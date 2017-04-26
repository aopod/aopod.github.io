---
layout: post
title:  "UITableView tableHeaderView自动隐藏"
date:   2017-04-18 22:22:22 +0800
categories: iOS
tags: Objective-C UITableView
---

可以说UITableView是iOS开发中极为重要的一个View。其头部(Header)的展示也是非常重要。其中一种常见的需求就是Header跟随TableView滑动中间，需要根据情况将头部收起或者完全展示出来。当然常见的做法可以通过KVO监听contentOffset，或者通过UIScrollViewDelegate获取contentOffset的值后进行处理——直到我注意到UISearchBar竟然完美地实现了这个效果，于是就有了本文。

<!-- more -->

# 效果预览

![AOPAutohideTableViewHeader][image-demo]

# 常见方案

首先很理所当然地我们会想到监听contentOffset的变化或者实现UIScrollViewDelegate来获取滚动位置的变化，然后判断是否应该回滚或者继续滚动以收起头部或者完整展示出头部。看似很简单的一个思路，但是真正实现起来却发现有很多情况需要考虑进去，比如滚动方向、加速度、滚动距离等。真的要实现出完美的效果是要下一番功夫的。本文的重点不在这儿，所以跳过。

# 意外的发现

然后我注意到了UISearchBar天生就适合做这事。只要设置`tableView.tableHeaderView = searchBar;`就能完美实现想要的效果。在注意到这个事实的一开始，我是非常奇怪的——毕竟它看上去并没干啥。而且当我满怀疑虑地将UISearchBar换为UIView时，并不会实现和UISearchBar相同的效果。所以有理由相信——UISearchBar一定有猫腻。

# 可能性

首先我不得不考虑一种情况：在tableHeaderView = searchBar的时候，searchBar修改了tableView的逻辑。当然这种可能性很快被降最低，毕竟这并不是一种好办法，没理由花这么大力气去做这么件事。

那还有可能怎么做到的呢？可能UISearchBar中可能包含相关代理？但显然此时还是能够将UITableView的代理设为其它的，所以这种情况也几乎是不可能的。

然后就是Method Swizzling？这是个好工具，那么如果这么做，在UISearchBar中极有可能存在着类似"prefix_*scroll*"命名的方法。但是通过查看其私有API，并没有发现对应方法。所以这种方式的可能也是极低的。

# 方案

使用UISearchBar的确很完美，不仅能正确地隐藏或者显示Header，并且能设置delegate，而且在我尝试打印contentOffset、contentInset时，发现它们跟正常的scrollView是一样的——这就显得这个方案更加完美了。还是需要深究一下。

## 方案一

既然UISearchBar如此神奇，那么首先我们就试试把UISearchBar清空，当作UIView来使用。为了方便使用，我们创建个子类吧。

{% highlight objc %}
@interface AOPSearchBar : UISearchBar
@end

@implementation AOPSearchBar
- (instancetype)initWithFrame:(CGRect)frame
{
    self = [super initWithFrame:frame];
    if (self) {
        for (UIView *view in self.subviews) {
    	    [view removeFromSuperview];
    	}
    }
    return self;
}
@end
{% endhighlight %}

此时可以将它当作正常的UIView来使用，算是勉强实现了效果。但是这并非一个好办法，毕竟UISearchBar还是臃肿的一个类，我们只需要一个简单的UIView，就继续找找有没有其他的方案吧。

## 方案二

鉴于UISearchBar只用`tableView.tableHeaderView = searchBar;`就实现了功能，我们还是要探究下这样一个简单的赋值操作背后到底发生了什么——不可避免地又得进入汇编代码了，在此仅截取关键代码。

{% highlight nasm %}
0x109f887ba <+707>: jne    0x109f887f6               ; <+767>
0x109f887bc <+709>: movq   0x10296ad(%rip), %rdi     ; (void *)0x000000010afd9098: UISearchBar
0x109f887c3 <+716>: movq   0xfed24e(%rip), %rsi      ; "class"
0x109f887ca <+723>: callq  *%r12
0x109f887cd <+726>: movq   0xfed66c(%rip), %rsi      ; "isKindOfClass:"
0x109f887d4 <+733>: movq   %r14, %rdi
0x109f887d7 <+736>: movq   %rax, %rdx
0x109f887da <+739>: callq  *%r12
0x109f887dd <+742>: testb  %al, %al
0x109f887df <+744>: je     0x109f887f6               ; <+767>
0x109f887e1 <+746>: movq   0xff7628(%rip), %rsi      ; "setTableHeaderViewShouldAutoHide:"
0x109f887e8 <+753>: movl   $0x1, %edx
0x109f887ed <+758>: movq   %r13, %rdi
0x109f887f0 <+761>: callq  *0xd25b9a(%rip)           ; (void *)0x000000010b690ac0: objc_msgSend
{% endhighlight %}

