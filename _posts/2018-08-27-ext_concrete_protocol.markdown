---
layout: post
title:  "EXTConcreteProtocol浅析"
date:   2019-08-27 22:36:00 +0800
categories: iOS
tags: Objective-C SourceCode
---

在Swift中，一个Protocol能够通过extension为特定的类型提供method, initializer, subscript, computed property的默认实现。这着实是一个很好的特性。那么在Objective-C中是否能够实现类似的效果？答案是肯定的。有若干个库都提供了自己的实现，因为大同小异，这边稍微讲一下[`libextobj`](https://github.com/jspahrsummers/libextobjc)库中的`EXTConcreteProtocol`的实现。

<!-- more -->

# 一个简单的例子

## `example.h`

{% highlight objc %}
@protocol MyProtocol
@required
- (void)someRequiredMethod;

@optional
- (void)someOptionalMethod;

@concrete
- (BOOL)isConcrete;

@end
{% endhighlight %}

## `example.m`

{% highlight objc %}
@concreteprotocol(MyProtocol)

- (BOOL)isConcrete {
    return YES;
}

// this will not actually get added to conforming classes, since they are
// required to have their own implementation
- (void)someRequiredMethod {}

@end
{% endhighlight %}

偷懒摘取了源码注释上的内容，代码看上去比较简洁，我们可以看看简单的几行代码都做了什么。

# 两个宏

## concrete

这个宏的定义很简单:

{% highlight c %}
#define concrete optional
{% endhighlight %}

可以看到使用`@concrete`时，其实展开后是`@optional`。也就是说我们定义了的值被认为是可选的，这样一来某个class遵从此协议的时候，就不用提供自己的实现了（有了optional编译器不会再提示）。如果不实现，则使用提供的默认的实现。

## concreteprotocol(NAME)

这个宏展开后相对复杂，可以拆解成以下几个部分：

1. 定义一个`{NAME}_ProtocolMethodContainer`的interface，即为一个container class；
2. 提供`{NAME}_ProtocolMethodContainer`的implementation，实现`+load`方法，调用`ext_addConcreteProtocol`；
3. 定义一个名为`ext_{NAME}_inject`的constructor，在*类初始化后*调用`ext_loadConcreteProtocol`；
4. 此container class包含了对应Protocol所需要实现的方法。

其中`+load`首先调用，constructor在Objective-C Runtime设置完成后调用。

关于constructor的介绍，可见*[《__attribute__指令》](/2016/08/03/attribute-directives/#constructor--destructor)*。

# 若干个函数

## ext_addConcreteProtocol

{% highlight c %}
BOOL ext_addConcreteProtocol (Protocol *protocol, Class containerClass)
{% endhighlight %}

这个函数在`+load`中先执行到。内部调用了`ext_loadSpecialProtocol`，其回调中执行`ext_injectConcreteProtocol`。

## ext_loadSpecialProtocol

{% highlight c %}
BOOL ext_loadSpecialProtocol (Protocol *protocol, void (^injectionBehavior)(Class destinationClass))
{% endhighlight %}

这个函数在其他地方定义。虽然代码比较长，但完成的功能比较简单，主要是将protocol和传入的回调(injectionBlock)记录起来，并设置ready为NO，留待后续使用。

此步骤主要为收集相关Protocol信息。

## ext_loadConcreteProtocol

{% highlight c %}
void ext_loadConcreteProtocol (Protocol *protocol)
{% endhighlight %}

此函数在constructor中自动被执行，其直接调用了`ext_specialProtocolReadyForInjection`函数，而此函数遍历了`ext_loadSpecialProtocol`中所存储的数据，置`ready = YES`，标记已经准备就绪，并在多次调用后会处理完列表中所有`ready = NO`状态的数据，最后会调用`ext_injectSpecialProtocols`。

此步骤主要确认相关类已经加载成功，前序工作完成。

## ext_injectSpecialProtocols

{% highlight c %}
static void ext_injectSpecialProtocols (void)
{% endhighlight %}

这个函数首先通过Protocol的依赖关系进行了排序。接下来获取了所有的类。遍历所有的Protocol和类。如果类遵从此Protocol，则通过之前保存的injectionBlock注入（调用的`ext_injectConcreteProtocol`）。

## ext_injectConcreteProtocol

{% highlight c %}
static void ext_injectConcreteProtocol (Protocol *protocol, Class containerClass, Class class)`
{% endhighlight %}

可以看到参数为protocol, containerClass, class。从名字可以知道protocol为其所遵从的协议，containerClass为上面concreteProtocol宏所定义的类，class为需要注入的类。

整个过程也中规中矩：

1. 获取containerClass的所有实例方法和类方法；
2. 获取class的meta class；
3. 分别遍历1中获取的实例方法和类方法，如果class不存在对应方法，则动态地将containerClass的对应实现添加到class中。

通过以上函数，就完成了Protocol的默认实现。

# 简单概括

1. `@optional`定义可选(optional)的property/method等；
2. `concreteProtocol`定义了containerClass，实现了对应Protocol需要实现的方法；
3. `+load`动态地收集此类Protocol信息；
4. `constructor`在Runtime设置完成后，自动执行，并在最后一次调用注入方法；
5. 注入方法时，通过遍历对应Protocol和类的关系，将containerClass的实现一一添加到相应的类里。

# 其他

这是一个精彩的利用Objective-C Runtime的例子，可见Runtime的强大。但利用不当，也很可能造成一些难以排查的问题。功能虽好，用时需谨慎。
