/* Panghu影视 · 内置演示源 csp_Demo（纯前端数据，离线可浏览） */
(function () {
  'use strict';
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry32(20260928);

  var CATS = [
    { type_id: '1', type_name: '电影' },
    { type_id: '2', type_name: '剧集' },
    { type_id: '3', type_name: '动漫' },
    { type_id: '4', type_name: '综艺' },
    { type_id: '5', type_name: '纪录' }
  ];
  var SUBS = {
    '1': ['动作', '喜剧', '科幻', '悬疑', '战争'],
    '2': ['国产', '美剧', '日剧', '韩剧'],
    '3': ['热血', '恋爱', '机战'],
    '4': ['真人秀', '脱口秀', '音乐'],
    '5': ['自然', '历史']
  };
  var AREAS = {
    '1': ['大陆', '香港', '美国', '日本', '欧洲'],
    '2': ['大陆', '韩国', '美国', '日本'],
    '3': ['日本', '大陆'],
    '4': ['大陆', '韩国'],
    '5': ['大陆', '海外']
  };
  var T1 = ['星际', '暗影', '长安', '深海', '雪国', '铁血', '迷雾', '孤岛', '凤凰', '无极',
    '长风', '落日', '寒武', '机械', '赤焰', '风语', '归途', '暗河', '破晓', '听雨',
    '拾光', '夜航', '白鲸', '蜃楼'];
  var T2 = ['迷航', '档案', '行动', '纪事', '之恋', '疑云', '编年史', '研究所', '旧事', '远征',
    '启示录', '小事', '少年', '客栈', '保卫战', '观察日记', '计划', '回响', '七日', '异闻录'];
  var REMARKS = {
    '1': ['HD', 'HD中字', '蓝光1080P', 'TC抢先', '正片'],
    '2': ['全40集', '更新至24集', '全16集', '全52集', '更新至08集'],
    '3': ['全24集', '更新至12集', '剧场版', '全12集'],
    '4': ['20250912期', '更新至第6期', '会员版'],
    '5': ['全6集', 'HD', '4K']
  };
  var NAMES = ['陈星旭', '林晚', '周牧', '沈知意', '顾长风', '苏梨', '白宇轩', '江离', '叶眠', '许照',
    '孟秋', '韩叙', '方醒', '洛九', '夏栀', '陆沉', '闻人夜', '温晏', '程野', '祁一'];
  var DIRS = ['林诣彬', '陈可辛', '乌尔善', '张纪中', '徐克', '王诺兰', '新井风', '金泰勇',
    '赵婷婷', '文牧野', '郭凡', '朴赞景'];
  var STREAM_HLS = [
    'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8'
  ];
  var STREAM_MP4 = [
    'https://media.w3.org/2010/05/sintel/trailer.mp4',
    'https://media.w3.org/2010/05/bunny/trailer.mp4',
    'https://vjs.zencdn.net/v/oceans.mp4',
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    'https://media.w3.org/2010/05/video/movie_300.mp4'
  ];
  var EP_COUNT = { '1': [1], '2': [12, 16, 24, 32, 40, 52], '3': [12, 24, 26], '4': [6, 8, 10, 12], '5': [6, 8] };

  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

  function poster(name, cat, hue) {
    var chars = name.split(''); var lines = []; var cur = '';
    for (var i = 0; i < chars.length; i++) {
      if (cur.length >= 5) { lines.push(cur); cur = ''; }
      cur += chars[i];
    }
    if (cur) lines.push(cur);
    var tsp = lines.map(function (l, i) {
      return '<tspan x="150" dy="' + (i === 0 ? 0 : 52) + '">' + l + '</tspan>';
    }).join('');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="hsl(' + hue + ',45%,24%)"/>' +
      '<stop offset="1" stop-color="hsl(' + ((hue + 60) % 360) + ',55%,10%)"/>' +
      '</linearGradient></defs>' +
      '<rect width="300" height="450" fill="url(#g)"/>' +
      '<circle cx="248" cy="60" r="90" fill="hsl(' + ((hue + 30) % 360) + ',60%,32%)" opacity="0.35"/>' +
      '<text x="150" y="215" font-family="PingFang SC,sans-serif" font-size="40" font-weight="700" fill="#fff" text-anchor="middle" opacity="0.95">' + tsp + '</text>' +
      '<text x="18" y="430" font-family="sans-serif" font-size="17" fill="#ffffff99">' + cat + ' · DanDan演示源</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  var DATA = [];
  function build() {
    if (DATA.length) return DATA;
    var id = 1000;
    CATS.forEach(function (c) {
      for (var i = 0; i < 64; i++) {
        var sub = pick(SUBS[c.type_id]);
        var year = String(2016 + Math.floor(rnd() * 10));
        var name = pick(T1) + pick(T2);
        DATA.push({
          vod_id: id++,
          vod_name: name,
          vod_class: c.type_name + ',' + sub,
          type_id: c.type_id,
          type_name: c.type_name,
          vod_year: year,
          vod_area: pick(AREAS[c.type_id]),
          vod_remarks: pick(REMARKS[c.type_id]),
          vod_score: +(5 + rnd() * 4.5).toFixed(1),
          vod_actor: [pick(NAMES), pick(NAMES), pick(NAMES)].join(' / '),
          vod_director: pick(DIRS),
          vod_hits: Math.floor(rnd() * 90000 + 1000),
          vod_time: Math.floor(Date.now() / 1000) - Math.floor(rnd() * 86400 * 400),
          vod_total: pick(EP_COUNT[c.type_id]),
          vod_pic: poster(name, c.type_name, Math.floor(rnd() * 360))
        });
      }
    });
    return DATA;
  }

  function detailBody(it) {
    var epsAll = [];
    for (var i = 1; i <= it.vod_total; i++) {
      epsAll.push({ name: it.vod_total > 1 ? ('第' + i + '集') : '正片' });
    }
    var l1 = epsAll.map(function (e, i) { return e.name + '$' + STREAM_HLS[i % STREAM_HLS.length]; }).join('#');
    var l2 = epsAll.map(function (e, i) { return e.name + '$' + STREAM_MP4[i % STREAM_MP4.length]; }).join('#');
    return {
      vod_id: it.vod_id, vod_name: it.vod_name, vod_pic: it.vod_pic, vod_class: it.vod_class,
      type_name: it.type_name, vod_year: it.vod_year, vod_area: it.vod_area,
      vod_remarks: it.vod_remarks, vod_score: it.vod_score, vod_actor: it.vod_actor,
      vod_director: it.vod_director,
      vod_content: '《' + it.vod_name + '》是' + it.vod_year + '年' + it.vod_area + '出品的' + it.type_name +
        '作品，由' + it.vod_director + '执导，' + it.vod_actor + ' 领衔出演。故事围绕一场意想不到的转折展开：' +
        '平凡的日常被一封神秘来信打破，主角不得不踏上寻找真相的旅途……（本条目为演示数据，播放使用公共测试片源）',
      vod_play_from: 'DanDan线路(HLS)$$$备用线路(MP4)',
      vod_play_url: l1 + '$$$' + l2
    };
  }

  function match(it, q) {
    if (q.tid && it.type_id !== String(q.tid)) return false;
    if (q.sub && it.vod_class.indexOf(q.sub) < 0) return false;
    if (q.area && it.vod_area !== q.area) return false;
    if (q.year && it.vod_year !== String(q.year)) return false;
    if (q.wd && it.vod_name.indexOf(q.wd) < 0) return false;
    return true;
  }

  function sortList(arr, by) {
    var a = arr.slice();
    if (by === 'hits') a.sort(function (x, y) { return y.vod_hits - x.vod_hits; });
    else if (by === 'score') a.sort(function (x, y) { return y.vod_score - x.vod_score; });
    else a.sort(function (x, y) { return y.vod_time - x.vod_time; });
    return a;
  }

  window.DemoSource = {
    class: function () {
      return CATS.map(function (c) { return { type_id: c.type_id, type_name: c.type_name }; });
    },
    subsOf: function (catId) {
      var c = CATS.filter(function (x) { return x.type_id === String(catId); })[0];
      return c ? SUBS[c.type_id] : [];
    },
    list: function (q) {
      q = q || {};
      var all = sortList(build().filter(function (it) { return match(it, q); }), q.by || 'time');
      var size = 30, pg = Math.max(1, +q.pg || 1);
      var pagecount = Math.max(1, Math.ceil(all.length / size));
      pg = Math.min(pg, pagecount);
      return {
        page: pg, pagecount: pagecount, total: all.length,
        list: all.slice((pg - 1) * size, pg * size)
      };
    },
    detail: function (id) {
      var it = build().filter(function (x) { return String(x.vod_id) === String(id); })[0];
      return it ? detailBody(it) : null;
    }
  };
})();
