---
layout: post
title:  "Method Swizzling"
date:   2016-07-10 18:00:00 +0800
categories: iOS
tags: Runtime
---

得益于Runtime系统，Objective-C将许多工作由编译时推迟到运行时进行。当然，这样的方式会牺牲掉部分性能，但却为这个语言带来了不少灵活性。其灵活性造就的黑魔法之一便是Method Swizzling。通过此方法，我们能够在程序运行时动态地将某个方法的实现与其他的实现交换。


# 消息传递

为了说明Method Swizzling，必须得从消息传递说起。为了动态地调用某一方法，Objective-C中在调用和执行相应的方法之间封装了一层，这个过程即称为消息传递(Messaging)。例如：

`[receiver message]`

在编译的时候，上述代码将被自动转换为如下代码：

`objc_msgSend(receiver, selector)`

于是，Objective-C中的消息发送便转换成了我们熟悉的C（包括其他语言）中的函数调用形式。

当然，如果有传入参数的话，那么最终的代码将被转换为下面的形式：

`objc_msgSend(receiver, selector, arg1, arg2, ...)`

可以看到，最终要执行的方法主要是由receiver和selector共同决定的。在运行的时候，我们可以根据情况传入对应的receiver和selector，也就是说，这两个参数并非在编译的时候就确定了，所以说方法的执行是动态的。这样的动态特性在运行时给了我们不少的发挥空间。

事实上，消息传递的主要原理就在于查表。Objective-C的类维护了一个消息分发表(Dispatch Table)。其Key和Value分别为Selector和方法的指针。当调用`objc_msgSend`时，会先去分发表中查询，找到对应的条目后就通过表中的方法实现指针执行方法。这样一来，我们便可以通过修改此表的Selector所对应的实现指针，达到替换运行时执行的方法的目的。

![消息传递][image-messaging]

# 如果不使用Method Swizzling的话

如果想重写方法，可以使用继承和Category(虽然原理上可以，但强烈不推荐Category去做方法重写)。

不推荐Category进行方法重写的原因在于：

1. 我们经常需要调用原来的方法，如果使用Category的话，无法访问原来的方法；
2. 如果多个Category同时重写了方法的话，最终重写生效的方法是很难确定的。

同样，使用继承也存在一些短板，如：

1. 在部分情况下不够通用，只能继承子类才能访问重写的方法；
2. 为了小的需求需要添加多余的文件，造成管理上的麻烦。

而Method Swizzling，虽然看起来像个黑魔法，但的确能为我们避免不少的问题。

# 示例

考虑这么一种情况：由于不可描述的原因，我们需要在每个ViewController的`ViewWillAppear:`中打印一条神秘信息，通过Method Swizzling的话可以这么做：

首先，创建一个Category (当然不是用来直接重写`ViewWillAppear:`方法)。

{% highlight objective-c %}

#import <objc/runtime.h>

@implementation UIViewController (Tracking)

+ (void)load {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        Class class = [self class];

        SEL originalSelector = @selector(viewWillAppear:);
        SEL swizzledSelector = @selector(xxx_viewWillAppear:);

        Method originalMethod = class_getInstanceMethod(class, originalSelector);
        Method swizzledMethod = class_getInstanceMethod(class, swizzledSelector);

        // 如果重写类方法，可使用以下注释内容
        // Class class = object_getClass((id)self);
        // ...
        // Method originalMethod = class_getClassMethod(class, originalSelector);
        // Method swizzledMethod = class_getClassMethod(class, swizzledSelector);

        BOOL didAddMethod =
            class_addMethod(class,
                originalSelector,
                method_getImplementation(swizzledMethod),
                method_getTypeEncoding(swizzledMethod));

        if (didAddMethod) {
            class_replaceMethod(class,
                swizzledSelector,
                method_getImplementation(originalMethod),
                method_getTypeEncoding(originalMethod));
        } else {
            method_exchangeImplementations(originalMethod, swizzledMethod);
        }
    });
}

#pragma mark - Method Swizzling

- (void)xxx_viewWillAppear:(BOOL)animated {
    [self xxx_viewWillAppear:animated];
    NSLog(@"viewWillAppear: %@", self);
}

