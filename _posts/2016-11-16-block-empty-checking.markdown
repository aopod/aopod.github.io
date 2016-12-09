---
layout: post
title:  "为何调用block应先判空"
date:   2016-11-16 23:30:00 +0800
categories: iOS
tags: Objective-C Assembly Low-Level
---


得益于Objective-C的Runtime系统，对象的方法调用通过消息传递的机制进行，从而避免了很多情况下的判空操作。block也是Objective-C世界的对象，然而如果当它为空时，调用它却能导致崩溃。归根结底，其实是因为block的调用并不使用消息传递那套机制，而是通过跳转到特定的函数地址进行函数调用。我们可以先这么粗略的解释一下，然后再深入一点进行探讨。


# 函数调用和消息传递

Objective-C中的消息传递是类似`[[obj method1:parameter1] method]`这样的形式，而普通的函数调用形如`func2(func1(parameter1))`。而对于block，其自身虽然是作为对象存在，但其调用形式却与函数调用相同：`block2(block1(parameter1))`。

对于消息传递，其使用的机制为查表，在[Method Swizzling][Method-Swizzling]一文中简单提到过。其优点在于不用在编译时确定，而是在运行时决定所调用的方法。而且对nil发消息，返回的永远是nil。这样一来，灵活性极高，并且对于nil的处理方便许多。当然其缺点显而易见，虽然有缓存机制，还是会比直接调用效率低那么一些。

而函数调用，其调用入口地址在编译期就决定了，这种形式缺少了些灵活性，但是却是效率较高的一种形式。鉴于现在的硬件条件已经足够高，低频率的调用所带来的性能提升其实无关紧要(然而对于高频调用情况，还是需要更进一步的优化)。

作为block，虽然它作为堂堂的Objective-C对象，却并不使用消息传递机制。原因之一可能是它同时作为C扩展的一部分，用了函数调用的形式更通用；另外其效率可能也在考虑范围，毕竟block用处较多，广泛用于各种回调、遍历之中。当然最重要的是，其实现的结构就决定了其调用形式。


# block结构

其实block也是一个对象。更进一步地说，它是一个结构体。基本结构如下：

{% highlight c %}
struct Block_literal_1 {
    void *isa; // initialized to &_NSConcreteStackBlock or &_NSConcreteGlobalBlock
    int flags;
    int reserved;
    void (*invoke)(void *, ...);
    struct Block_descriptor_1 {
        unsigned long int reserved;     // NULL
        unsigned long int size;         // sizeof(struct Block_literal_1)
        // optional helper functions
        void (*copy_helper)(void *dst, void *src);     // IFF (1<<25)
        void (*dispose_helper)(void *src);             // IFF (1<<25)
        // required ABI.2010.3.16
        const char *signature;                         // IFF (1<<30)
    } *descriptor;
    // imported variables
};
{% endhighlight %}

从名字可以看到invoke就是要执行的函数地址。为了紧紧围绕主题（实则偷懒），就不涉及其余的变量和类似变量捕获等的细节。

对于下面这么简单的一句`hello world`：

{% highlight objc %}
^ { printf("hello world\n"); }
{% endhighlight %}

其实最终会被编译器处理成如下形式：

{% highlight c %}
struct __block_literal_1 {
    void *isa;
    int flags;
    int reserved;
    void (*invoke)(struct __block_literal_1 *);
    struct __block_descriptor_1 *descriptor;
};

void __block_invoke_1(struct __block_literal_1 *_block) {
    printf("hello world\n");
}

static struct __block_descriptor_1 {
    unsigned long int reserved;
    unsigned long int Block_size;
} __block_descriptor_1 = { 0, sizeof(struct __block_literal_1), __block_invoke_1 };
{% endhighlight %}

事实上，上面这个block的调用就是调用了函数`__block_invoke_1`并且将`__block_literal_1`作为参数传进去（当然更复杂的block会有更多的参数）。那么最终调用到底是怎样的呢？


# 调用细节

考虑下面这样一个简单的block调用：

{% highlight objc %}
- (void)blockInvoke:(void (^)(void))block
{
    block();
}
{% endhighlight %}

其在模拟器上运行时的汇编代码为如下形式：

{% highlight nasm %}
    0x101daf510 <+0>:  pushq  %rbp
    0x101daf511 <+1>:  movq   %rsp, %rbp
    0x101daf514 <+4>:  subq   $0x20, %rsp
    0x101daf518 <+8>:  leaq   -0x18(%rbp), %rax
    0x101daf51c <+12>: movq   %rdi, -0x8(%rbp)
    0x101daf520 <+16>: movq   %rsi, -0x10(%rbp)
    0x101daf524 <+20>: movq   $0x0, -0x18(%rbp)
    0x101daf52c <+28>: movq   %rax, %rdi
    0x101daf52f <+31>: movq   %rdx, %rsi
