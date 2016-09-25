---
layout: post
title:  "字节序"
date:   2016-09-25 06:10:00 +0800
categories: Architecture
tags: Low-level Fundamental
---

在应用层面上，很多情况下计算机对于内存和存储器的操作都是高度抽象的，我们不必去关心其内部是如何工作的。但是总有那么些情况下，需要我们去了解其中的奥秘。在几年前开发[aoFont][aoFont]的时候，就遇到了文件字节序(Endianness)问题，即大端序(Big endian)、小端序(Little endian)的问题。也就是需要读取的字体文件是以大端序存储的，但是iOS设备CPU使用的是小端序，这样以来直接读取出来的数据是错误的，需要对读取出来的数据进行处理。


# 为什么会有大小端之分

内存、存储器都可以抽象为许多二进制位(bit)的集合，但事实上字节（byte）才是最小的可寻址存储器单位。绝大多数情况下（现代计算机体系下），一字节为8位（但早期的byte根据硬件不同可能有不同的位数，后面都默认一字节为8位），也就是从00000000<sub>2</sub>到11111111<sub>2</sub>。用16进制来表示的话，每4位能用一个十六进制数来表示，即其范围为0x00 - 0xFF。可见用16进制来表示的话会更为简洁（当然再往大了不好换算和记忆，16进制算是性价比较高的一个选择）。

## 按位计数法

对于大小端的字节序的讨论，可以先讨论下按位计数法。生活中常用的十进制和计算机中采用的二进制，是按位计数法的典型。例如十进制数字123456，表示的数值为:1×10<sup>5</sup> + 2×10<sup>4</sup> + 3×10<sup>3</sup> + 4×10<sup>2</sup> + 5×10<sup>1</sup> + 6×10<sup>0</sup>，特定位置上的数字权值不同。对于我们这种的从左到右书写方式的语言来说，最左边的具有最高权值，最右边的具有最小的权值。如果将从左至右看做计算机地址的从低到高的增长，那么就有了大小端的区别。如果从右往左看，那么上面的数字为可以看作654321，也就是其表示的数值应该为:6×10<sup>5</sup> + 5×10<sup>4</sup> + 4×10<sup>3</sup> + 3×10<sup>2</sup> + 2×10<sup>1</sup> + 1×10<sup>0</sup>。也就是说，大小端的区别就是由我们不同角度去看待一串二进制串所造成的。

Intel x86/x86_64系列用的是小端序，而IBM的System/360、System/370、System/390、Z/Architecture使用的是大端序，网络传输方面*大多*也用的大端序。值得一提的是，FAT文件系统是平台无关的，由于其第一个实现是在Intel x86平台上的，其始终为小端序。对于浮点数来说，我们熟悉的IEEE 754标准也并未定义其字节序，这意味着如果考虑历史原因，一台机器上存放的浮点数数据未必能在另一台机器上被正确读取，不过在现代机器上我们可以始终假定浮点数的字节序与整数的字节序相同。

因为底层已经帮我们自动处理了细节，所以我们需要自己处理字节序的场景是比较有限的，主要集中在特定文件的读取、网络输入输出的处理。


# 大端序

大端序与我们平时书写的数字方式一致，也就是低地址对应高位，高地址对应低位。这么一来，大端序适合阅读。并且由于大端先存储高位，所以可以简单的通过最低地址的内容判断数字的正负。


# 小端序

小端序与大端序相反，其低地址对应低位，高地址对应高位。这样其好处为比较容易进行加法运算（加法从最低位开始加起）。


# 混合序

顾名思义，就是大端序和小端序的混合形式，在特定机器上可能出现这种情形。


# 如何检查设备的字节序

因为在Mac上默认装着Python，我们可以利用强大的Python来获取：

{% highlight python %}
import sys
print sys.byteorder # 输出: little或者big
{% endhighlight %}

PS: 但其实如果不想这么大费周章的话，直接记下结论即可（当前机器绝大部份情况下都是正确的）：PowerPC上是大端序，x86/x86_64平台上是小端序，当然我们的苹果设备(iPhone、iPad等)是小端序（但ARM支持两种字节序）。

用Python似乎没有什么挑战，那么我们再来看看C语言可以怎么处理：

{% highlight c %}
int isLittleEndian() {
    uint32_t mask = 1;
    return *((char *)&mask);
}

int main() {
    if (isLittleEndian()) {
        printf("小端");
    } else {
        printf("大端");
    }
    return 0;
}
{% endhighlight %}

下面来简单说下为什么可以这么做。为了简化说明，下面假设为32位系统，也就意味着指针大小为32位，int也为32位，char此时为8位。

