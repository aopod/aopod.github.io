---
layout: post
title:  "类簇，从NSArray说起"
date:   2017-02-24 00:00:00 +0800
categories: iOS
tags: Objective-C Assembly Low-Level Design-Pattern
---


在iOS开发中，广泛运用了类蔟(Class clusters)的设计模式。如NSNumber、NSString、NSArray等。类簇其实是对现实的一种抽象和封装，基于抽象工厂模式(Abstract Factory Pattern)。最近在读书过程中联想到一些东西，于是尝试更加深入地去了解它。


# 问题

所谓抽象工厂模式就是将各种同一主题的工厂类封装起来，提供一个通用的抽象工厂类而不用知道具体的工厂类。对于类蔟的论述已经多如牛毛了，在此更加推荐阅读苹果的官方文档。本篇文章将以NSArray为例，着重讲下从alloc到init过程中发生的事。在重温《Effective Objective-C 2.0》的过程中我注意到这么一段话：

> In the case of NSArray, when an instance is allocated, it's an instance of another class that's allocated (during a call to alloc), known as a placeholder array. This placeholder array is then converted to an instance of another class, which is a concrete subclass of NSArray. This is a pretty little dance but beyond the scope of this book to explan fully.

可以用一个具体的例子来说明，比如:

{% highlight objc %}
NSArray *placeholder = [NSArray alloc];
NSArray *arr1 = [placeholder init];
NSArray *arr2 = [placeholder initWithObjects:@0, nil];
NSArray *arr3 = [placeholder initWithObjects:@0, @1, nil];
NSArray *arr4 = [placeholder initWithObjects:@0, @1, @2, nil];

NSLog(@"placeholder: %s", object_getClassName(placeholder));    // placeholder: __NSPlaceholderArray
NSLog(@"arr1: %s", object_getClassName(arr1));                  // arr1: __NSArray0
NSLog(@"arr2: %s", object_getClassName(arr2));                  // arr2: __NSSingleObjectArrayI
NSLog(@"arr3: %s", object_getClassName(arr3));                  // arr3: __NSArrayI
NSLog(@"arr4: %s", object_getClassName(arr4));                  // arr4: __NSArrayI
{% endhighlight %}

可以看到，alloc后所得到的类为__NSPlaceholderArray。而当init为一个空数组后，变成了__NSArray0。如果有且仅有一个元素，那么为__NSSingleObjectArrayI。如果数组大于一个元素，那么为__NSArrayI。这儿暂且不去讨论为什么arr1-4有所区别——先来关心一下为什么alloc和init前后转化为了不同的类。

从名字上很容易知道__NSPlaceholderArray作用为占位，我们可以尝试打印几个地址：

{% highlight objc %}
NSArray *placeholder = [NSArray alloc];
NSArray *placeholder2 = [NSArray alloc];
NSArray *arr1 = [placeholder init];
NSArray *arr2 = [placeholder initWithObjects:@0, nil];

NSLog(@"placeholder: %p", placeholder);     // placeholder: 0x618000013b10
NSLog(@"placeholder2: %p", placeholder2);   // placeholder2: 0x618000013b10
NSLog(@"arr1: %p", arr1);                   // arr1: 0x618000013b30
NSLog(@"arr2: %p", arr2);                   // arr2: 0x608000014050
{% endhighlight %}

可以看到`[NSArray alloc]`产生的实例为一个单例，而在init或者其他初始化方法后，地址发生了变化，也就是说，placeholder目前看来只是一个占位用的单例，在init后即被新的实例给替换掉了。那么，这个placeholder真的只用做占位吗？

# __NSPlaceholderArray

我们可以参考另一个开源实现GNUstep一瞥究竟。根据GNUstep的代码，可知NSObject的alloc是直接返回的`[self allocWithZone: NSDefaultMallocZone()]`，也就是说调用了对应类实现的此方法。我们来看看GNUstep中NSArray的`allocWithZone:`是如何实现的：

