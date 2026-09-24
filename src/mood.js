/* 心绪 · 情绪模型
 *
 * 情绪是连续量，不是六个选项。这里用效价(valence) × 唤醒度(arousal)
 * 的二维平面表示（Russell 环形模型）：v 从极不愉快到极愉快，a 从极
 * 平静到极激活。原来那六个情绪变成平面上的锚点，是快捷方式，不是
 * 取值集合。
 *
 * 旧的 intensity 滑杆取消了——在这个模型里「离中心的距离」就是强度，
 * 它是模型天然包含的维度，不是被砍掉的功能。
 *
 * 与安全层的接缝（改这个文件前先读 src/safety.js）：
 *   · legacyVal(v)  映射回旧的 1–5 量纲，lowStreak 的阈值 2 直接沿用，
 *                   低谷判定行为与旧模型逐条相同。
 *   · intensity(v,a) 映射回旧的 1–5 量纲，assess() 的 intensity>=5 沿用。
 *   · 每条记录必须带 date（由 ts 派生），safety.check/lowStreak 按它分组。
 * 这三条是危机识别的输入，不要为了让数字好看而改。
 */
(function (global) {
  'use strict';

  var CENTER = 0.5;
  var MAXD = Math.sqrt(2) * 0.5;      // 中心到角落的距离，用于强度归一

  /* ---------- 锚点 ---------- */
  /* 坐标是略带风格化的：焦虑与生气同属「低效价 + 高唤醒」，难过与疲惫
     同属「低效价 + 低唤醒」，纯靠这两维分不开。靠颜色和名字补足那点
     区分度。这是环形模型的固有局限，不是偷懒。 */
  /* v 值有一条硬约束：低谷阈值是 legacyVal(v)=1+4v ≤ 2，也就是 v ≤ 0.25。
     焦虑/难过/生气必须留在这条线以下，否则安全层的连续低谷判定会变。
     改这几个数之前先跑一遍 src/mood.js 顶部说的等价性测试。
     a 值可以随便调，只影响纵向分布。 */
  var ANCHORS = [
    { key: 'happy',   label: '开心', w: '晴',   c: '#F2C94C', v: 0.86, a: 0.78 },
    { key: 'calm',    label: '平静', w: '微风', c: '#7FB8E6', v: 0.78, a: 0.20 },
    { key: 'anxious', label: '焦虑', w: '阵雨', c: '#E88C5A', v: 0.24, a: 0.70 },
    { key: 'tired',   label: '疲惫', w: '阴',   c: '#8E8AA6', v: 0.40, a: 0.16 },
    { key: 'sad',     label: '难过', w: '雨',   c: '#6E8FD9', v: 0.15, a: 0.30 },
    { key: 'angry',   label: '生气', w: '雷雨', c: '#E07A6B', v: 0.08, a: 0.90 },
  ];

  /* ---------- 图标 ---------- */
  /* 手绘 SVG，不是 emoji。emoji 在 Windows / macOS / Android 上长得都不一样，
     而且跟沙盘那套手绘沙具是两个体系，摆在一起很突兀。
     全部用 currentColor，颜色由锚点自己的 c 给。 */
  var ICONS = {
    // 晴：圆太阳 + 八道短光
    happy:
      '<circle cx="32" cy="32" r="13" fill="currentColor"/>' +
      '<g stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none">' +
      '<path d="M32 6v8M32 50v8M6 32h8M50 32h8"/>' +
      '<path d="M13.5 13.5l5.7 5.7M44.8 44.8l5.7 5.7M50.5 13.5l-5.7 5.7M19.2 44.8l-5.7 5.7"/></g>',
    // 微风：太阳半躲在云后
    calm:
      '<circle cx="43" cy="21" r="11" fill="currentColor" opacity=".75"/>' +
      '<circle cx="19" cy="42" r="11" fill="currentColor"/>' +
      '<circle cx="33" cy="36" r="15" fill="currentColor"/>' +
      '<circle cx="47" cy="43" r="10" fill="currentColor"/>' +
      '<rect x="8" y="40" width="48" height="14" rx="7" fill="currentColor"/>',
    // 阵雨：云 + 小雨点 + 露一点太阳
    anxious:
      '<circle cx="45" cy="18" r="9" fill="currentColor" opacity=".75"/>' +
      '<circle cx="19" cy="34" r="11" fill="currentColor"/>' +
      '<circle cx="32" cy="28" r="14" fill="currentColor"/>' +
      '<circle cx="45" cy="35" r="10" fill="currentColor"/>' +
      '<rect x="8" y="32" width="48" height="14" rx="7" fill="currentColor"/>' +
      '<g stroke="currentColor" stroke-width="4.5" stroke-linecap="round">' +
      '<path d="M20 52v5M32 52v7M44 52v5"/></g>',
    // 阴：一朵圆云
    tired:
      '<circle cx="19" cy="34" r="11" fill="currentColor"/>' +
      '<circle cx="32" cy="28" r="15" fill="currentColor"/>' +
      '<circle cx="45" cy="35" r="10" fill="currentColor"/>' +
      '<rect x="8" y="32" width="48" height="14" rx="7" fill="currentColor"/>',
    // 雨：云 + 密雨点
    sad:
      '<circle cx="19" cy="28" r="11" fill="currentColor"/>' +
      '<circle cx="32" cy="22" r="15" fill="currentColor"/>' +
      '<circle cx="45" cy="29" r="10" fill="currentColor"/>' +
      '<rect x="8" y="26" width="48" height="14" rx="7" fill="currentColor"/>' +
      '<g stroke="currentColor" stroke-width="4.5" stroke-linecap="round">' +
      '<path d="M16 46v6M26 48v8M37 48v8M47 46v6"/></g>',
    // 雷雨：云 + 闪电
    angry:
      '<circle cx="19" cy="27" r="11" fill="currentColor"/>' +
      '<circle cx="32" cy="21" r="15" fill="currentColor"/>' +
      '<circle cx="45" cy="28" r="10" fill="currentColor"/>' +
      '<rect x="8" y="25" width="48" height="14" rx="7" fill="currentColor"/>' +
      '<path d="M35 42L24 56h7l-3 10 12-15h-7z" fill="currentColor"/>',
  };

  /* 尺寸走行内样式，不用 width/height 属性——CSS 里的规则会盖掉属性，
     之前图标被压到 1.15em 就是栽在这上面。装饰（底盘、对齐）留给 CSS。 */
  function icon(key, size) {
    var m = byKey(key);
    if (!m || !ICONS[key]) return '';
    var n = size || 18;
    return '<svg class="xm-ico" viewBox="0 0 64 64" aria-hidden="true"' +
           ' style="color:' + m.c + ';width:' + n + 'px;height:' + n + 'px">' +
           ICONS[key] + '</svg>';
  }

  /* 旧 intensity(1–5) 迁移时的收敛系数：只作用在唤醒度上。
     效价绝不能跟着收缩——若那样，把「焦虑·强度3」往中心拉会得到
     v≈0.27，legacyVal 2.08，越过低谷阈值 2，安全层就会少判一个低谷日。
     旧模型的 intensity 表达的是「这个感受有多强」，在 VA 里对应的是
     激活程度，本来就不是效价。 */
  var STRENGTH = [0.45, 0.65, 0.82, 0.92, 1.0];

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function num(x, d) { var n = Number(x); return isFinite(n) ? n : d; }

  function byKey(k) {
    for (var i = 0; i < ANCHORS.length; i++) if (ANCHORS[i].key === k) return ANCHORS[i];
    return null;
  }

  function dist(v, a) {
    var dx = v - CENTER, dy = a - CENTER;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function nearest(v, a) {
    var best = null, bd = Infinity;
    for (var i = 0; i < ANCHORS.length; i++) {
      var m = ANCHORS[i];
      var d = (m.v - v) * (m.v - v) + (m.a - a) * (m.a - a);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /* 颜色取最近锚点的颜色，和日历、日记列表保持一致 */
  function colorOf(v, a) { var m = nearest(v, a); return m ? m.c : '#9C94B4'; }

  /* ---------- 与安全层的两个换算 ---------- */
  /* 都是回到旧的 1–5 量纲。不要改这两个函数的取值范围，
     改了等于悄悄改了危机识别的灵敏度。 */
  function legacyVal(v) { return 1 + clamp01(num(v, CENTER)) * 4; }
  function intensity(v, a) { return 1 + (dist(num(v, CENTER), num(a, CENTER)) / MAXD) * 4; }

  /* ---------- 由位置推陪伴语 ---------- */
  function careOf(v, a) {
    v = num(v, CENTER); a = num(a, CENTER);
    if (v < CENTER && a >= CENTER) return '先慢下来，做一轮呼吸，让心跳停一停';
    if (v < CENTER && a < CENTER)  return '允许自己休息，缓一缓不是偷懒';
    if (v >= CENTER && a >= CENTER) return '给自己一点小奖励，把开心也记下来';
    return '平静很好，趁此刻做点想做的事';
  }

  /* 阈值定在这里，是为了让旧数据的 intensity 1–5 迁过来之后仍然单调：
     1→轻、2→中、3→中、4→强、5→强。定太靠外的话，锚点本身落在
     0.57–0.71 之间，连「难过·强度5」都会被读成「中」。 */
  function strengthLabel(v, a) {
    var d = dist(num(v, CENTER), num(a, CENTER)) / MAXD;
    return d < 0.28 ? '轻' : d < 0.52 ? '中' : '强';
  }

  /* ---------- 时间 ---------- */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function ymdOf(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function hmOf(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function todayStr() { return ymdOf(Date.now()); }

  /* ---------- 迁移 v1 → v2 ---------- */
  /* 旧记录是 {date, mood, intensity}，新记录是 {ts, date, v, a}。
     date 必须留下——安全层按它分组数低谷连续天数。 */
  function migrate(list) {
    var out = [];
    (list || []).forEach(function (e) {
      if (!e) return;
      if (e.v != null && e.a != null) { out.push(e); return; }   // 已经是新格式
      var m = byKey(e.mood) || byKey('calm');
      var k = STRENGTH[Math.min(5, Math.max(1, Math.round(num(e.intensity, 3)))) - 1];
      var ts = num(e.id, null) || (e.date ? new Date(e.date + 'T12:00:00').getTime() : Date.now());
      out.push({
        id: ts,
        ts: ts,
        date: e.date || ymdOf(ts),
        v: m.v,                                   // 效价原样保留，见 STRENGTH 处的说明
        a: clamp01(CENTER + (m.a - CENTER) * k),  // 只有唤醒度随强度向中心收缩
        note: e.note || '',
        tags: e.tags || [],
        from: e.from,
        scene: e.scene,
        migrated: true
      });
    });
    return out;
  }

  /* ================= 读写 ================= */
  /* 两个页面都走这里。如果让各自写一份，「先从哪个页面打开」就会导致
     迁移跑不跑得起来不一样——沙盘先写入 v2 的话，v1 的旧日记就再也
     迁不过来，用户的记录会静默丢掉。 */
  var ENTRIES_KEY = 'xinxu.entries.v2';
  var ENTRIES_KEY_V1 = 'xinxu.entries.v1';

  /* 判据是「v2 这个键在不在」，不是「里面有没有内容」。
     若用后者，用户把日记清空之后，v1 的旧数据会被重新迁进来——
     删掉的东西自己长回来，这比不迁移糟糕得多。 */
  function loadEntries() {
    var raw = null;
    try { raw = global.localStorage.getItem(ENTRIES_KEY); } catch (e) {}
    if (raw !== null) {
      var list = [];
      try { list = JSON.parse(raw); } catch (e) { list = []; }
      return { entries: migrate(Array.isArray(list) ? list : []), migrated: 0 };
    }
    var old = [];
    try { old = JSON.parse(global.localStorage.getItem(ENTRIES_KEY_V1) || '[]'); } catch (e) { old = []; }
    var out = Array.isArray(old) ? migrate(old) : [];
    saveEntries(out);                 // 落下 v2 键，迁移只跑这一次
    return { entries: out, migrated: out.length };
  }

  function saveEntries(list) {
    try {
      global.localStorage.setItem(ENTRIES_KEY, JSON.stringify(list || []));
      return true;
    } catch (e) { return false; }
  }

  /* 追加一条并保持倒序 */
  function appendEntry(entry) {
    var list = loadEntries().entries;
    list.unshift(entry);
    list.sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); });
    saveEntries(list);
    return list;
  }

  /* ================= 打卡面板 ================= */

  var STYLE_ID = 'xm-style';
  function injectStyle() {
    var doc = global.document;
    if (doc.getElementById(STYLE_ID)) return;
    var s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.xm-wrap{user-select:none;-webkit-user-select:none}',
      '.xm-field{position:relative;width:100%;aspect-ratio:1/1;max-height:330px;border-radius:18px;',
      'border:1px solid #3B3358;overflow:hidden;touch-action:none;cursor:crosshair;',
      /* 三层：中心中性区 → 低唤醒压暗 → 效价从冷到暖 */
      'background:',
      'radial-gradient(circle at 50% 50%, rgba(34,29,54,.62), rgba(34,29,54,.20) 48%, transparent 70%),',
      'linear-gradient(0deg, rgba(18,14,32,.62) 0%, rgba(18,14,32,0) 62%),',
      'linear-gradient(90deg, #5E6FA8 0%, #7A7296 32%, #9C8674 62%, #D9A05B 100%)}',
      '.xm-axis{position:absolute;pointer-events:none;font-size:.6rem;color:rgba(241,236,225,.42);',
      'letter-spacing:1px;white-space:nowrap}',
      '.xm-axis.top{top:6px;left:50%;transform:translateX(-50%)}',
      '.xm-axis.bot{bottom:6px;left:50%;transform:translateX(-50%)}',
      '.xm-axis.l{left:7px;top:50%;transform:translateY(-50%)}',
      '.xm-axis.r{right:7px;top:50%;transform:translateY(-50%)}',

      '.xm-pa{position:absolute;left:var(--x);top:var(--y);transform:translate(-50%,-50%);',
      'display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 9px;',
      'border:1px solid transparent;border-radius:14px;background:transparent;cursor:pointer;',
      'font-family:inherit;font-size:.64rem;color:rgba(241,236,225,.9);transition:.15s;',
      'text-shadow:0 1px 3px rgba(0,0,0,.75);letter-spacing:.5px}',
      '.xm-pa:hover{background:rgba(34,29,54,.62);border-color:rgba(241,236,225,.3)}',
      '.xm-ico{display:inline-block;vertical-align:-.18em}',
      /* 深色圆底盘。没有它的话，开心那个琥珀色太阳压在琥珀色背景上
         几乎看不见——同色相碰必然低对比。顺带也让锚点更像可点的按钮。 */
      '.xm-pa .xm-ico{display:block;padding:7px;border-radius:50%;',
      'background:rgba(28,22,44,.62);box-sizing:content-box;',
      'box-shadow:0 2px 7px rgba(8,5,18,.5),inset 0 1px 0 rgba(255,255,255,.07)}',
      '.xm-compact .xm-pa .xm-ico{padding:5px}',
      /* 紧凑模式（模态里的窄面板）：只留图标。锚点之间本来就近，
         在窄面板里文字标签会互相压住。读数行仍然会报出名字。 */
      '.xm-compact .xm-pa span{display:none}',
      '.xm-compact .xm-pa{padding:5px;border-radius:12px}',
      '.xm-pa[aria-pressed="true"]{background:rgba(34,29,54,.72);border-color:var(--c);color:#F1ECE1}',
      '.xm-pa:focus-visible{outline:2px solid #F0B36A;outline-offset:2px}',

      '.xm-dot{position:absolute;left:var(--x);top:var(--y);width:20px;height:20px;border-radius:50%;',
      'transform:translate(-50%,-50%);pointer-events:none;',
      'background:var(--c,#F1ECE1);box-shadow:0 0 0 3px rgba(34,29,54,.75),0 0 16px 2px var(--c,#F1ECE1);',
      'transition:left .18s cubic-bezier(.2,.7,.2,1),top .18s cubic-bezier(.2,.7,.2,1)}',
      '.xm-field.untouched .xm-dot{opacity:.45}',

      '.xm-read{display:flex;align-items:center;gap:10px;margin-top:11px;font-size:.84rem}',
      '.xm-read b{font-family:"Noto Serif SC","Songti SC",serif;font-weight:600}',
      '.xm-read .xm-s{color:#9C94B4;font-size:.76rem;white-space:nowrap}',
      '.xm-bar{flex:1;height:5px;border-radius:99px;background:#3B3358;overflow:hidden}',
      '.xm-bar i{display:block;height:100%;border-radius:99px;background:var(--c,#F0B36A);',
      'transition:width .18s ease,background .18s ease}'
    ].join('');
    doc.head.appendChild(s);
  }

  /* Pad(host, opts)
     host: 容器元素；opts: { v, a, onChange(v,a) }
     返回 { get(), set(v,a), touched() } */
  function Pad(host, opts) {
    opts = opts || {};
    injectStyle();

    var state = {
      v: opts.v != null ? clamp01(opts.v) : CENTER,
      a: opts.a != null ? clamp01(opts.a) : CENTER,
      on: opts.v != null
    };
    var moving = false;

    host.classList.add('xm-wrap');
    host.innerHTML = '';

    var field = document.createElement('div');
    field.className = 'xm-field' + (state.on ? '' : ' untouched') + (opts.compact ? ' xm-compact' : '');

    ['top:激活', 'bot:平静', 'l:不愉快', 'r:愉快'].forEach(function (spec) {
      var p = spec.split(':');
      var n = document.createElement('span');
      n.className = 'xm-axis ' + p[0];
      n.textContent = p[1];
      field.appendChild(n);
    });

    ANCHORS.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'xm-pa';
      b.setAttribute('aria-pressed', 'false');
      b.dataset.k = m.key;
      b.style.setProperty('--x', (m.v * 100) + '%');
      b.style.setProperty('--y', ((1 - m.a) * 100) + '%');
      b.style.setProperty('--c', m.c);
      b.innerHTML = icon(m.key, 24) + '<span>' + m.label + '</span>';
      b.onclick = function (e) { e.preventDefault(); set(m.v, m.a, true); };
      field.appendChild(b);
    });

    var dot = document.createElement('div');
    dot.className = 'xm-dot';
    field.appendChild(dot);

    var read = document.createElement('div');
    read.className = 'xm-read';
    read.innerHTML = '<b id="xm-n">—</b><span class="xm-s" id="xm-s"></span>' +
                     '<span class="xm-bar"><i id="xm-i"></i></span>';
    host.appendChild(field);
    host.appendChild(read);

    var elN = read.querySelector('#xm-n'),
        elS = read.querySelector('#xm-s'),
        elI = read.querySelector('#xm-i');

    function paint(fromUser) {
      var m = nearest(state.v, state.a);
      dot.style.setProperty('--x', (state.v * 100) + '%');
      dot.style.setProperty('--y', ((1 - state.a) * 100) + '%');
      dot.style.setProperty('--c', m.c);
      elN.innerHTML = state.on ? icon(m.key, 18) + ' ' + m.label : '还没定位';
      elN.style.color = state.on ? m.c : 'var(--muted)';
      elS.textContent = state.on ? strengthLabel(state.v, state.a) : '';
      elI.style.width = (dist(state.v, state.a) / MAXD * 100) + '%';
      elI.style.setProperty('--c', m.c);
      field.classList.toggle('untouched', !state.on);
      field.querySelectorAll('.xm-pa').forEach(function (b) {
        b.setAttribute('aria-pressed', String(state.on && b.dataset.k === m.key));
      });
      if (fromUser && opts.onChange) opts.onChange(state.v, state.a);
    }

    function set(v, a, fromUser) {
      state.v = clamp01(v); state.a = clamp01(a); state.on = true;
      paint(fromUser);
    }

    function fromEvent(e) {
      var r = field.getBoundingClientRect();
      set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, true);
    }

    field.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.xm-pa')) return;      // 锚点自己处理
      moving = true;
      try { field.setPointerCapture(e.pointerId); } catch (err) {}
      fromEvent(e);
      e.preventDefault();
    });
    field.addEventListener('pointermove', function (e) { if (moving) fromEvent(e); });
    function stop() { moving = false; }
    field.addEventListener('pointerup', stop);
    field.addEventListener('pointercancel', stop);

    paint(false);

    return {
      get: function () { return { v: state.v, a: state.a }; },
      set: function (v, a) { set(v, a, false); },
      touched: function () { return state.on; },
      /* 存完复位。留着上一次的点，容易让人顺手再存一条重复的。 */
      reset: function () { state.v = CENTER; state.a = CENTER; state.on = false; paint(false); }
    };
  }

  global.XinxuMood = {
    ANCHORS: ANCHORS,
    CENTER: CENTER,
    byKey: byKey,
    icon: icon,
    nearest: nearest,
    colorOf: colorOf,
    careOf: careOf,
    strengthLabel: strengthLabel,
    dist: dist,
    legacyVal: legacyVal,
    intensity: intensity,
    migrate: migrate,
    loadEntries: loadEntries,
    saveEntries: saveEntries,
    appendEntry: appendEntry,
    ENTRIES_KEY: ENTRIES_KEY,
    ymdOf: ymdOf,
    hmOf: hmOf,
    todayStr: todayStr,
    Pad: Pad
  };
})(window);
