(function() {
	var AOPOD_CLASS = {
		'create' : function() {
			var isInitialized = false;
			var thisBody = document.body || document.documentElement;

			function Service() {
				var _this = this;

				// support of different features
				this.support = {
					'transition' : false,
					'fixed' : false,
					'property_check' : function(thisStyle, name) {
				    	if (name == null)
				    		return;
				    	name = name.toLowerCase();
				    	var _name = name.substring(0, 1).toUpperCase() + name.substring(1);
				    	var properties = [
				    		name,
				    		'Webkit' + _name,
				    		'Moz' + _name,
				    		'Ms' + _name,
				    		'O' + _name,
				    	];
				    	var support = false;
				    	for (var i = 0; i  < properties.length; i++) {
				    		if (support === true) return true;
				    		var property = properties[i];
							support = (thisStyle[property] !== undefined);
				    	}
				    	return support;
				    },
					'init' : function() {
					    var thisStyle = thisBody.style;
						// http://www.abeautifulsite.net/feature-detection-for-css-transitions-via-jquery-support/
				        // this.transition = (function() {
					       //  var support = thisStyle.transition !== undefined || thisStyle.WebkitTransition !== undefined || thisStyle.MozTransition !== undefined || thisStyle.MsTransition !== undefined || thisStyle.OTransition !== undefined;
					       //  return support;
				        // }());
				        this.transition = this.property_check(thisStyle, 'transition')

				        var elem = document.createElement('div');
				        this.fixed = (function () {
		                    elem.style.cssText = 'position:fixed';
		                    if (elem.style.position.match('fixed')) return true;
		                    return false;
		                }());
					}
				};

				this.template = {
					'generate' : function(template, data, should_replace_holder) {
						if (template == null || data == null)
							return template;
						should_replace_holder = should_replace_holder || true;
						var html = template;
						var regex = null;
						for (var key in data) {
							regex = new RegExp('\{\{' + key + '\}\}', 'g');
							html = html.replace(regex, data[key]);
						}
						if (should_replace_holder) {
							regex = new RegExp('\{\{[\dA-Za-z_]+\}\}', 'g');
							html = html.replace(regex, '');
						}
						return html;
					}
				};

				this.scrollTop = {
					'_timeout' : null,
					'scroll' : function(offset) {
						offset = offset || 0;
						console.log('scroll to:' + offset);
						$('html, body').animate({
							'scrollTop' : offset	
						}, 500);
					},
					'init' : function() {
						var __this = this;
						(function() {
							scrollTop = $('.scrollTop');
							if (scrollTop == null)
								return;
							$(scrollTop).click(function() {
								// _this.scrollTop.scroll(0);
								// console.log('run');
								__this.scroll(0);
							});
						})();
						
					},
					'onScroll' : function(current_scroll, window_height) {
						var __this = this;
						current_scroll = current_scroll || $(window).scrollTop();
						window_height = window_height || $(thisBody).height();
						clearTimeout(this._timeout);
						this._timeout = setTimeout(function() {
							if (current_scroll > 100) {
								$(scrollTop).addClass('show');
							} else {
								$(scrollTop).removeClass('show');
							}
						}, 500);
					}
				};

				this.menu = {
					'init' : function() {
						$('#menu .ctl, #fade').click(function() {
      						$('body').toggleClass('menu');
    					});
					}
				};

				this._search = {
					'init' : function() {

						var html = '' +
							'<div id="search">' +
								'<div class="wrap">' +
									'<div class="search_box">' +
										'<div class="close"></div>' +
										'<input type="text" value="" placeholder="Enter to Search">' +
									'</div>' +
									'<div class="content">' +
										'<h3>Search Results</h3>' +
										'<ol id="search_result_area" class="hide">' +
											// '<li><a href="/">title</a><span></span></li>' +
										'</ol>' +
									'</div>' +
								'</div>' +
							'</div>';
						$('body').append(html);

						$('#search_icon').click(function() {
      						$('#search').addClass('show');
     				 		$('#search .wrap .search_box input').focus();
    					});

    					$('#search .wrap .search_box .close').click(function() {
      						$('#search').removeClass('show');
    					});

						$('#search .wrap .search_box input').keypress(function(e) {
	      					if (e.keyCode == 27) {
	        					$('#search').removeClass('show');
	        					return;
		      				}
						    if (e.keyCode != 13) {
						        return;
						    }
						    var keyword = this.value;
						    if (keyword.length == 0) {
						        return;
						    }
						    _this.search(keyword);
    					});
					},
					'search' : function(keyword) {
						if (!_this._search['data'] || _this._search['data'].length == 0) {
							$.getJSON( "/search_data.json", function( data ) {
								if (data.length == 0) {
									alert('No data');
									return;
								}
								_this._search['data'] = data.data;
								// alert(JSON.stringify(data.data));
								_this._search.search(keyword);
							});
							return;
						}
						// alert('data: ' + _this._search['data']);
						var data = _this._search['data'];
						var keywords = keyword.split(" ");
						var items = [];
						var keys = {"title" : "", "tags" : [], "categories" : [], "date_cn" : ""};
						for (var i = 0; i < data.length; i++) {
							var item = data[i];
							for (var j = 0; j < keywords.length; j++) {
								var keyword = keywords[j];
								var isHit = false;
								for (var key in keys) {
									var value = item[key];
									if (typeof value == typeof "") {
										if (value.indexOf(keyword) >= 0) {
											isHit = true;
											break;
										}
									} else if (typeof value == typeof []) {
										var isHit2 = false;
										for (var k = 0; k < value.length; k++) {
											var value2 = value[k];
											if (value2.indexOf(keyword) >= 0) {
												isHit2 = true;
												break;
											}
										}
										if (isHit2) {
											isHit = true;
											break;
										}
									}
								}
								if (isHit) {
									items.push(item);
									break;
								}
							}
						}
						
						// if (items.length == 0) {
						// 	alert('No Result');
						// }
						_this._search.show_result(items);
					},
					'show_result' : function(items) {
						// alert('show result, count: ' + items.length);
						var container = $('#search_result_area');
						if (items.length > 0) {
							container.removeClass('hide');
							container.html('');
						} else {
							// container.addClass('hide');
							container.removeClass('hide');
							container.html('No Result');
						}
						for (var i = 0; i < items.length; i++) {
							var item = items[i];
							var item_str = '<li><a href="' + item['url'] + '" target="_blank">' + item['title'] + '</a></li>';
							// alert(item_str);
							container.append(item_str);
						}
					}
				};

				this.search = function(keyword) {
					_this._search.search(keyword);
				};

				// 分享
				this.share = {
					'info' : {
						'title' : '',
						'url' : ''
					},
					'open' : function(template) {
						var attrs = {
							'url' : encodeURIComponent(this.info.url),
							'title' : encodeURIComponent(this.info.title),
							'desc' : ''
						};
						var url = _this.template.generate(template, attrs);
						window.open(url);
					},
					'local' : function() {
						
					},
					'share_to' : {
						'weixin' : function() {
							var container = $('#weixin_qr');
							var content = $('#weixin_qr_content');
							content.html('');
							new QRCode(document.getElementById('weixin_qr_content'), _this.share.info.url);
							$(container).addClass('show');
						},
						'sina' : function() {
							_this.share.open('http://service.weibo.com/share/share.php?url={{url}}&title={{title}}&ralateUid=2168855645');
						},
						'qq' : function() {
							_this.share.open('http://connect.qq.com/widget/shareqq/index.html?url={{url}}&desc={{desc}}&title={{title}}&;site=aopod&amp;pics=');
						},
						'douban' : function() {
							_this.share.open('http://shuo.douban.com/!service/share?image=&href={{url}}&name={{title}}');
						},
						'tweet' : function() {
							_this.share.open('https://twitter.com/home?status={{title}}%20--%20{{url}}');
						},
						'facebook' : function() {
							_this.share.open('http://www.facebook.com/share.php?src=bm&u={{url}}&t={{title}}');
						}
					},
					'handler' : function(target) {
						for (var key in this.share_to) {
							if ($(target).hasClass(key)) {
								if (this.share_to[key] !== undefined) {
									this.share_to[key]();
									break;
								}
							}
						}
					},
					'share_html' : function() {
						var html = '' +
'<div class="btn"></div>' +
'<div class="share_content">' +
'  <ul>' +
'    <li class="weixin"><div class="thumb"></div><div class="hint">微信分享</div></li>' +
'    <li class="sina"><div class="thumb"></div><div class="hint">分享到新浪微博</div></li>' +
'    <li class="qq"><div class="thumb"></div><div class="hint">分享给QQ好友</div></li>' +
'    <li class="tweet"><div class="thumb "></div><div class="hint">Tweet This!</div></li>' +
'  </ul>' +
'  <div style="width:0;height:0;overflow:hidden;position:relative;"><input value="" style="height:1px;"></div>' +
'</div>';
						return html;
					},
					'weixin_html' : function() {
						var html = '<div id="weixin_qr"><div class="content" id="weixin_qr_content"></div></div>';
						return html;
					},
					'init' : function() {
						var __this = this;

						if (window.aopod_page) {
							__this['info']['title'] = window.aopod_page.title;
							__this['info']['url'] = window.aopod_page.url;
						} else {
							__this['info']['title'] = document.title;
							__this['info']['url'] = window.location.href;
						}

						$('#footer .share').append(this.share_html());
						$('body').append(this.weixin_html());

						$('#footer .share li').click(function() {
							__this.handler(this);
						});

						$('#weixin_qr').click(function() {
							$('#weixin_qr').removeClass('show');
						});

						$('#footer .share .share_content input').focusout(function() {
      						$('#footer .share .share_content').removeClass('show');
    					});

    					$('#footer .share .btn').click(function() {
      						var obj = $('#footer .share .share_content');
      						if ($('#footer .share .share_content ul').height() > 10) {
        						$(obj).removeClass('show');
      						} else {
        						$(obj).addClass('show');
          						$('#footer .share .share_content input').focus();
      						}
    					});

    					/*
    					var weixinShare = $('#weixinShare');
      					// http://stackoverflow.com/questions/3552944/how-to-get-the-anchor-from-the-url-using-jquery
      					var hash = window.location.hash.substring(1);
      					weixinShare.click(function() {
        					$(this).removeClass('show');
      					});
      					if (hash === 'qr' || 
        					navigator.userAgent.toLowerCase().match(/MicroMessenger/i) === "micromessenger") {
        					weixinShare.addClass('show');
      					}
      					*/
					}
				};

				this.init = function() {
					if (isInitialized) return;
					isInitialized = true;
					setTimeout(function() {
						_this.menu.init();
						_this.scrollTop.init();
						_this.share.init();
						_this._search.init();
					}, 0);
					// check if is supported devices/browsers
					_this.support.init();

					// method need to run once
					setTimeout(function() {
					}, 0);
					
				};
			}

			return new Service();
		}
	};

	$(document).ready(function() {
		window.aopod = AOPOD_CLASS.create();
		window.aopod.init();
		// alert(window.aopod.support.transition);
		// var template = 'test1: {{abc}}, test2: {{cdef}}, test3:{{abc}}, test4: {{xxxx}}';
		// var data = {
		// 	'abc' : 'hehe',
		// 	'cdef' : '123'
		// };
		// alert(window.aopod.template.generate(template, data));
	});
})();