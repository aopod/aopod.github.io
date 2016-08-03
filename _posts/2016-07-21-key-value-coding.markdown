---
layout: post
title:  "Key-value Coding"
date:   2016-07-21 20:20:20 +0800
categories: iOS
tags: Objective-C
---

Key-value coding (KVC)是非直接地访问通过字符串访问Property的机制。这种机制下，我们通过键值对的形式来访问对象的属性，形式上类似于字典的操作。

# 如何支持KVC

值得指出的是，KVC遵循NSKeyValueCoding协议，但此协议跟Protocol有些不同，仅指一套规范。一个类（或属性）遵循了这套规范，我们就能够说这个类（或属性）支持KVC。具体定义在`NSKeyValueCoding.h`中。主要在于Getter和Setter的命名，一些方法的实现等。

## Getter、Setter命名规范

Objective-C对于命名是有自己一套规则，比如对于引用计数有一套规则，同样对于KVC的重点Getter和Setter，也有其一套规则。

简单来说，规则就是Setter为`- (type)property`，Getter为`- (void)setProperty`。自动合成(Synthesize)为我们自动生成这两种方法，如果我们重写代码，最好也按照这个规范。并且，这个命名规范对KVC也至关重要。

命名规则虽然简单，但通过统一这样的一个命名规范，可以统一不少操作。这样的约定俗成是极好的。对于KVC的几个基本方法，默认实现会优先去查找属性的Getter和Setter（当然不仅仅是这两个）。所以遵守规范是很重要的。

这边提一句，如果有方法支持上述的Setter和Getter，那么即使不使用@property也是可以的。

## 点语法

我们在Objective-C中可以使用这样的语法：`obj.property1.property2 = @"aopod";`，那么在KVC中我们有没有类似的方法？答案是肯定的，通过点语法我们能够做到这个。

{% highlight objc %}
[obj setValue:@"aopod" forKeyPath:@"property1.property2.value"];
{% endhighlight %}

然而需要注意的是，`setValuesForKeysWithDictionary:`并不能直接使用点语法，所以如果需要用到，可能需要自行处理或者用上第三方框架。

# KVC的一些用法

## 通过KVC简化代码

KVC的一大功用便是简化代码。在逻辑有很多分支的情况下，我们很可能会写出下面这样一段代码：

{% highlight objc %}
- (id)tableView:(NSTableView *)tableview
      objectValueForTableColumn:(id)column row:(NSInteger)row {
 
    ChildObject *child = [childrenArray objectAtIndex:row];
    if ([[column identifier] isEqualToString:@"name"]) {
        return [child name];
    }
    if ([[column identifier] isEqualToString:@"age"]) {
        return [child age];
    }
    if ([[column identifier] isEqualToString:@"favoriteColor"]) {
        return [child favoriteColor];
    }
    // And so on.
}
{% endhighlight %}

上述代码虽然结构简单固定，但如果需要处理的分支变多，那么代码将会极为庞大，并且很容易在拼写方面出错不好排查，对于日后的管理是不利的。所幸我们有KVC：

{% highlight objc %}
- (id)tableView:(NSTableView *)tableview
      objectValueForTableColumn:(id)column row:(NSInteger)row {
 
    ChildObject *child = [childrenArray objectAtIndex:row];
    return [child valueForKey:[column identifier]];
}
{% endhighlight %}

通过KVC，我们将关键代码缩至一行。同时，如果合理地简化了代码，那么会让逻辑更加清晰，同时减少了很多不必要的工作。

当然，上面的代码还是有个小问题。调用`valueForKey:`时，如果Key对应的Getter不存在时，则会调用接收者的`valueForUndefinedKey:`方法，此方法的默认实现会抛出`NSUndefinedKeyException`异常，此时可以重写对象的`valueForUndefinedKey:`方法，返回为空时的值。在实际编程过程中，需要注意这一点。

看起来很给力，能不能再给力点儿？

## 通过KVC初始化对象

如果比较传统点，我们可以通过下面的方式初始化对象：

{% highlight objc %}
APDKVCTestObject * testObject = [[APDKVCTestObject alloc] init];
testObject.aString = @"a";
testObject.bString = @"b";
testObject.cString = @"c";
{% endhighlight %}

可以想见，如果Property多了的话，这一定是个灾难。在KVC的帮助下，我们又可以得到救赎了：