对于`int mask = 1`，可以知道在小端序和大端序下分别为如下分布(假设此时mask地址为0x1000):

| 地址    | 小端序 | 大端序 |
| ------ | -- | -- |
| 0x1000 | 01 | 00 |
| 0x1001 | 00 | 00 |
| 0x1002 | 00 | 00 |
| 0x1003 | 00 | 01 |


`&mask`获取mask地址0x1000，而`(char *)&mask`，则将其强制转换为char指针，`*((char *)&mask)`则读取此char指针的一字节，即读取了0x1000存储的内容。这样一来，对于小端序则为0x01（也就是true），对于大端序则为0x00（也就是false）。

同样对于64位系统来说也是如此，不赘述。

当然如果对于混合序模式，情况*可能为*:

| 地址    | 混合序 |
| ------ | -- |
| 0x1000 | 00 |
| 0x1001 | 01 |
| 0x1002 | 00 |
| 0x1003 | 00 |

这样就有可能造成判断错误，虽然可以将char改为unit16_t，但还是不足以判断64位可能出现的其它可能序列。所以此法并非通用解法，针对特定平台可以如此进行判断，简洁而且明了。

同样可以利用联合体也可进行判断：

{% highlight c %}
int isLittleEndian() {
    union {
    	uint32_t a;
    	char b;
    } mask;
    mask.a = 1;
    return mask.b;
}
{% endhighlight %}

因为a和b共享相同的32位的空间，并且是从低地址到高地址进行存储，其原理同上面的例子。当然缺点也是同样的，索性我们并不需要去担心这些问题，毕竟普通开发中混合序的机器还是比较少的。


# 大小端转换

让我们来假定上面的函数是可以正确进行的，其以1字节为单位，并且依旧操作32位。这样我们需要做的就是将其顺序调换回来，这时候可以使用位操作:

{% highlight c %}
uint32_t convert(uint32_t val) {
    uint32_t result = 0;
    result = (val & 0x000000FF) << 24;
    result = (val & 0x0000FF00) << 8;
    result = (val & 0x00FF0000) >> 8;
    result = (val & 0xFF000000) >> 24;
    return result;
}
{% endhighlight %}

对于其它的位数同理。


# 常见文件的大小端

在找资料的过程中，找到一些类型的文件的大小端信息，在此列出：

| 文件类型 | 字节序 |
| ------- | ----- |
| Adobe Photoshop | Big Endian |
| BMP (Windows and OS/2 Bitmaps) | Little Endian |
| DXF (AutoCad)  | Variable |
| GIF | Little Endian |
| IMG (GEM Raster)  | Big Endian |
| JPEG | Big Endian |
| FLI (Autodesk Animator) | Little Endian |
| MacPaint | Big Endian |
| PCX (PC Paintbrush)  | Little Endian |
| PNG | Big Endian |
| PostScript | Not Applicable (text!) |
| POV (Persistence of Vision ray-tracer) | Not Applicable (text!) |
| QTM (Quicktime Movies) | Little Endian (on a Mac!) |
| Microsoft RIFF (.WAV & .AVI) | Both |
| Microsoft RTF (Rich Text Format) | Little Endian |
| SGI (Silicon Graphics) | Big Endian |
| Sun Raster | Big Endian |
| TGA (Targa) | Little Endian |
| TIFF | Both, Endian identifier encoded into file |
| WPG (WordPerfect Graphics Metafile) | Big Endian (on a PC!) |
| XWD (X Window Dump) | Both, Endian identifier encoded into file |


# 结语

整个计算机体系之所以能够构建起来，其实就是有大量的规范存在。计算机的一切都是靠相应的规范才能正常工作的（所以文档是多么滴重要:D），所以有很多统一的规范甚至组织避免"百花齐放"，过多的规范对很多情况下对计算机不一定是好处。当然有很多是历史遗留原因（就如大小端序问题），这时候就需要我们去理解其中的区别，毕竟深入了解女（ji）盆（suan）友（ji）的心思才是码农的工作括弧笑。


# 参考资料

* [Big and Little Endian](https://www.cs.umd.edu/class/sum2003/cmsc311/Notes/Data/endian.html)
* [Byte](https://en.wikipedia.org/wiki/Byte)
* CSAPP
* [Endianness](https://en.wikipedia.org/wiki/Endianness)
* [An Essay on Endian Order](https://people.cs.umass.edu/~verts/cs32/endian.html)


[aoFont]: https://itunes.apple.com/cn/app/aofont-free-mian-fei-zi-ti/id910168407?mt=8