{% highlight objc %}
+ (id) allocWithZone: (NSZone*)z
{
  if (self == NSArrayClass)
  {
    /*
    * For a constant array, we return a placeholder object that can
    * be converted to a real object when its initialisation method
    * is called.
    */
    if (z == NSDefaultMallocZone() || z == 0)
    {
      /*
      * As a special case, we can return a placeholder for an array
      * in the default malloc zone extremely efficiently.
      */
      return defaultPlaceholderArray;
    }
    else
    {
      // 此处省略
    }
  }
  else
  {
    return NSAllocateObject(self, 0, z);
  }
}
{% endhighlight %}

可以看到NSArray此时会返回defaultPlaceholderArray。在GNUstep的实现中，defaultPlaceholderArray实例所对应的类为GSPlaceholderArray。所以alloc完成后的`init`消息是发送给GSPlaceholderArray实例的。而`init`恰恰调用的是`initWithObjects:count:`——这个方法其实就是NSArray的指定初始化方法。我们继续看看GNUstep实现：

{% highlight objc %}
// GSPlaceholderArray
- (id) initWithObjects: (const id[])objects count: (NSUInteger)count
{
  self = (id)NSAllocateObject(GSInlineArrayClass, sizeof(id)*count, [self zone]);
  return [self initWithObjects: objects count: count];
}

// GSInlineArray
- (id) initWithObjects: (const id[])objects count: (NSUInteger)count
{
  _contents_array = (id*)(((void*)self) + class_getInstanceSize([self class]));

  if (count > 0)
  {
    NSUInteger  i;

    for (i = 0; i < count; i++)
    {
      if ((_contents_array[i] = RETAIN(objects[i])) == nil)
      {
        _count = i;
        DESTROY(self);
        [NSException raise: NSInvalidArgumentException format: @"Tried to init array with nil object"];
      }
    }
    _count = count;
  }
  return self;
}
{% endhighlight %}

可以看到在GSPlaceholderArray的`initWithObjects:count:`方法中，通过NSAllocateObject给GSInlineArray实例分配空间，包括所包含元素的空间。并且在GSInlineArray的`initWithObjects:count:`方法中，对分配的元素的空间进行初始化。自此就返回了一个类型为GSInlineArray的实例。

CoreFoundation中NSArray的相关实现会比GNUstep中的实现复杂些，但通过汇编代码来看可以知道基本逻辑是类似的，在此不再赘述。有几点可以提下：1、当元素为空时，返回的是__NSArray0的*单例*；2、当元素仅有一个时，返回的是__NSSingleObjectArrayI的实例；3、当元素大于一个的时候，返回的是__NSArrayI的实例。根据网上的资料，大多未提及__NSSingleObjectArrayI，可能是后面新增的，理由大概还是为了效率，在此不深究。

同样的，对于NSMutableArray、NSNumber、NSString等也是有相同的NSPlaceholderNumber机制的。

# 可变类的Placeholder

提到NSMutableArray，那么问题来了——NSMutableArray是否也有NSMutablePlaceholderArray呢？

答案是：并没有。一开始我也是先入为主地认为一定对应着一个可变类型的placeholderArray。但在好奇心驱使下打印了各个实例的父类后，我吃惊的发现其实并没有——它依然是__NSPlaceholderArray。

{% highlight objc %}
NSArray *placeholder = [NSArray alloc];
NSArray *arr1 = [placeholder init];
NSArray *arr2 = [placeholder initWithObjects:@0, nil];
NSArray *arr3 = [placeholder initWithObjects:@0, @1, nil];

NSLog(@"superclass of placeholder: %s", class_getName(placeholder.superclass)); // superclass of placeholder: NSMutableArray
NSLog(@"superclass of arr1: %s", class_getName(arr1.superclass));               // superclass of arr1: NSArray
NSLog(@"superclass of arr2: %s", class_getName(arr2.superclass));               // superclass of arr2: NSArray
NSLog(@"superclass of arr3: %s", class_getName(arr3.superclass));               // superclass of arr3: NSArray

