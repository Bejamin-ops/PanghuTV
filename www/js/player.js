/* Panghu影视 · 播放器（hls.js 动态加载 + WebKit原生HLS兜底 + 手势/进度/选集） */
(function () {
  'use strict';
  var HLS_CDNS = [
    'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js',
    'https://unpkg.com/hls.js@1.5.13/dist/hls.min.js'
  ];
  var hlsLoading = null;
  function ensureHls() {
    if (window.Hls && window.Hls.isSupported && window.Hls.isSupported()) return Promise.resolve(window.Hls);
    if (hlsLoading) return hlsLoading;
    hlsLoading = HLS_CDNS.reduce(function (p, url) {
      return p.catch(function () {
        return new Promise(function (res, rej) {
          var s = document.createElement('script');
          s.src = url;
          s.onload = function () { window.Hls ? res(window.Hls) : rej(new Error('no Hls')); };
          s.onerror = function () { rej(new Error('CDN失败')); };
          document.head.appendChild(s);
        });
      });
    }, Promise.reject(new Error('start')));
    return hlsLoading;
  }

  var SPEEDS = [1, 1.25, 1.5, 2, 0.75];
  var S = null; // 当前播放会话

  function fmt(t) {
    t = Math.max(0, Math.floor(t || 0));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }

  window.Player = {
    isOpen: function () { return !!S; },
    curIndex: function () { return S ? (S.opts.epIndex || 0) : 0; },

    open: function (opts) {
      this.close(true);
      var view = $('view-player');
      view.innerHTML =
        '<video id="pv-video" playsinline webkit-playsinline preload="metadata" x5-playsinline></video>' +
        '<div id="pv-ui">' +
          '<div class="pv-top">' +
            '<button id="pv-back" class="pv-btn pv-back">▾</button>' +
            '<div id="pv-title" class="pv-title"></div>' +
            '<span id="pv-clock" class="pv-clock"></span>' +
            '<button id="pv-kernel" class="pv-btn">内核</button>' +
            '<button id="pv-more" class="pv-btn ico" style="font-size:15px;letter-spacing:1px">⋯</button>' +
          '</div>' +
          '<div class="pv-center">' +
            '<div id="pv-spin" class="pv-spin hidden"></div>' +
            '<button id="pv-bigplay" class="pv-bigplay hidden">▶</button>' +
            '<div id="pv-err" class="pv-err hidden"></div>' +
          '</div>' +
          '<div class="pv-bottom">' +
            '<div class="pv-bar" id="pv-bar"><div class="pv-track">' +
              '<div class="pv-buf" id="pv-buf"></div>' +
              '<div class="pv-fill" id="pv-fill"><i class="pv-knob"></i></div>' +
            '</div></div>' +
            '<div class="pv-row">' +
              '<span id="pv-cur" class="pv-time">00:00</span>' +
              '<span class="pv-flex"></span>' +
              '<button id="pv-prev" class="pv-btn ico" title="上一集">' +
                '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg></button>' +
              '<button id="pv-play" class="pv-btn play">⏸</button>' +
              '<button id="pv-next" class="pv-btn ico" title="下一集">' +
                '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l11 7L4 19z"/></svg></button>' +
              '<span class="pv-flex"></span>' +
              '<button id="pv-speed" class="pv-btn">1.0x</button>' +
              '<button id="pv-eps" class="pv-btn">选集</button>' +
              '<button id="pv-fs" class="pv-btn ico" title="全屏">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>' +
              '<span id="pv-dur" class="pv-time">00:00</span>' +
            '</div>' +
          '</div>' +
          '<div id="pv-ibox" class="pv-ibox">' +
            '<div class="pv-ibox-tabs" id="pv-ibox-tabs">' +
              '<button data-t="eps" class="on">选集</button>' +
              '<button data-t="src">线路</button>' +
              '<button data-t="set">设置</button>' +
              '<button id="pv-ibox-close">✕</button>' +
            '</div>' +
            '<div class="pv-ibox-body" id="pv-ibox-body">' +
              '<div class="pv-ibox-pane" data-p="eps"><div class="pv-eps" id="pv-eps-list"></div></div>' +
              '<div class="pv-ibox-pane hidden" data-p="src"><div id="pv-ibox-srcs"></div></div>' +
              '<div class="pv-ibox-pane hidden" data-p="set"><div id="pv-ibox-set"></div></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="pv-sheet" class="pv-sheet-mask"></div>';

      S = { opts: opts, video: $('pv-video'), hls: null, speedIdx: 0,
        lastSave: 0, hideT: null, clockT: null, seekTouch: false };
      view.classList.toggle('pv-live', !!opts.isLive);
      bind();
      renderEps();
      this.update(opts, true);
      startClock();
      var k = kernelPref();
      if ((k === 'vlc' || k === 'nplayer' || k === 'infuse' || k === 'web') && S.opts.url) {
        setTimeout(function () {
          if (S) { if (k === 'web') openWebPlay(S.opts.url); else jumpKernel(k, S.opts.url); }
        }, 350);
      }
    },

    /* 换集（不重建DOM） */
    update: function (opts, first) {
      if (!S) return;
      S.opts = mergeOpts(S.opts, opts);
      $('pv-title').textContent = S.opts.title + (S.opts.epName ? ' · ' + S.opts.epName : '');
      renderEps();
      renderSrcs();
      hideErr();
      attach(S.opts.url, S.opts.resume || 0);
      if (first && effKernel() === 'builtin') S.video.play().catch(function () {});
    },

    close: function (silent) {
      if (!S) return;
      try {
        if (!silent && S.opts.onProgress && S.video.currentTime > 0) {
          S.opts.onProgress(S.video.currentTime, S.video.duration || 0, S.opts.epIndex, S.opts.epName);
        }
      } catch (e) {}
      stopClock();
      clearTimeout(S.watchT);
      if (S.hls) { try { S.hls.destroy(); } catch (e) {} }
      try { S.video.pause(); S.video.removeAttribute('src'); S.video.load(); } catch (e) {}
      $('view-player').innerHTML = '';
      S = null;
    }
  };

  function mergeOpts(oldO, newO) {
    var o = {};
    for (var k in oldO) o[k] = oldO[k];
    for (var k2 in newO) o[k2] = newO[k2];
    return o;
  }

  function renderEps() {
    var box = $('pv-eps-list'); if (!box || !S) return;
    var eps = S.opts.episodes || [];
    box.innerHTML = eps.map(function (e, i) {
      return '<button class="ep' + (i === S.opts.epIndex ? ' on' : '') + '" data-i="' + i + '">' +
        esc(e.name || ('第' + (i + 1) + '集')) + '</button>';
    }).join('');
  }

  /* ===== iBox 风格面板：选集 / 线路 / 设置 ===== */
  function renderSrcs() {
    var box = $('pv-ibox-srcs'); if (!box || !S) return;
    var list = S.opts.sources || [];
    if (!list.length) { box.innerHTML = '<div class="pv-ibox-empty">当前只有单一线路</div>'; return; }
    var cur = S.opts.srcIndex || 0;
    box.innerHTML = list.map(function (s, i) {
      return '<button class="pv-ibox-src' + (i === cur ? ' on' : '') + '" data-i="' + i + '">' +
        '<span class="pv-ibox-src-name">' + esc(s.name) + '</span>' +
        '<span class="pv-ibox-src-n">' + s.count + '集</span>' +
        (i === cur ? '<span class="pv-ibox-src-ok">✓</span>' : '') +
        '</button>';
    }).join('');
  }

  function renderSet() {
    var box = $('pv-ibox-set'); if (!box || !S) return;
    var st = settings();
    var sk = skipGet();
    var speeds = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
    var curRate = S.video.playbackRate;
    var kern = KERNEL_META[effKernel()] ? KERNEL_META[effKernel()].name : '内置';
    box.innerHTML =
      '<div class="pv-ibox-sect">倍速</div>' +
      '<div class="pv-ibox-speeds">' + speeds.map(function (s) {
        return '<button data-rate="' + s + '"' + (Math.abs(s - curRate) < .01 ? ' class="on"' : '') + '>' + s + 'x</button>';
      }).join('') + '</div>' +
      '<div class="pv-ibox-sect">播放</div>' +
      '<button class="pv-ibox-row" data-act="kernel"><span>播放内核</span><span class="pv-ibox-val">' + esc(kern) + ' ›</span></button>' +
      '<div class="pv-ibox-row"><span>单集循环</span><span class="pv-switch' + (st.loop ? ' on' : '') + '" data-sw="loop"><i></i></span></div>' +
      '<div class="pv-ibox-row"><span>长按3x快进</span><span class="pv-switch' + (st.longpress ? ' on' : '') + '" data-sw="longpress"><i></i></span></div>' +
      '<button class="pv-ibox-row" data-act="sleep"><span>定时暂停</span><span class="pv-ibox-val">' + (S.sleepMin ? S.sleepMin + '分钟后' : '关') + '</span></button>' +
      '<button class="pv-ibox-row" data-act="skip"><span>片头片尾跳过</span><span class="pv-ibox-val">' +
        ((sk.intro || sk.out) ? (sk.intro ? '片头' + sk.intro + 's ' : '') + (sk.out ? '片尾' + sk.out + 's' : '') : '未设置') + ' ›</span></button>' +
      '<div class="pv-ibox-sect">其他</div>' +
      '<button class="pv-ibox-row" data-act="web"><span>网页打开当前视频</span><span class="pv-ibox-val">›</span></button>' +
      '<button class="pv-ibox-row" data-act="copy"><span>复制播放链接</span><span class="pv-ibox-val">›</span></button>';
  }

  function openIbox(tab) {
    var box = $('pv-ibox'); if (!box || !S) return;
    if (tab === 'src') renderSrcs();
    if (tab === 'set') renderSet();
    renderEps();
    box.querySelectorAll('#pv-ibox-tabs button[data-t]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.t === tab);
    });
    box.querySelectorAll('.pv-ibox-pane').forEach(function (p) {
      p.classList.toggle('hidden', p.dataset.p !== tab);
    });
    box.classList.add('show');
    if (tab === 'eps') {
      var on = box.querySelector('.pv-eps .ep.on');
      if (on) { try { on.scrollIntoView({ block: 'center' }); } catch (e) {} }
    }
  }

  function closeIbox() {
    var box = $('pv-ibox');
    if (box) box.classList.remove('show');
  }

  function onIboxTap(ev) {
    if (!S) return;
    var src = ev.target.closest('.pv-ibox-src');
    if (src) {
      closeIbox();
      var i = +src.dataset.i;
      if (S.opts.onSwitchSrc && i !== (S.opts.srcIndex || 0)) S.opts.onSwitchSrc(i);
      return;
    }
    var rate = ev.target.closest('[data-rate]');
    if (rate) {
      var sp = +rate.dataset.rate;
      S.video.playbackRate = sp;
      var pb = $('pv-speed'); if (pb) pb.textContent = (sp % 1 === 0 ? sp.toFixed(1) : sp) + 'x';
      renderSet();
      return;
    }
    var sw = ev.target.closest('[data-sw]');
    if (sw) {
      var key = sw.getAttribute('data-sw');
      var st = settings();
      st[key] = !st[key];
      saveSettings(st);
      sw.classList.toggle('on', st[key]);
      if (key === 'loop') S.video.loop = st.loop;
      return;
    }
    var act = ev.target.closest('[data-act]');
    if (!act) return;
    var a = act.getAttribute('data-act');
    if (a === 'kernel') { showKernelSheet(); return; }
    if (a === 'sleep') {
      var seq = [0, 15, 30, 60];
      var st2 = settings();
      var next = seq[(seq.indexOf(st2.sleep || 0) + 1) % seq.length];
      st2.sleep = next; saveSettings(st2);
      setupSleep(next);
      toast(next ? '将在' + next + '分钟后暂停' : '定时暂停已关闭');
      renderSet();
      return;
    }
    if (a === 'skip') { showSkipPanel(); return; }
    if (a === 'web') { openWebPlay(curUrl()); return; }
    if (a === 'copy') { copyLink(); return; }
  }

  function showSpin(v) { var e = $('pv-spin'); if (e) e.classList.toggle('hidden', !v); }
  function showBig(v) { var e = $('pv-bigplay'); if (e) e.classList.toggle('hidden', !v); }
  function showErr(msg) {
    var e = $('pv-err'); if (!e) return;
    if (S) S.errShown = true;
    clearTimeout(S && S.watchT);
    e.innerHTML = String(msg).replace(/</g, '&lt;') +
      '<br><span class="pv-err-btns">' +
      '<button id="pv-retry">重试</button>' +
      '<button id="pv-errweb">网页播放</button>' +
      '<button id="pv-errcopy">复制链接</button></span>';
    e.classList.remove('hidden');
    $('pv-retry').onclick = function () { hideErr(); attach(curUrl(), 0); };
    var wb = $('pv-errweb'); if (wb) wb.onclick = function () { openWebPlay(curUrl()); };
    var cb = $('pv-errcopy'); if (cb) cb.onclick = copyLink;
  }
  function hideErr() { var e = $('pv-err'); if (e) e.classList.add('hidden'); if (S) S.errShown = false; }

  function curUrl() {
    if (!S) return '';
    var eps = S.opts.episodes || [];
    return (eps[S.opts.epIndex] || {}).url || S.opts.url || '';
  }

  function copyLink() {
    try {
      var ta = document.createElement('textarea');
      ta.value = curUrl(); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      toastMsg('播放链接已复制');
    } catch (e) { toastMsg('复制失败'); }
  }

  function armWatchdog(isNativePhase) {
    if (!S || S.errShown) return;
    clearTimeout(S.watchT);
    S.watchT = setTimeout(function () {
      if (!S || S.errShown) return;
      var v = S.video;
      if (v.readyState >= 1 || v.error) return;   /* 已出画面或已由 error 链接管 */
      if (isNativePhase && !S.hlsTried && S.tryHls) { S.tryHls(curUrl() || v.src); return; }
      showErr('线路长时间无响应：可重试 / 换线路 / 网页播放 / 复制链接');
    }, 14000);
  }

  function attach(url, resume) {
    if (!S) return;
    if (S.hls) { try { S.hls.destroy(); } catch (e) {} S.hls = null; }
    S.nativeTried = false; S.hlsTried = false;
    clearTimeout(S.watchT);
    var v = S.video;
    showSpin(true); showBig(false); hideErr();
    var isHls = /\.m3u8($|[?#])/i.test(url) || url.indexOf('m3u8') >= 0;
    var nativeOk = (v.canPlayType('application/vnd.apple.mpegurl') || v.canPlayType('application/x-mpegurl')) !== '';
    function native() {
      if (S.hls) { try { S.hls.destroy(); } catch (e) {} S.hls = null; }
      S.nativeTried = true;
      v.src = url;
      armWatchdog(true);
    }
    function mkHls(u) {
      try {
        var h = new window.Hls({ maxBufferLength: 30 });
        S.hls = h; S.hlsTried = true;
        var netRetries = 0;
        h.loadSource(u);
        h.attachMedia(v);
        armWatchdog(false);
        h.on(window.Hls.Events.ERROR, function (ev, d) {
          if (!d || !d.fatal || !S) return;
          try { h.destroy(); } catch (e2) {}
          S.hls = null;
          if (!S.nativeTried && (v.canPlayType('application/vnd.apple.mpegurl') || v.canPlayType('application/x-mpegurl')) !== '') { native(u); return; }
          showErr(d.type === 'networkError' ? '此线路拉取失败：可能被跨域/网络拦截，可换线路或网页播放' : '解码失败：试试换线路或换播放内核');
        });
      } catch (e) { native(); }
    }
    S.tryHls = function (u) {
      if (window.Hls && window.Hls.isSupported && window.Hls.isSupported()) { mkHls(u); return; }
      ensureHls().then(function () { if (S) mkHls(u); })
        .catch(function () { if (S && !S.errShown) showErr('线路播放失败：可重试 / 换线路 / 网页播放 / 复制链接'); });
    };
    if (!isHls) native();
    else if (nativeOk) native();               /* iOS/macOS：AVPlayer 原生 HLS，无跨域拦截 */
    else if (window.Hls && window.Hls.isSupported()) mkHls(url);
    else ensureHls().then(function () { if (S) mkHls(url); }).catch(function () { if (S) native(); });
    if (resume && resume > 20) {
      var apply = function () {
        if (v.duration && resume < v.duration - 15) v.currentTime = resume;
      };
      if (v.readyState >= 1) apply();
      else v.addEventListener('loadedmetadata', apply, { once: true });
    }
  }

  function startClock() {
    stopClock();
    S.clockT = setInterval(function () {
      var e = $('pv-clock'); if (!e || !S) return;
      var d = new Date();
      e.textContent = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' +
        (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    }, 20000);
    var d = new Date();
    var e = $('pv-clock');
    if (e) e.textContent = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' +
      (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }
  function stopClock() { if (S && S.clockT) clearInterval(S.clockT); }

  function switchEp(i) {
    if (!S) return;
    var eps = S.opts.episodes || [];
    if (!eps[i]) { S.opts.toast && S.opts.toast('没有更多集了'); return; }
    var o = { epIndex: i, epName: eps[i].name, url: eps[i].url, resume: 0 };
    if (S.opts.onSwitch) S.opts.onSwitch(i, o);
    else Player.update(o);
  }

  function bind() {
    var v = S.video;

    $('pv-back').onclick = function () {
      if (S && S.opts.onExit) S.opts.onExit();
      else Player.close();
    };
    $('pv-play').onclick = function () { if (!v.src && !S.hls) return; v.paused ? v.play().catch(function(){}) : v.pause(); };
    $('pv-bigplay').onclick = function () { v.play().catch(function(){}); };
    $('pv-next').onclick = function () { switchEp(S.opts.epIndex + 1); };
    $('pv-prev').onclick = function () { switchEp(S.opts.epIndex - 1); };
    $('pv-speed').onclick = function () {
      S.speedIdx = (S.speedIdx + 1) % SPEEDS.length;
      var sp = SPEEDS[S.speedIdx];
      v.playbackRate = sp;
      $('pv-speed').textContent = (sp % 1 === 0 ? sp.toFixed(1) : sp) + 'x';
    };
    $('pv-eps').onclick = function () { openIbox('eps'); };
    $('pv-more').onclick = function () { openIbox('set'); };
    $('pv-ibox-close').onclick = closeIbox;
    $('pv-ibox-tabs').onclick = function (ev) {
      var b = ev.target.closest('button[data-t]');
      if (!b) return;
      openIbox(b.dataset.t);
    };
    $('pv-ibox-body').onclick = onIboxTap;
    $('pv-eps-list').onclick = function (ev) {
      var b = ev.target.closest('.ep');
      if (!b) return;
      closeIbox();
      switchEp(+b.dataset.i);
    };
    $('pv-fs').onclick = function () {
      try {
        if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
        else if (v.requestFullscreen) v.requestFullscreen();
        else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
      } catch (e) {}
    };

    v.addEventListener('play', function () { var b = $('pv-play'); if (b) b.textContent = '⏸'; showBig(false); });
    v.addEventListener('pause', function () { var b = $('pv-play'); if (b) b.textContent = '▶'; showBig(!v.ended); });
    v.addEventListener('waiting', function () { showSpin(true); });
    v.addEventListener('playing', function () { showSpin(false); showBig(false); clearTimeout(S && S.watchT); });
    v.addEventListener('canplay', function () { showSpin(false); clearTimeout(S && S.watchT); });
    v.addEventListener('error', function () {
      if (!S || (!v.src && !S.hls)) return;
      /* 原生播放失败且 hls.js 没试过 → 自动降级再试一次 */
      if (S.nativeTried && !S.hlsTried && S.tryHls) { S.tryHls(curUrl() || v.src); return; }
      showErr('此线路播放失败：可重试 / 网页播放 / 复制链接，或到详情页换线路换源');
    });
    v.addEventListener('ended', function () {
      if (S && S.opts.epIndex < ((S.opts.episodes || []).length - 1)) switchEp(S.opts.epIndex + 1);
    });
    v.addEventListener('loadedmetadata', function () { $('pv-dur').textContent = fmt(v.duration); });
    v.addEventListener('timeupdate', function () {
      if (!S) return;
      var cur = v.currentTime, dur = v.duration || 0;
      $('pv-cur').textContent = fmt(cur);
      if (dur > 0) $('pv-fill').style.width = (cur / dur * 100) + '%';
      try {
        if (v.buffered.length) $('pv-buf').style.width = (v.buffered.end(v.buffered.length - 1) / (dur || 1) * 100) + '%';
      } catch (e) {}
      try {
        var sk = S.skip || {};
        if (sk.intro && cur > 0 && cur < sk.intro - 0.3 && sk.intro < (dur || 1e9) - 5) {
          v.currentTime = sk.intro;
        }
        if (sk.out && dur > 0 && dur - cur <= sk.out && !S.outFired) {
          S.outFired = true;
          if (S.opts.epIndex < ((S.opts.episodes || []).length - 1)) {
            var nx = S.opts.epIndex + 1;
            var o2 = { epIndex: nx, epName: S.opts.episodes[nx].name, url: S.opts.episodes[nx].url, resume: 0 };
            if (S.opts.onSwitch) S.opts.onSwitch(nx, o2); else Player.update(o2);
          }
        }
        if (sk.out && dur > 0 && dur - cur > sk.out) S.outFired = false;
      } catch (e2) {}
      var now = Date.now();
      if (now - S.lastSave > 5000 && S.opts.onProgress) {
        S.lastSave = now;
        S.opts.onProgress(cur, dur, S.opts.epIndex, S.opts.epName);
      }
    });

    /* 进度条拖动 */
    var bar = $('pv-bar');
    function seekAt(x) {
      var rect = bar.getBoundingClientRect();
      var pct = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
      if (v.duration) v.currentTime = pct * v.duration;
    }
    bar.addEventListener('touchstart', function (e) { S.seekTouch = true; seekAt(e.touches[0].clientX); }, { passive: true });
    bar.addEventListener('touchmove', function (e) { if (S.seekTouch) seekAt(e.touches[0].clientX); }, { passive: true });
    bar.addEventListener('touchend', function () { S.seekTouch = false; });
    bar.addEventListener('mousedown', function (e) { seekAt(e.clientX); });
    bar.addEventListener('click', function (e) { seekAt(e.clientX); });

    /* 点击画面显隐控制条 + 双击播放暂停 */
    var ui = $('pv-ui');
    ui.addEventListener('click', function (ev) {
      if (ev.target.closest('button') || ev.target.closest('.pv-ibox')) return;
      view().classList.toggle('pv-hide');
      scheduleHide();
    });
    var lastTap = 0;
    ui.addEventListener('touchend', function (ev) {
      if (ev.target.closest('button') || ev.target.closest('.pv-ibox') || ev.target.closest('.pv-bar')) return;
      var now = Date.now();
      if (now - lastTap < 280) { v.paused ? v.play().catch(function(){}) : v.pause(); }
      lastTap = now;
    });
    scheduleHide();
    bindExt();
    /* 竖屏时提示横屏更佳 */
    if (window.innerHeight > window.innerWidth && S.opts.hint !== false) {
      setTimeout(function () {
        toastMsg('横屏观看体验更佳（设备横过来试试）');
      }, 800);
    }
  }

  function view() { return document.getElementById('view-player'); }
  function scheduleHide() {
    if (!S) return;
    clearTimeout(S.hideT);
    S.hideT = setTimeout(function () {
      var el = view();
      if (el && !S.video.paused) el.classList.add('pv-hide');
    }, 3200);
  }

  /* ============ 扩展：内核/更多面板/片头片尾/睡眠/长按倍速 ============ */
  function skipStoreKey() {
    var k = S && S.opts.skipKey;
    return k ? ('skip:' + k) : null;
  }
  function skipGet() {
    var k = skipStoreKey();
    return k ? (Store.get(k, {}) || {}) : {};
  }
  function skipSet(obj) {
    var k = skipStoreKey();
    if (k) Store.set(k, obj);
  }
  function settings() { return Store.get('pvset', { loop: false, bg: true, longpress: true, sleep: 0 }); }
  function saveSettings(s) { Store.set('pvset', s); }

  function openWebPlay(url) {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.panghuOpen) {
      window.webkit.messageHandlers.panghuOpen.postMessage({ url: url });
    } else if (window.GullNative && window.GullNative.openWeb) {
      window.GullNative.openWeb(url);
    } else {
      var w = null;
      try { w = window.open(url, '_blank'); } catch (e) {}
      if (!w && window.__PANGHU_NATIVE__) {
        copyLink();
        toastMsg('壳内无网页播放通道，链接已复制，可去浏览器/VLC 打开');
      }
    }
  }
  window.openWebPlay = openWebPlay;

  function showSheet(title, items) {
    var m = $('pv-sheet');
    if (!m) {   /* 设置页等非播放器上下文也能弹 */
      m = document.createElement('div');
      m.id = 'pv-sheet'; m.className = 'pv-sheet-mask';
      document.body.appendChild(m);
    }
    var html = '<div class="pv-sheet-title">' + title + '</div>';
    items.forEach(function (it, idx) {
      if (!it.label) {
        html += '<div class="pv-sheet-item sub">' + it.sub + '</div>';
        return;
      }
      html += '<button class="pv-sheet-item" data-idx="' + idx + '">' + it.label +
        (it.sub ? '<span class="pv-sheet-sub">' + it.sub + '</span>' : '') + '</button>';
    });
    html += '<button class="pv-sheet-cancel" data-cancel="1">取消</button>';
    m.innerHTML = '<div class="pv-sheet">' + html + '</div>';
    m.classList.add('show');
    m.onclick = function (ev) {
      if (ev.target === m || ev.target.closest('[data-cancel]')) { m.classList.remove('show'); return; }
      var b = ev.target.closest('.pv-sheet-item');
      if (!b) return;
      m.classList.remove('show');
      var it = items[+b.dataset.idx];
      if (it && it.fn) it.fn();
    };
  }

  function jumpExternal(scheme, name) {
    var t = Date.now();
    try { window.location.href = scheme; } catch (e) {}
    setTimeout(function () {
      if (!document.hidden && Date.now() - t < 2500) toastMsg('未检测到 ' + name + '，可去 App Store 安装');
    }, 2000);
  }

  /* ============ 默认播放器（OK影视同款） ============ */
  var KERNEL_META = {
    builtin: { name: '内置', desc: '缓冲快 / 支持格式少' },
    vlc:     { name: 'VLC', desc: '建议播放 4K 选择' },
    nplayer: { name: 'nPlayer', desc: '缓冲稍慢 / 支持格式多' },
    infuse:  { name: 'Infuse', desc: '4K 画质与海报墙首选' },
    web:     { name: '网页播放', desc: '调用站点自带播放器' }
  };
  function kernelPref() { return Store.get('pvset', {}).kernel || 'auto'; }
  function lastKernel() { return Store.get('pvset', {}).used || 'builtin'; }
  function effKernel() { var k = kernelPref(); return k === 'auto' ? lastKernel() : k; }
  function setKernelPref(k) {
    var st = Store.get('pvset', {});
    st.kernel = k;
    if (k !== 'auto') st.used = k;
    Store.set('pvset', st);
  }
  function touchUsed(k) {
    if (k && k !== 'auto') { var st = Store.get('pvset', {}); st.used = k; Store.set('pvset', st); }
  }

  function appStoreGuide(name, term) {
    showSheet('未检测到 ' + name, [
      { label: '去 App Store 搜索「' + term + '」', i: 0, fn: function () {
          var t = encodeURIComponent(term);
          var w = null; try { w = window.open('https://apps.apple.com/search?term=' + t, '_blank'); } catch (e) {}
          if (!w && window.__PANGHU_NATIVE__) {
            try { window.location.href = 'itms-apps://itunes.apple.com/search?term=' + t; } catch (e2) {}
          }
        } },
      { label: '本次改用内置播放器', i: 1, fn: function () { setKernelPref('builtin'); toastMsg('已切换内置播放器'); } }
    ]);
  }

  var NATIVE_KERNEL = !!(window.__PANGHU_NATIVE__ && window.webkit && window.webkit.messageHandlers &&
                          window.webkit.messageHandlers.panghuPlay);

  function jumpKernel(k, url) {
    var enc = encodeURIComponent(url);
    touchUsed(k);
    /* 原生壳 v3.0：VLC/内置为 app 内真内核，直通原生播放 */
    if (NATIVE_KERNEL && (k === 'vlc' || k === 'builtin')) {
      window.webkit.messageHandlers.panghuPlay.postMessage({ url: url, kernel: k });
      return;
    }
    var t = Date.now();
    try {
      window.location.href =
        k === 'vlc' ? ('vlc://x-callback-url/stream?url=' + enc) :
        k === 'nplayer' ? ('nplayer-' + url) :
        ('infuse://x-callback-url/play?url=' + enc);
    } catch (e) {}
    setTimeout(function () {
      if (!document.hidden && Date.now() - t < 2500) appStoreGuide(KERNEL_META[k].name, KERNEL_META[k].name);
    }, 2000);
  }

  function showKernelSheet() {
    var eps = S ? (S.opts.episodes || []) : [];
    var cur = eps[S ? S.opts.epIndex : 0] || {};
    var url = cur.url || (S ? S.opts.url : '');
    var pref = kernelPref();
    function mark(k) {
      if (k === 'auto') return pref === 'auto' ? ' · 当前' : '';
      if (pref === k) return ' · 当前';
      if (pref === 'auto' && lastKernel() === k) return ' · 上次';
      return '';
    }
    var items = [
      { label: '自动 -> 使用上次选择' + mark('auto'), sub: '跟随上次使用的播放内核', i: 0, fn: function () {
          setKernelPref('auto'); toastMsg('默认播放器：自动（上次：' + KERNEL_META[lastKernel()].name + '）');
        } },
      { label: '内置 -> 缓冲快 / 支持格式少' + mark('builtin'), sub: 'AVPlayer · m3u8/mp4 直链首选', i: 1, fn: function () {
          setKernelPref('builtin'); toastMsg('默认播放器：内置');
        } },
      { label: 'VLC -> 建议播放 4K 选择' + mark('vlc'), sub: NATIVE_KERNEL ? '全格式 · app 内置 VLC 真内核' : '全格式 · 需安装 VLC for iOS', i: 2, fn: function () {
          setKernelPref('vlc'); url ? jumpKernel('vlc', url) : toastMsg('已设为默认：VLC');
        } },
      { label: 'nPlayer -> 缓冲稍慢 / 支持格式多' + mark('nplayer'), sub: '全格式硬解 · 需安装 nPlayer', i: 3, fn: function () {
          setKernelPref('nplayer'); url ? jumpKernel('nplayer', url) : toastMsg('已设为默认：nPlayer');
        } },
      { label: 'Infuse -> 4K 画质首选' + mark('infuse'), sub: '海报墙 · 需安装 Infuse', i: 4, fn: function () {
          setKernelPref('infuse'); url ? jumpKernel('infuse', url) : toastMsg('已设为默认：Infuse');
        } },
      { label: '网页播放 -> 站点自带播放器' + mark('web'), sub: '部分站点可用', i: 5, fn: function () {
          setKernelPref('web'); url ? openWebPlay(url) : toastMsg('已设为默认：网页播放');
        } }
    ];
    if (url) items.push({ label: '复制播放链接', i: 6, fn: copyLink });
    showSheet('默认播放器', items);
  }
  window.showKernelSheet = showKernelSheet;

  function setupSleep(min) {
    if (S.sleepT) { clearTimeout(S.sleepT); S.sleepT = null; }
    S.sleepMin = min || 0;
    if (min) {
      S.sleepT = setTimeout(function () {
        if (S) { S.video.pause(); toastMsg('睡眠时间到，已暂停'); }
      }, min * 60000);
    }
  }

  function showSkipPanel() {
    var sk = skipGet();
    showSheet('片头片尾', [
      { label: '把当前时间设为片头结束点', sub: '当前 ' + fmt(S.video.currentTime) + '（先拖到片头结束位置再点）', i: 0, fn: function () {
          var o = skipGet(); o.intro = Math.floor(S.video.currentTime); skipSet(o);
          toastMsg('已设片头 ' + o.intro + ' 秒'); renderMore();
        } },
      { label: '把当前时间设为片尾起始点', sub: '剩余 ' + fmt((S.video.duration || 0) - S.video.currentTime), i: 1, fn: function () {
          var o = skipGet(); o.out = Math.max(0, Math.floor((S.video.duration || 0) - S.video.currentTime)); skipSet(o);
          toastMsg('已设片尾提前 ' + o.out + ' 秒'); renderMore();
        } },
      { label: '清除本剧集跳过设置', i: 2, fn: function () { skipSet({}); toastMsg('已清除'); renderMore(); } }
    ]);
  }

  function bindExt() {
    $('pv-kernel').onclick = showKernelSheet;
    var box = $('pv-ibox');
    var st = settings();
    S.video.loop = !!st.loop;
    setupSleep(st.sleep || 0);
    S.skip = skipGet();
    /* 长按倍速 */
    var lpT = null, origRate = 1;
    var ui = $('pv-ui');
    ui.addEventListener('touchstart', function (ev) {
      var st2 = settings();
      if (!st2.longpress) return;
      if (ev.target.closest('button') || ev.target.closest('.pv-bar') || ev.target.closest('.pv-drawer') || ev.target.closest('.pv-more')) return;
      lpT = setTimeout(function () {
        if (!S) return;
        origRate = S.video.playbackRate;
        S.video.playbackRate = 3;
        toastMsg('3x 快进中…');
      }, 550);
    }, { passive: true });
    ui.addEventListener('touchend', function () {
      if (lpT) { clearTimeout(lpT); lpT = null; }
      if (S && S.video.playbackRate === 3) S.video.playbackRate = origRate;
    }, { passive: true });
  }

  function toastMsg(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
})();
