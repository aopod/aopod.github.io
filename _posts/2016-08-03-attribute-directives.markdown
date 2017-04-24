---
layout: post
title:  "__attribute__指令"
date:   2016-08-03 10:30:00 +0800
categories: iOS
tags: Objective-C Compiler Clang
---

__attribute__指令在C、C++和Objective-C中修饰一段代码，用处一是为编译器提供上下文，用处之二是为未来看到这段代码的人（包括自己）提供额外的信息。__attribute__指令对编译器优化有重要意义，并且对于开发者来说一定程度的额外信息是有积极意义的。在开发过程中可以发现苹果的SDK中已经普遍运用了__attribute__指令。

<!-- more -->

__attribute__指令格式如下：

{% highlight C %}
__attribute__((attribute-list))
{% endhighlight %}

可以看到__attribute__后跟随了两个圆括号，主要是为了与宏区分开来。其中的attribute-list由逗号`,`隔开，每个attribute可为如下格式：

* 空值，将会被忽略；

* 一个词，例如：unused、const等；

* 一个词，跟随着括号，括号里为此attribute的参数，每个参数可为如下形式：

    * 一个标识符，如：`__attribute__((mode))`

    * 一个标识符，后面跟随着逗号和非空的由逗号隔开的表达式列表，例如`__attribute__((format(printf, 1, 2)))`；

    * 一个由逗号隔开的表达式列表，如`__attribute__((format_arg(2)))`

__attribute__根据不同attribute，可以拿来修饰函数、变量、类型声明等，放置的位置也有所不同。

# 什么时候该用__attribute__？

## 能用就用

*在充分了解了所要使用的指令后*，尽量用上。但考虑到使用__attribute__可能带来的风险，建议一定在了解其特性后使用，不然它在一些情况下也能造成一些难以调试的Bug。

## 警惕其可能带来的风险

毕竟，__attribute__指令主要是给编译器看的——优化不是错，编译器也不容易出错，但人却很容易出错。考虑下面一段代码：

{% highlight objc %}
// Header declarations

typedef NS_ENUM(char, XPL802_11Protocol) {
    XPL802_11ProtocolA = 'a',
    XPL802_11ProtocolB = 'b',
    XPL802_11ProtocolG = 'g',
    XPL802_11ProtocolN = 'n'
};

FOUNDATION_EXPORT NSString *XPL802_11ProtocolToString(XPL802_11Protocol protocol);

// Implementation

NSString *XPL802_11ProtocolToString(XPL802_11Protocol protocol)
{
    switch(protocol) {
        case XPL802_11ProtocolA:
             return @"802.11a";
        case XPL802_11ProtocolB:
             return @"802.11b";
        case XPL802_11ProtocolG:
             return @"802.11g";
        case XPL802_11ProtocolN:
             return @"802.11n";
        default:
           break;
    }
    return nil;
}
{% endhighlight %}

在上述代码中，`XPL802_11ProtocolToString`函数返回了一个字符串的指针常量，这些指针常量都存储在文字常量区，是不可变的且拥有无限大的引用计数。此时我们可以利用__attribute__来告诉编译器进行优化：

{% highlight objc %}
FOUNDATION_EXPORT NSString*XPL802_11ProtocolToString(XPL802_11Protocol protocol)__attribute__((const));
{% endhighlight %}

上面的代码里，我们向编译器打包票这个函数返回的是个常量，妥妥哒！而且这段代码的确运行得棒棒哒，完美收工！但万恶的产品经理偏偏不让你清闲，于是一段时候后你不得不把代码改为如下形式：

{% highlight objc %}
NSString *XPL802_11ProtocolToString(XPL802_11Protocol protocol)
{
switch(protocol) {
    case XPL802_11ProtocolA:
    case XPL802_11ProtocolB:
    case XPL802_11ProtocolG:
    case XPL802_11ProtocolN:
       return [NSString stringWithFormat:@"802.11%c", protocol];
    default:
       break;
  }
      return nil;
}
{% endhighlight %}

插上手机，运行，通过！妥妥哒，生活真美好！直到产品上线……突然收集到了N+1个崩溃，而且你在机器上不断运行不断调适，都无法重现，突然这个世界都不够美好了，到底怎么了？

