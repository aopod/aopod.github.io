---
layout: post
title:  "一个iOS下的URL路由方案"
date:   2017-12-10 22:30:00 +0800
categories: iOS
tags: Objective-C Open-Source
---

所有项目在一定阶段都会遇到组件化的问题。特别是在代码量越来越大、模块越来越多的情况下，都需要一定的机制去简化页面间跳转的流程，并通过这个机制实现不同模块之间一定程度的解耦。在我看来，我需要一个有如下特点的方案：

* 能够聚合为不同模块，以方便管理；
* 也能有灵活性允许分散至不同地方；
* 能够安全、方便地调用，不至于误写导致排查困难；
* 能够像方法一样定义、实现；
* 能够检测重复定义；
* 对编辑器友好，有代码补全、能使用注释；
* 特殊情况允许单独处理；
* 允许重定向；
* 增加起来直观；
* 私有和公共的简单权限控制；
* 缓存机制;
* 错误处理；
* 等等

要求还挺多……那还是自己造个轮子吧。于是催生了这个方案：*[AOPRouter][AOPRouter]*。简单的说，它是一个基于URL形式的、利用了Objective-C Runtime特性的路由方案。

<!-- more -->

# 为什么选用URL形式

URL形式的优点：
* 符合直觉：毕竟URL已经深入人心；
* 分段式表达：scheme://host/path，可对应项目的不同模块或行为，有层次感；
* 通用：在WebView里、App内(间)跳转都能统一形式；
* URL允许传参：不管怎样，任何页面都可能有传参的需要；
* 方便重定向：因为基于URL，换个地址就能重定向至其他模块了；
* 方便替换不同的URL跳转方案：毕竟URL还是比较统一的形式。

# 一些开源方案我不喜欢的方面

* 需要注册URL；
* 无法检测重复注册（不仅限于去重，更重要的在于提示可能的错误)；
* 缺乏错误处理；
* 缓存过重；
* 调用方式不清真；
* 等等

当然，这些问题都是分散在各个方案里的，每个方案都有自己的优点和缺点，AOPRouter自然也不例外。选择合适自己的才是正确的。

# 我的尝试

## 区分模块

可以回想下在Objective-C中，我们如何拆分、管理代码——通过不同类和Category。但如果通过不同类来分散代码有一个致命的缺点：子模块无法知道这个类的存在，也就无法给它添砖加瓦。我的选择是在AOPRouter中创建一个AOPRouterHandler的类，在项目中使用Category扩展路由。比如对于不同的URL可能有如下的对应关系：

| URL 			      | Category |
| ------------------- | -------- |
| test://log          | Log      |
| test://ui/jump      | UI       |
| aop://comment/view  | Comment  |
| aop://comment/reply | Comment  |

通过这样的划分，带来的好处就是：

* 甚至可以在对应的类中去使用Category定义（当然个人并不推荐这种写法，对于小项目，我更喜欢统一管理）；
* 模块更加明确，通过看Category Name就能大致知道属于什么功能。

## URL定义

既然选择了Category，那么使用类的方法（或实例方法）就变得理所当然了。为了将URL格式和方法名对应起来，需要制定一个规则。因此设计了如下的命名形式：

对于URL格式:

`scheme://host/path1/path2`

有类（或者实例）方法：

`+/- (void)scheme:(AOPRouterContext *)context host$path1$path2:_ {}`

此时，我们可以通过查询`@selector(scheme:host$path1$path2:)`来判断此URL路由是否存在。

不过由于命名字符天生的限制，不能包含诸如`-`, `+`, `&`等的一些字符，这些在前期制定具体URL时可以加以避免。对于不可避免的`-`,`.`来说，我是分别转换为`$`,`$$`，这个在定义的时候需要注意。

另外注意到类方法(+)和实例方法(-)的定义，通过这二者还可以分别区分公共方法和私有方法。

## 先定义后实现

因为如果声明了方法，但没有实现，Xcode会提示。我们可以利用这一点，始终声明对应的方法。

{% highlight objc %}
+/- (void)scheme:(AOPRouterContext *)context host$path1$path2:_;
{% endhighlight %}

