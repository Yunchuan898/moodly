/* 场景状态 —— 心绪 · 沙盘
 *
 * 摆件的增删改、序列化、草稿与作品的持久化、缩略图合成。
 * 位置用沙盘归一化坐标 [0,1]，与分辨率无关。
 */
window.Scene = (function () {
  "use strict";

  var DRAFT_KEY  = "xinxu.sandbox.draft.v1";
  var SCENES_KEY = "xinxu.sandbox.scenes.v1";

  var items = [];
  var seq = 1;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* ---------- 增删改 ---------- */
  function add(k, x, y) {
    var it = { id: seq++, k: k, x: clamp01(x), y: clamp01(y), rot: 0, sc: 1 };
    items.push(it);
    return it;
  }
  function get(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }
  function remove(id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) { items.splice(i, 1); return true; }
    }
    return false;
  }
  function moveTo(id, x, y) {
    var it = get(id); if (!it) return;
    it.x = clamp01(x); it.y = clamp01(y);
  }
  function rotateBy(id, deg) {
    var it = get(id); if (!it) return;
    it.rot = ((it.rot + deg) % 360 + 360) % 360;
  }
  function scaleBy(id, f) {
    var it = get(id); if (!it) return;
    it.sc = Math.min(2.6, Math.max(0.35, it.sc * f));
  }
  function toFront(id) {
    var it = get(id); if (!it) return;
    items.splice(items.indexOf(it), 1);
    items.push(it);
  }
  function all() { return items; }
  function count() { return items.length; }

  function clear() {
    items = [];
    seq = 1;
  }

  /* ---------- 序列化 ---------- */
  function serialize() {
    return { v: 1, items: items.map(function (it) {
      return { k: it.k, x: +it.x.toFixed(4), y: +it.y.toFixed(4),
               rot: Math.round(it.rot), sc: +it.sc.toFixed(3) };
    }) };
  }
  function load(data) {
    clear();
    if (!data || !data.items) return;
    data.items.forEach(function (o) {
      if (!window.Shelf.find(o.k)) return;   // 忽略未知沙具，向前兼容
      var it = add(o.k, o.x, o.y);
      it.rot = o.rot || 0;
      it.sc = o.sc || 1;
    });
  }

  /* ---------- 持久化 ---------- */
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  function saveDraft() { return write(DRAFT_KEY, serialize()); }
  function loadDraft() { return read(DRAFT_KEY, null); }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  function listScenes() {
    var a = read(SCENES_KEY, []);
    return Array.isArray(a) ? a : [];
  }
  function localDate() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function saveScene(name, thumb) {
    var a = listScenes();
    a.unshift({
      id: Date.now(),
      name: name || "未命名",
      date: localDate(),
      thumb: thumb || "",
      data: serialize(),
    });
    write(SCENES_KEY, a);
    return a;
  }
  function deleteScene(id) {
    var a = listScenes().filter(function (s) { return s.id !== id; });
    write(SCENES_KEY, a);
    return a;
  }

  /* ---------- 缩略图合成 ---------- */
  /* 沙面是 canvas，摆件是 DOM，要合成一张图得把每个 SVG 也光栅化。
     把沙具包成自包含的 data URI（内联调色板变量），再逐个画上去。 */
  var PALETTE = "--fig-body:#57506F;--fig-body2:#7A6E96;--fig-line:#F1ECE1;" +
                "--fig-ac:#F0B36A;--fig-ac2:#A78BFA";
  var FIG_CSS =
    "svg>*{fill:var(--fig-body);stroke:var(--fig-line);stroke-width:1.7;" +
    "stroke-linejoin:round;stroke-linecap:round}" +
    ".a{fill:var(--fig-ac)}.b{fill:var(--fig-ac2)}.l{fill:var(--fig-line)}" +
    ".n{fill:none}.d{fill:var(--fig-body2)}";

  var uriCache = {};
  function figUri(k) {
    if (uriCache[k]) return uriCache[k];
    var f = window.Shelf.find(k);
    if (!f) return null;
    var inner = f.s.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" style="' + PALETTE + '">' +
      "<style>" + FIG_CSS + "</style>" + inner + "</svg>";
    uriCache[k] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    return uriCache[k];
  }

  function loadImg(src) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = src;
    });
  }

  /* FIG_W：沙具宽度占沙盘宽度的比例，与页面上保持一致 */
  var FIG_W = 0.085;

  function makeThumb(sandCanvas, W, H) {
    var out = document.createElement("canvas");
    out.width = W; out.height = H;
    var ctx = out.getContext("2d");
    ctx.drawImage(sandCanvas, 0, 0, W, H);

    var jobs = items.map(function (it) {
      var u = figUri(it.k);
      return u ? loadImg(u).then(function (im) { return { it: it, im: im }; })
               : Promise.resolve(null);
    });

    return Promise.all(jobs).then(function (list) {
      list.forEach(function (o) {
        if (!o || !o.im) return;
        var w = FIG_W * W * o.it.sc;
        ctx.save();
        ctx.translate(o.it.x * W, o.it.y * H);
        ctx.rotate(o.it.rot * Math.PI / 180);
        ctx.drawImage(o.im, -w / 2, -w, w, w);
        ctx.restore();
      });
      try { return out.toDataURL("image/jpeg", 0.72); }
      catch (e) { return ""; }
    });
  }

  return {
    add: add, get: get, remove: remove, moveTo: moveTo,
    rotateBy: rotateBy, scaleBy: scaleBy, toFront: toFront,
    all: all, count: count, clear: clear,
    serialize: serialize, load: load,
    saveDraft: saveDraft, loadDraft: loadDraft, clearDraft: clearDraft,
    listScenes: listScenes, saveScene: saveScene, deleteScene: deleteScene,
    makeThumb: makeThumb, FIG_W: FIG_W,
  };
})();