NSMutableArray *mPlaceholder = [NSMutableArray alloc];
NSMutableArray *mArr1 = [mPlaceholder init];
NSMutableArray *mArr2 = [mPlaceholder initWithObjects:@0, nil];
NSMutableArray *mArr3 = [mPlaceholder initWithObjects:@0, @1, nil];

NSLog(@"mPlaceholder: %s", object_getClassName(mPlaceholder));    // mPlaceholder: __NSPlaceholderArray
NSLog(@"mArr1: %s", object_getClassName(mArr1));                  // mArr1: __NSArrayM
NSLog(@"mArr2: %s", object_getClassName(mArr2));                  // mArr2: __NSArrayM
NSLog(@"mArr3: %s", object_getClassName(mArr3));                  // mArr3: __NSArrayM

NSLog(@"superclass of mPlaceholder: %s", class_getName(mPlaceholder.superclass));   // superclass of mPlaceholder: NSMutableArray
NSLog(@"superclass of mArr1: %s", class_getName(mArr1.superclass));                 // superclass of mArr1: NSMutableArray
NSLog(@"superclass of mArr2: %s", class_getName(mArr2.superclass));                 // superclass of mArr2: NSMutableArray
NSLog(@"superclass of mArr3: %s", class_getName(mArr3.superclass));                 // superclass of mArr3: NSMutableArray
{% endhighlight %}

当时我的心里大概出现了这么个文件名：大吃一惊.jpg。但转念一想也是可以接受的，毕竟NSMutableArray是NSArray的子类，从这个角度来看，共用一个NSPlaceholderArray也是情有可原的。那么现在的问题是：它是个单例，又该怎么区分可变和不可变数组的呢？毕竟两个初始化方法selector是相同的。GNUstep似乎并不能找到答案，那么就再次祭出大杀器汇编吧。