不得不提的是一开始将UISearchBar这么几个字给忽略了——因为我就是用的UISearchBar进行赋值。后面才意识到——这丫竟然是写死的(Hard-coded)，也就是说，其实tableView对UISearchBar开了后门，只要是UISearchBar，那么就有这个特权，于是我们可以通过Runtime来验证这个设想，让我们再来创建一个普通的UIView吧。

{% highlight objc %}
@interface AOPAutohideHeaderView : UIView
@end

@implementation AOPAutohideHeaderView
- (BOOL)isKindOfClass:(Class)aClass
{
    if (aClass == [UISearchBar class]) {
        return YES;
    }
    return [super isKindOfClass:aClass];
}
@end
{% endhighlight %}

主要思路就是在通过`isKindOfClass:`判断是否为UISearchBar的时候，直接让调用方认为这是个UISearchBar。将其实例作为tableHeaderView后，可以发现竟然和UISearchBar是一个效果的。如果就这么结束了那也未免太过无趣。我们注意到判断`isKindOfClass:`后紧跟着`setTableHeaderViewShouldAutoHide:`——这是不是就是关键的代码？可以通过设置普通的UIView后再手动调用这个方法，很遗憾地发现似乎并没什么用。暂且放过这个细节，我们来探讨探讨其他方案。

## 方案三

虽然方案二看起来十分的简洁，但有显而易见的一个缺点：有可能让外界认为这是个UISearchBar（但是请看着我的眼睛告诉我你不会这么做！）。虽然大部分情况下是没什么关系的，但我们还是来看看有没有其他方案。从等号右边入手暂时似乎只能止步于此了，那让我们来看看等号左边也就是tableView有没有可以作为的地方。

让我们再回到`setTableHeaderViewShouldAutoHide:`。虽然很显而易见地一定跟它有关，但单独设置它却并没有什么用，也是一件很奇怪的事。既然肯定同`isKindOfClass:`方法有关，那么我们给它打个断点，看看到底是哪儿调用了它。

{% highlight objc %}
// 1
[UITableView setTableHeaderView:]
[UITableView _isTableHeaderAutohiding]
[AOPAutohideHeaderView isKindOfClass:]

// 2
[UITableView setTableHeaderView:]
[AOPAutohideHeaderView isKindOfClass:]

// 3
[UITableView _isTableHeaderAutohiding]
[AOPAutohideHeaderView isKindOfClass:]
{% endhighlight %}

可以知道两个地方调用了它，分别是`setTableHeaderView:`和`_isTableHeaderAutohiding`。这也就是为什么单独设置`setTableHeaderViewShouldAutoHide:`并没有什么用的原因了，事实上还有一个地方在`_isTableHeaderAutohiding:`上。知道了这点我们就能够给出方案三了——创建一个TableView的子类。

{% highlight objc %}
@interface AOPAutohideHeaderTableView : UITableView
- (void)aop_setTableHeaderView:(UIView *)tableHeaderView autohide:(BOOL)autohide;
@end

@interface UITableView ()
- (BOOL)_isTableHeaderAutohiding;	///< 暴露父类接口
@end

@interface AOPAutohideHeaderTableView ()
@property (nonatomic, assign) BOOL aop_tableHeaderViewAutohide;
- (void)setTableHeaderViewShouldAutoHide:(BOOL)autohide;
@end

@implementation AOPAutohideHeaderTableView
- (void)aop_setTableHeaderView:(UIView *)tableHeaderView autohide:(BOOL)autohide
{
    [self setTableHeaderView:tableHeaderView];
    self.aop_tableHeaderViewAutohide = autohide;
    [self setTableHeaderViewShouldAutoHide:autohide];
}
- (BOOL)_isTableHeaderAutohiding
{
    if (_aop_tableHeaderViewAutohide) {
        return YES;
    } else {
        return NO;
    }
}
@end
{% endhighlight %}

这边建立了自己的setTableHeaderView同原来的方法区分开来，并且通过此方法设置的tableHeaderView，可以根据情况改变其行为，所以即使是UISearchBar也能够同正常UIView一样滑动了。

虽满心欢喜地在iOS 10上正常地运行起来了，但在测试iOS 8和iOS 9的时候，发现并未实现预期的效果，再进一步排查后，发现是iOS 8/9与iOS 10的实现有区别，调用`isKindOfClass:`的时机如下：

{% highlight objc %}
[UITableView setDelegate:]
[AOPAutohideTableHeaderView isKindOfClass:]

