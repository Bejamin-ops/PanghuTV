/* Panghu影视 · HTTP(原生桥/fetch) + 苹果CMS V10 JSON 客户端 + 演示源路由 */
(function () {
  'use strict';

  function nativeGet(url, headers) {
    return new Promise(function (resolve, reject) {
      try {
        var raw = window.GullNative.get(url, JSON.stringify(headers || {}));
        var r = JSON.parse(raw);
        if (r && r.ok) resolve(r.body);
        else reject(new Error((r && r.error) || 'native http error'));
      } catch (e) { reject(e); }
    });
  }

  function httpGet(url, timeout, headers) {
    timeout = timeout || 15000;
    return attempt(url, timeout, headers).catch(function (e) {
      return attempt(url, timeout, headers); // 网络抖动自动重试一次
    });
  }
  function attempt(url, timeout, headers) {
    if (window.__PANGHU_NATIVE__ && window.webkit && window.webkit.messageHandlers &&
        window.webkit.messageHandlers.panghuHttp) return bridgeGet(url, timeout + 5000, headers);
    if (window.GullNative && window.GullNative.get) return nativeGet(url, headers);
    return new Promise(function (resolve, reject) {
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctrl) ctrl.abort();
        reject(new Error('请求超时'));
      }, timeout);
      var opts = { mode: 'cors', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined };
      if (headers) opts.headers = headers;
      fetch(url, opts)
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (t) { clearTimeout(timer); resolve(t); })
        .catch(function (e) {
          clearTimeout(timer);
          reject(new Error(e && e.name === 'AbortError' ? '请求超时' :
            ((e && e.message) || 'fetch失败') + '（网页预览受跨域限制，接口请在Android壳内使用）'));
        });
    });
  }

  function bridgeGet(url, timeout, headers) {
    return new Promise(function (resolve, reject) {
      var id = 'r' + Date.now() + Math.random().toString(36).slice(2);
      var to = setTimeout(function () {
        delete window.__panghuHttpCbs[id];
        reject(new Error('请求超时'));
      }, timeout || 20000);
      window.__panghuHttpCbs[id] = function (r) {
        clearTimeout(to);
        delete window.__panghuHttpCbs[id];
        if (r && r.ok) resolve(r.body || '');
        else reject(new Error((r && r.error) || ('HTTP ' + (r && r.code))));
      };
      window.webkit.messageHandlers.panghuHttp.postMessage({ id: id, url: url, headers: headers || {} });
    });
  }

  function api(apiBase, params) {
    var qs = Object.keys(params)
      .filter(function (k) { return params[k] !== '' && params[k] != null; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
    return apiBase + (apiBase.indexOf('?') >= 0 ? '&' : '?') + qs;
  }

  function isDemo(site) { return !!(site && site.type === 3 && /^csp_Demo/.test(site.api || '')); }

  function normItem(v, siteKey) {
    return {
      site: siteKey,
      id: String(v.vod_id),
      name: v.vod_name || '',
      pic: v.vod_pic || '',
      remark: v.vod_remarks || '',
      cls: v.vod_class || '',
      type_name: v.type_name || '',
      year: String(v.vod_year || ''),
      area: v.vod_area || '',
      score: v.vod_score || '',
      actor: v.vod_actor || '',
      director: v.vod_director || ''
    };
  }

  function parsePlay(vod) {
    var froms = String(vod.vod_play_from || '').split('$$$');
    var groups = String(vod.vod_play_url || '').split('$$$');
    var out = [];
    froms.forEach(function (f, i) {
      var eps = (groups[i] || '').split('#').map(function (e) {
        e = e.trim(); if (!e) return null;
        var k = e.indexOf('$');
        return k < 0 ? { name: '正片', url: e } : { name: e.slice(0, k), url: e.slice(k + 1) };
      }).filter(function (x) { return x && x.url; });
      if (eps.length) out.push({ name: (f || '').trim() || ('线路' + (out.length + 1)), eps: eps });
    });
    return out;
  }

  function jparse(txt) {
    try { return JSON.parse(txt); }
    catch (e) { throw new Error('接口返回非JSON（可能是XML源或被拦截）'); }
  }

  function normSpiderItem(it, siteKey) {
    return {
      site: siteKey, id: String(it.id), name: it.name || '', pic: it.pic || '',
      remark: it.remark || '', cls: '', type_name: '', year: '', area: '',
      score: '', actor: '', director: ''
    };
  }
  function adapterFor(site) {
    if (window.SPR_ADAPTERS) {
      var r = SPR_ADAPTERS.resolve(site);
      if (r) return r;
    }
    return null;
  }

  window.HTTP = { get: httpGet };

  window.CMS = {
    isDemo: isDemo,
    classList: function (site) {
      if (isDemo(site)) return Promise.resolve(DemoSource.class());
      var ad = adapterFor(site);
      if (ad) {
        return SPR.baseUrl(ad.ad).then(function (base) {
          return ad.ad.classList(base);
        });
      }
      if (site.type !== 0) {
        return Promise.reject(new Error('此源(csp)需Spider运行时，本壳暂未适配「' + (site.name || site.key) + '」'));
      }
      return httpGet(api(site.api, { ac: 'class' })).then(jparse).then(function (j) {
        return (j.class || []).map(function (c) {
          return { type_id: String(c.type_id), type_name: c.type_name };
        });
      });
    },
    list: function (site, q) {
      q = q || {};
      if (isDemo(site)) {
        var r = DemoSource.list(q);
        r.list = (r.list || []).map(function (v) { return normItem(v, site.key); });
        return Promise.resolve(r);
      }
      var ad = adapterFor(site);
      if (ad) {
        return SPR.baseUrl(ad.ad).then(function (base) {
          if (q.wd) return ad.ad.search ? ad.ad.search(base, q.wd) : [];
          return ad.ad.list(base, q);
        }).then(function (r) {
          if (Array.isArray(r)) {
            return { page: 1, pagecount: 1, total: r.length, list: r.map(function (it) { return normSpiderItem(it, site.key); }) };
          }
          r.list = (r.list || []).map(function (it) { return normSpiderItem(it, site.key); });
          return r;
        });
      }
      if (site.type !== 0) {
        return Promise.reject(new Error('此源(csp)需Spider运行时，本壳暂未适配「' + (site.name || site.key) + '」'));
      }
      var p = { ac: 'videolist', pg: q.pg || 1 };
      if (q.wd) { p.wd = q.wd; }
      else {
        if (q.tid) p.tid = q.tid;
        if (q.sub) p['class'] = q.sub;
        if (q.area) p.area = q.area;
        if (q.year) p.year = q.year;
        if (q.by) p.by = q.by;
      }
      return httpGet(api(site.api, p)).then(jparse).then(function (j) {
        return {
          page: +j.page || 1,
          pagecount: +j.pagecount || 1,
          total: +j.total || 0,
          list: (j.list || []).map(function (v) { return normItem(v, site.key); })
        };
      });
    },
    detail: function (site, id) {
      function mix(base, v) {
        base.content = String(v.vod_content || v.vod_blurb || '').replace(/<[^>]*>/g, '').trim();
        base.play = parsePlay(v);
        return base;
      }
      if (isDemo(site)) {
        var v = DemoSource.detail(id);
        return v ? Promise.resolve(mix(normItem(v, site.key), v)) : Promise.reject(new Error('条目不存在'));
      }
      var ad = adapterFor(site);
      if (ad) {
        return SPR.baseUrl(ad.ad).then(function (base) {
          return ad.ad.detail(base, id);
        }).then(function (d) {
          d.site = site.key;
          d.content = (d.content || '').replace(/<[^>]*>/g, '').trim();
          return d;
        });
      }
      if (site.type !== 0) return Promise.reject(new Error('type=' + site.type + ' 源在网页壳不支持'));
      return httpGet(api(site.api, { ac: 'videolist', ids: id })).then(jparse).then(function (j) {
        var v = (j.list || [])[0];
        if (!v) throw new Error('详情为空');
        return mix(normItem(v, site.key), v);
      });
    }
  };
})();