{% highlight nasm %}
CoreFoundation`-[__NSPlaceholderArray initWithObjects:count:]:
; 前略
    0x10edf9698 <+40>:  je     0x10edf96b3               ; <+67>
    0x10edf969a <+42>:  nopw   (%rax,%rax)
    0x10edf96a0 <+48>:  cmpq   $0x0, (%rdx,%r8,8)
    0x10edf96a5 <+53>:  je     0x10edf972c               ; <+188>
    0x10edf96ab <+59>:  incq   %r8
    0x10edf96ae <+62>:  cmpq   %r9, %r8
    0x10edf96b1 <+65>:  jb     0x10edf96a0               ; <+48>
->  0x10edf96b3 <+67>:  cmpq   %rdi, 0x3b514e(%rip)      ; __immutablePlaceholderArray
    0x10edf96ba <+74>:  je     0x10edf96d2               ; <+98>
->  0x10edf96bc <+76>:  cmpq   %rdi, 0x3b514d(%rip)      ; __mutablePlaceholderArray
    0x10edf96c3 <+83>:  jne    0x10edf97b7               ; <+327>
    0x10edf96c9 <+89>:  movq   0x3aa260(%rip), %rdi      ; (void *)0x000000010f1a5db0: __NSArrayM
    0x10edf96d0 <+96>:  jmp    0x10edf9717               ; <+167>
    0x10edf96d2 <+98>:  cmpq   $0x1, %r9
    0x10edf96d6 <+102>: je     0x10edf96f5               ; <+133>
    0x10edf96d8 <+104>: testq  %r9, %r9
    0x10edf96db <+107>: jne    0x10edf9710               ; <+160>
    0x10edf96dd <+109>: leaq   0x3b7c9c(%rip), %rax      ; __NSArray0__
    0x10edf96e4 <+116>: movq   (%rax), %rdi
    0x10edf96e7 <+119>: movq   0x3a862a(%rip), %rsi      ; "retain"
    0x10edf96ee <+126>: popq   %rbp
    0x10edf96ef <+127>: jmpq   *0x371b2b(%rip)           ; (void *)0x000000010e961ac0: objc_msgSend
    0x10edf96f5 <+133>: movq   0x3aa224(%rip), %rdi      ; (void *)0x000000010f1a5d60: __NSSingleObjectArrayI
    0x10edf96fc <+140>: movq   (%rdx), %rdx
    0x10edf96ff <+143>: movq   0x3a92c2(%rip), %rsi      ; "__new::"
    0x10edf9706 <+150>: xorl   %ecx, %ecx
    0x10edf9708 <+152>: callq  *0x371b12(%rip)           ; (void *)0x000000010e961ac0: objc_msgSend
    0x10edf970e <+158>: popq   %rbp
    0x10edf970f <+159>: retq   
    0x10edf9710 <+160>: movq   0x3aa211(%rip), %rdi      ; (void *)0x000000010f1a5d88: __NSArrayI
    0x10edf9717 <+167>: movq   0x3a92b2(%rip), %rsi      ; "__new:::"
    0x10edf971e <+174>: xorl   %r8d, %r8d
    0x10edf9721 <+177>: movq   %r9, %rcx
    0x10edf9724 <+180>: callq  *0x371af6(%rip)           ; (void *)0x000000010e961ac0: objc_msgSend
    0x10edf972a <+186>: popq   %rbp
; 后也略
{% endhighlight %}

让我们重点关注两个箭头所指向的cmpq指令吧。可以很清楚地知道，其实就是判断self == __immutablePlaceholderArray和self == __mutablePlaceholderArray。也就是说，CoreFoundation在某个时机初始化了两个NSPlaceholderArray，分别存起来。在调用__NSPlaceholderArray的`initWithObjects:count:`方法时，直接通过判断存起来的这两个单例来判断是否是不可变还是可变数组。真相就是这么赤裸裸的简单粗暴。

我们再来看看`+[NSArray allocWithZone:]`

{% highlight nasm %}
CoreFoundation`+[NSArray allocWithZone:]:
    0x10b5004a0 <+0>:   pushq  %rbp
    0x10b5004a1 <+1>:   movq   %rsp, %rbp
    0x10b5004a4 <+4>:   pushq  %r15
    0x10b5004a6 <+6>:   pushq  %r14
    0x10b5004a8 <+8>:   pushq  %rbx
    0x10b5004a9 <+9>:   subq   $0x18, %rsp
    0x10b5004ad <+13>:  movq   %rdx, %r14
    0x10b5004b0 <+16>:  movq   %rdi, %rbx
    0x10b5004b3 <+19>:  movq   0x3aa47e(%rip), %rdi      ; (void *)0x000000010b8acdd8: NSArray
    0x10b5004ba <+26>:  movq   0x3a9647(%rip), %r15      ; "self"
    0x10b5004c1 <+33>:  movq   %r15, %rsi
    0x10b5004c4 <+36>:  callq  *0x371d56(%rip)           ; (void *)0x000000010b068ac0: objc_msgSend
->  0x10b5004ca <+42>:  cmpq   %rbx, %rax
    0x10b5004cd <+45>:  je     0x10b500511               ; <+113>
    0x10b5004cf <+47>:  movq   0x3aa392(%rip), %rdi      ; (void *)0x000000010b8ace50: NSMutableArray
    0x10b5004d6 <+54>:  movq   %r15, %rsi
    0x10b5004d9 <+57>:  callq  *0x371d41(%rip)           ; (void *)0x000000010b068ac0: objc_msgSend
