/* Panghu影视 · 存储层（localStorage 不可用时自动降级内存） */
(function () {
  'use strict';
  var mem = {};
  function ls() {
    try {
      var L = window.localStorage;
      L.setItem('__gtv_t', '1'); L.removeItem('__gtv_t');
      return L;
    } catch (e) { return null; }
  }
  window.Store = {
    get: function (k, d) {
      var L = ls();
      try {
        var v = L ? L.getItem('gtv_' + k) : mem[k];
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set: function (k, v) {
      var L = ls(); var s;
      try { s = JSON.stringify(v); } catch (e) { return; }
      if (L) { try { L.setItem('gtv_' + k, s); } catch (e) { mem[k] = s; } }
      else mem[k] = s;
    },
    del: function (k) {
      var L = ls();
      if (L) { try { L.removeItem('gtv_' + k); } catch (e) {} }
      delete mem[k];
    }
  };
})();
