---
layout: post
title:  "dictionaryWithDictionary和copy引起的思考"
date:   2016-09-04 22:30:00 +0800
categories: iOS
tags: Objective-C Assembly
---

在开发过程中，常见到这样的写法：`[NSDictionary dictionaryWithDictionary:otherDict]`、`[otherDict copy]`。在很多情况下，我们甚至不用去考虑两种方法的异同，随机地选择用哪个方法。但二者又确确实实地有着些许不同。


# `-copy` 和 `+dictionaryWithDictionary`

首先我们可以知道一个是实例方法一个是类方法，这是最直观的区别。然后，如果otherDict为nil的话，既然copy是一个实例方法，那么其返回的值必然是nil。而对于类方法的`+dictionaryWithDictionary`来说，其返回值为空的字典(@[])。

在内存管理方面，`-copy`返回的是retain +1的对象，而`+dictionaryWithDictionary`返回的是autoreleased的对象。在MRC环境下，前者需要我们手动去释放，而后者不用。当然在ARC环境下，这其中的区别就显得不是那么重要了。

然后，对于otherDict为NSDictionary和NSMutableDictionary的情况，`-copy`依旧有话说。如果otherDict为可变字典的话，那么`-copy`将返回一个retainCount = 1的复制的对象。对于不可变字典情况，因为其不可变性，将返回当前的otherDict，并且retainCount + 1。

很多情况下，两者混用并没有什么大问题，甚至于如果仅凭喜好来说，有人倾向于更短的`-copy`，相当于当成一个语法糖来使用。

是的，大部分情况下没什么差别，所以大部分之外情况引出了血案。

# AFNetworking引发的血案

闲来无事，修个Bug玩吧。于是AFNetworking的一个问题成功引起了我的注意，最终问题代码定位在这儿：

{% highlight objc %}
- (NSDictionary *)HTTPRequestHeaders {
    return [NSDictionary dictionaryWithDictionary:self.mutableHTTPRequestHeaders];
}
{% endhighlight %}

其引起的崩溃关键Log如下：

>
Fatal Exception: NSInvalidArgumentException <br />
*** -[__NSPlaceholderDictionary initWithObjects:forKeys:count:]: attempt to insert nil object from objects[6] <br />
<br />
0  CoreFoundation                 0x183976db0 __exceptionPreprocess <br />
1  libobjc.A.dylib                0x182fdbf80 objc_exception_throw <br />
2  CoreFoundation                 0x18385f77c -[__NSPlaceholderDictionary initWithObjects:forKeys:count:] <br />
3  CoreFoundation                 0x18389f010 -[NSDictionary initWithDictionary:copyItems:] <br />
4  CoreFoundation                 0x18389ee2c +[NSDictionary dictionaryWithDictionary:] <br />
5  TaLiCaiCommunity               0x1002b9d80 -[AFHTTPRequestSerializer HTTPRequestHeaders] (AFURLRequestSerialization.m:309) <br />
6  TaLiCaiCommunity               0x1002bae0c -[AFHTTPRequestSerializer requestBySerializingRequest:withParameters:error:] (AFURLRequestSerialization.m:474) <br />
7  TaLiCaiCommunity               0x1002bec10 -[AFJSONRequestSerializer requestBySerializingRequest:withParameters:error:] (AFURLRequestSerialization.m:1244)

显然是插入了空值，那么我们可以知道这又是一个由高并发引起的血案。当然抛去中间蛋疼的排查，*可以知道开发者理所当然地用上了单例*，是的，AFHTTPSessionManager的单例。我可以想到开发者想到单例的时候对自己的骄傲和崇拜。但一时的壮举可能依然会无心插柳酿成悲剧。一旦用上单例，那么所有的变量都将为无数的并发请求所使用……和操作。并发的种种问题便接踵而至。

可以想象，当一个请求正在修改self.mutableHTTPRequestHeaders时，另一个请求调用了`-HTTPRequestHeaders`方法，这时进入`+dictionaryWithDictionary`便华华丽丽地崩溃了，并书写下了上述的死亡讯息。

很经典的并发问题，很经典的解法——dispatch_barrier_async可解。事实上，AFNetworking中也利用过此方法规避过此类问题。

但，如果这么轻易地就解决了，那还有后来的恩怨情愁么？

# 我们来构造个崩溃

没有一点点防备，就这么构造出了如下的代码，很有效地崩溃了：