@end

{% endhighlight %}

## 源码分析

我们利用Category，直接重写`+load`方法，使用`+load`方法的原因在于确保类在初始化时就执行代码。然后通过`dispatch_once`保证只被执行一次。`didAddMethod`一行可能让人感到比较困惑，它的作用是，如果添加成功了swizzledMethod，则不再进行交换，直接将原来swizzledSelector的实现替换为originalMethod实现；而如果未添加成功，则交换实现。如果不熟悉这方面知识，可能还会感觉到困惑，觉得`didAddMethod`一行其实在做无用功。其实并不是这样的，重点在于——class_addMethod在原来已经存在相应实现的情况下，此方法会返回NO。了解了这点，就能够理解上面的逻辑了：其实`didAddMethod`的存在是为了在原来未实现此方法的情况下，少做一次交换操作。

接下来可能比较令人迷惑的一点在于`[self xxx_viewWillAppear:animated];`是否会造成循环调用。答案是不会的。原因在于`xxx_viewWillAppear:`的实现已经被动态替换为原来的`viewWillAppear:`的实现了，所以此时调用它，事实上调用的是未进行Method Swizzling之前的`viewWillAppear:`方法。这个操作就有点像继承里边的`[super viewWillAppear:animated]`了。

可以看到，通过Method Swizzling，并不会添加多余的类（虽然多了一个Category）。并且保留了原来的实现，可以随时调用原有的实现。在当前需求下，是个不错的方案。


# 多提一句

## 为什么是`+load`而不是`+initialize`

需要明确的一点：*Method Swizzling应该始终在`+load`中进行。*

两个方法都会被Objective-C Runtime自动调用，那么，为什么我们选择`+load`呢？原因就在于，`+load`是在类初次被载入时调用的。而`+initialize`是在类方法或者其实例方法被调用到的时候才会自动调用。这么一看，两个都是可以的。但我们在编程过程中，应该尽可能让程序可控，特别是涉及到Method Swizzling这种涉及影响全局状态的方案。事实上，`+load`的调用时机很明确，就是在类初始化过程中进行；而`+initialize`很难说什么时候被调用到，如果没用到的话，甚至不会被调用到。

## dispatch_once

dispatch_once是个好东西。很适合只需要执行有且只有一次的工作，如实现单例、Method Swizzling代码的执行等。

所以请确保*Method Swizzling都在`dispatch_once`代码块内执行*。

并不是说一定要在此进行，使用它的情况可以避免多线程情况下的竞争，保证只被执行一次。可以自己建立锁机制来保证代码块只被执行一次，但既然系统给了这么一个简单可靠的方法，为什么不用它呢？

# 需要注意的

由于Method Swizzling技术本身的特性，不稍加注意的情况下很容易造成问题。

* 如果需要的话，记得调用原有的实现；
* 尽量避免冲突，一个好的避免方式就是使用前缀；
* 使用`+load`，并且使用`dispatch_once`；
* 尽量避免多次Swizzle同一个方法，不然容易乱套；
* 时刻牢记，当前可以用的方法未来不一定可以用，说不定什么时候被Swizzled的方法被干掉了呢(笑)；
* 写好注释和文档。

# 总结

既然我们称之为*黑魔法*，那么Method Swizzling神奇的另一面，是它的危险性。我们在使用它的时候，需要多个心眼。在确保我们足够了解逻辑、系统和Runtime情况下再去使用它。别让一把利刃把自己割伤。

并且如果没有特别的要求的话，尽量优先选择那些通用的，并且用起来、维护起来比较简单的技术，杀鸡焉用宰牛刀，能够实现实现功能的技术都是好技术。而且通用的简单的方式后来人也更好接手:)


# 参考资料

1. [Objective-C Runtime Programming Guide](https://developer.apple.com/library/mac/documentation/Cocoa/Conceptual/ObjCRuntimeGuide/Articles/ocrtHowMessagingWorks.html)
2. [Method Swizzling](http://nshipster.com/method-swizzling/)


[image-messaging]: /assets/post/2016/07-10-messaging.gif "消息传递"
