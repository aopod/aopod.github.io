/*
	功能：根据标签显示相应印章
	作者:Aopod
	博客:https://www.aopod.com
	用法:https://www.aopod.com/2012/02/post-tag-stamp-for-blogger.html
	转载请保留此信息，谢谢!
*/
document.onreadystatechange=function(){var obj=document.getElementById("AopodTagStamp");if(obj.getAttribute("exec")!=null)return;var status=false;var labelArr=new Array(3);var opt,tmp;var data=obj.getAttribute("data")==null?"012":obj.getAttribute("data");var ot=obj.getAttribute("ot")==null?0:obj.getAttribute("ot");var ol=obj.getAttribute("ol")==null?0:obj.getAttribute("ol");var eid=obj.getAttribute("eid")==null?"post-body-":obj.getAttribute("eid");var zindex=obj.getAttribute("zindex")==null?0:obj.getAttribute("zindex");obj.setAttribute("exec","true");for(var i=0;i<data.length;i++){switch(data.charAt(i)){case'0':labelArr[i]="原创";break;case'1':labelArr[i]="精品";break;case'2':labelArr[i]="推荐";break;}}
obj=document.getElementsByTagName('a');for(var i=0;i<labelArr.length;i++){for(var j=0;j<obj.length;j++)
if(obj[j].rel!="tag")continue;else if(obj[j].innerHTML==labelArr[i]){status=true;break;}
if(status){switch(labelArr[i]){case"原创":tmp="Original";break;case"精品":tmp="HQ";break;case"推荐":tmp="Recommended";break;}
break;}
else return false;}
obj=document.getElementsByTagName("div");for(var i=0;i<obj.length;i++)
if((obj[i].id).indexOf(eid)>-1){opt=obj[i];break;}
for(var offleft=0,offtop=0,obj=opt;obj!=null;obj=obj.offsetParent){offleft+=obj.offsetLeft;offtop+=obj.offsetTop;}
obj=document.createElement('div');obj.id="Aopod_Tag_Stamp";obj.style.width='170px';obj.style.height='124px';obj.style.background="transparent url(http://git.aopod.com/blog_extern/Aopod_Seal_"+tmp+".png) no-repeat";obj.style.position="absolute";obj.style.top=(offtop+parseInt(ot)-62)+"px";obj.style.left=(offleft+opt.offsetWidth+parseInt(ol)-85)+"px";if(parseInt(zindex)!=0)obj.style.zIndex=parseInt(zindex);document.body.appendChild(obj);}