{% highlight objc %}
// self.dict = [@[] mutableCopy];
dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    for (NSInteger i = 0; i < 102400; i++) {
        if (i % 2 == 0) {
            [_dict setObject:@(i) forKey:@"key"];
        } else {
            [_dict removeObjectForKey:@"key"];
        }
    }
    
});

for (NSInteger i = 0; i < 102400; i++) {
    NSDictionary * dict = [NSDictionary dictionaryWithDictionary:self.dict];
    // NSDictionary * dict2 = [_dict copy];
}
{% endhighlight %}

一个在主线程不断复制，一个在其他县城不断设置和移除。可以模拟出大并发情况下，是必崩的。但机(dan)智(teng)如我，试验了下注释中的`[_dict copy]`，在此情况下非常稳定地运行到了最后。哎哟不错，你成功引起我的注意了。

从上面构造的代码可知，_dict的count是从0-1不断变化的（假设_dict初始为空）。考虑到如下的崩溃原因，我们可以猜测是因为`removeObject:forKey:`，被移除掉的对象被释放了，从而变成nil导致出错。

> *** -[__NSPlaceholderDictionary initWithObjects:forKeys:count:]: attempt to insert nil object from objects[0]

虽然问题原因根据Log可以猜出八九不离十，但为什么copy就相安无事呢？我们当然可以继续猜测其并不检查nil。是不是真的是这样，我们需要继续分析。但上面所说的区别已经无法解释这种不同了，我们只好祭出大杀器——翠花，上汇编！


# Assembly

汇编可谓大杀器也！苹果不会什么都告诉你，所以很多实现都需要通过分析汇编代码来获取细节。虽然自从大学学完8086汇编就很少见面了,再见面已是时过境迁，这时我们面对的是x86_64（模拟器中）了（其带来的副作用就是一开始搞混各种指令和其格式，呜呼哀哉！）。由于代码太长，下面的分析当中不会贴上全篇代码，而且由于分次获取的代码，可能不同方法间跳转的地址可能有所出入，所幸我们只需检查同一方法的汇编代码即可。如果需要检查，则可以选中Xcode中Debug - Debug Workflow - Always show disassembly，打断点后通过control + F7进行逐步调试。

首先，我们比较`+dictionaryWithDictionary`和`-copy`都调用了什么。

## `+dictionaryWithDictionary`

可以知道，`+dictionaryWithDictionary`主要调用了`-[NSDictionary initWithDictionary:copyItems:]`方法，我们就针对这个方法继续查看。此方法调用到的方法大致有如下几个：

1. `isNSDictionary__`
2. `count`
3. `getObjects:andKeys:count:`
4. `copyWithZone:`
5. `initWithObjects:forKeys:count:`
6. `release`

对于1，因为上面的操作始终为Dictionary，那么可以跳过。对于2，且消息对象为可变NSMutableDictionary为如下代码：

