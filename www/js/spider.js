/* PanghuTV · 站点适配引擎（type=3 csp 源的壳内实现：多域名探测 + 模板化HTML解析 + 播放嗅探） */
(function () {
  'use strict';

  var SKIP_PATTERNS = [/暂停使用/i, /domain suspended/i, /默认跳转/, /请保存CTRL\+D/];

  var SPR = {
    cache: {},
    /* ---------- 基础 ---------- */
    abs: function (base, href) {
      if (!href) return '';
      href = href.trim();
      if (/^https?:\/\//i.test(href)) return href;
      if (href.indexOf('//') === 0) return 'https:' + href;
      try { return new URL(href, base).href; } catch (e) { return href; }
    },
    doc: function (html) {
      return new DOMParser().parseFromString(html, 'text/html');
    },
    text: function (el) { return el ? (el.textContent || '').trim() : ''; },
    attr: function (el, name) { return el ? (el.getAttribute(name) || '') : ''; },
    img: function (el) {
      if (!el) return '';
      return el.getAttribute('data-src') || el.getAttribute('data-original') ||
        el.getAttribute('src') || '';
    },
    /* ---------- 带Referer请求 ---------- */
    page: function (url, referer, timeout) {
      var h = referer ? { 'Referer': referer } : null;
      return HTTP.get(url, timeout || 12000, h);
    },
    /* ---------- 域名探测（并发竞速） ---------- */
    baseUrl: function (ad) {
      var self = this;
      var hit = self.cache[ad.key];
      if (hit) return Promise.resolve(hit);
      var domains = ad.domains || [];
      if (!domains.length) return Promise.reject(new Error('无候选域名'));
      return new Promise(function (resolve, reject) {
        var pending = domains.length, done = false;
        domains.forEach(function (d) {
          var url = /^https?:\/\//i.test(d) ? d : ('https://' + d + '/');
          SPR.page(url, null, 9000).then(function (html) {
            for (var k = 0; k < SKIP_PATTERNS.length; k++) {
              if (SKIP_PATTERNS[k].test(html) && html.length < 8000) throw new Error('skip');
            }
            if (!/<body/i.test(html)) throw new Error('skip');
            if (!done) { done = true; self.cache[ad.key] = url; resolve(url); }
          }).catch(function () {
            pending--;
            if (pending <= 0 && !done) {
              done = true;
              reject(new Error('候选域名均不可达（' + ad.name + '），检查网络或稍后再试'));
            }
          });
        });
      });
    },
    idOf: function (href) {
      var m = String(href || '').match(/(?:voddetail|detail|v_detail)[\/=]([\w\-]+)/i);
      return m ? m[1] : '';
    },
    /* ---------- MacCMS dz(module) 模板解析 ---------- */
    dzList: function (base, html) {
      var d = this.doc(html);
      var out = [];
      var items = d.querySelectorAll('.module-item, .video-item');
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var a = it.querySelector('a[href*="voddetail"]') ||
          it.querySelector('.module-item-title a, .video-title a');
        if (!a) continue;
        var img = it.querySelector('.module-item-pic img, img');
        out.push({
          id: this.idOf(this.attr(a, 'href')),
          href: this.abs(base, this.attr(a, 'href')),
          name: this.attr(a, 'title') || this.text(a),
          pic: this.abs(base, this.img(img)),
          remark: this.text(it.querySelector('.module-item-note, .video-info, .module-item-text, .note'))
        });
      }
      return out.filter(function (x) { return x.id && x.name; });
    },
    myuiList: function (base, html) {
      var d = this.doc(html);
      var out = [];
      var items = d.querySelectorAll('.myui-vodlist__box, li.col-p, .myui-vodlist li, .thumb, .card');
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var a = it.querySelector('a.myui-vodlist__thumb, a[href*="voddetail"], a[href*="/detail/"], a[href*="v_detail"]');
        if (!a) continue;
        var h3 = it.querySelector('h3 a, h4 a, .title a, a.title, .hand-color a');
        out.push({
          id: this.idOf(this.attr(a, 'href')),
          href: this.abs(base, this.attr(a, 'href')),
          name: this.attr(a, 'title') || this.text(h3) || this.text(a),
          pic: this.abs(base, this.img(a)),
          remark: this.text(it.querySelector('.pic-text, .text-right, span.pic-text, .note'))
        });
      }
      return out.filter(function (x) { return x.id && x.name; });
    },
    /* ---------- 播放页嗅探 ---------- */
    hop: function (pageUrl) {
      var self = this;
      return self.page(pageUrl, pageUrl).then(function (html) {
        var direct = self.grepMedia(html);
        if (direct) return direct;
        var d = self.doc(html);
        var ifr = d.querySelector('iframe[src*="player"], iframe[src*="share"], iframe[src*="play"]') ||
          d.querySelector('iframe');
        if (ifr) {
          var iurl = self.abs(pageUrl, self.attr(ifr, 'src'));
          return self.page(iurl, pageUrl).then(function (ih) {
            return self.grepMedia(ih) || iurl;
          });
        }
        throw new Error('播放页未嗅探到直链，可尝试「网页播放」');
      });
    },
    grepMedia: function (html) {
      var m = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) ||
        html.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
      if (m) return m[1];
      m = html.match(/url\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i);
      if (m) return m[1];
      return null;
    },
    isMedia: function (u) { return /\.(m3u8|mp4|flv)(\?|$)/i.test(u || ''); },
    isPan: function (u) {
      return /(pan\.quark|pan\.baidu|aliyundrive|alipan|115\.com|caiyun|weiyun|123pan|mega\.nz)/i.test(u || '');
    }
  };

  window.SPR = SPR;
})();
