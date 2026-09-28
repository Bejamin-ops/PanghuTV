/* PanghuTV · 站点适配器注册表（匹配 aowu 等 csp 源名） */
(function () {
  'use strict';
  var SPR = window.SPR;

  /* ============ MacCMS dz(module) 模板工厂（厂长/玩偶/木偶等） ============ */
  function dzAdapter(key, name, domains, cats, panMode) {
    return {
      key: key, name: name, domains: domains, panMode: !!panMode,
      classList: function () {
        return cats.map(function (c) { return { type_id: c[0], type_name: c[1] }; });
      },
      list: function (base, q) {
        var pg = Math.max(1, +q.pg || 1);
        var tid = q.tid || 1;
        var urls = [];
        if (pg > 1) {
          urls.push(base + 'vodshow/' + tid + '----------' + pg + '---.html');
          urls.push(base + 'vodshow/' + tid + '-' + pg + '.html');
          urls.push(base + 'vodshow/' + tid + '.html?pg=' + pg);
        } else {
          urls.push(base + 'vodshow/' + tid + '.html');
          urls.push(base + 'vodshow/' + tid + '-----------.html');
          urls.push(base + 'vodshow/' + tid + '----------1---.html');
        }
        function tryOne(i) {
          if (i >= urls.length) return Promise.resolve({ page: pg, pagecount: pg, total: 0, list: [] });
          return SPR.page(urls[i], base).then(function (html) {
            var list = SPR.dzList(base, html);
            if (list.length) {
              var hasMore = /下一页|page-next|下一頁/.test(html);
              return { page: pg, pagecount: hasMore ? pg + 1 : pg, total: list.length, list: list };
            }
            return tryOne(i + 1);
          }).catch(function () { return tryOne(i + 1); });
        }
        return tryOne(0);
      },
      detail: function (base, id) {
        var urls = [
          base + 'voddetail/' + id + '.html',
          base + 'voddetail/' + id + '-----------.html'
        ];
        function tryOne(i) {
          if (i >= urls.length) return Promise.reject(new Error('详情页不可达'));
          return SPR.page(urls[i], base).then(function (html) {
            var d = SPR.dzDetail(base, html, id);
            if (!d.play || !d.play.length) throw new Error('empty');
            return d;
          }).catch(function (e) {
            if (i + 1 < urls.length) return tryOne(i + 1);
            throw e;
          });
        }
        return tryOne(0);
      },
      search: function (base, wd) {
        var urls = [
          base + 'vodsearch/' + encodeURIComponent(wd) + '----------1---.html',
          base + 'vodsearch/' + encodeURIComponent(wd) + '.html',
          base + 'index.php/vodsearch/' + encodeURIComponent(wd) + '.html'
        ];
        function tryOne(i) {
          if (i >= urls.length) return Promise.resolve([]);
          return SPR.page(urls[i], base).then(function (html) {
            var list = SPR.dzList(base, html).slice(0, 20);
            if (list.length) return list;
            return tryOne(i + 1);
          }).catch(function () { return tryOne(i + 1); });
        }
        return tryOne(0);
      },
      resolvePlay: function (base, url) {
        if (SPR.isPan(url)) return Promise.reject({ pan: url, message: '网盘资源' });
        return SPR.hop(url);
      }
    };
  }

  SPR.dzDetail = function (base, html, id) {
    var d = SPR.doc(html);
    function pick(sel) {
      var el = d.querySelector(sel);
      return el ? SPR.text(el) : '';
    }
    var picEl = d.querySelector('.module-info-poster img, .module-info-pic img, .dyimg img, img.thumb');
    var name = pick('h1.title, .module-info-heading h1, h1') || ('ID' + id);
    var tabs = d.querySelectorAll('.module-tab-item, .module-tab-content .tab-item, .play_from li');
    var groups = d.querySelectorAll('.module-play-list, .play_list');
    var play = [];
    var anyEps = d.querySelectorAll('a[href*="vodplay"], a[href*="vodplay"]');
    if (groups.length) {
      for (var g = 0; g < groups.length; g++) {
        var links = groups[g].querySelectorAll('a');
        var eps = [];
        for (var i = 0; i < links.length; i++) {
          eps.push({ name: SPR.attr(links[i], 'title') || SPR.text(links[i]) || ('第' + (i + 1) + '集'), url: SPR.abs(base, SPR.attr(links[i], 'href')) });
        }
        if (eps.length) {
          var tab = tabs[g] ? (SPR.attr(tabs[g], 'title') || SPR.text(tabs[g])) : '';
          play.push({ name: tab || ('线路' + (g + 1)), eps: eps });
        }
      }
    } else if (anyEps.length) {
      var eps2 = [];
      for (var j = 0; j < anyEps.length; j++) {
        eps2.push({ name: SPR.attr(anyEps[j], 'title') || SPR.text(anyEps[j]) || ('第' + (j + 1) + '集'), url: SPR.abs(base, SPR.attr(anyEps[j], 'href')) });
      }
      play.push({ name: '默认线路', eps: eps2 });
    }
    var meta = [];
    var tagEls = d.querySelectorAll('.module-info-item, .module-info-tag a, .tag a');
    for (var m = 0; m < tagEls.length; m++) meta.push(SPR.text(tagEls[m]));
    return {
      site: this.__site || '', id: String(id), name: name,
      pic: SPR.abs(base, SPR.img(picEl)),
      remark: pick('.module-info-item-content') || meta.join(' · ').slice(0, 40),
      cls: pick('.module-info-taglink a') || '',
      year: (html.match(/(19|20)\d{2}/) || [''])[0],
      area: '', score: '', actor: pick('.module-info-item:3, .module-info-item-context') || '',
      director: '', content: pick('.module-info-introduction-content, .module-info-introduction, .sketch, .content') || '',
      play: play
    };
  };

  /* ============ MacCMS myui 模板工厂（libvio 等） ============ */
  function myuiAdapter(key, name, domains) {
    return {
      key: key, name: name, domains: domains,
      classList: function () {
        return [
          { type_id: '1', type_name: '电影' }, { type_id: '2', type_name: '剧集' },
          { type_id: '3', type_name: '综艺' }, { type_id: '4', type_name: '动漫' }
        ];
      },
      list: function (base, q) {
        var pg = Math.max(1, +q.pg || 1);
        var tid = q.tid || 1;
        var url = pg > 1
          ? base + 'index.php/vodtype/' + tid + '/' + pg + '.html'
          : base + 'index.php/vodtype/' + tid + '.html';
        if (q.wd) url = base + 'index.php/vodsearch/' + encodeURIComponent(q.wd) + '----------' + pg + '---.html';
        return SPR.page(url, base).then(function (html) {
          var list = SPR.myuiList(base, html);
          var hasMore = /下一页|next/.test(html);
          return { page: pg, pagecount: hasMore ? pg + 1 : pg, total: list.length, list: list };
        });
      },
      detail: function (base, id) {
        return SPR.page(base + 'index.php/voddetail/' + id + '.html', base).then(function (html) {
          return SPR.myuiDetail(base, html, id);
        });
      },
      resolvePlay: function (base, url) {
        if (SPR.isPan(url)) return Promise.reject({ pan: url, message: '网盘资源' });
        return SPR.hop(url);
      }
    };
  }

  SPR.myuiDetail = function (base, html, id) {
    var d = SPR.doc(html);
    function pick(sel) { var el = d.querySelector(sel); return el ? SPR.text(el) : ''; }
    var play = [];
    var froms = d.querySelectorAll('.myui-content__source, .nav-tabs a, .play_from li a');
    var groups = d.querySelectorAll('.myui-content__list');
    for (var g = 0; g < groups.length; g++) {
      var links = groups[g].querySelectorAll('a');
      var eps = [];
      for (var i = 0; i < links.length; i++) {
        eps.push({ name: SPR.attr(links[i], 'title') || SPR.text(links[i]), url: SPR.abs(base, SPR.attr(links[i], 'href')) });
      }
      if (eps.length) play.push({ name: (froms[g] ? SPR.text(froms[g]) : '') || ('线路' + (g + 1)), eps: eps });
    }
    return {
      site: this.__site || '', id: String(id),
      name: pick('.myui-content__detail h1, h1.title, h1') || ('ID' + id),
      pic: SPR.abs(base, SPR.img(d.querySelector('.myui-content__thumb img, .lazyload, img'))),
      remark: '', cls: '', year: (html.match(/(19|20)\d{2}/) || [''])[0],
      area: '', score: pick('.score, .rating-num'),
      actor: pick('.myui-content__detail p.data:nth-of-type(2)'), director: '',
      content: pick('.myui-content__detail .data.desc, .sketch, .text-collapse .content') || '',
      play: play
    };
  };

  /* ============ 注册表 ============ */
  var ADAPTERS = [
    dzAdapter('czzy', '厂长资源', ['www.4kcz.com', 'czzy.top', 'www.cz4k.com', 'cz01.tv'],
      [['1', '电影'], ['2', '剧集'], ['3', '综艺'], ['4', '动漫']]),
    dzAdapter('wogg', '玩偶4K', ['wogg.net', 'www.wogg.net', 'wogg25.net', 'wogg26.net', 'wogg27.net', 'wogg28.net', 'wogg29.net', 'wogg30.net', 'wogg33.net'],
      [['1', '电影'], ['2', '剧集'], ['3', '综艺'], ['4', '动漫'], ['25', '短剧']], true),
    dzAdapter('wobg', '木偶4K', ['wobg.net', 'www.wobg.net', 'wobg25.net', 'wobg26.net', 'wobg27.net', 'wobg28.net', 'wobg29.net', 'wobg30.net'],
      [['1', '电影'], ['2', '剧集'], ['3', '综艺'], ['4', '动漫'], ['25', '短剧']], true),
    myuiAdapter('libvio', 'LIBVIO', ['libvio.me', 'libvio.pro', 'libvio.cc', 'libvio.la', 'libvio.tv', 'libvio.link'])
  ];

  /* api名 / key / 名称 三重匹配（兼容不同接口的csp命名） */
  var MATCH = [
    { re: /csp_Czzy|厂长/i, ad: 0 },
    { re: /csp_Wogg|玩偶/i, ad: 1 },
    { re: /csp_Wobg|木偶/i, ad: 2 },
    { re: /csp_Libvio|libvio|LBV/i, ad: 3 }
  ];

  window.SPR_ADAPTERS = {
    list: ADAPTERS,
    resolve: function (site) {
      if (!site || +site.type !== 3) return null;
      var hay = (site.api || '') + ' ' + (site.key || '') + ' ' + (site.name || '');
      for (var i = 0; i < MATCH.length; i++) {
        if (MATCH[i].re.test(hay)) {
          return { ad: ADAPTERS[MATCH[i].ad], base: null, siteKey: site.key };
        }
      }
      return null;
    },
    isAdapted: function (site) { return !!this.resolve(site); }
  };
})();