这样一来，我们先声明了一个方法，然后Xcode自动帮我们完成去实现这个方法的提示工作。同时，在同一个类中，如果重复定义了相同的方法，Xcode也会提示我们（但是不够给力，还需要另外的机制）。这些特性方便我们在编译期及之前就定位到问题所在。

## 代码补全

为了能够有代码补全功能，我选择定义property。其格式如下：

{% highlight objc %}
/*
 * This is comment
 */
@property(nonatomic,strong,readonly) NSString *scheme_host_path1_path2;
{% endhighlight %}

当然，使用`_`可能会造成其他的问题（比如无法区分`_`和`/`）。但对比问题少些的表达：scheme$host$path1$path2来说，使用下划线更明显些，并且通过实践，`_`对代码补全更加友好。

并且，我们需要通过这个property获取到对应的URL地址。

{% highlight objc %}
- (NSString *)scheme_host_path1_path2
{
	return @"scheme://host/path1/path2";
}
{% endhighlight %}

当引入property之后，就可以方便地通过[AOPRouterHandler new].propertyName获取到对应的正确的URL值。通过给property加上注释，还能在代码补全的基础上引入注释提示的功能。

## 宏的引入

当然上面的实现未免太过繁杂，如果定义一个URL都要如此大费周张，那么这个方案的可用性也就大打折扣了。所幸我们有宏这个助手。

对于声明一个路由，我们定义为这种形式：

{% highlight objc %}
`@AOPRouterMethodName(SCHEME,HOST,PATH1,PATH2)`
{% endhighlight %}

其展开为
{% highlight objc %}
/**
 * Comment
 */
property(nonatomic,strong,readonly) NSString *scheme_host_path1_path2;
{% endhighlight %}

对于实现，定义为这种形式：
{% highlight objc %}
/**
 * Comment
 */
- AOPRouterMethodImpl(VISIBILITY,SCHEME,HOST,PATH1,PATH2) {
	// Do something
}
{% endhighlight %}

其展开为:
{% highlight objc %}
(NSString *)scheme_host_path1_path2 {
	return @"scheme" "/" "host" "/" "path1/path2";
}
+/- (void)scheme:(AOPRouterContext *)context host$path1$path2:_ {
	
}
{% endhighlight %}

注意到上面去掉了方法的声明，而通过property的实现有无来提示是否实现了方法（因为宏将它们绑定到了一块儿）。至于为啥前面有`@`,`-`——其实还是经过试验，发现这样对Xcode最为友好。如果有更好的表现形式希望告知我。

## 检测重复

使用Category的固有缺陷之一就在于其允许重写一个方法，也就是说我们很容易就不小心覆盖掉原先的路由。我的解决方案比较简单粗暴——让它在编译时出错。通过宏控制在DEBUG模式中在__DATA区域保存类似名为`_aop_router$checker$scheme$host$path1$path2`的变量，如果有相同的名字的变量存在，在编译时就会提示错误，这样就能很快的发现重复了。

## 未命中处理

原本只实现了一个defaultMissHandler。但其实对应到不同模块里，这样的处理还是略显单薄。所以我又另外实现了一个分层的miss handler。也就是可以分别制定形如：`scheme://host`, `scheme://host/path1`, `scheme://host/path1/path2`这样的未命中处理。一旦没找到，便从最后一种形式开始往前找，如果存在对应handler，并且返回YES，则不再继续往前查找。封装为如下宏调用：

{% highlight c %}
AOPRouterMissHandler(SCHEME,...)
{% endhighlight %}

其展开为
{% highlight objc %}
+ (BOOL)missHandler:(AOPRouterContext *)context scheme$host$path1$path2:_ {
	
}
{% endhighlight %}

当然还是给它加上了重复检测。因为难免会重复，而且由于URL分段表达的特点，一般一个模块专门负责其中一段，不应该插手其他模块的事务。所以未命中处理也就暂不考虑重复的情况了。


## 路由的分发

逻辑主要在AORouter类中。主要逻辑为：

1. 获取URL对应的方法的selector；
2. 分别判断类的类方法、实例方法是否存在；
3. 如果限定访问公共接口，那么如果类方法不存在则进入对应未命中处理，如果无法处理则使用默认错误处理；
4. 如果类方法和实例方法都不存在，那么进入对应的未命中处理，如果无法处理则使用默认错误处理；
5. 通过NSInvocation调用查找到的方法（传入context参数）。