原因在于大部分开发者在开发中都是Debug模式，此模式下很多优化都被禁用了，于是我们告诉编译器进行的工作编译器可能并没进行，而一旦发布出去，编译器把该做的优化都做了，问题也就随之出现了。

上面的问题在于原来我们告诉编译器返回的是个常量，毕竟是字符串常量嘛。但一旦我们用上`[NSString stringWithFormat:@"802.11%c", protocol]`，事情就不一样了。编译器依旧呆萌呆萌地把这个指针当作常量。但是，字符串常量有着无限大的retain count，而后者只是普通的在堆上的字符串，它只有有限的引用计数。于是就可能出现还没用上返回值，它就被回收了，然后不小心就访问了个野指针。

所以，因为不了解或者不小心引起的问题是很难调试的，这就要求我们在使用时要多加小心。但容易出现问题并不是说我们不能用它，而是要小心谨慎，毕竟大部分指令还是很好用。

# 一些常用的attribute

## availability

这个应该在iOS开发中相当常见，用于声明所修饰的对象的访问性。有如下参数可选：

* 平台，可为macosx, ios, tvos, watchos；
* 何时引入，introduced=版本；
* 何时弃用，deprecated=版本；
* 何时废弃，obsoleted=版本；
* 不可用，unavailable，标识此平台不可用；
* 额外信息，message=字符串，可用来额外说明，如提示新的可用的替代方法。

下面是一些例子：

{% highlight objc %}
- (void)deprecatedMethod1 __attribute__((availability(ios, introduced=5, deprecated=8.0, obsoleted=9.0, message="It's deprecated")));
- (void)deprecatedMethod2 __attribute__((availability(ios, unavailable, message="It's deprecated")));
- (void)deprecatedMethod3 __attribute__((availability(ios, deprecated=8.0, message="It's deprecated")));
- (void)deprecatedMethod4 __attribute__((availability(ios, obsoleted=9.2, message="It's deprecated")));
// 因为还是可用，所以message虽然设置了，编译时并不会提示
- (void)deprecatedMethod5 __attribute__((availability(ios, introduced=9.2, message="It's deprecated"))); 
{% endhighlight %}

当然，也有些稍微简单的用法：

{% highlight objc %}
- (void)deprecatedMethod1 __attribute__((unavailable("It's deprecated")));
- (void)deprecatedMethod2 __attribute__((deprecated));
- (void)deprecatedMethod3 __attribute__((deprecated("It's deprecated")));
- (void)deprecatedMethod4 __attribute__((unavailable("It's deprecated")));
{% endhighlight %}

不过直接使用__attribute__还是稍显啰嗦了些，不过Foundation为我们封装了以下的宏：

* NS_AVAILABLE(_mac, _ios)
* NS_AVAILABLE_MAC(_mac)
* NS_AVAILABLE_IOS(_ios)
* NS_DEPRECATED(_macIntro, _macDep, _iosIntro, _iosDep, ...)
* NS_DEPRECATED_MAC(_macIntro, _macDep, ...)
* NS_DEPRECATED_IOS(_iosIntro, _iosDep, ...)

以下就是这些宏的简单用法，相比之下比上面的简洁许多。

{% highlight objc %}
- (void)deprecatedMethodMacro1 NS_AVAILABLE(10, 8);
- (void)deprecatedMethodMacro2 NS_AVAILABLE_MAC(10);
- (void)deprecatedMethodMacro3 NS_AVAILABLE_IOS(8);
- (void)deprecatedMethodMacro4 NS_DEPRECATED(10, 10.4, 8, 9, "It's deprecated");
- (void)deprecatedMethodMacro5 NS_DEPRECATED_MAC(10, 10.4, "It's deprecated");
- (void)deprecatedMethodMacro6 NS_DEPRECATED_IOS(8, 9, "It's deprecated");
{% endhighlight %}


## format(archetype, string-index, first-to-check)

format允许编译器检查传入的参数的格式，可以为printf、scanf类型风格的标准格式化输入输出方法类型。