->  0x10b5004df <+63>:  cmpq   %rbx, %rax
    0x10b5004e2 <+66>:  je     0x10b500521               ; <+129>
    0x10b5004e4 <+68>:  movq   %rbx, -0x28(%rbp)
    0x10b5004e8 <+72>:  movq   0x3aa7e9(%rip), %rax      ; (void *)0x000000010b8acea0: NSArray
    0x10b5004ef <+79>:  movq   %rax, -0x20(%rbp)
    0x10b5004f3 <+83>:  movq   0x3a88b6(%rip), %rsi      ; "allocWithZone:"
    0x10b5004fa <+90>:  leaq   -0x28(%rbp), %rdi
    0x10b5004fe <+94>:  movq   %r14, %rdx
    0x10b500501 <+97>:  callq  0x10b6acb50               ; symbol stub for: objc_msgSendSuper2
    0x10b500506 <+102>: addq   $0x18, %rsp
    0x10b50050a <+106>: popq   %rbx
    0x10b50050b <+107>: popq   %r14
    0x10b50050d <+109>: popq   %r15
    0x10b50050f <+111>: popq   %rbp
    0x10b500510 <+112>: retq   
    0x10b500511 <+113>: movq   0x3aa428(%rip), %rdi      ; (void *)0x000000010b8ace78: __NSPlaceholderArray
    0x10b500518 <+120>: movq   0x3a94d9(%rip), %rsi      ; "immutablePlaceholder"
    0x10b50051f <+127>: jmp    0x10b50052f               ; <+143>
    0x10b500521 <+129>: movq   0x3aa418(%rip), %rdi      ; (void *)0x000000010b8ace78: __NSPlaceholderArray
    0x10b500528 <+136>: movq   0x3a94f1(%rip), %rsi      ; "mutablePlaceholder"
    0x10b50052f <+143>: addq   $0x18, %rsp
    0x10b500533 <+147>: popq   %rbx
    0x10b500534 <+148>: popq   %r14
    0x10b500536 <+150>: popq   %r15
    0x10b500538 <+152>: popq   %rbp
    0x10b500539 <+153>: jmpq   *0x371ce1(%rip)           ; (void *)0x000000010b068ac0: objc_msgSend
    0x10b50053f <+159>: nop    
{% endhighlight %}

依旧看两个箭头，可以看到当self为NSArray和NSMutableArray时候分别返回immutablePlaceholder和mutablePlaceholder，它们都是__NSPlaceholderArray类型的。这样就验证了上面的想法。

# Primitive methods

上面多处提到了`initWithObjects:count:`。为什么它这么重要？我们可以看看NSArray的interface是如何定义的：

{% highlight objc %}
@interface NSArray<__covariant ObjectType> : NSObject <NSCopying, NSMutableCopying, NSSecureCoding, NSFastEnumeration>

@property (readonly) NSUInteger count;
- (ObjectType)objectAtIndex:(NSUInteger)index;
- (instancetype)init NS_DESIGNATED_INITIALIZER;
- (instancetype)initWithObjects:(const ObjectType _Nonnull [_Nullable])objects count:(NSUInteger)cnt NS_DESIGNATED_INITIALIZER;
- (nullable instancetype)initWithCoder:(NSCoder *)aDecoder NS_DESIGNATED_INITIALIZER;

@end
{% endhighlight %}

不同于普通的继承，在创建某个类蔟的具体的子类时，通常不需要实现所有的功能。也不同于普通的抽象类，在公共的抽象基类中，一般提供了辅助的方法的实现，子类只需要提供几个核心方法的实现即可。

在CoreFoundation的类蔟的抽象工厂基类（如NSArray、NSString、NSNumber等）中，Primitive methods指的就是这些核心的方法，也就是那些在创建子类时必须要重写的方法，通常在类的interface中声明，在文档中一般也会说明。其他可选实现的方法在Category中声明。同时还需要注意其整个继承树的祖先的Primitive methods也都需要实现。

# 总结

虽然类蔟的概念还算是比较易懂的，但深究下去总有精彩，有些地方真是出人意料。这篇文章也是因为看到书上一句话产生的疑惑而诞生的，说明了书还是该认真读，好书应多读几遍。

# 参考资料

* [Class Clusters](https://developer.apple.com/library/content/documentation/General/Conceptual/CocoaEncyclopedia/ClassClusters/ClassClusters.html)
* [Abstract factory pattern](https://en.wikipedia.org/wiki/Abstract_factory_pattern)
* [objc4](https://opensource.apple.com/tarballs/objc4/)
* [GNUstep](http://www.gnustep.org/)
* [Subclassing Class Clusters](https://mikeash.com/pyblog/friday-qa-2010-03-12-subclassing-class-clusters.html)
* 《Effective Objective-C 2.0》
