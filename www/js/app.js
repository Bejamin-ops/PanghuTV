/* Panghu影视 · 主逻辑：路由/首页/详情/搜索/收藏/设置/抽屉 */
(function () {
  'use strict';
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtT(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function timeAgo(ts) {
    var d = Date.now() - ts;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + '分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + '小时前';
    return Math.floor(d / 86400000) + '天前';
  }
  window.PH = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#1a2130"/><text x="150" y="230" font-size="60" text-anchor="middle" fill="#2c364e">🎬</text></svg>');

  var BUILTIN = {
    id: 'builtin', name: '演示接口', url: '', ver: 2,
    json: {
      name: '演示接口',
      sites: [{ key: 'demo', name: 'DanDan演示', type: 3, api: 'csp_Demo', searchable: 1, quickSearch: 1, filterable: 1 }],
      lives: [
        { name: '公共直播', type: 0, url: 'https://iptv-org.github.io/iptv/countries/cn.m3u', epg: '' },
        { name: '直播备用', type: 0, url: 'https://live.fanmingming.com/tv/m3u/ipv6.m3u', epg: '' }
      ]
    }
  };

  var A = {
    cfgs: Store.get('configs', []),
    cfgId: Store.get('activeCfg', 'builtin'),
    site: null, cats: [], cat: '',
    filters: { sub: '', area: '', year: '', by: 'time' }, popAttr: null,
    page: 1, pagecount: 1, loading: false, seq: 0,
    detailCache: {}, detailCtx: null, srcIdx: 0,
    stack: ['home'], pushed: false, view: 'home',
    favTab: 'fav', searchAll: false
  };

  function cfg() {
    for (var i = 0; i < A.cfgs.length; i++) if (A.cfgs[i].id === A.cfgId) return A.cfgs[i];
    return BUILTIN;
  }
  function sites() { return (cfg().json.sites || []); }
  function findSite(k) {
    var arr = sites();
    for (var i = 0; i < arr.length; i++) if (arr[i].key === k) return arr[i];
    return null;
  }
  function siteName(k) { var s = findSite(k); return s ? s.name : k; }
  function siteTypeLabel(s) {
    if (CMS.isDemo(s)) return '演示';
    if (s.type === 0) return 'CMS·JSON';
    if (s.type === 1) return 'CMS·XML';
    if (s.type === 3) return (window.SPR_ADAPTERS && SPR_ADAPTERS.isAdapted(s)) ? '🧩已适配' : 'Spider·未适配';
    return 'Spider';
  }

  var toastT = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* ============ 路由 ============ */
  var VIEWS = ['home', 'search', 'detail', 'live', 'fav', 'settings', 'player'];
  var TAB_VIEWS = { home: 'home', live: 'live', fav: 'fav' };
  function goto(view) {
    if (Player.isOpen() && view !== 'player') Player.close(true);
    VIEWS.forEach(function (v) {
      var el = $('#view-' + v);
      if (el) el.classList.toggle('active', v === view);
    });
    $('#topbar').style.display = (view === 'player' || view === 'detail') ? 'none' : 'flex';
    var detailBar = document.querySelector('.detail-top');
    if (detailBar) detailBar.style.display = (view === 'detail') ? 'flex' : 'none';
    var showTab = !!TAB_VIEWS[view];
    document.body.classList.toggle('has-tabbar', showTab);
    $$('#tabbar button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === view);
    });
    document.body.classList.toggle('lock', view === 'player');
    syncBars();
    A.view = view;
    if (view !== 'player') {
      var appEl = document.getElementById('app');
      if (appEl) appEl.scrollTop = 0; else window.scrollTo(0, 0);
    }
    if (view === 'fav') renderFav();
    if (view === 'settings') renderSettings();
  }
  function push(v) {
    A.stack.push(v);
    try { history.pushState({ g: 1 }, '', '#/' + v); A.pushed = true; } catch (e) { A.pushed = false; }
  }
  function popManual() {
    if (A.stack.length > 1) { A.stack.pop(); goto(A.stack[A.stack.length - 1]); }
    else goto('home');
  }
  function goBack() {
    if (A.pushed) { try { history.back(); } catch (e) { A.pushed = false; popManual(); } }
    else popManual();
  }
  window.addEventListener('popstate', function () {
    A.pushed = false;
    popManual();
  });

  /* ============ 首页：站点/分类/筛选/无限滚动 ============ */
  var AREA_OPTS = ['全部', '大陆', '香港', '台湾', '美国', '韩国', '日本', '欧洲', '泰国'];
  var YEAR_OPTS = ['全部', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'];
  var BY_OPTS = [['time', '最新'], ['hits', '最热'], ['score', '评分']];

  function firstUsableSiteKey() {
    var arr = sites();
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      if (CMS.isDemo(s) || +s.type === 0 || +s.type === 1 ||
        (window.SPR_ADAPTERS && SPR_ADAPTERS.isAdapted(s))) return s.key;
    }
    return arr.length ? arr[0].key : null;
  }

  function adaptedSites() {
    return sites().filter(function (s) {
      return window.SPR_ADAPTERS && SPR_ADAPTERS.isAdapted(s);
    });
  }

  function renderUnsupportedSite(errMsg) {
    var good = adaptedSites();
    var html = '<div class="empty" style="padding:34px 20px">' +
      '<div style="font-size:38px;margin-bottom:10px">🧩</div>' +
      '<div style="font-size:15px;font-weight:700;margin-bottom:6px">「' + esc(A.site.name || A.site.key) + '」需要 Spider(jar) 运行时</div>' +
      '<div style="font-size:12.5px;color:var(--tx2);line-height:1.7;margin-bottom:4px">这是嗷呜接口里的功能型源（配置管理/网盘/直播等），<br>不是普通影视站，本壳暂未适配它的爬虫。</div>' +
      '<div style="font-size:12px;color:var(--tx2);margin-bottom:14px">' + esc(errMsg || '') + '</div>';
    if (good.length) {
      html += '<div style="font-size:13px;color:var(--tx);margin-bottom:10px">👇 本接口里这些源可直接用：</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">';
      good.forEach(function (s) {
        html += '<button class="mini-btn on" data-jumpsite="' + esc(s.key) + '" style="padding:9px 16px;font-size:13px">' +
          esc(s.name) + '</button>';
      });
      html += '</div>';
    } else {
      html += '<div style="font-size:13px;color:var(--tx2)">本接口没有壳内可直接用的源。<br>建议导入苹果CMS JSON 接口（type 0）。</div>';
    }
    html += '</div>';
    $('#grid').innerHTML = html;
    var bar = $('#filter-bar');
    if (bar) bar.innerHTML = '';
    var tabs = $('#cat-tabs');
    if (tabs) tabs.innerHTML = '';
    var bn = $('#banner');
    if (bn) bn.innerHTML = '';
    $('#sentinel').style.display = 'none';
  }

  function switchSite(key) {
    var s = findSite(key);
    if (!s) { var arr = sites(); s = arr[0]; if (!s) { toast('当前接口没有可用站点'); return; } key = s.key; }
    A.site = s; A.cat = ''; A.srcIdx = 0;
    A.filters = { sub: '', area: '', year: '', by: 'time' };
    A.popAttr = null;
    A.page = 1; A.pagecount = 1; A.seq++;
    Store.set('lastSite', key);
    $('#btn-sites').textContent = s.name + ' ▾';
    $('#grid').innerHTML = '';
    renderCatTabs([]);
    CMS.classList(s).then(function (c) {
      A.cats = c || [];
      renderCatTabs();
      loadHome(true);
    }).catch(function (e) {
      A.cats = [];
      renderCatTabs();
      toast('分类加载失败：' + e.message);
      loadHome(true);
    });
  }

  function renderCatTabs() {
    var el = $('#cat-tabs');
    var html = '<button class="cat' + (A.cat === '' ? ' on' : '') + '" data-cat="">全部</button>';
    A.cats.forEach(function (c) {
      html += '<button class="cat' + (String(c.type_id) === String(A.cat) ? ' on' : '') +
        '" data-cat="' + esc(c.type_id) + '">' + esc(c.type_name) + '</button>';
    });
    el.innerHTML = html;
    renderFilterBar();
  }

  function chip(label, attr, val, on) {
    return '<button class="f-chip' + (on ? ' on' : '') + '" data-attr="' + attr + '" data-val="' + esc(val) + '">' +
      esc(label) + '</button>';
  }
  function renderFilterBar() {
    var f = A.filters;
    var byL = (BY_OPTS.filter(function (b) { return b[0] === f.by; })[0] || BY_OPTS[0])[1];
    var items = [
      { k: 'by', label: byL, cur: f.by, opts: BY_OPTS.map(function (b) { return { v: b[0], l: b[1] }; }) }
    ];
    if (A.cat && CMS.isDemo(A.site)) {
      var subs = DemoSource.subsOf(A.cat) || [];
      if (subs.length) {
        items.push({ k: 'sub', label: f.sub || '类型', cur: f.sub, opts: [{ v: '', l: '全部' }].concat(subs.map(function (s) { return { v: s, l: s }; })) });
      }
    }
    items.push({ k: 'area', label: '地区\u00b7' + (f.area || '\u5168\u90e8'), cur: f.area || '\u5168\u90e8', opts: AREA_OPTS.map(function (v) { return { v: v, l: v }; }) });
    items.push({ k: 'year', label: (f.year && f.year !== '\u5168\u90e8') ? f.year : '\u5e74\u4efd', cur: f.year || '\u5168\u90e8', opts: YEAR_OPTS.map(function (v) { return { v: v, l: v }; }) });
    var html = '<div class="filter-row">' + items.map(function (it) {
      var on = (it.k === 'by' && f.by !== 'time') || (it.k !== 'by' && it.cur !== '\u5168\u90e8' && it.cur !== '');
      return '<button class="fchip' + (on ? ' on' : '') + '" data-pop="' + it.k + '">' + esc(it.label) + '</button>';
    }).join('') + '</div>';
    if (A.popAttr) {
      var pop = items.filter(function (it) { return it.k === A.popAttr; })[0];
      if (pop) {
        html += '<div class="filter-opts">' + pop.opts.map(function (o) {
          return '<button class="fopt' + (pop.cur === o.v ? ' on' : '') + '" data-attr="' + pop.k + '" data-val="' + esc(o.v) + '">' + esc(o.l) + '</button>';
        }).join('') + '</div>';
      }
    }
    $('#filter-bar').innerHTML = html;
  }

  function skeleton(n) {
    var h = '';
    for (var i = 0; i < n; i++) h += '<div class="skl"></div>';
    return h;
  }
  function cardHtml(v) {
    return '<button class="card js-card" data-site="' + esc(v.site) + '" data-id="' + esc(v.id) + '">' +
      '<div class="poster"><img loading="lazy" src="' + esc(v.pic) + '" ' +
      'onerror="this.onerror=null;this.src=window.PH">' +
      (v.remark ? '<span class="remark">' + esc(v.remark) + '</span>' : '') + '</div>' +
      '<div class="c-name">' + esc(v.name) + '</div>' +
      (v.siteName ? '<div class="c-site">' + esc(v.siteName) + '</div>' : '') +
      '</button>';
  }

  function loadHome(reset) {
    if (!A.site || A.loading) return;
    if (reset) { A.page = 1; $('#grid').innerHTML = skeleton(12); $('#sentinel').style.display = 'none'; }
    A.loading = true;
    var seq = ++A.seq;
    CMS.list(A.site, {
      pg: A.page, tid: A.cat, sub: A.filters.sub,
      area: A.filters.area === '全部' ? '' : A.filters.area,
      year: A.filters.year === '全部' ? '' : A.filters.year,
      wd: '', by: A.filters.by
    }).then(function (r) {
      if (seq !== A.seq) return;
      A.loading = false;
      A.pagecount = r.pagecount || 1;
      var html = r.list.map(function (v) { return cardHtml(v); }).join('');
      if (reset) {
        $('#grid').innerHTML = html || '<div class="empty">没有找到内容</div>';
        renderBanner();
      }
      else $('#grid').insertAdjacentHTML('beforeend', html);
      if (!reset && !r.list.length) toast('没有更多了');
      $('#sentinel').style.display = A.page < A.pagecount ? 'flex' : 'none';
    }).catch(function (e) {
      if (seq !== A.seq) return;
      A.loading = false;
      if (reset) {
        if (+A.site.type === 3 && !(window.SPR_ADAPTERS && SPR_ADAPTERS.isAdapted(A.site))) {
          renderUnsupportedSite(e.message);
        } else {
          $('#grid').innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
        }
      }
      $('#sentinel').style.display = 'none';
    });
  }

  function initObserver() {
    if (typeof IntersectionObserver === 'undefined') return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && !A.loading && A.page < A.pagecount && A.view === 'home') {
          A.page++; loadHome(false);
        }
      });
    }, { rootMargin: '400px', root: document.getElementById('app') });
    io.observe($('#sentinel'));
  }

  /* ============ 详情 + 播放 ============ */
  function openDetail(siteKey, id) {
    A.detailCtx = { site: siteKey, id: id };
    A.srcIdx = 0;
    goto('detail'); push('detail');
    var box = $('#view-detail');
    box.innerHTML = '<div class="detail-loading"><div class="spinner"></div></div>';
    var c = A.detailCache[siteKey + ':' + id];
    if (c) return renderDetail(c);
    var s = findSite(siteKey);
    if (!s) { box.innerHTML = '<div class="empty">站点不存在</div>'; return; }
    CMS.detail(s, id).then(function (d) {
      A.detailCache[siteKey + ':' + id] = d;
      renderDetail(d);
    }).catch(function (e) {
      box.innerHTML = '<div class="empty">详情加载失败：' + esc(e.message) + '</div>';
    });
  }
  function curDetail() {
    return A.detailCtx ? A.detailCache[A.detailCtx.site + ':' + A.detailCtx.id] : null;
  }
  function renderDetail(d) {
    if (!d) return;
    var favs = Store.get('favs', []);
    var isFav = favs.some(function (f) { return f.site === d.site && f.id === d.id; });
    var hist = Store.get('history', []).filter(function (h) { return h.site === d.site && h.id === d.id; })[0];
    var play = d.play || [];
    var meta = [d.year, d.area, d.type_name || (d.cls || '').split(',')[0]].filter(function (x) { return x; }).join(' \u00b7 ');
    var srcTabs = play.map(function (p, i) {
      return '<button class="src' + (i === A.srcIdx ? ' on' : '') + '" data-src="' + i + '">' + esc(p.name) +
        '<span class="n">' + p.eps.length + '</span></button>';
    }).join('') || '<span class="empty" style="padding:0">\u65e0\u64ad\u653e\u6e90</span>';
    var cur = play[A.srcIdx] || null;
    var eps = cur ? cur.eps.map(function (e, i) {
      return '<button class="ep js-ep" data-i="' + i + '">' + esc(e.name) + '</button>';
    }).join('') : '';
    $('#view-detail').innerHTML =
      '<div class="detail-top"><button id="d-back" class="icon-btn">\u2039</button>' +
      '<div class="detail-top-title">' + esc(d.name) + '</div>' +
      '<button id="d-fav" class="icon-btn">' + (isFav ? '\u2665' : '\u2661') + '</button></div>' +
      '<div class="hero" style="--bgimg:url(\'' + esc(d.pic).replace(/'/g, '') + '\')">' +
        '<div class="hero-poster"><img src="' + esc(d.pic) + '" onerror="this.onerror=null;this.src=window.PH"></div>' +
        '<div class="hero-info">' +
          '<div class="hero-name">' + esc(d.name) + '</div>' +
          '<div class="hero-meta">' + esc(siteName(d.site)) + '</div>' +
          '<div class="hero-meta">' + esc(meta || '\u6682\u65e0\u4fe1\u606f') + '</div>' +
          (d.remark ? '<div class="hero-score">' + esc(d.remark) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="vd-actions">' +
        '<button id="d-play1" class="vd-btn play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>\u64ad\u653e</button>' +
        '<button id="d-fav2" class="vd-btn fav">' + (isFav ? '\u2665' : '\u2661') + '</button>' +
      '</div>' +
      '<div class="section"><div class="sec-title">\u64ad\u653e\u6e90</div><div class="src-tabs" id="d-srcs">' + srcTabs + '</div></div>' +
      '<div class="section"><div class="sec-title">\u9009\u96c6<span class="sub">' + (cur ? cur.eps.length + '\u96c6 \u00b7 ' + esc(cur.name) : '') + '</span></div>' +
      '<div class="ep-grid" id="d-eps">' + eps + '</div></div>' +
      '<div class="section"><div class="sec-title">\u7b80\u4ecb</div>' +
      '<div class="hero-desc open" style="max-height:none" id="d-desc">' + esc(d.content || '\u6682\u65e0\u7b80\u4ecb') + '</div></div>';

    var dtop = document.querySelector('#view-detail .detail-top');
    if (dtop && dtop.parentElement !== document.body) document.body.appendChild(dtop);
    $('#d-back').onclick = goBack;
    $('#d-fav').onclick = function () { toggleFav(d); renderDetail(d); };
    var fav2 = document.getElementById('d-fav2');
    if (fav2) fav2.onclick = function () { toggleFav(d); renderDetail(d); };
    $('#d-play1').onclick = function () { playEp(0, 0); };
    var rs = $('#d-resume');
    if (rs) rs.onclick = function () {
      var idx = 0;
      if (cur) {
        for (var i = 0; i < cur.eps.length; i++) {
          if (cur.eps[i].name === hist.epName) { idx = i; break; }
        }
      }
      playEp(idx, hist.pos);
    };
    $('#d-srcs').onclick = function (ev) {
      var b = ev.target.closest('.src');
      if (!b) return;
      A.srcIdx = +b.dataset.src;
      renderDetail(d);
    };
  }
  function saveHistory(d, epName, pos, dur) {
    var h = Store.get('history', []);
    var key = d.site + ':' + d.id;
    h = h.filter(function (x) { return x.site + ':' + x.id !== key; });
    h.unshift({
      site: d.site, siteName: siteName(d.site), id: d.id, name: d.name, pic: d.pic,
      epName: epName, pos: pos || 0, dur: dur || 0, ts: Date.now()
    });
    Store.set('history', h.slice(0, 100));
  }
  function toggleFav(d) {
    var favs = Store.get('favs', []);
    var key = d.site + ':' + d.id;
    var has = favs.some(function (f) { return f.site + ':' + f.id === key; });
    if (has) favs = favs.filter(function (f) { return f.site + ':' + f.id !== key; });
    else favs.unshift({
      site: d.site, siteName: siteName(d.site), id: d.id, name: d.name, pic: d.pic,
      remark: d.remark || '', ts: Date.now()
    });
    Store.set('favs', favs);
    toast(has ? '已取消收藏' : '已加入收藏');
  }
  function copyText(t) {
    try {
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }

  function playEp(i, resume) {
    var d = curDetail();
    if (!d) return;
    var play = d.play || [];
    if (!play.length) { toast('没有可播放的地址'); return; }
    var p = play[A.srcIdx] || play[0];
    var ep = p.eps[i];
    if (!ep) { toast('没有这一集'); return; }
    var ctx = { d: d, p: p, i: i, ep: ep, resume: resume || 0 };

    var res = (window.SPR_ADAPTERS) ? SPR_ADAPTERS.resolve(findSite(d.site)) : null;
    if (res) {
      toast('正在解析播放页…');
      res.ad.baseUrl(res.ad).then(function (base) {
        return res.ad.resolvePlay(base, ep.url);
      }).then(function (direct) {
        launchPlayer(ctx, direct);
      }).catch(function (e) {
        if (e && e.pan) {
          copyText(e.pan);
          toast('网盘资源：链接已复制，请到网盘App打开播放');
        } else {
          copyText(ep.url);
          toast((e && e.message || '解析失败') + '；播放页链接已复制');
        }
      });
      return;
    }
    launchPlayer(ctx, ep.url);
  }

  function launchPlayer(ctx, url) {
    var d = ctx.d, p = ctx.p, i = ctx.i;
    saveHistory(d, ctx.ep.name, 0, 0);
    goto('player'); push('player');
    Player.open({
      title: d.name, epName: ctx.ep.name, url: url,
      episodes: p.eps, epIndex: i, resume: ctx.resume, skipKey: d.site + ':' + d.id,
      sources: (d.play || []).map(function (x) { return { name: x.name, count: x.eps.length }; }),
      srcIndex: A.srcIdx || 0,
      onSwitchSrc: function (ni) { switchLineFromPlayer(ni); },
      onProgress: function (pos, dur, epIdx, epName) {
        saveHistory(d, epName || p.eps[epIdx].name, pos, dur);
      },
      onSwitch: function (ni, o) {
        var nextEp = p.eps[ni];
        if (!nextEp) { toast('没有更多集了'); return; }
        var res = (window.SPR_ADAPTERS) ? SPR_ADAPTERS.resolve(findSite(d.site)) : null;
        if (res) {
          showSpinCompat(true);
          res.ad.baseUrl(res.ad).then(function (base) {
            return res.ad.resolvePlay(base, nextEp.url);
          }).then(function (direct) {
            o.url = direct;
            Player.update(o);
            saveHistory(d, o.epName, 0, 0);
          }).catch(function () {
            toast('换集解析失败');
          });
          return;
        }
        Player.update(o);
        saveHistory(d, o.epName, 0, 0);
      },
      onExit: function () {
        try {
          var v = document.getElementById('pv-video');
          if (v && v.currentTime > 0) saveHistory(d, p.eps[i].name, v.currentTime, v.duration || 0);
        } catch (e) {}
        Player.close(true);
        goBack();
      }
    });
  }
  /* 播放器面板内切换线路：保持当前集序，重新解析新线路同集 */
  function switchLineFromPlayer(ni) {
    var d = curDetail();
    if (!d) return;
    var play = d.play || [];
    if (!play[ni]) { toast('没有这个线路'); return; }
    A.srcIdx = ni;
    var p = play[ni];
    var i = Math.min(window.Player ? Player.curIndex() : 0, p.eps.length - 1);
    var ep = p.eps[i];
    var ctx = { d: d, p: p, i: i, ep: ep, resume: 0 };
    saveHistory(d, ep.name, 0, 0);
    var res = (window.SPR_ADAPTERS) ? SPR_ADAPTERS.resolve(findSite(d.site)) : null;
    if (res) {
      toast('切换到「' + p.name + '」解析中…');
      res.ad.baseUrl(res.ad).then(function (base) {
        return res.ad.resolvePlay(base, ep.url);
      }).then(function (direct) {
        Player.update({ url: direct, episodes: p.eps, epIndex: i, epName: ep.name, resume: 0,
          srcIndex: ni, sources: play.map(function (x) { return { name: x.name, count: x.eps.length }; }) });
      }).catch(function () {
        toast('该线路解析失败，试试别的线路');
      });
    } else {
      Player.update({ url: ep.url, episodes: p.eps, epIndex: i, epName: ep.name, resume: 0,
        srcIndex: ni, sources: play.map(function (x) { return { name: x.name, count: x.eps.length }; }) });
      toast('已切换到「' + p.name + '」');
    }
  }
  window.switchLineFromPlayer = switchLineFromPlayer;

  function showSpinCompat(v) {
    var e = document.getElementById('pv-spin');
    if (e) e.classList.toggle('hidden', !v);
  }

  /* ============ 搜索 ============ */
  function doSearch(q) {
    q = (q || '').trim();
    if (!q) { toast('输入片名再搜'); return; }
    goto('search'); push('search');
    var targets = A.searchAll
      ? sites().filter(function (s) { return s.searchable !== 0; }).slice(0, 8)
      : [A.site];
    var box = $('#view-search');
    box.innerHTML =
      '<div class="page-top"><button id="s-back" class="icon-btn">‹</button>' +
      '<div class="page-top-title">搜索：' + esc(q) + (A.searchAll ? '（全站）' : '') + '</div></div>' +
      targets.map(function (s, i) {
        return '<div class="section"><div class="sec-title">' + esc(s.name) +
          '<span class="sub" id="sr-' + i + '">搜索中…</span></div>' +
          '<div class="grid" id="sb-' + i + '">' + skeleton(6) + '</div></div>';
      }).join('');
    $('#s-back').onclick = goBack;
    targets.forEach(function (s, i) {
      CMS.list(s, { wd: q, pg: 1 }).then(function (r) {
        var el = $('#sb-' + i), st = $('#sr-' + i);
        if (!el) return;
        var list = (r.list || []).slice(0, 12).map(function (v) {
          v.siteName = s.name;
          return cardHtml(v);
        }).join('');
        el.innerHTML = list || '<div class="empty" style="padding:14px">无结果</div>';
        st.textContent = (r.list || []).length ? '共' + r.total + '条' : '无结果';
      }).catch(function (e) {
        var el = $('#sb-' + i), st = $('#sr-' + i);
        if (el) el.innerHTML = '<div class="empty" style="padding:14px">失败：' + esc(e.message) + '</div>';
        if (st) st.textContent = '失败';
      });
    });
  }

  /* ============ 收藏/历史 ============ */
  function showPanSheet() {
    var pans = ['夸克云盘', '阿里云盘', 'UC云盘', '百度云盘', '123云盘', '哔哩哔哩'];
    var html = '<div class="modal-mask show" id="panmask"><div class="modal">' +
      '<div class="modal-head"><div class="modal-title">选择云盘</div>' +
      '<button class="modal-close" data-x="1">关闭</button></div><div class="modal-body">';
    pans.forEach(function (p) {
      html += '<div class="card"><b>' + p + '</b>' +
        '<span style="color:#8a90a0;font-size:12.5px">转存播放开发中 · 当前播放网盘资源会自动复制分享链接，请到对应网盘 App 打开</span></div>';
    });
    html += '<div style="color:#8a90a0;font-size:12px;line-height:1.7">提示：网盘 4K 资源需要登录态转存才能取直链。扫码设置 Cookie 的转存播放将在后续版本支持。</div></div></div></div>';
    var m = document.createElement('div');
    m.innerHTML = html;
    document.body.appendChild(m.firstChild);
    var el = document.getElementById('panmask');
    el.addEventListener('click', function (ev) {
      if (ev.target === el || ev.target.closest('[data-x]')) el.remove();
    });
  }

  function showModal(title, bodyHtml) {
    var old = document.getElementById('gmodal');
    if (old) old.remove();
    var m = document.createElement('div');
    m.innerHTML = '<div class="modal-mask show" id="gmodal"><div class="modal">' +
      '<div class="modal-head"><div class="modal-title">' + esc(title) + '</div>' +
      '<button class="modal-close" data-x="1">关闭</button></div>' +
      '<div class="modal-body">' + bodyHtml + '</div></div></div>';
    document.body.appendChild(m.firstChild);
    var el = document.getElementById('gmodal');
    el.addEventListener('click', function (ev) {
      if (ev.target === el || ev.target.closest('[data-x]')) el.remove();
    });
  }

  function renderFav() {
    var tab = A.favTab;
    var favs = Store.get('favs', []);
    var hist = Store.get('history', []);
    var box = $('#view-fav');
    box.innerHTML =
      '<div class="page-top"><button id="f-back" class="icon-btn">‹</button>' +
      '<div class="page-top-title">我的</div></div>' +
      '<div class="me-card"><img class="me-logo" src="assets/icon-180.png" onerror="this.style.display=\'none\'">' +
      '<div style="flex:1;min-width:0"><div class="me-name">DanDan影视</div>' +
      '<div class="me-sub">' + esc(cfg().name) + ' · ' + sites().length + '个站点 · 当前：' + esc(A.site ? A.site.name : '-') + '</div></div>' +
      '<button class="icon-btn" id="me-set">⚙</button></div>' +
      '<div class="seg"><button data-tab="fav"' + (tab === 'fav' ? ' class="on"' : '') + '>收藏 ' + favs.length + '</button>' +
      '<button data-tab="hist"' + (tab === 'hist' ? ' class="on"' : '') + '>历史 ' + hist.length + '</button></div>' +
      '<div class="set-group" style="margin:12px 14px"><div class="set-title">网盘</div>' +
      '<div class="set-row"><span style="flex:1;font-size:14px">云盘 Token（夸克/阿里/UC…）</span>' +
      '<button id="me-pan" class="set-btn ghost">管理</button></div></div>' +
      (tab === 'fav'
        ? '<div class="grid">' + (favs.length ? favs.map(function (f) {
            return cardHtml({ site: f.site, id: f.id, pic: f.pic, name: f.name, remark: f.remark });
          }).join('') : '<div class="empty">还没有收藏，去详情页点 ♡</div>') + '</div>'
        : '<div>' + (hist.length ? hist.map(function (h, i) {
            var pct = h.dur ? Math.min(100, h.pos / h.dur * 100) : 0;
            return '<div class="hist-row js-card" data-site="' + esc(h.site) + '" data-id="' + esc(h.id) + '">' +
              '<img class="hist-poster" src="' + esc(h.pic) + '" onerror="this.onerror=null;this.src=window.PH">' +
              '<div class="hist-info"><div class="hist-name">' + esc(h.name) + '</div>' +
              '<div class="hist-sub">' + esc(h.epName || '') + ' · 看到 ' + fmtT(h.pos) + ' · ' + timeAgo(h.ts) + '</div>' +
              '<div class="hist-bar"><i style="width:' + pct + '%"></i></div></div>' +
              '<button class="del-btn" data-delhist="' + i + '">✕</button></div>';
          }).join('') + '<div class="section"><button id="f-clear" class="mini-btn danger" style="width:100%;padding:10px">清空播放历史</button></div>'
          : '<div class="empty">暂无播放记录</div>') + '</div>');
    $('#f-back').onclick = goBack;
    var meSet = document.getElementById('me-set');
    if (meSet) meSet.onclick = function () { goto('settings'); push('settings'); };
    var mePan = document.getElementById('me-pan');
    if (mePan) mePan.onclick = showPanSheet;
  }

  /* ============ 设置 ============ */
  function renderSettings() {
    var box = $('#view-settings');
    box.innerHTML =
      '<div class="page-top"><button id="st-back" class="icon-btn">‹</button>' +
      '<div class="page-top-title">设置</div></div>' +

      '<div class="set-group"><div class="set-title">接口管理（TVBox 0.0.x 配置）</div>' +
      '<div class="set-row"><input id="cfg-url" class="set-input" placeholder="接口URL(https://… 返回{sites:[...]})">' +
      '<button id="cfg-add" class="set-btn">添加</button></div>' +
      '<div class="set-row"><input id="cfg-file" type="file" accept=".json,.txt,application/json,text/plain" style="display:none">' +
      '<button id="cfg-filebtn" class="set-btn ghost">📁 导入本地文件(摸鱼等)</button></div>' +
      '<div class="set-row"><input id="cfg-name" class="set-input" placeholder="备注名(可选)">' +
      '<button id="cfg-import" class="set-btn ghost">粘贴JSON导入</button></div>' +
      '<textarea id="cfg-json" class="set-input" rows="4" style="margin:10px 2px;width:calc(100% - 4px)" ' +
      'placeholder=\'{"sites":[{"key":"xx","name":"xx","type":0,"api":"https://…/provide/vod"}]}\'></textarea>' +
      '<div id="cfg-list"></div>' +
      '<div class="set-note">· type 0 = 苹果CMS V10 JSON 接口（网页壳/安卓壳都可用）<br>' +
      '· type 3 = Spider 源（内置 csp_Demo 可用；其余需在安卓原生壳里跑 Spider 运行时）<br>' +
      '· 网页预览有跨域限制，远程接口请在安卓壳内使用</div></div>' +

      '<div class="set-group"><div class="set-title">播放器</div>' +
      '<div class="set-row"><button id="st-kernel" class="set-btn ghost" style="width:100%">🎬 默认播放器（自动 / 内置 / VLC / nPlayer / Infuse / 网页）</button></div>' +
      '<div class="set-row"><button id="st-playerhelp" class="set-btn ghost" style="width:100%">📖 播放器内核说明（内置/VLC/nPlayer/Infuse/网页）</button></div></div>' +

      '<div class="set-group"><div class="set-title">数据</div>' +
      '<div class="set-row"><button id="st-clearhist" class="set-btn danger">清空播放历史</button>' +
      '<button id="st-clearfav" class="set-btn danger">清空收藏</button>' +
      '<button id="st-clearcache" class="set-btn ghost">清详情缓存</button></div></div>' +

      '<div class="set-group"><div class="set-title">关于</div>' +
      '<div class="set-note">DanDan影视 v3.1 · 原生内核版<br>' +
      'Web 核心 + Android WebView 壳（无跨域HTTP桥）<br>' +
      '支持：TVBox配置导入 / CMS·JSON源 / HLS·MP4播放 / 收藏历史续播<br>' +
      '演示源为公共测试片源，请自行配置合法授权接口</div>' +
      '<div class="set-note" id="diag-bottom" style="color:#5f6778"></div></div>';

    $('#st-back').onclick = goBack;
    try {
      var probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;bottom:0;height:1px;padding-bottom:env(safe-area-inset-bottom);visibility:hidden';
      document.body.appendChild(probe);
      var envB = probe.getBoundingClientRect().height - 1;
      document.body.removeChild(probe);
      var dRect = document.documentElement.getBoundingClientRect();
      var dg = $('#diag-bottom');
      if (dg) dg.textContent = '底部诊断: 视口高' + innerHeight + ' · 文档底' + Math.round(dRect.bottom) +
        ' · 安全区' + Math.round(envB) + 'px · 壳' + (document.body.classList.contains('native') ? '内' : '外');
    } catch (e) {}
    renderCfgList();
    $('#cfg-add').onclick = function () {
      var url = $('#cfg-url').value.trim().replace(/[\s\u200b-\u200d\ufeff]+/g, '');
      var name = $('#cfg-name').value.trim();
      if (!/^https?:\/\//.test(url)) { toast('URL 不合法（要以 http(s):// 开头）'); return; }
      toast('拉取接口中…');
      var tryFetch = function (attempt) {
        HTTP.get(url, 30000).then(function (txt) {
          var clean = (txt || '').replace(/^\uFEFF/, '').trim();
          if (!clean) throw new Error('服务器返回空内容（地址可能失效或被网络拦截）');
          var j;
          try { j = JSON.parse(clean); }
          catch (pe) {
            throw new Error('返回的不是完整JSON：开头「' + clean.slice(0, 26).replace(/</g, '＜') + '」(' + clean.length + '字节)');
          }
          if (!j || !j.sites || !j.sites.length) throw new Error('配置里没有 sites');
          addCfg(j, name || j.name || url, url);
        }).catch(function (e) {
          if (attempt < 1) { setTimeout(function () { tryFetch(1); }, 900); return; }
          var m = (e && e.message) || String(e);
          toast('导入失败：' + m);
        });
      };
      tryFetch(0);
    };
    $('#cfg-import').onclick = function () {
      try {
        var raw = ($('#cfg-json').value || '').replace(/^\uFEFF/, '').trim();
        var j = JSON.parse(raw);
        if (!j || !j.sites || !j.sites.length) throw new Error('配置里没有 sites');
        addCfg(j, j.name || '粘贴配置', '');
      } catch (e) { toast('导入失败：' + e.message); }
    };
    $('#cfg-filebtn').onclick = function () { $('#cfg-file').click(); };
    $('#cfg-file').onchange = function (e) {
      var f = e.target.files[0];
      if (!f) return;
      toast('读取文件：' + f.name);
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var j = JSON.parse(reader.result);
          if (!j || !j.sites || !j.sites.length) throw new Error('配置里没有 sites');
          addCfg(j, (f.name || '本地配置').replace(/\.json$|\.txt$/i, ''), '');
        } catch (err) {
          toast('导入失败：' + err.message);
        }
        e.target.value = '';
      };
      reader.onerror = function () { toast('文件读取失败'); };
      reader.readAsText(f, 'utf-8');
    };
    $('#st-kernel').onclick = function () {
      if (window.showKernelSheet) window.showKernelSheet();
      else toast('播放器模块未就绪');
    };
    $('#st-playerhelp').onclick = function () {
      showModal('关于播放器',
        '<h4>内置播放器（AVPlayer）</h4>' +
        '<div class="card"><b>默认内核</b>优点：起播快，省电，支持 HLS(m3u8)/MP4 直链，可后台播放。<br>' +
        '缺点：支持格式有限（mkv/avi 等容器不支持）。</div>' +
        '<h4>VLC 播放器（外部接力）</h4>' +
        '<div class="card"><b>全格式</b>优点：支持几乎所有格式与协议。<br>' +
        '缺点：需安装 VLC for iOS，首次起播稍慢。内核菜单选择后自动把当前视频推送给 VLC。</div>' +
        '<h4>nPlayer / Infuse（外部接力）</h4>' +
        '<div class="card"><b>硬解与画质</b>nPlayer 全格式硬解；Infuse 画质与媒体库强。同样需要安装对应 App。</div>' +
        '<h4>网页播放</h4>' +
        '<div class="card"><b>兼容兜底</b>壳内打开站点自带的网页播放器，特殊源/网盘分享页可用。</div>' +
        '<h4>关于阿里播放器</h4>' +
        '<div class="card"><b>原生SDK计划中</b>阿里云播放器为闭源原生SDK，网页壳无法内嵌。已提供 VLC/nPlayer/Infuse 接力作为全格式替代，后续原生版本计划内嵌。</div>' +
        '<h4>关于网盘 Token</h4>' +
        '<div class="card"><b>复制链接方式</b>网盘 4K 资源需登录态转存才能取直链。当前版本播放网盘资源时自动复制分享链接，请到网盘 App 打开；扫码设置 Cookie 的转存播放后续版本支持。</div>');
    };
    $('#st-clearhist').onclick = function () { Store.set('history', []); toast('已清空播放历史'); };
    $('#st-clearfav').onclick = function () { Store.set('favs', []); toast('已清空收藏'); };
    $('#st-clearcache').onclick = function () { A.detailCache = {}; toast('已清详情缓存'); };
  }
  function renderCfgList() {
    var el = $('#cfg-list');
    if (!el) return;
    el.innerHTML = A.cfgs.map(function (c) {
      var host = '';
      try { host = c.url ? c.url.replace(/^https?:\/\//, '').split('/')[0] : '内置'; } catch (e) {}
      return '<div class="cfg-item"><div class="cfg-main">' +
        '<div class="cfg-name">' + esc(c.name) +
        (c.id === A.cfgId ? '<span class="cfg-badge">当前</span>' : '') + '</div>' +
        '<div class="cfg-url">' + esc(host) + ' · ' + (c.json.sites || []).length + '个站点</div></div>' +
        '<div class="cfg-act">' +
        (c.id !== A.cfgId ? '<button class="mini-btn" data-usecfg="' + esc(c.id) + '">启用</button>' : '') +
        (c.id !== 'builtin' ? '<button class="mini-btn danger" data-delcfg="' + esc(c.id) + '">删</button>' : '') +
        '</div></div>';
    }).join('');
  }
  function addCfg(json, name, url) {
    var c = { id: 'c' + Date.now(), name: name, url: url || '', json: json };
    A.cfgs.push(c);
    Store.set('configs', A.cfgs);
    setActiveCfg(c.id);
    toast('接口已添加并启用');
  }
  function setActiveCfg(id) {
    A.cfgId = id;
    Store.set('activeCfg', id);
    var last = Store.get('lastSite', null);
    var lastSite = last ? findSite(last) : null;
    var lastOk = lastSite && (CMS.isDemo(lastSite) || +lastSite.type === 0 || +lastSite.type === 1 ||
      (window.SPR_ADAPTERS && SPR_ADAPTERS.isAdapted(lastSite)));
    var first = lastOk ? last : firstUsableSiteKey();
    if (A.view === 'settings') renderCfgList();
    if (first) switchSite(first);
    if (A.view !== 'home') { A.stack = ['home']; goto('home'); }
  }

  /* ============ 站点抽屉 ============ */
  function openDrawer() {
    var el = $('#drawer-list');
    var arr = sites().slice();
    arr.sort(function (a, b) {
      var ua = (+a.type === 3 && !(window.SPR_ADAPTERS && SPR_ADAPTERS.isAdapted(a))) ? 1 : 0;
      var ub = (+b.type === 3 && !(window.SPR_ADAPTERS && SPR_ADAPTERS.isAdapted(b))) ? 1 : 0;
      return ua - ub;
    });
    el.innerHTML = arr.map(function (s) {
      var dead = (+s.type === 3 && !(window.SPR_ADAPTERS && SPR_ADAPTERS.isAdapted(s)));
      return '<button class="site-row' + (A.site && s.key === A.site.key ? ' on' : '') + '" data-site="' + esc(s.key) + '"' +
        (dead ? ' style="opacity:.45"' : '') + '>' +
        '<span class="site-name">' + esc(s.name) + '</span>' +
        '<span class="site-type">' + siteTypeLabel(s) + '</span></button>';
    }).join('');
    $('#drawer').classList.add('show');
    $('#drawer-mask').classList.add('show');
  }
  function closeDrawer() {
    $('#drawer').classList.remove('show');
    $('#drawer-mask').classList.remove('show');
  }

  /* ============ 直播 ============ */
  function liveList() { return (cfg().json.lives || []); }

  function parseLivePlaylist(txt) {
    var lines = txt.split(/\r?\n/);
    var groups = [];
    var gi = -1;
    function curG() { return groups[gi]; }
    function addG(name) { groups.push({ name: name, channels: [] }); gi = groups.length - 1; }
    if (/^\s*#EXTM3U/.test(txt)) {
      var pending = null;
      lines.forEach(function (line) {
        line = line.trim();
        if (!line) return;
        if (line.indexOf('#EXTINF') === 0) {
          var g = (line.match(/group-title="([^"]*)"/) || [])[1] || '直播';
          var nm = line.slice(line.lastIndexOf(',') + 1).trim();
          pending = { name: nm || '频道', group: g };
        } else if (line.indexOf('#') !== 0) {
          if (pending) {
            var t = groups.filter(function (x) { return x.name === pending.group; })[0];
            if (!t) { addG(pending.group); t = curG(); }
            t.channels.push({ name: pending.name, url: line });
            pending = null;
          }
        }
      });
    } else {
      lines.forEach(function (line) {
        line = line.trim();
        if (!line || line.indexOf('#') === 0) return;
        var k = line.indexOf(',');
        if (k < 0) return;
        var name = line.slice(0, k).trim();
        var url = line.slice(k + 1).trim();
        if (url.indexOf('#genre#') >= 0) { addG(name); return; }
        if (!url) return;
        if (gi < 0) addG('直播');
        curG().channels.push({ name: name, url: url });
      });
    }
    return groups.filter(function (g) { return g.channels.length; });
  }

  function openLive() {
    goto('live'); push('live');
    var lives = liveList();
    var box = $('#view-live');
    if (!lives.length) {
      box.innerHTML =
        '<div class="page-top"><button id="lv-back" class="icon-btn">‹</button><div class="page-top-title">直播</div></div>' +
        '<div class="empty">当前接口没有配置直播源<br><span style="font-size:12px">配置格式：lives:[{"name":"直播","type":0,"url":"https://…/live.txt"}]</span></div>';
      $('#lv-back').onclick = goBack;
      return;
    }
    loadLiveSrc(0, lives, true);
  }
  function liveSrcChips(lives, cur) {
    if (lives.length < 2) return '';
    return '<div class="cat-tabs" id="lv-srcs">' + lives.map(function (lv, i) {
      return '<button class="cat' + (i === cur ? ' on' : '') + '" data-lv="' + i + '">' +
        esc(lv.name || ('源' + (i + 1))) + '</button>';
    }).join('') + '</div>';
  }
  function loadLiveSrc(idx, lives, autoNext) {
    var lv = lives[idx];
    var box = $('#view-live');
    box.innerHTML =
      '<div class="page-top"><button id="lv-back" class="icon-btn">‹</button>' +
      '<div class="page-top-title">直播 · ' + esc(lv.name || ('源' + (idx + 1))) + '</div>' +
      '<div class="page-top-title" style="flex:none;font-size:12px;color:var(--tx2)" id="lv-status">加载中…</div></div>' +
      liveSrcChips(lives, idx) +
      '<div id="lv-groups" class="cat-tabs"></div><div id="lv-chans" class="lv-list"><div class="empty"><span class="spinner"></span></div></div>';
    bindLiveChrome(lives, idx, autoNext);
    HTTP.get(lv.url).then(function (txt) {
      var groups = parseLivePlaylist(txt);
      if (!groups.length) throw new Error('解析到0个频道');
      var cur = 0;
      function renderGroups() {
        $('#lv-groups').innerHTML = groups.map(function (g, i) {
          return '<button class="cat' + (i === cur ? ' on' : '') + '" data-g="' + i + '">' + esc(g.name) + '</button>';
        }).join('');
        renderChans();
      }
      function renderChans() {
        $('#lv-chans').innerHTML = groups[cur].channels.map(function (c, i) {
          return '<button class="lv-chan" data-c="' + i + '">' + esc(c.name) + '</button>';
        }).join('');
      }
      renderGroups();
      $('#lv-status').textContent = groups.length + '组';
      $('#lv-groups').onclick = function (ev) {
        var b = ev.target.closest('.cat');
        if (!b) return;
        cur = +b.dataset.g;
        renderGroups();
      };
      $('#lv-chans').onclick = function (ev) {
        var b = ev.target.closest('.lv-chan');
        if (!b) return;
        playLive(groups[cur], +b.dataset.c);
      };
    }).catch(function (e) {
      if (autoNext && idx + 1 < lives.length) {
        toast('「' + (lv.name || '源' + (idx + 1)) + '」不可达，自动切换下一个…');
        loadLiveSrc(idx + 1, lives, true);
        return;
      }
      var chans = $('#lv-chans');
      if (chans) chans.innerHTML = '<div class="empty">直播源加载失败：' + esc(e.message) + '<br><span style="font-size:12px">可点上方源名切换其他直播源</span></div>';
      var st = $('#lv-status');
      if (st) st.textContent = '失败';
    });
  }
  function bindLiveChrome(lives, idx, autoNext) {
    var back = $('#lv-back');
    if (back) back.onclick = goBack;
    var srcs = document.getElementById('lv-srcs');
    if (srcs) {
      srcs.onclick = function (ev) {
        var b = ev.target.closest('.cat');
        if (!b) return;
        var i = +b.getAttribute('data-lv');
        if (i !== idx) loadLiveSrc(i, lives, false);
      };
    }
  }
  function playLive(group, i) {
    var ch = group.channels[i];
    if (!ch) return;
    goto('player'); push('player');
    Player.open({
      title: ch.name, epName: group.name, url: ch.url, isLive: true,
      episodes: group.channels, epIndex: i, resume: 0,
      onProgress: function () {},
      onSwitch: function (ni, o) { Player.update(o); },
      onExit: function () { Player.close(true); goBack(); }
    });
  }

  /* ============ 热门推荐 Banner（自动轮播） ============ */
  var carouselT = null;
  function renderBanner() {
    var el = $('#banner');
    if (!el) return;
    var isClean = A.site && CMS.isDemo(A.site) && !A.cat && !A.filters.sub &&
      (A.filters.area === '全部' || A.filters.area === '') &&
      (A.filters.year === '全部' || A.filters.year === '');
    if (!isClean) { el.innerHTML = ''; stopCarousel(); return; }
    var top = DemoSource.list({ by: 'hits', pg: 1 }).list.slice(0, 6);
    if (!top.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="carousel" id="carousel">' +
      '<div class="carousel-track" id="car-track">' +
      top.map(function (v) {
        return '<button class="carousel-slide js-card" data-site="' + esc(A.site.key) + '" data-id="' + esc(v.vod_id) + '">' +
          '<img src="' + esc(v.vod_pic) + '">' +
          '<div class="carousel-cap"><div class="carousel-name">' + esc(v.vod_name) + '</div>' +
          '<div class="carousel-sub">' + esc(v.vod_remarks) + ' · ★' + esc(v.vod_score) + ' · ' + esc(v.type_name) + '</div></div></button>';
      }).join('') + '</div>' +
      '<div class="carousel-dots" id="car-dots">' +
      top.map(function (_, i) { return '<i' + (i === 0 ? ' class="on"' : '') + '></i>'; }).join('') +
      '</div></div>' +
      '<div class="sec-title" style="padding:6px 14px 2px">🔥 热门推荐</div>';
    startCarousel(top.length);
  }
  function startCarousel(n) {
    stopCarousel();
    if (n < 2) return;
    var idx = 0;
    carouselT = setInterval(function () {
      var track = document.getElementById('car-track');
      if (!track) { stopCarousel(); return; }
      idx = (idx + 1) % n;
      track.style.transform = 'translateX(-' + (idx * 100) + '%)';
      var dots = document.querySelectorAll('#car-dots i');
      dots.forEach(function (d, i) { d.classList.toggle('on', i === idx); });
    }, 3500);
  }
  function stopCarousel() {
    if (carouselT) { clearInterval(carouselT); carouselT = null; }
  }

  /* ============ 事件绑定 + 启动 ============ */
  function bindEvents() {
    $('#btn-sites').onclick = openDrawer;
    $('#drawer-mask').onclick = closeDrawer;
    $('#btn-fav').onclick = function () { goto('fav'); push('fav'); };
    $('#btn-live').onclick = openLive;
    $('#btn-settings').onclick = function () { goto('settings'); push('settings'); };
    $$('#tabbar button').forEach(function (b) {
      b.onclick = function () {
        var t = b.getAttribute('data-tab');
        if (t === 'live') { openLive(); return; }
        goto(t);
        if (A.stack[A.stack.length - 1] !== t) { A.stack = [t]; A.pushed = false; }
      };
    });
    $('#search-form').onsubmit = function (e) {
      e.preventDefault();
      doSearch($('#search-input').value);
      $('#search-input').blur();
    };
    $('#cat-tabs').onclick = function (ev) {
      var b = ev.target.closest('.cat');
      if (!b) return;
      A.cat = b.dataset.cat;
      renderCatTabs();
      loadHome(true);
    };
    $('#filter-bar').onclick = function (ev) {
      var p = ev.target.closest('[data-pop]');
      if (p) {
        var k = p.getAttribute('data-pop');
        A.popAttr = (A.popAttr === k) ? null : k;
        renderFilterBar();
        return;
      }
      var o = ev.target.closest('.fopt');
      if (!o) return;
      var attr = o.getAttribute('data-attr');
      A.filters[attr] = o.getAttribute('data-val');
      A.popAttr = null;
      renderFilterBar();
      loadHome(true);
    };
    document.addEventListener('click', function (ev) {
      var jm = ev.target.closest('[data-jumpsite]');
      if (jm) { switchSite(jm.getAttribute('data-jumpsite')); return; }
      var c = ev.target.closest('.js-card');
      if (c) { openDetail(c.dataset.site, c.dataset.id); return; }
      var e2 = ev.target.closest('.js-ep');
      if (e2) { playEp(+e2.dataset.i, 0); return; }
    });
    $('#drawer-list').onclick = function (ev) {
      var b = ev.target.closest('.site-row');
      if (!b) return;
      closeDrawer();
      switchSite(b.dataset.site);
    };
    $('#view-fav').addEventListener('click', function (ev) {
      var t = ev.target.closest('.seg button');
      if (t) { A.favTab = t.dataset.tab; renderFav(); return; }
      var d = ev.target.closest('[data-delhist]');
      if (d) {
        var h = Store.get('history', []);
        h.splice(+d.dataset.delhist, 1);
        Store.set('history', h);
        renderFav();
        return;
      }
      if (ev.target.closest('#f-clear')) { Store.set('history', []); renderFav(); }
    });
    $('#view-settings').addEventListener('click', function (ev) {
      var u = ev.target.closest('[data-usecfg]');
      if (u) { setActiveCfg(u.dataset.usecfg); return; }
      var d = ev.target.closest('[data-delcfg]');
      if (d) {
        if (!window.confirm('删除该接口？')) return;
        A.cfgs = A.cfgs.filter(function (c) { return c.id !== d.dataset.delcfg; });
        Store.set('configs', A.cfgs);
        if (A.cfgId === d.dataset.delcfg) setActiveCfg('builtin');
        else renderCfgList();
      }
    });
  }

  function syncBars() {
    var tb = document.getElementById('topbar');
    var bb = document.getElementById('tabbar');
    var hTop = (tb && tb.style.display !== 'none') ? tb.offsetHeight + 8 : 14;
    var hTab = (bb && bb.style.display !== 'none' && document.body.classList.contains('has-tabbar')) ? bb.offsetHeight + 8 : 0;
    document.documentElement.style.setProperty('--topbar-h', hTop + 'px');
    document.documentElement.style.setProperty('--tabbar-h', hTab + 'px');
  }

  function init() {
    // fixed 浮层移出滚动容器 #app（iOS WebKit 下 fixed 在 overflow 容器内会异常）
    ['#topbar', '#tabbar', '#drawer-mask', '#drawer', '#toast'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el && el.parentElement !== document.body) document.body.appendChild(el);
    });
    /* 壳内环境：剥掉 WKWebView 双重安全区叠加（原生底部已让位，页面不再重复 env 抬升） */
    if (window.__PANGHU_NATIVE__ || (window.webkit && window.webkit.messageHandlers)) {
      document.body.classList.add('native');
    }
    syncBars();
    window.addEventListener('resize', syncBars);
    var biIdx = -1;
    for (var i = 0; i < A.cfgs.length; i++) if (A.cfgs[i].id === 'builtin') biIdx = i;
    if (biIdx < 0) A.cfgs.unshift(BUILTIN);
    else if (A.cfgs[biIdx].ver !== BUILTIN.ver) A.cfgs[biIdx] = BUILTIN; // 内置配置升级
    Store.set('configs', A.cfgs);
    bindEvents();
    initObserver();
    var last = Store.get('lastSite', null);
    var lastSite = last ? findSite(last) : null;
    var lastOk = lastSite && (CMS.isDemo(lastSite) || +lastSite.type === 0 || +lastSite.type === 1 ||
      (window.SPR_ADAPTERS && SPR_ADAPTERS.isAdapted(lastSite)));
    var key = lastOk ? last : firstUsableSiteKey();
    if (key) switchSite(key);
    else toast('请先到设置添加接口');
    goto('home');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
