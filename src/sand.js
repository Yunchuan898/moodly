/* 沙面引擎 —— 心绪 · 沙盘
 *
 * 高度场 + 安息角松弛 + 逐像素 hillshading。
 * 没有依赖，挂 window.Sand。
 */
window.Sand = (function () {
  "use strict";

  /* ---------- 常量 ---------- */
  var GW = 128, GH = 96;          // 高度场格子数（4:3）
  var VW = 512, VH = 384;         // 内部渲染分辨率
  var FRAME = 2;                  // 光照采样需要的高度场外扩

  var H_INIT   = 0.60;            // 平沙高度
  var H_MAX    = 1.0;
  var WATER    = 0.045;           // 低于此高度露出水
  var TALUS    = 0.055;           // 安息角：相邻格最大稳定高差
  var RELIEF   = 32;              // 高度场 -> 法线的夸张系数
  var RELAX_IT = 2;               // 每帧松弛轮数

  /* ---------- 状态 ---------- */
  var h = new Float32Array(GW * GH);       // 高度
  var delta = new Float32Array(GW * GH);   // 松弛增量缓冲
  var grain = new Uint8Array(GW * GH);     // 低频噪声（按格，参与起伏）
  var pgrain = new Uint8Array(VW * VH);    // 沙粒（按像素，纯质感）
  var canvas = null, ctx = null;

  var dirty = null;   // {x0,y0,x1,y1} 格坐标，null = 全脏
  var running = false, raf = 0;
  var time = 0;

  /* ---------- 调色板 LUT ---------- */
  var LUT_N = 256;
  var lutR = new Uint8Array(LUT_N), lutG = new Uint8Array(LUT_N), lutB = new Uint8Array(LUT_N);
  /* 关键的标定：一块平整的沙面法线朝上，与光点乘得 LZ=0.67，
     落在 0.58 附近——正好是「沙」这一档，而不是逼近顶端。
     这就是为什么下面的光照式子是 0.16 + ndl*0.66 而不是 0.30 + ndl*0.85：
     后者会让整盘沙糊成一片均匀的浅米色，看不出任何起伏。 */
  var STOPS = [
    [0.00, 0x1E, 0x18, 0x30],  // 最深的背光
    [0.22, 0x3D, 0x33, 0x55],  // 阴影里的紫
    [0.42, 0x6E, 0x5F, 0x6E],
    [0.58, 0xA0, 0x8B, 0x6E],  // 沙（平面落点）
    [0.78, 0xDC, 0xCB, 0xA6],  // 受光面
    [1.00, 0xF8, 0xEF, 0xD9],  // 高光
  ];
  (function buildLUT() {
    for (var i = 0; i < LUT_N; i++) {
      var t = i / (LUT_N - 1), a = STOPS[0], b = STOPS[STOPS.length - 1];
      for (var s = 0; s < STOPS.length - 1; s++) {
        if (t >= STOPS[s][0] && t <= STOPS[s + 1][0]) { a = STOPS[s]; b = STOPS[s + 1]; break; }
      }
      var span = b[0] - a[0] || 1, k = (t - a[0]) / span;
      lutR[i] = a[1] + (b[1] - a[1]) * k;
      lutG[i] = a[2] + (b[2] - a[2]) * k;
      lutB[i] = a[3] + (b[3] - a[3]) * k;
    }
  })();

  /* ---------- 工具 ---------- */
  function idx(x, y) { return y * GW + x; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function markDirty(x0, y0, x1, y1) {
    x0 = clamp(x0, 0, GW - 1); y0 = clamp(y0, 0, GH - 1);
    x1 = clamp(x1, 0, GW - 1); y1 = clamp(y1, 0, GH - 1);
    if (!dirty) dirty = { x0: x0, y0: y0, x1: x1, y1: y1 };
    else {
      if (x0 < dirty.x0) dirty.x0 = x0;
      if (y0 < dirty.y0) dirty.y0 = y0;
      if (x1 > dirty.x1) dirty.x1 = x1;
      if (y1 > dirty.y1) dirty.y1 = y1;
    }
  }
  function dirtyAll() { dirty = { x0: 0, y0: 0, x1: GW - 1, y1: GH - 1 }; }

  /* ---------- 起伏噪声 ---------- */
  function staticNoise() {
    // 三个八度的值噪声，让平沙表面有可被光照捕捉的细微起伏
    var seed = 1337;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    var oct = [];
    for (var o = 0; o < 4; o++) {
      var f = 4 << o, w = f + 2, g = new Float32Array(w * w);
      for (var i = 0; i < g.length; i++) g[i] = rnd();
      oct.push({ f: f, w: w, g: g });
    }
    function smooth(t) { return t * t * (3 - 2 * t); }
    function sample(o, fx, fy) {
      var x = fx * o.f, y = fy * o.f;
      var x0 = Math.floor(x), y0 = Math.floor(y);
      var tx = smooth(x - x0), ty = smooth(y - y0);
      x0 = clamp(x0, 0, o.w - 2); y0 = clamp(y0, 0, o.w - 2);
      var a = o.g[y0 * o.w + x0], b = o.g[y0 * o.w + x0 + 1];
      var c = o.g[(y0 + 1) * o.w + x0], d = o.g[(y0 + 1) * o.w + x0 + 1];
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
    for (var y = 0; y < GH; y++) {
      for (var x = 0; x < GW; x++) {
        var fx = x / GW, fy = y / GH, v = 0, amp = 1, tot = 0;
        for (var k = 0; k < oct.length; k++) {
          v += sample(oct[k], fx, fy) * amp; tot += amp; amp *= 0.5;
        }
        v = v / tot;
        h[idx(x, y)] = H_INIT + (v - 0.5) * 0.040;
        grain[idx(x, y)] = (Math.random() * 255) | 0;
      }
    }
    // 沙粒必须是逐像素的。按格生成的话，在 512 宽的图上每格 4×4 像素，
    // 出来是一块块方砖，像刨花板而不像沙。
    for (var p = 0; p < pgrain.length; p++) pgrain[p] = (Math.random() * 255) | 0;
  }

  /* ---------- 笔刷 ---------- */
  /* nx, ny 为沙盘归一化坐标 [0,1]；strength > 0 堆沙，< 0 挖沙 */
  function poke(nx, ny, opt) {
    opt = opt || {};
    var radius = (opt.radius || 0.05) * GW;        // 以格为单位
    var strength = opt.strength || 0;
    var cx = nx * GW, cy = ny * GH;
    var r = radius, r2 = r * r;
    var x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
    var y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        var d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        var f = 1 - d2 / r2;               // 平方衰减
        var i = idx(x, y);
        h[i] = clamp(h[i] + strength * f * f, 0, H_MAX);
      }
    }
    // 松弛区外扩，避免笔刷边缘出现刀切一样的直壁
    markDirty(x0 - 6, y0 - 6, x1 + 6, y1 + 6);
  }

  /* ---------- 安息角松弛 ---------- */
  /* 沙之所以是沙：坡太陡就塌。没有这一步，挖出来的是垂直的假洞。 */
  function relax() {
    if (!dirty) return;
    var x0 = clamp(dirty.x0 - 5, 0, GW - 1), y0 = clamp(dirty.y0 - 5, 0, GH - 1);
    var x1 = clamp(dirty.x1 + 5, 0, GW - 1), y1 = clamp(dirty.y1 + 5, 0, GH - 1);
    var moved = false;

    for (var it = 0; it < RELAX_IT; it++) {
      delta.fill(0, 0, GW * GH);
      var any = false;
      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          var i = idx(x, y), hv = h[i];
          var nbr = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
          for (var n = 0; n < 4; n++) {
            var nx2 = nbr[n][0], ny2 = nbr[n][1];
            if (nx2 < 0 || ny2 < 0 || nx2 >= GW || ny2 >= GH) continue;
            var j = idx(nx2, ny2);
            var diff = hv - h[j];
            if (diff > TALUS) {
              var give = (diff - TALUS) * 0.22;
              delta[i] -= give; delta[j] += give; any = true;
            }
          }
        }
      }
      if (!any) break;
      moved = true;
      for (var y2 = y0; y2 <= y1; y2++) {
        for (var x2 = x0; x2 <= x1; x2++) {
          var k = idx(x2, y2);
          h[k] = clamp(h[k] + delta[k], 0, H_MAX);
        }
      }
    }
    if (moved) markDirty(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
  }

  /* ---------- 高度查询（双线性） ---------- */
  function heightAt(nx, ny) {
    var fx = clamp(nx * GW - 0.5, 0, GW - 1.001);
    var fy = clamp(ny * GH - 0.5, 0, GH - 1.001);
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var tx = fx - x0, ty = fy - y0;
    var a = h[idx(x0, y0)], b = h[idx(x0 + 1, y0)];
    var c = h[idx(x0, y0 + 1)], d = h[idx(x0 + 1, y0 + 1)];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  // 光照用：格坐标处的连续高度
  function hAt(fx, fy) {
    var x0 = clamp(Math.floor(fx), 0, GW - 2), y0 = clamp(Math.floor(fy), 0, GH - 2);
    var tx = clamp(fx - x0, 0, 1), ty = clamp(fy - y0, 0, 1);
    var a = h[idx(x0, y0)], b = h[idx(x0 + 1, y0)];
    var c = h[idx(x0, y0 + 1)], d = h[idx(x0 + 1, y0 + 1)];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  /* ---------- 渲染 ---------- */
  var LX = -0.50, LY = -0.55, LZ = 0.67;   // 光源：左上方（屏幕 y 向下）

  function render() {
    if (!dirty) return;
    var gx0 = dirty.x0, gy0 = dirty.y0, gx1 = dirty.x1, gy1 = dirty.y1;
    dirty = null;

    // 格 -> 像素（并外扩，让光照的 2 格外扩也落到像素上）
    var sx = VW / GW, sy = VH / GH;
    var x0 = clamp(Math.floor(gx0 * sx) - 3, 0, VW);
    var y0 = clamp(Math.floor(gy0 * sy) - 3, 0, VH);
    var x1 = clamp(Math.ceil((gx1 + 1) * sx) + 3, 0, VW);
    var y1 = clamp(Math.ceil((gy1 + 1) * sy) + 3, 0, VH);
    var w = x1 - x0, hgt = y1 - y0;
    if (w <= 0 || hgt <= 0) return;

    var sub = ctx.createImageData(w, hgt);
    var p = sub.data;
    var t = time;

    for (var py = 0; py < hgt; py++) {
      var fy = (y0 + py) / sy;
      for (var pxi = 0; pxi < w; pxi++) {
        var fx = (x0 + pxi) / sx;

        var hv = hAt(fx, fy);
        var o = (py * w + pxi) * 4;

        // 箱内暗角：中心被灯照着，四角落进阴影，箱子才像有深度
        var vx = fx / GW - 0.5, vy = fy / GH - 0.5;
        var rr = (vx * vx + vy * vy) * 0.9;
        var vig = 1 - (rr > 0.10 ? (rr - 0.10) * 1.05 : 0);

        if (hv < WATER) {
          /* --- 水 --- */
          var depth = (WATER - hv) / WATER;              // 0 浅 -> 1 深
          var rp = Math.sin(fx * 0.55 + t * 1.15) * Math.cos(fy * 0.48 - t * 0.92);
          var ndl = clamp(0.70 + rp * 0.16, 0, 1);
          var spec = Math.pow(clamp(rp * 0.5 + 0.5, 0, 1), 6) * 0.6;

          // 浅水偏青，深水偏靛
          var wr = 0x3A + (0x74 - 0x3A) * (1 - depth);
          var wg = 0x5E + (0xA3 - 0x5E) * (1 - depth);
          var wb = 0x94 + (0xD2 - 0x94) * (1 - depth);
          var lit = (0.62 + ndl * 0.50) * (0.55 + vig * 0.45);   // 水面比沙面吃光少些
          wr *= lit; wg *= lit; wb *= lit;
          wr += spec * 255; wg += spec * 245; wb += spec * 235;

          // 浅水半透明：透出底下的沙
          var above = hAt(fx, fy - 1.2), below = hAt(fx, fy + 1.2);
          var slope = (above - below) * 0.5 * RELIEF;
          var sl = clamp(0.5 + slope * 0.30, 0, 1);
          var li = clamp(sl * (LUT_N - 1), 0, LUT_N - 1) | 0;
          var alpha = clamp(depth * 2.6, 0, 0.82);
          wr = wr * alpha + lutR[li] * (1 - alpha);
          wg = wg * alpha + lutG[li] * (1 - alpha);
          wb = wb * alpha + lutB[li] * (1 - alpha);

          p[o] = wr > 255 ? 255 : wr; p[o + 1] = wg > 255 ? 255 : wg; p[o + 2] = wb > 255 ? 255 : wb;
        } else {
          /* --- 沙 --- */
          var hL = hAt(fx - 1.1, fy), hR = hAt(fx + 1.1, fy);
          var hU = hAt(fx, fy - 1.1), hD = hAt(fx, fy + 1.1);
          var dx = (hR - hL) * 0.5 * RELIEF;
          var dy = (hD - hU) * 0.5 * RELIEF;

          // 法线 = normalize(-dx, -dy, 1)，再与光点乘
          var inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
          var ndl2 = (-dx * LX - dy * LY + LZ) * inv;
          var v = 0.20 + clamp(ndl2, 0, 1) * 0.68;

          // 沙粒：逐像素，细而匀，是质感不是起伏
          v += (pgrain[(y0 + py) * VW + (x0 + pxi)] / 255 - 0.5) * 0.055;
          v *= vig;
          v = clamp(v, 0, 1);

          var ci = (v * (LUT_N - 1)) | 0;
          p[o] = lutR[ci]; p[o + 1] = lutG[ci]; p[o + 2] = lutB[ci];
        }
        p[o + 3] = 255;
      }
    }
    ctx.putImageData(sub, x0, y0);
  }

  /* ---------- 主循环 ---------- */
  /* step 供外部驱动（沙盘页自己管 rAF，好把笔刷和投影刷新放进同一条帧里）；
     start/stop 留给独立使用。 */
  function step() {
    time += 1 / 60;
    relax();
    render();
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    step();
  }

  /* ---------- 对外 ---------- */
  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext("2d", { alpha: false });
    canvas.width = VW; canvas.height = VH;
    ctx.imageSmoothingEnabled = true;
    staticNoise();
    dirtyAll();
    render();
  }

  function reset() {
    staticNoise();
    dirtyAll();
    render();
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  return {
    init: init,
    reset: reset,
    start: start,
    stop: stop,
    step: step,
    poke: poke,
    heightAt: heightAt,
    markDirty: markDirty,
    dirtyAll: dirtyAll,
    GW: GW, GH: GH, WATER: WATER, H_INIT: H_INIT,
  };
})();