## 缓存

方案在表面上并没做缓存，但其实很大程度上缓存由Runtime负责了。也就是通过机制的实现形式的选择，这个方案自然地利用了系统级别的缓存实现。目前暂无打算实现自己的一套缓存机制。

# 注意点（和缺点）

* 命名允许的字符有所限制；
* 因为宏限制，path最大个数为19个（一般都够用）,如果不够用可以扩展宏;
* 无法区分`_`和`/`，所以`scheme://host/path1_path2`和`scheme://host/path1/path2`会判定为相同的路由；
* 尽量少在URL中使用`-`,`.`（特别提到这俩是因为它们比较常见）。定义它们分别要替换为:`$`,`$$`。
* 无法在URL的path中附加其他信息，如：`aop://comment/:commend_id`。这个方法要求变量始终在query中体现；
* 声明上将URL的`/`处理成了`,`，不是原汁原味的URL表达（但至少是分段的）。

# 示例

## 简单处理和重定向

{% highlight c %}
@interface AOPRouterHandler (Blog)

/**
 Open my blog
 aop://blog/open
 */
@AOPRouterMethodName(aop,blog,open);

/**
 Redirect to aop://blog/open
 */
@AOPRouterMethodName(aop,blog,redirect);

@end

@implementation AOPRouterHandler (Blog)

- AOPRouterMethodImpl(+,aop,blog,open)
{
    [UIApplication.sharedApplication openURL:[NSURL URLWithString:@"http://www.aopod.com"]];
}

- AOPRouterMethodImpl(+,aop,blog,redirect)
{
    context.url = [NSURL URLWithString:kAOPRouterPath(aop_blog_open)];
    [AOPRouter openInternalWithContext:context];
}

@end

{% endhighlight %}

## 获取参数

包含默认的AOPRouterContext类型的context变量。

{% highlight c %}
- AOPRouterMethodImpl(-,aop,log)
{
    NSString *message = context.parameters[@"message"];
    NSLog(@"log a message: %@", message);
}
{% endhighlight %}

## 未命中处理

{% highlight c %}
AOPRouterMissHandler(aop)
{
    NSLog(@"Miss handler: %s", __FUNCTION__);
    return YES;
}

AOPRouterMissHandler(aop,log)
{
    NSLog(@"Miss handler: %s", __FUNCTION__);
    return YES;
}
{% endhighlight %}

## 调用

{% highlight c %}
[AOPRouter open:kAOPRouterPath(aop_blog_open)];

[AOPRouter openInternal:kAOPRouterPath(aop_log)
                     parameters:@{
                                  @"message": @"Hello, World!"
                                  } animated:NO];

AOPRouterOpen(aop_blog_redirect);

{% endhighlight %}

上面出现两个宏:`AOPRouterOpen`, `kAOPRouterPath`，分别是快速打开某个property对应的URL和获取某个property对应的URL。主要用途仅为简化调用。完整调用应参照AOPRouter实现。

# GitHub & Cocoapods

## GitHub

> [https://github.com/aopod/AOPRouter](https://github.com/aopod/AOPRouter)

## Cocoapods

```ruby
# 如为Swift项目则需反注释下面一行
# use_frameworks!
pod 'AOPRouter', :git => 'https://github.com/aopod/AOPRouter'
```

API调用参照Demo。

# 总结

其实最终开源出来的方案和一开始所写的还是有些出入。毕竟开源出来要考虑的是将它抽取为一个单独的模块，期间对原型做了一些改动。比如一开始对于模块的划分是以不同类+不同Category的形式处理的，但这样处理不利于子模块集成。还有一开始的重复检测在抽取出来后无法正常工作，然后又加了点技巧进去，处理可以看代码。

最后，这个方案自然有其优点，缺点也是显然的。每种方案必然带着其优点和缺点。但就一个方案来说，这次封装的感悟之一就是不仅要实现功能，而且要友好。友好有多方面的因素：API友好、对编辑器友好、对开发者友好、对测试友好等。但不可能尽善尽美，需要做权衡和折衷。总之选择适合自己项目的方案就好。也欢迎提供意见和建议。


[AOPRouter]: https://github.com/aopod/AOPRouter
