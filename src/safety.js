/* 心绪 · 安全识别与提醒
 *
 * assess() 是纯函数：给一段文字和上下文，返回风险等级。可以单独测。
 *
 * 一条底线：这里永远不会自动发送任何东西。
 * 无论识别到什么，是否联系别人、什么时候联系，都由用户自己按下。
 */
(function (global) {
  'use strict';

  var C = global.XinxuSafetyContent;
  var V = global.XinxuVault;
  var TERMS = C.RISK_TERMS;
  var STYLE_ID = 'xs-style';

  function el(tag, cls, text) {
    var n = global.document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- 匹配 ---------- */

  /* 「想死你了」「想死我了」是思念，不是风险，跳过。
     词表里只有「想死」带「死」字，中文常见的「笑死 / 累死 / 烦死」
     根本不在这张表里，不会误命中。 */
  function isEndearment(text, at, len) {
    if (text.slice(at, at + len).indexOf('死') === -1) return false;
    var after = text.charAt(at + len);
    return after === '你' || after === '我';
  }

  function matchTerms(text, list) {
    var hits = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var from = 0, at;
      while ((at = text.indexOf(t, from)) !== -1) {
        from = at + 1;
        if (isEndearment(text, at, t.length)) continue;
        hits.push(t);
        break;
      }
    }
    return hits;
  }

  /* ---------- 判定 ---------- */

  /* 返回 { level: 'none' | 'elevated' | 'urgent', reasons: [] }
     单一弱信号不触发任何东西——压误报比抓全更重要。
     误报毁掉的是信任本身：一个人被产品背刺过一次，就再也不会在里面写真话了。 */
  function assess(text, ctx) {
    ctx = ctx || {};
    text = String(text || '');
    if (!text.trim()) return { level: 'none', reasons: [] };

    var strong = matchTerms(text, TERMS.strong);
    if (strong.length) return { level: 'urgent', reasons: ['strong:' + strong.join('/')] };

    var weak = matchTerms(text, TERMS.weak);
    if (!weak.length) return { level: 'none', reasons: [] };

    var intensity = Number(ctx.intensity) || 0;
    var streak = Number(ctx.lowStreak) || 0;

    // 弱信号要叠加了强度或反复出现，才值得打扰用户一次
    var escalated = weak.length >= 2 || intensity >= 5 || streak >= 3;
    if (!escalated) return { level: 'none', reasons: [] };

    var urgent = (weak.length >= 2 && intensity >= 5) || streak >= 4;
    return {
      level: urgent ? 'urgent' : 'elevated',
      reasons: ['weak:' + weak.join('/'), 'intensity:' + intensity, 'lowStreak:' + streak]
    };
  }

  /* ---------- 情绪低谷连续天数 ---------- */

  function ymd(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  /* 从 opts.from 往回数，连续多少天情绪值不高于阈值。
     怎么取值得由调用方给（safety.js 不需要知道心情有哪几种）。
     opts: { from, valueOf, threshold = 2, max = 7 } */
  function lowStreak(entries, opts) {
    opts = opts || {};
    if (!opts.from || !entries || !entries.length) return 0;

    var valueOf = opts.valueOf || function (e) { return e.val; };
    var threshold = opts.threshold != null ? opts.threshold : 2;
    var max = opts.max || 7;

    // 一天记了多条时取最低的那条：判断连续低谷，那天最差的状态才是信号
    var byDate = {};
    for (var i = 0; i < entries.length; i++) {
      var cur = entries[i];
      if (!cur || !cur.date) continue;
      var prev = byDate[cur.date];
      if (!prev || Number(valueOf(cur)) < Number(valueOf(prev))) byDate[cur.date] = cur;
    }

    var streak = 0;
    var d = new Date(opts.from + 'T00:00:00');
    for (var n = 0; n < max; n++) {
      var e = byDate[ymd(d)];
      if (!e) break;                                   // 中间断了就不算连续
      if (!(Number(valueOf(e)) <= threshold)) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  /* ---------- 保存后的检查 ---------- */

  /* 在用户保存一条日记之后调用。同一天最多打扰一次。 */
  function check(entry, ctx) {
    if (!entry || !entry.date) return false;
    if (V.promptedToday(entry.date)) return false;

    var r = assess(entry.note, ctx);
    if (r.level === 'none') return false;

    V.markPrompted(entry.date);
    show(r);
    return true;
  }

  /* ---------- 提醒弹层 ---------- */

  function show(result) {
    injectStyle();
    var doc = global.document;
    var contact = V.getContact();

    var mask = el('div', 'xs-mask');
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', '安全提醒');

    var card = el('div', 'xs-card');

    card.appendChild(el('h3', 'xs-h3', '刚才那段话，我有点在意'));

    // 不判定、不说教。说清产品分不清什么，把判断权交回去。
    card.appendChild(el('p', 'xs-p',
      '我不做判断，也分不清你是在写歌词、写气话，还是真的撑不住了。' +
      '所以不猜，只是把几个出口放在这里——用不用，都由你。'));

    var tel = el('ul', 'xs-tel');
    C.HOTLINES.forEach(function (h) {
      var li = el('li');
      var a = el('a', 'xs-a', h.name + ' ' + h.tel);
      a.href = 'tel:' + String(h.tel).replace(/[^0-9+]/g, '');
      li.appendChild(a);
      li.appendChild(el('span', 'xs-n', h.note));
      tel.appendChild(li);
    });
    card.appendChild(tel);

    if (contact && contact.phone) {
      card.appendChild(el('p', 'xs-p xs-contact',
        '你留过的联系人：' + contact.name + (contact.relation ? '（' + contact.relation + '）' : '')));

      var callLink = el('a', 'xs-btn primary', '现在打给 ' + contact.name);
      callLink.href = 'tel:' + String(contact.phone).replace(/[^0-9+]/g, '');
      card.appendChild(callLink);
    } else {
      card.appendChild(el('p', 'xs-p xs-contact',
        '你还没有留紧急联系人。要留的话在「安全与支持」里，随时可以填。'));
    }

    var bar = el('div', 'xs-actions');
    var dismiss = el('button', 'xs-btn', '我没事');
    dismiss.type = 'button';
    bar.appendChild(dismiss);
    card.appendChild(bar);

    card.appendChild(el('p', 'xs-foot', '心绪不会替你联系任何人。要不要说、跟谁说，永远由你自己决定。'));

    mask.appendChild(card);
    doc.body.appendChild(mask);

    function close() {
      mask.remove();
      doc.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    dismiss.onclick = close;
    mask.onclick = function (e) { if (e.target === mask) close(); };
    doc.addEventListener('keydown', onKey);
    setTimeout(function () { dismiss.focus(); }, 60);
  }

  /* ---------- 样式 ---------- */

  function injectStyle() {
    var doc = global.document;
    if (doc.getElementById(STYLE_ID)) return;

    var s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.xs-mask{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;',
      'padding:20px;overflow:auto;background:rgba(34,29,54,.86);backdrop-filter:blur(6px);',
      'color:#F1ECE1;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;',
      'line-height:1.7;-webkit-font-smoothing:antialiased}',

      '.xs-card{width:100%;max-width:440px;background:#2A2440;border:1px solid #3B3358;border-radius:22px;',
      'padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.5);animation:xs-in .28s ease both}',
      '@keyframes xs-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion:reduce){.xs-card{animation:none}}',

      '.xs-h3{font-family:"Noto Serif SC","Songti SC",serif;font-size:1.12rem;font-weight:700;margin-bottom:9px;line-height:1.5}',
      '.xs-p{font-size:.87rem;color:#F1ECE1;margin-bottom:12px}',

      '.xs-tel{list-style:none;margin:0 0 14px;padding:13px 15px;border-radius:16px;background:#221D36}',
      '.xs-tel li{margin-bottom:9px;font-size:.86rem}',
      '.xs-tel li:last-child{margin-bottom:0}',
      '.xs-a{color:#F0B36A;text-decoration:none;font-weight:600;border-bottom:1px solid rgba(240,179,106,.35)}',
      '.xs-a:hover{border-bottom-color:#F0B36A}',
      '.xs-n{display:block;font-size:.74rem;color:#6E6786}',

      '.xs-contact{color:#9C94B4;font-size:.83rem}',
      '.xs-actions{display:flex;gap:10px;margin-top:6px}',
      '.xs-btn{display:block;flex:1;text-align:center;text-decoration:none;border:1px solid #3B3358;',
      'background:#332C4E;color:#F1ECE1;border-radius:16px;padding:12px 16px;font-size:.9rem;',
      'font-family:inherit;cursor:pointer;transition:filter .2s,transform .1s}',
      '.xs-btn:hover{filter:brightness(1.12)}',
      '.xs-btn:active{transform:translateY(1px)}',
      '.xs-btn.primary{background:#F0B36A;border-color:#F0B36A;color:#221D36;font-weight:600;margin-bottom:10px}',

      '.xs-foot{margin-top:14px;font-size:.75rem;color:#6E6786;line-height:1.6}'
    ].join('');

    doc.head.appendChild(s);
  }

  global.XinxuSafety = {
    assess: assess,
    lowStreak: lowStreak,
    check: check,
    show: show
  };
})(window);