* archetype：
    可以为printf、scanf类型的标准格式化输入输出方法类型，如，printf、scanf、strftime、strfmon，下面是一些例子：
{% highlight objc %}
void printfFormat1(const char *format, char *s, ...) __attribute__((format(printf, 1, 3)));
int scanfFormat1(const char *format, char *s, ...) __attribute__((format(scanf, 1, 3)));
size_t strftimeFormat1(char * __restrict, size_t, const char * __restrict, const struct tm * __restrict, ...) __attribute__((format(strftime, 3, 0)));
ssize_t strfmonFormat(char *, size_t, const char *, ...) __attribute__((format(strfmon, 3, 4)));
{% endhighlight %}
* string-index：大部分情况为format格式位置，从1开始计算；
* first-to-check：大部分情况为format参数位置，从1开始计算，视情况不同可能为0等。

对于Objective-C的方法，也是同样的，虽然最终依然生成C函数，并且隐式地包含了两个参数self和_cmd，但在Objective-C中依然是从1开始。

{% highlight objc %}
- (void)printfFormatMethod1:(const char *)format, ... __attribute__((format(printf, 1, 2)));
{% endhighlight %}

如果觉得上面的格式稍显繁杂的话，还是有相应的宏简化代码：

* __printflike(fmtarg, firstvararg);
* __scanflike(fmtarg, firstvararg);
* __strftimelike(fmtarg);
* __strftimelike(fmtarg);

改写上面的代码如下：

{% highlight objc %}
void printfFormat1(const char *format, char *s, ...) __printflike(1, 3);
int scanfFormat1(const char *format, char *s, ...) __scanflike(1, 3);
size_t strftimeFormat1(char * __restrict, size_t, const char * __restrict, const struct tm * __restrict, ...) __strftimelike(3);
ssize_t strfmonFormat(char *, size_t, const char *, ...) __strfmonlike(3, 4);
{% endhighlight %}

## nonnull(...)

nonnull运用范围也是相当广泛，用以指定某个参数不能为空。其参数可为空也可为index列表，分别用以单独指定某个参数和指定多个参数不能为空情况。具体如下：

{% highlight objc %}
void nonnullMethod1(char *format __attribute((nonnull)), char *buffer, char *parameter1 __attribute((nonnull)));
void nonnullMethod2(char *format, char *buffer, char *parameter1) __attribute((nonnull(1, 3)));
{% endhighlight %}


## returns_nonnull

用以标识一个返回值为指针的函数不能返回空。

{% highlight objc %}
int * returnMethod1() __attribute__((returns_nonnull));
{% endhighlight %}


## noreturn

这个相对特殊，标识一个函数不会返回。什么情况下一个函数被调用后不回返回值呢？1、直接结束程序；2、无限循环。

其中1相对好理解，对于2，AFNetworking有下面的用法：

{% highlight objc %}
+ (void) __attribute__((noreturn)) networkRequestThreadEntryPoint:(id)__unused object {
    do {
        @autoreleasepool {
            [[NSRunLoop currentRunLoop] run];
        }
    } while (YES);
}
{% endhighlight %}


## const / pure

`const`表示函数/方法的结果严格依赖于输入的参数，并且不修改外部任何状态，也就是说对应相同的参数输入一定是相同的输出。

`pure`与`const`相似，也不会改变任何外部状态。但pure除了输入还能依赖外部状态，如全局、静态变量等，根据外部状态不同，同样的参数输入不一定是相同的输出。

尽管Objective-C是一门动态的语言，但这两个参数还是有其积极意义的：

1. 他人阅读起来会更清晰；
2. 推荐对所有单例方法使用const；
3. 编译器还是会进行优化的，并且如果Objective-C的方法经常被使用，并且用到了const或者pure，考虑转换为C函数。

当然，const的不正确使用会带来怎样的影响已经在上面提到了，不再赘述。


## unused

此属性可能有一些小歧义，其表示的意义为：所修饰的对象*可能*不会被用到，并且编译器不会产生相应的警告。

可以使用`__unused`作为替代。


## overloadable

Objective-C不能实现方法重载(Overloading)，因为消息传递的机制决定了重载的不可行。但是Objective-C是兼容C和C++的。所以，可以在C或者C++中实现函数重载。当然C++毋需多说，C中通过引入__attribute__((overloadable))可实现重载。其函数名重整方式与C++类似。

{% highlight objc %}
#include <math.h>
float __attribute__((overloadable)) tgsin(float x) { return sinf(x); }
double __attribute__((overloadable)) tgsin(double x) { return sin(x); }
long double __attribute__((overloadable)) tgsin(long double x) { return sinl(x); }
{% endhighlight %}