{% highlight objc %}
APDKVCTestObject * testObject = [[APDKVCTestObject alloc] init];
[testObject setValuesForKeysWithDictionary:@{@"aString": @"a", @"bString": @"b", @"cString": @"c"}];
{% endhighlight %}

上面的方法特别适用于从一个JSON创建一个特定对象。也能方便我们在创建某个类的实例时初始化特定的值。

同样的，取出多个值可以使用`dictionaryWithValuesForKeys:`方法。

了解了上面的方法，咱能不能再给力点？

## 值校验

KVC同样规定了值校验的规范，对于属性值校验的方法名一般为:

`-(BOOL)validateName:(id *)ioValue error:(NSError * __autoreleasing *)outError;`

或者

`- (BOOL)validateValue:(inout id __nullable * __nonnull)ioValue forKey:(NSString *)inKey error:(out NSError **)outError;`。

默认的，后者会自动调用前者。

一些技术比如Core Data、OS X下的Cocoa Bindings能够自动调用上面的方法。不过由于iOS下大部分情况下要求自己主动去调用，所以不多讲。

需要注意的是：*不要在`set<Key>:`方法中直接调用上述方法*。

## 集合操作

上面的值校验是稍显不给力，但对于集合元素的部分操作，KVC可算是个大杀器。对于集合类型，Objective-C允许直接操作一些方法，如直接获得元素个数计数，集合内元素某个属性的平均值、最大最小值、求和等。如：`[transactions valueForKeyPath:@"@avg.amount"]`，其中的key是比较特殊的KeyPath，以@开头，这种的叫做集合操作符。具体格式如下：

![Collection operator keypath format][operator-key-path-format]

左边的keypathCollection属于可选项，指定集合的Keypath。目前来说，除了@count外的所有的集合操作符，都应该包含右边的keypathToProperty。并且，当前无法直接自定义自己的集合操作符。当然，通过[Method Swizzling][aopod-method-swizzling]我们可以间接地添加自己的实现。

### 简单的集合操作符

对于集合的操作，我们正常的写法会去遍历元素集合，然后根据需要进行计算。对于一些常见的操作，这样做会增加不少代码。所幸KVC内置了一些集合操作，方便我们进行操作。

#### *@avg*

`@avg`操作符使用`valueForKeyPath:`获取特定的值，将值转换为double后取得平均值后以NSNumber类型返回。如果为nil，则默认为0。

{% highlight objc %}
NSNumber *transactionAverage = [transactions valueForKeyPath:@"@avg.amount"];
{% endhighlight %}

如果元素本身就是需要进行计算的值，那么可以使用这个key：`@avg.self`。

#### *@count*

`@count`操作符获取keypathToCollection的元素个数，并以NSNumber形式返回。

{% highlight objc %}
NSNumber *numberOfTransactions = [transactions valueForKeyPath:@"@count"];
{% endhighlight %}

#### *@max*

`@max`求取集合元素的keypathToProperty的最大值。

{% highlight objc %}
NSDate *latestDate = [transactions valueForKeyPath:@"@max.date"];
{% endhighlight %}

#### *@min*

`@min`求取集合元素的keypathToProperty的最小值。

{% highlight objc %}
NSDate *earliestDate = [transactions valueForKeyPath:@"@min.date"];
{% endhighlight %}

#### *@sum*

`@sum`对集合元素的keypathToProperty转换为double后求和，并以NSNumber类型返回。如果为nil，则直接跳过。

{% highlight objc %}
NSNumber *amountSum = [transactions valueForKeyPath:@"@sum.amount"];
{% endhighlight %}


### 对象操作符

#### *@distinctUnionOfObjects*

`@distinctUnionOfObjects`返回keypathToProperty的唯一的所有值的集合。如下所示，将会返回对象payee属性不重复的所有payee值。

{% highlight objc %}
NSArray *payees = [transactions valueForKeyPath:@"@distinctUnionOfObjects.payee"];
{% endhighlight %}

需要注意的是:*如果任意的子对象为空，则会抛出异常*。

#### *@unionOfObjects*

`@unionOfObjects`类似`@distinctUnionOfObjects`，但会保留相同的值。

{% highlight objc %}
NSArray *payees = [transactions valueForKeyPath:@"@unionOfObjects.payee"];
{% endhighlight %}

需要注意的是:*如果任意的子对象为空，则会抛出异常*。

### Array和Set操作符

Array和Set都是一个集合，区别在于前者允许重复的元素，而后者不允许。

对于一个集合中嵌套多个集合的情况，也有办法实现上面对象的操作。