->  0x101daf532 <+34>: callq  0x101db01e4               ; symbol stub for: objc_storeStrong
    0x101daf537 <+39>: movq   -0x18(%rbp), %rax
    0x101daf53b <+43>: movq   %rax, %rdx
    0x101daf53e <+46>: movq   %rdx, %rdi
->  0x101daf541 <+49>: callq  *0x10(%rax)
    0x101daf544 <+52>: xorl   %ecx, %ecx
    0x101daf546 <+54>: movl   %ecx, %esi
    0x101daf548 <+56>: leaq   -0x18(%rbp), %rax
    0x101daf54c <+60>: movq   %rax, %rdi
    0x101daf54f <+63>: callq  0x101db01e4               ; symbol stub for: objc_storeStrong
    0x101daf554 <+68>: addq   $0x20, %rsp
    0x101daf558 <+72>: popq   %rbp
    0x101daf559 <+73>: retq   
{% endhighlight %}

可以知道在`0x101daf541`处是调用block的指令。那么`0x10(%rax)`即为所要调用的函数地址。往前还有一个`objc_storeStrong`调用(0x101daf532处)，它做了什么呢？我们来看一下：

{% highlight nasm %}
libobjc.A.dylib`objc_storeStrong:
    0x10e4f5cda <+0>:  pushq  %rbp
    0x10e4f5cdb <+1>:  movq   %rsp, %rbp
    0x10e4f5cde <+4>:  pushq  %r15
    0x10e4f5ce0 <+6>:  pushq  %r14
    0x10e4f5ce2 <+8>:  pushq  %rbx
    0x10e4f5ce3 <+9>:  pushq  %rax
    0x10e4f5ce4 <+10>: movq   %rsi, %rbx
    0x10e4f5ce7 <+13>: movq   %rdi, %r15
    0x10e4f5cea <+16>: movq   (%r15), %r14
    0x10e4f5ced <+19>: cmpq   %rbx, %r14
    0x10e4f5cf0 <+22>: je     0x10e4f5d0f               ; <+53>
    0x10e4f5cf2 <+24>: movq   %rbx, %rdi
    0x10e4f5cf5 <+27>: callq  0x10e4f5cb0               ; objc_retain
    0x10e4f5cfa <+32>: movq   %rbx, (%r15)
    0x10e4f5cfd <+35>: movq   %r14, %rdi
    0x10e4f5d00 <+38>: addq   $0x8, %rsp
    0x10e4f5d04 <+42>: popq   %rbx
    0x10e4f5d05 <+43>: popq   %r14
    0x10e4f5d07 <+45>: popq   %r15
    0x10e4f5d09 <+47>: popq   %rbp
    0x10e4f5d0a <+48>: jmp    0x10e4f5d20               ; objc_release
    0x10e4f5d0f <+53>: addq   $0x8, %rsp
    0x10e4f5d13 <+57>: popq   %rbx
    0x10e4f5d14 <+58>: popq   %r14
    0x10e4f5d16 <+60>: popq   %r15
    0x10e4f5d18 <+62>: popq   %rbp
    0x10e4f5d19 <+63>: retq   
    0x10e4f5d1a <+64>: nopw   (%rax,%rax)
{% endhighlight %}

虽然也可以分析下汇编，但还是尽量避免这种分析吧，搜一搜`objc_storeStrong`能够找到[clang文档](http://clang.llvm.org/docs/AutomaticReferenceCounting.html#arc-runtime-objc-storestrong)关于`objc_storeStrong`的实现如下：

{% highlight objc %}
id objc_storeStrong(id *object, id value) {
  value = [value retain];
  id oldValue = *object;
  *object = value;
  [oldValue release];
  return value;
}
{% endhighlight %}

从上面blockInvoke的汇编代码可以知道传入`objc_storeStrong`函数的参数object为新分配的指针地址，value为传入的block地址。可知当block为nil时，object依旧为nil，但如果block不为nil的话，那么object则指向value retain操作后的地址。

回到blockInvoke汇编代码。可以知道`-0x18(%rbp)`为block经过`objc_storeStrong`后的内容。在block为nil时，其内容显然为0也就是nil。此时$rax = 0。这样对于`0x10(%rax)`来说，其实访问了地址为`0x10`的内存，自然会造成`EXC_BAD_ACCESS(code=1, address=0x10)`的错误。

如果传入一个非空的block，则0x10的偏移正好对应十进制下16偏移，在64位系统下，对应的是sizeof(void *) + sizeof(int) * 2, 也就是8 + 4 * 2 = 16。此偏移刚好指向invoke变量。此时便正确调用了block。

所以最后要说的其实是：*调用block的时候一定要记得判断是不是为空，避免不必要的崩溃*。

PS：本以为没啥东西的最后扯了这么一堆，我也是够了……>_<


# 参考资料

* [Block Implementation Specification](http://clang.llvm.org/docs/Block-ABI-Apple.html)
* [Objective-C Automatic Reference Counting (ARC)](http://clang.llvm.org/docs/AutomaticReferenceCounting.html)


[Method-Swizzling]: /2016/07/10/method-swizzling/#section