在C中，由overloadable修饰的函数名会通过与C++相同的方式进行重整，例如上面的三个函数名将会分别被重整为`_Z5tgsinf`、`_Z5tgsind`和`_Z5tgsine`。同样，已有宏封装了此指令：OS_OVERLOADABLE。

需要注意的是，由于重载不依赖于运行时，所以调用哪个函数在编译时就已经确定了。对于需要重载的函数，必需包含一个及以上的参数。


## enable_if

enable_if可实现参数的静态检查。其包含两个参数，第一个参数是条件，第二个参数是额外信息提示。

1. 确定某个条件成立情况下函数可用；
2. 配合overloadable使用，可对特定条件成立情况下进行定义；
3. 配合overloadable使用，可在不可用时使用另一个重载的函数。

对于1，假设有如下代码：

{% highlight objc %}
void enable_func(int c) __attribute__((enable_if(c > 0, ""))) {}

void invoke() {
    enable_func(0); // 提示: "No matching function for call to 'enable_func'"
    enable_func(1);
}
{% endhighlight %}

对于2，假设有如下代码

{% highlight objc %}
OS_OVERLOADABLE void overload_func(int c);
OS_OVERLOADABLE void overload_func(int c) 
  __attribute__((enable_if(c <= -1 || c > 255, ""))) 
  __attribute__((unavailable("Deprecated")));

void invoke() {
    overload_func(10);
    overload_func(-10); // 提示: "Call to unavailable function 'overload_func': Deprecated"
}
{% endhighlight %}

可以看到在参数c在超出范围时，提示了unavailable定义的信息"Deprecated"。有人可能会注意到上面的两个overload_func(int c)并未提示重复定义，这是因为enable_if修饰的话，也同时定义在函数签名中（这也是为什么需要使用overloadable的原因）。

对于3，假设有如下代码：

{% highlight objc %}
OS_OVERLOADABLE void overload_func(int c) 
  __attribute__((enable_if(c > -1 && c <= 255, "")))
{
    NSLog(@"%s, int", __FUNCTION__);
}

OS_OVERLOADABLE void overload_func(float c) {
    NSLog(@"%s, float", __FUNCTION__);
}

void invoke() {
    overload_func(10);    // 输出: overload_func, int
    overload_func(-10);   // 输出: overload_func, float
}
{% endhighlight %}

可以看到在参数c不满足条件时，虽然c看起来是个整数，但依然自动执行了float为参数的函数。


## objc_boxable

结构体(struct)和联合体(union)可以通过此属性使用Objective-C中的装箱语法`@(...)`。

假设我们有着么一个结构体，包括其两个变量st1（用以装箱）, st2（用以拆箱）：

{% highlight objc %}
struct __attribute__((objc_boxable)) custom_struct {
    int a;
    int b;
};
{% endhighlight %}

如果没有`@(...)`的话，我们想要将一个结构体装入NSValue和取出的话需要这么做：

{% highlight objc %}
NSValue * v1 = [NSValue value:&st1 withObjCType:@encode(struct custom_struct)];
[v1 getValue:&st2];
{% endhighlight %}

而通过`@(...)`，这一切就自然多了：

{% highlight objc %}
NSValue * v2 = @(st1);
[v2 getValue:&st2];
{% endhighlight %}

## objc_requires_super

有些类要求子类在重写方法时调用super方法，此属性可用以标识方法需要调用super。Foundation中封装了宏`NS_REQUIRES_SUPER`。

父类中使用了此属性，子类中重写时如果未调用［super method］，则会提示`Method possibly missing a [super method] call`。

## objc_runtime_name

objc_runtime_name允许在编译时将`interface`或者`protocol`的名字指定为其他名字。

{% highlight objc %}
__attribute__((objc_runtime_name("BearChild")))
@interface Child : NSObject
@end

// 打印获取类名为: BearChild
Child * c = [Child new];
NSLog(NSStringFromClass([c class]));
{% endhighlight %}

此属性只能放在@protocol或者@interface前面。因为此方法可以很容易地更改类名，所以可以用来做代码混淆。

## objc_method_family

Objective-C有其自己的命名规则，一定的命名规则对应一定的行为。如果我们希望一定的命名对应不同的规则，或者无规则的命名能够适用某个规则的话该怎么办？`objc_method_family`给了方法。其格式为：`__attribute__((objc_method_family(X)))`，其中`X`可能为`none`、`alloc`、`copy`、`init`、`mutableCopy`、`new`。此属性只能放在Objective-C方法名后.

