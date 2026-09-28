/* DanDan影视 · 豆瓣数据源（首页频道/评分/筛选，对齐蛋蛋不语数据面） */
(function () {
  'use strict';
  function headers() {
    var bid = '';
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < 11; i++) bid += chars[Math.floor(Math.random() * chars.length)];
    return {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Referer': 'https://movie.douban.com/',
      'Cookie': 'bid=' + bid + '; _dobawkkey=2-1'
    };
  }
  function get(url) { return window.HTTP.get(url, 20000, headers()); }
  function map(list) {
    return (list || []).map(function (s) {
      return { name: s.title, pic: s.cover, rate: s.rate || '', title: s.title };
    });
  }

  /* 频道热榜：type movie|tv, tag 热门/国产剧/日剧/综艺… */
  function byTag(type, tag) {
    var url = 'https://movie.douban.com/j/search_subjects?type=' + encodeURIComponent(type) +
      '&tag=' + encodeURIComponent(tag || '热门') +
      '&sort=recommend&page_limit=24&page_start=0';
    return get(url).then(function (t) { return map(JSON.parse(t).subjects); });
  }

  /* 多标签筛选：tags = [类型,地区,年代] */
  function filter(type, tags) {
    var url = 'https://movie.douban.com/j/new_search_subjects?sort=U&range=0,10&tags=' +
      encodeURIComponent([type].concat(tags || []).filter(Boolean).join(',')) + '&start=0';
    return get(url).then(function (t) { return map(JSON.parse(t).data); });
  }

  window.Douban = { byTag: byTag, filter: filter };
})();