#### *@distinctUnionOfArrays*

同`@distinctUnionOfObjects`，会将所有指定的属性值不重复地作为NSArray返回。但是不同的是，`@distinctUnionOfArrays`会遍历所有的集合，对集合里边的元素进行操作。

#### *@unionOfArrays*

同`@unionOfObjects`，会将所有指定的属性值作为NSArray返回，允许重复。但是不同的是，`@distinctUnionOfArrays`会遍历所有的集合，对集合里边的元素进行操作。


# 访问器

KVC存取值的主要方法有：`valueForKey:`, `setValue:forKey:`, `mutableArrayValueForKey:`, `mutableSetValueForKey:`。为了让KVC能够调用这些方法，我们需要设置属性的Getter和Setter。因为调用上述方法会调用相应的属性的存取方法。当然，目前的自动合成可以为我们省去这一步。

同时需要注意的是，*如果对于非对象的属性，需要对设置为nil的情况通过`setNilValueForKey:`进行处理*，例如我们有BOOL类型的`hidden`:

{% highlight objc %}
- (void)setNilValueForKey:(NSString *)theKey {
 
    if ([theKey isEqualToString:@"hidden"]) {
        [self setValue:@YES forKey:@"hidden"];
    }
    else {
        [super setNilValueForKey:theKey];
    }
}
{% endhighlight %}

如果要操作集合，有上面的`mutableArrayValueForKey:`, `mutableSetValueForKey:`，前者能够返回一个可变的数组，我们甚至可以直接通过返回的可变数组来修改。但是老师，这不够KVC呀。通过KVC，我们可以让一个类表现得像NSArray、NSMutableArray或者类似NSSet、NSMutableSet。

## 有序的访问器

不仅限于集合，任何类型的对象都可以通过这些方法当成一个集合来进行处理。如果我们想让任意一个类表现得像NSArray这样的有序集合，我们可以通过实现下列方法实现只读访问：

* `-countOf<Key>`: 必需。此方法类似NSArray的`count`方法；
* `-objectIn<Key>AtIndex:` 或 `-<key>AtIndexes:`: 其中之一必需实现。类似NSArray的`objectAtIndex:`和`objectsAtIndexes:`；
* `-get<Key>:range:`: 可选方法。类似NSArray的`getObjects:range:`方法，可实现以提高性能。

如：

{% highlight objc %}
- (NSUInteger)countOfEmployees {
    return [self.employees count];
}

- (id)objectInEmployeesAtIndex:(NSUInteger)index {
    return [employees objectAtIndex:index];
}
 
- (NSArray *)employeesAtIndexes:(NSIndexSet *)indexes {
    return [self.employees objectsAtIndexes:indexes];
}

- (void)getEmployees:(Employee * __unsafe_unretained *)buffer range:(NSRange)inRange {
    // Return the objects in the specified range in the provided buffer.
    // For example, if the employees were stored in an underlying NSArray
    [self.employees getObjects:buffer range:inRange];
}
{% endhighlight %}

如果要让上述的类可修改，可以使用上面提到的`mutableArrayValueForKey:`。如果要实现类似NSMutableArray的功能，可以通过KVO使其更进一步。我们需要做以下操作：

* `-insertObject:in<Key>AtIndex:`或`-insert<Key>:atIndexes:`: 至少需要实现其中之一的方法。类似于NSMutableArray的`insertObject:atIndex:`和`insertObjects:atIndexes:`。
* `-removeObjectFrom<Key>AtIndex:`或`-remove<Key>AtIndexes:`: 至少需要实现其中之一的方法。类似于NSMutableArray的`removeObjectAtIndex:`和`removeObjectsAtIndexes:`。
* `-replaceObjectIn<Key>AtIndex:withObject:`或`-replace<Key>AtIndexes:with<Key>:`:可实现以提高性能。

推荐实现上面的方法而非单纯地通过`mutableArrayValueForKey:`返回一个可变数组后进行操作，原因在于前者更加有效。

如:

{% highlight objc %}
- (void)insertObject:(Employee *)employee inEmployeesAtIndex:(NSUInteger)index {
    [self.employees insertObject:employee atIndex:index];
    return;
}
 
- (void)insertEmployees:(NSArray *)employeeArray atIndexes:(NSIndexSet *)indexes {
    [self.employees insertObjects:employeeArray atIndexes:indexes];
    return;
}

- (void)removeObjectFromEmployeesAtIndex:(NSUInteger)index {
    [self.employees removeObjectAtIndex:index];
}
 