{% highlight objc %}
- (NSString *)initMyStringValue __attribute__((objc_method_family(none)));
{% endhighlight %}

## cleanup

这是一个神奇的属性，它允许一个变量在超出作用域范围时运行某个函数。运行的函数必须传入此变量的指针作为参数。如果有返回值都会被忽略。

*注意：在执行的函数中，不允许捕获异常，其仅仅为执行一个操作而已。函数如果不正常返回的话，其行为是未定义的。*

因为Block也是一个变量，所以在Reactive Cocoa中有个有意思的用法：

{% highlight objc %}
// 首先定义一个函数
static void blockCleanUp(__strong void(^*block)(void)) {
    (*block)();
}

- (void)method
{
    __strong void(^block)(void) __attribute__((cleanup(blockCleanUp), unused)) = ^{
        NSLog(@"Hey, this is the end");
    };
    NSLog(@"Start");
}
{% endhighlight %}

上面的代码将首先输出"Start"，然后输出"Hey, this is the end"。值得注意的是，如果有多个cleanup，则函数执行的顺序为栈的方式，后入先出。


## constructor / destructor

constructor允许在main()函数执行前运行相应的函数。而destructor则在main()退出后或者exit()被调用后进行，但App被杀死后不会调用此函数。constructor / destructor都为GCC扩展（也就是其并非标准）。两个属性只能修饰函数而不能是方法。

假设有下列的constructor方法：

{% highlight objc %}
__attribute__((constructor))
void constructor1() {
    NSLog(@"%s", __FUNCTION__);
}

int main(int argc, char * argv[]) {
    NSLog(@"main");
    @autoreleasepool {
        return UIApplicationMain(argc, argv, nil, NSStringFromClass([AppDelegate class]));
    }
}
{% endhighlight %}

其输出应该为"constructor1"、"main"。说明constructor函数在main函数之前执行了，如果有多个constructor函数，其执行顺序是比较不确定的（与其编译单元定义有关），但我们可以通过设置优先级来进行`constructor (priority)`，其中priority为101到65535的数字，越小的数字拥有越高的优先级。

可以看到constructor函数与`+load`方法很类似，二者有什么区别呢？以下为`+load`的调用时机顺序：

1. 项目链接的所有framework初始化构造器；
2. 自己代码的所有`+load`方法；
3. 所有C++的静态初始化构造器和C/C++的`__attribute__((constructor))`函数；
4. 链接此项目的framework的初始化构造器。

可以看到constructor函数的调用时机是晚于`+load`的。并且相对于`+load`，constructor函数可以在除Class以外的其他文件中。并且在constructor函数被调用时，我们可以保证所有类已经加载完毕，即此时可以不用顾忌操作类。


## objc_subclassing_restricted

使用此属性修饰的类不能被继承，试图创建其子类编译器会提示错误。Swift在其生成的Objective-C代码的Header中添加这个属性，带来的结果就是Swift的类不能在Objective-C中被继承。

{% highlight objc %}

// 父类
__attribute__((objc_subclassing_restricted))
@interface Parent : NSObject
@end

@implementation Parent
@end

// 试图继承Parent
// 提示: Cannot subclass a class with objc_subclassing_restricted attribute
@interface Child : Parent
@end

@implementation Child
@end

{% endhighlight %}

# 写在最后

__attribute__看起来简单，但搜集资料过程中（不得不吐槽下资料挺分散的），发现它竟包罗万象，异常强大，仅仅其attribute就多达数百个。上面提到的一些仅仅是我觉得比较有意思的几个，也是比较常用的几个。活用__attribute__的话，能够实现不少神奇的功能（如上面提到的cleanup）。这些神奇的功能也在不少开源框架中被用到，了解这些用法有助于我们更好地阅读它们。


# 参考资料

* [Attributes in Clang](http://clang.llvm.org/docs/AttributeReference.html)
* [__attribute__](http://nshipster.com/__attribute__/)
* [__attribute__ directives in Objective-C](https://blog.twitter.com/2014/attribute-directives-in-objective-c)
* [load() API Reference](https://developer.apple.com/reference/objectivec/nsobject/1418815-load)