{% highlight nasm %}
CoreFoundation`-[__NSDictionaryM count]:
0x10d31f620 <+0>:  pushq  %rbp
0x10d31f621 <+1>:  movq   %rsp, %rbp
0x10d31f624 <+4>:  movq   0x32cbad(%rip), %rcx      ; __NSDictionaryM._used
0x10d31f62b <+11>: movabsq $0x3ffffffffffffff, %rax  ; imm = 0x3FFFFFFFFFFFFFF
0x10d31f635 <+21>: andq   (%rdi,%rcx), %rax
0x10d31f639 <+25>: popq   %rbp
0x10d31f63a <+26>: retq   
0x10d31f63b <+27>: nopl   (%rax,%rax)
{% endhighlight %}

可以看到，并无什么特殊代码，所以此时包含在%rax中返回的count将为此时Dictionary的个数，即在上面构造的崩溃代码中，count可能为0或者1。此时并不会崩溃，当然会导致后续崩溃的情况是count = 1，我们可以继续看看3。

对于3，也没什么可疑的代码，只有一个判断count是否是否过大的代码，也可以暂且跳过。其提示内容如下：

{% highlight nasm %}
0x10d31f82b <+251>: leaq   0x33f53e(%rip), %rax      ; kCFAllocatorSystemDefault
0x10d31f832 <+258>: movq   (%rax), %rdi
0x10d31f835 <+261>: leaq   0x352da4(%rip), %rdx      ; @"*** %s: count (%lu) of objects array is ridiculous"
0x10d31f83c <+268>: leaq   0x3093f6(%rip), %rcx      ; "-[__NSDictionaryM getObjects:andKeys:count:]"
0x10d31f843 <+275>: xorl   %esi, %esi
0x10d31f845 <+277>: xorl   %eax, %eax
0x10d31f847 <+279>: callq  0x10d311540               ; CFStringCreateWithFormat
0x10d31f84c <+284>: movq   %rax, %rdi
0x10d31f84f <+287>: callq  0x10d30f980               ; CFMakeCollectable
0x10d31f854 <+292>: xorl   %edi, %edi
0x10d31f856 <+294>: movq   %rax, %rsi
0x10d31f859 <+297>: callq  0x10d39bfb0               ; _CFAutoreleasePoolAddObject
0x10d31f85e <+302>: movq   0x32c073(%rip), %rdi      ; (void *)0x000000010d64e358: NSException
0x10d31f865 <+309>: leaq   0x3492d4(%rip), %rcx      ; NSInvalidArgumentException
0x10d31f86c <+316>: movq   (%rcx), %rdx
0x10d31f86f <+319>: movq   0x32a852(%rip), %rsi      ; "exceptionWithName:reason:userInfo:"
0x10d31f876 <+326>: xorl   %r8d, %r8d
0x10d31f879 <+329>: movq   %rax, %rcx
0x10d31f87c <+332>: callq  *0x33d986(%rip)           ; (void *)0x000000010ceb1800: objc_msgSend
0x10d31f882 <+338>: movq   %rax, %rdi
0x10d31f885 <+341>: callq  0x10d486f88               ; symbol stub for: objc_exception_throw
0x10d31f88a <+346>: nopw   (%rax,%rax)
{% endhighlight %}

同样对于4，也是相对简单的几行代码，（代码连贴都不贴地）华丽丽地跳过。

接下来终于来到5了，基本就可以肯定在这儿了，毕竟release大概也没做什么出格的事。我们搜索下关键词，可以看到的确有对应的提示信息：

{% highlight nasm %}
0x10d3241dc <+220>: leaq   0x33ab8d(%rip), %rax      ; kCFAllocatorSystemDefault
0x10d3241e3 <+227>: movq   (%rax), %rdi
>> 0x10d3241e6 <+230>: leaq   0x34e413(%rip), %rdx      ; @"*** %s: attempt to insert nil object from objects[%lu]"
0x10d3241ed <+237>: leaq   0x304849(%rip), %rcx      ; "-[__NSPlaceholderDictionary initWithObjects:forKeys:count:]"
0x10d3241f4 <+244>: xorl   %esi, %esi
0x10d3241f6 <+246>: xorl   %eax, %eax
0x10d3241f8 <+248>: movq   %r9, %r8
0x10d3241fb <+251>: callq  0x10d311540               ; CFStringCreateWithFormat
0x10d324200 <+256>: movq   %rax, %rdi
0x10d324203 <+259>: callq  0x10d30f980               ; CFMakeCollectable
{% endhighlight %}

我们搜索0x10d3241dc可以知道有两个地方会跳转至此：

{% highlight nasm %}
0x10d324130 <+48>:  cmpq   $0x0, (%rcx,%r9,8)        ; 判断首地址是否为空
>> 0x10d324135 <+53>:  je     0x10d3241dc               ; <+220>, 跳转错误提示，其中之一
0x10d32413b <+59>:  incq   %r9                       ; r9 += 1
0x10d32413e <+62>:  cmpq   %r8, %r9                  ; 判断r9 - r8
0x10d324141 <+65>:  jb     0x10d324130               ; <+48>, 如果r9 < r8，跳转回0x10d324130
0x10d324143 <+67>:  testq  %rax, %rax                ; 判断rax是否为0
0x10d324146 <+70>:  jne    0x10d324151               ; <+81>, 如果rax不为0则跳转
0x10d324148 <+72>:  testq  %r8, %r8                  ; 判断r8是否为0
0x10d32414b <+75>:  jne    0x10d32423e               ; <+318>, 如果r8不为0则跳转
0x10d324151 <+81>:  xorl   %r9d, %r9d                ; r9d = 0
0x10d324154 <+84>:  testq  %r8, %r8                  ; 判断r8是否为0
0x10d324157 <+87>:  je     0x10d32416f               ; <+111>，如果r8为0
0x10d324159 <+89>:  nopl   (%rax)
0x10d324160 <+96>:  cmpq   $0x0, (%rax,%r9,8)        ; 判断(rax + r9 * 8)地址内容是否为0，此处判断地址是否为空
>> 0x10d324165 <+101>: je     0x10d3241dc               ; <+220> , 跳转错误提示，第二个跳转
{% endhighlight %}

可以看到在0x10d324130和0x10d324160处分别进行了判空操作，跳转显示错误信息。前者判断了首地址是否为空，后者循环判断count内的元素是否为空。判空操作完成后，调用`+[__NSDictionaryI __new:::::]`方法。

罪魁祸首就在这儿了，但为什么copy不存在此情况呢？咱继续走起～


## `-copy`

我们继续分析`-copy`情况，首先其主要调用了`-[__NSDictionaryM copyWithZone:]`。现在主要还是针对此方法进行分析。

同样的，可以看到分别调用了如下方法：

1. `count`
2. `getObjects:andKeys:count:`
3. `__new:::::`

前两者不必再分析，第3因为跟`+dictionaryWithDictionary`调用的同样的方法，所以也不去分析。并且在`getObjects:andKeys:count:`和`__new:::::`之间，可以看到并未掺杂其它东西：

{% highlight nasm %}
>> 0x1018ae534 <+244>: movq   0x30d8f5(%rip), %rsi      ; "getObjects:andKeys:count:"
0x1018ae53b <+251>: movq   0x31fcc6(%rip), %r13      ; (void *)0x0000000101422800: objc_msgSend
0x1018ae542 <+258>: movq   %r14, %rdi                ; rdi = r14
0x1018ae545 <+261>: movq   %r12, %rdx                ; rdx = r12
0x1018ae548 <+264>: movq   %rbx, %rcx                ; rcx = rbx
0x1018ae54b <+267>: movq   %r15, %r8                 ; r8 = r15
0x1018ae54e <+270>: callq  *%r13
0x1018ae551 <+273>: movq   0x30e4a8(%rip), %rdi      ; (void *)0x0000000101bbef98: __NSDictionaryI
>> 0x1018ae558 <+280>: movq   0x30d559(%rip), %rsi      ; "__new:::::"
0x1018ae55f <+287>: subq   $0x10, %rsp
0x1018ae563 <+291>: movl   $0x0, (%rsp)
0x1018ae56a <+298>: xorl   %r9d, %r9d
0x1018ae56d <+301>: movq   %rbx, %rdx
0x1018ae570 <+304>: movq   %r12, %rcx
0x1018ae573 <+307>: movq   %r15, %r8
0x1018ae576 <+310>: callq  *%r13
{% endhighlight %}

所以整体来说`-copy`无判断Object为空的流程。这也是`-copy`不崩溃的原因。

但问题又来了，同样遇上空值，也同样调用了`+[__NSDictionaryI __new:::::]`。但为什么`+[__NSDictionaryI __new:::::]`能不出问题？


＃ `+[__NSDictionaryI __new:::::]`

首先`new:::::`这个方法名可能看起来比较奇怪，但事实上Objective-C中完全支持这样的写法。当前这不在我们讨论范围之内，我们现在只需要知道此方法显式传入5个参数（还有两个隐式传入的self和_cmd）。由外部调用可知至少传入getObjects:andKeys:count:中所包含的objects、keys、count，一个应为标志是否copy的布尔值(当前始终为NO)，和一个可能标志是否避免retain的参数(当前始终为NO)，后二者可以由具体汇编代码推断出来。

可以看到此方法的主要分为三个部分：

1. 根据Capacity，通过某种策略分配空间；
2. 根据objects、keys、count等进行初始化（如果需要copy则copy）；
3. 返回。

分配策略方面因为传入的count始终是个合理的值，所以分配空间并不会出现什么问题。唯一需要警惕的是2中的初始化过程。

对于objects和count，可能的情况有objects.count == count，objects.count < count(其中一个objects被释放)。前者是正常情况，后者是可能引起问题的情况。后面假设其中一个object被释放进行分析。

还是摘取最后的一段汇编代码(此处为一段循环后半部分)：

{% highlight nasm %}
0x10d2e1960 <+384>: movq   -0x30(%rbp), %rax         ; 此时rax应为分配出空间后调用object_getIndexedIvars所得的首地址
0x10d2e1964 <+388>: cmpq   $0x0, (%rax,%rbx,8)       ; 根据上文，此时rbx应为循环次数(x2，因为包含key和value)，此行比较当前遍历的object是否为空
0x10d2e1969 <+393>: movq   -0x58(%rbp), %r15         ; 此时r15 应该为获取到的count
0x10d2e196d <+397>: movq   -0x48(%rbp), %r12         ; 暂不明确，但不影响分析
0x10d2e1971 <+401>: jne    0x10d2e1a1e               ; <+574>, 此处如果上面object比较不为空，则跳过到最后一部分（因为object已经存在）。
0x10d2e1977 <+407>: movq   -0x50(%rbp), %rax         ; 此时rax = keys首地址
0x10d2e197b <+411>: movq   -0x38(%rbp), %rdx         ; 此时rdx = 当前循环计数
0x10d2e197f <+415>: movq   (%rax,%rdx,8), %rdi       ; rdi = 当前的key
0x10d2e1983 <+419>: movl   -0x64(%rbp), %eax         ; eax = 传入的值，当前始终为0（即NO）
0x10d2e1986 <+422>: testb  %al, %al                  ; 如果al == 0则跳过，当前始终跳过
0x10d2e1988 <+424>: je     0x10d2e19a1               ; <+449>
; 此段当前情况下始终被跳过 begin
0x10d2e198a <+426>: movq   %rdx, %r13
0x10d2e198d <+429>: xorl   %edx, %edx
0x10d2e198f <+431>: movq   0x368ae2(%rip), %rsi      ; "copyWithZone:"
0x10d2e1996 <+438>: callq  *0x37b86c(%rip)           ; (void *)0x000000010ceb1800: objc_msgSend
0x10d2e199c <+444>: movq   %r13, %rdx
0x10d2e199f <+447>: jmp    0x10d2e19be               ; <+478>
; 此段当前情况下始终被跳过 end
0x10d2e19a1 <+449>: testq  %rdi, %rdi                ; 判断key是否为空
0x10d2e19a4 <+452>: movl   $0x0, %eax                ; eax = 0
0x10d2e19a9 <+457>: je     0x10d2e19be               ; <+478>, 如果key为空，则跳转
0x10d2e19ab <+459>: movq   %rdx, %r13                ; r13 = 当前循环计数
0x10d2e19ae <+>: callq  0x10d2e0aa0               ; CFRetain, 对当前key进行retain
0x10d2e19b3 <+467>: movq   -0x50(%rbp), %rax         ; rax = keys首地址
0x10d2e19b7 <+471>: movq   %r13, %rdx                ; rdx = r13 = 当前循环计数
0x10d2e19ba <+474>: movq   (%rax,%rdx,8), %rax       ; rax = 当前key地址
0x10d2e19be <+478>: movq   %rdx, -0x38(%rbp)         ; 存储当前循环计数
0x10d2e19c2 <+482>: movq   -0x30(%rbp), %rcx         ; rcx = 分配空间 indexed ivars 首地址
>> 0x10d2e19c6 <+486>: movq   %rax, (%rcx,%rbx,8)       ; 保存rax至新对象里(此时可能为0，但不影响), 可以知道key保存在偶数位
0x10d2e19ca <+490>: movq   -0x70(%rbp), %rax         ; rax = objects首地址
0x10d2e19ce <+494>: movq   (%rax,%rdx,8), %rdi       ; 获取当前object
0x10d2e19d2 <+498>: orq    $0x1, %rbx                ; rbx最后一位置为1，即始终为奇数
>> 0x10d2e19d6 <+502>: movq   %rdi, (%rcx,%rbx,8)       ; 保存当前object至新对象(此时可能为0，但不影响)， 可以知道object依次保存在key后的计数位
0x10d2e19da <+506>: testq  %rdi, %rdi                ; 判断object是否为空, 为空则跳过retain
0x10d2e19dd <+509>: je     0x10d2e19ea               ; <+522>
0x10d2e19df <+511>: cmpb   $0x0, 0x10(%rbp)
0x10d2e19e3 <+515>: jne    0x10d2e19ea               ; <+522>
0x10d2e19e5 <+517>: callq  0x10d2e0aa0               ; CFRetain
0x10d2e19ea <+522>: movq   0x36a7d7(%rip), %rax      ; __NSDictionaryI._used, 获取used偏移
0x10d2e19f1 <+529>: movq   -0x60(%rbp), %rsi         ; rsi = 分配的NSDictionary空间首地址
0x10d2e19f5 <+533>: movq   (%rsi,%rax), %rcx         ; rcx = 当前的计数
0x10d2e19f9 <+537>: leaq   0x1(%rcx), %rdx           ; rdx = rcx + 1, 即used = used + 1
0x10d2e19fd <+541>: movabsq $0x3ffffffffffffff, %rdi  ; imm = 0x3FFFFFFFFFFFFFF 
0x10d2e1a07 <+551>: andq   %rdi, %rdx
0x10d2e1a0a <+554>: movabsq $-0x400000000000000, %rdi ; imm = 0xFC00000000000000 
0x10d2e1a14 <+564>: andq   %rdi, %rcx
0x10d2e1a17 <+567>: orq    %rdx, %rcx                ; 至此可能用以避免溢出
0x10d2e1a1a <+570>: movq   %rcx, (%rsi,%rax)         ; 保存新的used，即增加过的used
0x10d2e1a1e <+574>: movq   -0x38(%rbp), %rcx         ; rcx = 循环计数
0x10d2e1a22 <+578>: incq   %rcx                      ; rcx = rcx + 1
0x10d2e1a25 <+581>: cmpq   %r15, %rcx                ; 比较rcx - r15
0x10d2e1a28 <+584>: jb     0x10d2e18d0               ; <+240>, 如果rcx - r15 < 0, 即如果未循环完则继续循环
0x10d2e1a2e <+590>: movq   -0x60(%rbp), %rax         ; 保存返回值
0x10d2e1a32 <+594>: addq   $0x48, %rsp               ; 恢复rsp
0x10d2e1a36 <+598>: popq   %rbx
0x10d2e1a37 <+599>: popq   %r12
0x10d2e1a39 <+601>: popq   %r13
0x10d2e1a3b <+603>: popq   %r14
0x10d2e1a3d <+605>: popq   %r15
0x10d2e1a3f <+607>: popq   %rbp
0x10d2e1a40 <+608>: retq   462                       ; 返回
{% endhighlight %}

从0x10d2e19c6和0x10d2e19d6可以分别看出，其实key或者object此时是否为空并不影响，会照常将0存储在新分配的对象中。这就是为什么即使为空，这个方法也不会崩溃的原因。如果object为空的话，此时获取到的value为nil。而且由于不阻碍继续循环，此时依旧可以复制其他元素进去，也就是碰到nil不会中途停下。

另外可以看到，虽然有这么别扭的方法名（即object放在前面，key放在后面）：`dictionaryWithObjectsAndKeys`，但事实上key和object在内存中的分布依然是key在前object在后。

对于nil的想法，我们我们可以再改造下上述的代码进行验证：

{% highlight objc %}
// self.dict = [@[] mutableCopy];
dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    for (NSInteger i = 0; i < 102400; i++) {
        if (i % 2 == 0) {
            [_dict setObject:@(i) forKey:@"key"];
        } else {
            [_dict removeObjectForKey:@"key"];
        }
    }
    
});

for (NSInteger i = 0; i < 102400; i++) {
    NSDictionary * dict2 = [_dict copy];
    // 我们假设一开始为空，则添加完后只有一个元素
    if (dict2.count == 1) {
        NSLog(@"is %@Empty", [dict2 objectForKey:@"key"] ? @"NOT " : @"");
    }
}
{% endhighlight %}

此时当count == 1的时候，还是有可能出现输出`is Empty`的情况。这就验证了上面的想法。

至于后面的nil不影响其他元素的想法，也可以通过类似的方法进行验证，在此不赘述。


# 结语

从上面的分析来看，如果直接使用copy，那么虽然会造成高并发时获取到的部分value为nil，但其并不会对其他未进行操作的key/value有影响。而且此法不需要进行加锁，避免了一些开销。如果仅仅针对避免崩溃的情况，直接修改为copy是可行的。但如果需要保证线程安全，那么就需要进行传统的加锁操作，但此时占用较多资源。考虑到上面的情况是为误用单例，那么为了避免崩溃，可以直接使用copy。

当然以上仅仅是在模拟器中获取x86_64汇编代码的，跟ARM中指令还是有所区别的，但我想逻辑理应是相通的，有时间再去看看是否真机中也是如此（我想是个有生之年系列）。

PS: 在准备提交一个Pull Request的时候发现最新版本已经为有问题的方法添加上了dispatch_barrier_async、dispatch_sync等，残念。

*最后的最后，嗯，我只是把`[NSDictionary dictionaryWithDictionary:otherDict]`改成`[otherDict copy]`而已。*


# 参考资料

[NSDictionary +dictionaryWithDictionary or -copy?](http://stackoverflow.com/questions/17076974/nsdictionary-dictionarywithdictionary-or-copy)

[What is the role of the “copy” in the ARC](http://stackoverflow.com/questions/16149653/what-is-the-role-of-the-copy-in-the-arc)

[x86 Assembly Language Reference Manual](http://docs.oracle.com/cd/E19253-01/817-5477/index.html)