- (void)removeEmployeesAtIndexes:(NSIndexSet *)indexes {
    [self.employees removeObjectsAtIndexes:indexes];
}

- (void)replaceObjectInEmployeesAtIndex:(NSUInteger)index
                             withObject:(id)anObject {
 
    [self.employees replaceObjectAtIndex:index withObject:anObject];
}
 
- (void)replaceEmployeesAtIndexes:(NSIndexSet *)indexes
                    withEmployees:(NSArray *)employeeArray {
 
    [self.employees replaceObjectsAtIndexes:indexes withObjects:employeeArray];
}

{% endhighlight %}


## 无序的访问器

集合类型如NSSet和NSMutableSet是无序的，并且不保证元素在集合内的顺序。我们同样可以通过KVC让一个非集合类支持类似的行为。

### 只读

为了支持只读的一对多关系，需要进行下面的操作：

* `-countOf<Key>`：必需。和NSSet的`count`相对应；
* `-enumeratorOf<Key>`：必需。和NSSet的`objectEnumerator`相对应；
* `-memberOf<Key>`：必需。和NSSet的`member:`相对应。

如下：

{% highlight objc %}
- (NSUInteger)countOfTransactions {
    return [self.transactions count];
}
 
- (NSEnumerator *)enumeratorOfTransactions {
    return [self.transactions objectEnumerator];
}
 
- (Transaction *)memberOfTransactions:(Transaction *)anObject {
    return [self.transactions member:anObject];
}
{% endhighlight %}

### 可变

为了让其可变，可以多做如下工作：

* `-add<Key>Object:`或者`-add<Key>:`：至少需要实现其一。类似NSMutableSet的`addObject:`方法；
* `-remove<Key>Object:`或`-remove<Key>:`：至少需要实现其一。类似NSMutableSet的`removeObject:`方法；
* `-intersect<Key>:`：可选。如果需要进一步提高效率，可实现此方法。此方法与NSSet的`intersectSet:`等效。

实现如下：

{% highlight objc %}
- (void)addTransactionsObject:(Transaction *)anObject {
    [self.transactions addObject:anObject];
}
 
- (void)addTransactions:(NSSet *)manyObjects {
    [self.transactions unionSet:manyObjects];
}

- (void)removeTransactionsObject:(Transaction *)anObject {
    [self.transactions removeObject:anObject];
}
 
- (void)removeTransactions:(NSSet *)manyObjects {
    [self.transactions minusSet:manyObjects];
}

- (void)intersectTransactions:(NSSet *)otherObjects {
    return [self.transactions intersectSet:otherObjects];
}
{% endhighlight %}


# 性能考虑

KVC尽管为我们带来不少便利，但毕竟其对性能有些影响，所以如果不是特别需要使用KVC，避免使用它。

KVC依然使用了消息分发，通过objc_msgSend()虽然已做了缓存操作，还是有部分效率损失。如果对性能有要求，多利用缓存提高效率。对于重写KVC的一些方法，需要小心处理，避免反过来影响到性能。

另外，上面提到的对于集合访问器的一些方法，如果对性能有要求的话，建议实现其中的方法。

# 总结

KVC机制看似一句话能说清楚，但真的深入钻下去，其中的很多细节还是需要我们去注意的。同样的，KVC也是Objective-C带给我们的利器，好好研究并利用它，是学习iOS过程中很重要的一步——不仅仅是KVC自身，其他的各种技术也常常涉及到KVC相关内容。


# 参考资料
* [Apple KVC code programming guide](https://developer.apple.com/library/mac/documentation/Cocoa/Conceptual/KeyValueCoding/Articles/KeyValueCoding.html)
* [Key-Value Coding and Observing](https://www.objc.io/issues/7-foundation/key-value-coding-and-observing/)
* [Intro to Cocoa KVC/KVO and Bindings](http://www.slideshare.net/sergio.acosta/intro-to-cocoa-kvckvo-and-bindings-presentation)
* [KVC Collection Operators](http://nshipster.com/kvc-collection-operators/)
* [Understanding Key-Value Observing and Coding](http://www.appcoda.com/understanding-key-value-observing-coding/)


[aopod-method-swizzling]: {{ site.url }}/2016/07/01/method-swizzling/
[operator-key-path-format]: https://developer.apple.com/library/mac/documentation/Cocoa/Conceptual/KeyValueCoding/art/keypath.jpg "Collection operator keypath format"