[UITableViewRowData heightForTableHeaderViewHiding]
[AOPAutohideTableHeaderView isKindOfClass:]
{% endhighlight %}

事实上，主要在于UITableViewRowData中的`heightForTableHeaderViewHiding`方法调用。而此方法由UITableView的`heightForTableHeaderViewHiding`调用。所以重写此方法即可。

{% highlight objc %}
- (CGFloat)heightForTableHeaderViewHiding
{
    if (_aop_tableHeaderViewAutohide) {
        id rowData = [self _rowData];
        CGFloat height = [rowData heightForTableHeaderView];
        return height;
    } else {
        return 0;
    }
}
{% endhighlight %}

当然上面这段代码是略过了一些细节，完整的代码可以在GitHub中看到。

## Swift支持

为了让此项目更加完善，还是试验了下在Swift项目中如何集成它。事实上变动不大，需要注意的几点：

1. 在Podfile中使用`use_frameworks!`引入项目；
2. 在需要使用的swift文件中引入项目:`import AOPAutohideTableViewHeader`；
3. 对于UIView方案，Objective-C中虽然很简洁，但在Swift中如果使用Interface Builder的话，还需要在代码重新设置一遍tableHeaderView才能生效:`tableView.tableHeaderView = tableView.tableHeaderView`。

## 完善方案

方案二和方案三都可以作为正式的解决方案，但是依然有可以改进的空间。对于UI开发来说，最重要的还是需要支持Interface Builder。所以最终GitHub上的代码是针对Interface Builder作了改进了的。

通过Interface Builder使用时，需要设置对应的值:

![Interface Builder setting](/assets/post/2017/04-18-interface-builder-setting.png)

分别对应枚举AOPAutohideHeaderMode的值：

* AOPAutohideHeaderModeDefault    = 0       // tableHeaderView默认行为
* AOPAutohideHeaderModeAutohide   = 1       // 始终自动隐藏
* AOPAutohideHeaderModeNoAutohide = 2       // 始终不自动隐藏，会消除UISearchBar的本来行为

然后需要支持方便地集成进项目，这边就选用了Cocoapods。分为了两个子Subspec：UIView和UITableView。可单独导入项目。

至于为啥这么简单的一个东西要用上Cocoapods——因为我想试试而已。

## 其他方案

我是很认真地考虑过使用Method Swizzling。但为了这么一个需求替换类的方法并没什么好处，个人觉得这种黑魔法还是慎用。如果有更好的方案欢迎提出。

## 方案总结

总的来说方案一只是个过渡产物，看看就好。方案二和方案三都是可以用的，方案二更为简洁但有小问题；方案三复杂些但适用范围稍广些，但因用上了私有API，可能在上架AppStore时被拒。而且在研究过程中，感觉方案二兼容性还是更强，毕竟说不定哪天UITableView的实现方式又变了……其实在项目开发过程中还是看心情使用了。（毕竟像我这种懒人说不定就用了方案二:D）。

## GitHub & Cocoapods

### GitHub

代码整理到了[GitHub](https://github.com/aopod/AOPAutohideTableViewHeader)上，细节上和文中会有些许不同，文中考虑可读性还是精简了一些东西。

> [https://github.com/aopod/AOPAutohideTableViewHeader](https://github.com/aopod/AOPAutohideTableViewHeader)

### Cocoapods

此方案可通过Cocoapods引入，引入两种方案：

```ruby
# 如为Swift项目则需反注释下面一行
# use_frameworks!
pod "AOPAutohideTableViewHeader", :git => 'https://github.com/aopod/AOPAutohideTableViewHeader'
```

单独引入:

```ruby
# 如为Swift项目则需反注释下面一行
# use_frameworks!
pod "AOPAutohideTableViewHeader/UIView", :git => 'https://github.com/aopod/AOPAutohideTableViewHeader'
```

```ruby
# 如为Swift项目则需反注释下面一行
# use_frameworks!
pod "AOPAutohideTableViewHeader/UITableView", :git => 'https://github.com/aopod/AOPAutohideTableViewHeader'
```

API调用可参照Demo。

# 总结

*正统的*实现方式固然需要知道，但有时借用系统的实现不失为一件好事，追究其内在原因的过程也是挺有意思的。虽然对于这种硬编码的方式，我个人也是觉得有些奇怪，或许苹果是想引入UISearchBar后保持UITableView原有的行为和特性吧。这样一来，虽说自己能够通过其他方式实现类似的效果，但原生的硬编码进去的实现总不会差到哪儿去吧:D。


[image-demo]: /assets/post/2017/04-18-autohide-tableHeaderView.gif "AOPAutohideTableViewHeader"
