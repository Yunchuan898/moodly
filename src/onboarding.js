/* 心绪 · 首次进入
 *
 * 三步遮罩：注册 / 登录 → 安全须知 → 最信任的人。
 * 也负责渲染安全须知正文（renderNoticeInto），供「安全与支持」面板复用，
 * 避免同一份须知出现两处措辞。
 */
(function (global) {
  'use strict';

  var V = global.XinxuVault;
  var C = global.XinxuSafetyContent;

  var STYLE_ID = 'xo-style';

  /* ---------- 小工具 ---------- */

  function el(tag, cls, text) {
    var n = global.document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function field(host, label, opts) {
    opts = opts || {};
    var row = el('label', 'xo-field');
    row.appendChild(el('span', 'xo-label', label));
    var input = el('input', 'xo-input');
    input.type = opts.type || 'text';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.maxlength) input.maxLength = opts.maxlength;
    if (opts.inputmode) input.inputMode = opts.inputmode;
    row.appendChild(input);
    host.appendChild(row);
    return input;
  }

  function button(host, label, kind) {
    var b = el('button', 'xo-btn' + (kind ? ' ' + kind : ''), label);
    b.type = 'button';
    host.appendChild(b);
    return b;
  }

  /* ---------- 须知正文 ---------- */

  /* 正文只有这一份。onboarding 与 support 都调它，改文案改一处就够。 */
  function renderNoticeInto(host) {
    host.textContent = '';

    C.NOTICE_SECTIONS.forEach(function (sec) {
      var s = el('section', 'xo-sec');
      s.appendChild(el('h3', 'xo-sec-t', sec.title));

      (sec.paras || []).forEach(function (p) {
        s.appendChild(el('p', 'xo-p', p));
      });

      if (sec.hotlines) {
        var ul = el('ul', 'xo-tel');
        C.HOTLINES.forEach(function (h) {
          var li = el('li', 'xo-tel-i');
          var a = el('a', 'xo-tel-a', h.name + ' ' + h.tel);
          a.href = 'tel:' + String(h.tel).replace(/[^0-9+]/g, '');
          li.appendChild(a);
          li.appendChild(el('span', 'xo-tel-n', h.note));
          ul.appendChild(li);
        });
        s.appendChild(ul);
      }

      if (sec.callout) {
        var c = el('div', 'xo-callout');
        c.appendChild(el('b', null, sec.callout.label));
        c.appendChild(el('p', null, sec.callout.text));
        s.appendChild(c);
      }

      if (sec.tail) s.appendChild(el('p', 'xo-p xo-tail', sec.tail));

      host.appendChild(s);
    });
  }

  /* ---------- 第一步 · 注册 ---------- */

  function renderRegisterStep(done) {
    var wrap = el('div', 'xo-step');
    wrap.appendChild(el('h2', 'xo-h2', '先给这个空间起个名字'));
    wrap.appendChild(el('p', 'xo-lead', '这是你自己的地方。设一个称呼和口令，下次回来用它打开。'));

    var name = field(wrap, '怎么称呼你', { placeholder: '昵称', maxlength: 20 });
    var pass = field(wrap, '口令', { type: 'password', placeholder: '至少 4 位', maxlength: 64 });

    var show = el('label', 'xo-check');
    var showBox = el('input');
    showBox.type = 'checkbox';
    show.appendChild(showBox);
    show.appendChild(el('span', null, '显示口令'));
    wrap.appendChild(show);
    showBox.onchange = function () { pass.type = showBox.checked ? 'text' : 'password'; };

    wrap.appendChild(el('p', 'xo-note',
      '账号只存在这台设备的浏览器里。换设备、清空浏览器数据，它和记录都会一起消失。'));

    var err = el('p', 'xo-err');
    err.hidden = true;
    wrap.appendChild(err);

    var bar = el('div', 'xo-actions');
    wrap.appendChild(bar);
    var go = button(bar, '继续', 'primary');

    function submit() {
      err.hidden = true;
      go.disabled = true;
      V.register(name.value, pass.value).then(function (res) {
        go.disabled = false;
        if (!res.ok) { err.textContent = res.error; err.hidden = false; return; }
        done();
      });
    }

    go.onclick = submit;
    name.onkeydown = function (e) { if (e.key === 'Enter') pass.focus(); };
    pass.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    setTimeout(function () { name.focus(); }, 60);
    return wrap;
  }

  /* ---------- 第一步 · 登录 ---------- */

  /* 口令只在「进入程序」时问一次。
     之前是每次加载页面都问——从首页点进沙盘、再点进对话，每换一次页面
     就要重输一次，像是每隔五分钟被门卫拦一回。

     用带时效的 localStorage 而不是 sessionStorage：后者不跨标签页，
     新开一个标签又会问一遍。12 小时够覆盖一次连续使用，
     也不会把「已解锁」永久留在机器上。

     顺带说清：这不降低任何实际安全性。这个口令本来就不是防护——
     vault.js 顶部自己写了「指望它保护数据是不现实的」。它的作用是
     归属感，不是门锁。既然是归属感，就不该让人每换一页就重新证明一次。 */
  var UNLOCK_KEY = 'xinxu.unlocked.v1';
  var UNLOCK_TTL = 12 * 3600 * 1000;

  function unlocked() {
    try {
      var t = Number(global.localStorage.getItem(UNLOCK_KEY) || 0);
      return t > 0 && (Date.now() - t) < UNLOCK_TTL;
    } catch (e) { return false; }
  }
  function markUnlocked() {
    try { global.localStorage.setItem(UNLOCK_KEY, String(Date.now())); } catch (e) {}
  }
  function clearUnlocked() {
    try { global.localStorage.removeItem(UNLOCK_KEY); } catch (e) {}
  }

  function renderUnlockStep(done) {
    var acct = V.getAccount();
    var wrap = el('div', 'xo-step');
    wrap.appendChild(el('h2', 'xo-h2', '欢迎回来，' + acct.nickname));
    wrap.appendChild(el('p', 'xo-lead', '输入口令，回到你的记录。'));

    var pass = field(wrap, '口令', { type: 'password', maxlength: 64 });

    var err = el('p', 'xo-err');
    err.hidden = true;
    wrap.appendChild(err);

    var bar = el('div', 'xo-actions');
    wrap.appendChild(bar);
    var go = button(bar, '进入', 'primary');

    var forgot = el('button', 'xo-link', '忘记口令？');
    forgot.type = 'button';
    wrap.appendChild(forgot);
    forgot.onclick = function () { confirmWipe(wrap); };

    function submit() {
      err.hidden = true;
      go.disabled = true;
      V.login(acct.nickname, pass.value).then(function (res) {
        go.disabled = false;
        if (!res.ok) { err.textContent = res.error; err.hidden = false; pass.select(); return; }
        markUnlocked();
        done();
      });
    }

    go.onclick = submit;
    pass.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    setTimeout(function () { pass.focus(); }, 60);
    return wrap;
  }

  /* 本地没有找回口令的途径。必须给出出口，否则用户会被自己的数据锁在门外——
     但要让人清楚这是销毁，不是重置。
     「安全与支持」面板也调这个，销毁确认只此一份。 */
  function confirmWipe(host, onConfirm) {
    if (host.querySelector('.xo-danger')) return;

    var box = el('div', 'xo-danger');
    box.appendChild(el('b', null, '本地没有办法找回口令'));
    box.appendChild(el('p', null,
      '口令只以哈希形式存在这台设备上，我们没有服务端可以帮你重置。' +
      '唯一的出路是清除本机全部数据——包括你写过的情绪日记和沙盘。清除后无法恢复。'));

    var row = el('label', 'xo-field');
    row.appendChild(el('span', 'xo-label', '输入「清空」以确认'));
    var input = el('input', 'xo-input');
    input.placeholder = '清空';
    row.appendChild(input);
    box.appendChild(row);

    var bar = el('div', 'xo-actions');
    var cancel = el('button', 'xo-btn', '再想想');
    cancel.type = 'button';
    var wipe = el('button', 'xo-btn danger', '清除全部数据');
    wipe.type = 'button';
    wipe.disabled = true;
    bar.appendChild(cancel);
    bar.appendChild(wipe);
    box.appendChild(bar);

    input.oninput = function () { wipe.disabled = input.value.trim() !== '清空'; };
    cancel.onclick = function () { box.remove(); };
    wipe.onclick = function () {
      V.clearAll();
      clearUnlocked();   // 数据没了，解锁状态也不该留着
      if (onConfirm) onConfirm();
      else global.location.reload();   // 回到干净的引导流程
    };

    host.appendChild(box);
    input.focus();
  }

  /* ---------- 第二步 · 安全须知 ---------- */

  function renderNoticeStep(done) {
    var wrap = el('div', 'xo-step xo-wide');
    wrap.appendChild(el('h2', 'xo-h2', '开始之前，有几件事想让你知道'));
    wrap.appendChild(el('p', 'xo-lead', '请读到底。读完才能继续——这是你应得的知情权。'));

    var scroll = el('div', 'xo-notice');
    renderNoticeInto(scroll);
    wrap.appendChild(scroll);

    var check = el('label', 'xo-check xo-locked');
    var box = el('input');
    box.type = 'checkbox';
    box.disabled = true;
    check.appendChild(box);
    check.appendChild(el('span', null, '我已读完，并理解上面写的内容'));
    wrap.appendChild(check);

    var bar = el('div', 'xo-actions');
    wrap.appendChild(bar);
    var go = button(bar, '同意并继续', 'primary');
    go.disabled = true;

    function unlock() {
      if (!box.disabled) return;
      box.disabled = false;
      check.classList.remove('xo-locked');
    }

    scroll.onscroll = function () {
      if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 8) unlock();
    };
    // 屏幕够高、内容不用滚时也得能解锁，否则用户会被卡死在这一步
    setTimeout(function () {
      if (scroll.scrollHeight <= scroll.clientHeight + 8) unlock();
    }, 80);

    box.onchange = function () { go.disabled = !box.checked; };
    go.onclick = function () { V.recordConsent(); done(); };
    return wrap;
  }

  /* ---------- 第三步 · 最信任的人 ---------- */

  function renderContactStep(done) {
    var wrap = el('div', 'xo-step');
    wrap.appendChild(el('h2', 'xo-h2', '如果有一天你不太好，希望谁被通知？'));
    wrap.appendChild(el('p', 'xo-lead',
      '留一个你信得过的人。这条信息只存在本机，也只在你自己打开「安全与支持」时才会出现。'));

    var name = field(wrap, 'TA 怎么称呼', { placeholder: '名字或昵称', maxlength: 20 });
    var rel = field(wrap, 'TA 是你的', { placeholder: '朋友 / 家人 / 伴侣…', maxlength: 20 });
    var phone = field(wrap, '联系电话', { placeholder: '手机号', inputmode: 'tel', maxlength: 24 });

    wrap.appendChild(el('p', 'xo-note',
      '心绪不会自动联系任何人。要不要说、什么时候说，永远由你自己决定。'));

    var err = el('p', 'xo-err');
    err.hidden = true;
    wrap.appendChild(err);

    var bar = el('div', 'xo-actions');
    wrap.appendChild(bar);
    var skip = button(bar, '暂时不填');
    var save = button(bar, '保存', 'primary');

    save.onclick = function () {
      var c = { name: name.value.trim(), relation: rel.value.trim(), phone: phone.value.trim() };
      var any = c.name || c.relation || c.phone;
      if (any && (!c.name || !c.phone)) {
        err.textContent = '至少填上个称呼和电话，不然真到那天找不到人';
        err.hidden = false;
        return;
      }
      V.updateContact(any ? c : null);
      done();
    };

    skip.onclick = function () { V.updateContact(null); done(); };
    return wrap;
  }

  /* ---------- 流程控制 ---------- */

  function buildSteps() {
    var firstRun = !V.hasConsented();
    var steps = [];

    /* 换页面不等于重新进门。已解锁就什么都不加，mount() 会直接把内容放出来。 */
    if (!V.hasAccount()) {
      steps.push({ render: renderRegisterStep });
    } else if (!unlocked()) {
      steps.push({ render: renderUnlockStep });
    }

    // 联系人只在第一次问一遍。跳过就不再追问——反复要人交联系方式
    // 本身就是一种压力，而未填的提醒交给「安全与支持」面板去做。
    if (firstRun) {
      steps.push({ render: renderNoticeStep });
      steps.push({ render: renderContactStep });
    }
    return steps;
  }

  function mount() {
    var steps = buildSteps();
    if (!steps.length) {
      global.document.documentElement.classList.remove('xo-pending');
      return;
    }

    injectStyle();
    var doc = global.document;

    var mask = el('div', 'xo-mask');
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', '开始之前');

    var card = el('div', 'xo-card');
    var head = el('div', 'xo-head');

    var brand = el('div', 'xo-brand', '心绪');
    brand.appendChild(el('small', null, '开始之前'));
    head.appendChild(brand);

    var dots = el('div', 'xo-dots');
    head.appendChild(dots);
    card.appendChild(head);

    var body = el('div', 'xo-body');
    card.appendChild(body);
    mask.appendChild(card);

    doc.body.appendChild(mask);
    doc.body.classList.add('xo-locked');

    var i = 0;

    function paintDots() {
      dots.textContent = '';
      steps.forEach(function (_, k) {
        dots.appendChild(el('span', 'xo-dot' + (k === i ? ' on' : '') + (k < i ? ' done' : '')));
      });
    }

    function finish() {
      mask.remove();
      doc.body.classList.remove('xo-locked');
      doc.documentElement.classList.remove('xo-pending');
      global.dispatchEvent(new CustomEvent('xinxu:ready'));
    }

    function next() {
      i++;
      if (i >= steps.length) { finish(); return; }
      paint();
    }

    function paint() {
      paintDots();
      body.textContent = '';
      body.appendChild(steps[i].render(next));
      body.scrollTop = 0;
    }

    paint();
  }

  /* ---------- 样式 ---------- */

  /* 自带样式而不去改 index.html / sandbox.html 的 <style>，
     这样这个模块可以直接搬进任何一个页面。 */
  function injectStyle() {
    var doc = global.document;
    if (doc.getElementById(STYLE_ID)) return;

    var s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      'html.xo-pending .shell{visibility:hidden}',
      'body.xo-locked{overflow:hidden}',

      '.xo-mask{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;',
      'padding:20px;overflow:auto;background:radial-gradient(120% 80% at 50% -10%,#34294f 0%,#221D36 55%);',
      'color:#F1ECE1;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;',
      'line-height:1.7;-webkit-font-smoothing:antialiased}',

      '.xo-card{width:100%;max-width:540px;background:#2A2440;border:1px solid #3B3358;border-radius:22px;',
      'padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.45)}',

      '.xo-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}',
      '.xo-brand{font-family:"Noto Serif SC","Songti SC",serif;font-weight:700;font-size:1.1rem;letter-spacing:.5px}',
      '.xo-brand small{display:block;font-weight:400;font-size:.7rem;color:#9C94B4;letter-spacing:.16em}',
      '.xo-dots{display:flex;gap:6px}',
      '.xo-dot{width:7px;height:7px;border-radius:50%;background:#3B3358}',
      '.xo-dot.on{background:#F0B36A;transform:scale(1.25)}',
      '.xo-dot.done{background:#6E6786}',

      '.xo-h2{font-family:"Noto Serif SC","Songti SC",serif;font-size:1.3rem;font-weight:700;line-height:1.45;margin-bottom:8px}',
      '.xo-lead{color:#9C94B4;font-size:.88rem;margin-bottom:18px}',

      '.xo-field{display:block;margin-bottom:14px}',
      '.xo-label{display:block;font-size:.78rem;color:#9C94B4;margin-bottom:5px;letter-spacing:.04em}',
      '.xo-input{width:100%;background:#221D36;border:1px solid #3B3358;border-radius:11px;',
      'padding:11px 13px;color:#F1ECE1;font-size:.95rem;font-family:inherit;outline:none;transition:border-color .2s}',
      '.xo-input:focus{border-color:#F0B36A}',
      '.xo-input::placeholder{color:#6E6786}',

      '.xo-check{display:flex;align-items:flex-start;gap:9px;font-size:.86rem;color:#F1ECE1;',
      'margin:12px 0 4px;cursor:pointer;user-select:none}',
      '.xo-check input{margin-top:5px;width:16px;height:16px;accent-color:#F0B36A;flex:none}',
      '.xo-locked{color:#6E6786;cursor:not-allowed}',

      '.xo-actions{display:flex;gap:10px;margin-top:20px}',
      '.xo-btn{flex:1;border:1px solid #3B3358;background:#332C4E;color:#F1ECE1;border-radius:16px;',
      'padding:12px 16px;font-size:.92rem;font-family:inherit;cursor:pointer;transition:filter .2s,transform .1s}',
      '.xo-btn:hover:not(:disabled){filter:brightness(1.12)}',
      '.xo-btn:active:not(:disabled){transform:translateY(1px)}',
      '.xo-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.xo-btn.primary{background:#F0B36A;border-color:#F0B36A;color:#221D36;font-weight:600}',
      '.xo-btn.danger{background:#E07A6B;border-color:#E07A6B;color:#221D36;font-weight:600}',

      '.xo-link{display:block;width:100%;margin-top:14px;background:none;border:none;color:#6E6786;',
      'font-size:.8rem;font-family:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}',
      '.xo-link:hover{color:#9C94B4}',

      '.xo-note{font-size:.78rem;color:#6E6786;line-height:1.65;margin-top:6px}',
      '.xo-err{font-size:.82rem;color:#E07A6B;margin-top:10px}',

      '.xo-notice{max-height:46vh;overflow-y:auto;background:#221D36;border:1px solid #3B3358;',
      'border-radius:16px;padding:18px;margin-top:6px;scrollbar-width:thin}',
      '.xo-sec{margin-bottom:20px}',
      '.xo-sec:last-child{margin-bottom:0}',
      '.xo-sec-t{font-family:"Noto Serif SC","Songti SC",serif;font-size:.98rem;font-weight:700;',
      'color:#F0B36A;margin-bottom:7px}',
      '.xo-p{font-size:.87rem;color:#F1ECE1;margin-bottom:8px}',
      '.xo-p:last-child{margin-bottom:0}',
      '.xo-tail{color:#9C94B4}',

      '.xo-tel{list-style:none;margin:10px 0 0}',
      '.xo-tel-i{margin-bottom:9px;font-size:.87rem}',
      '.xo-tel-a{color:#F0B36A;text-decoration:none;font-weight:600;border-bottom:1px solid rgba(240,179,106,.35)}',
      '.xo-tel-a:hover{border-bottom-color:#F0B36A}',
      '.xo-tel-n{display:block;font-size:.75rem;color:#6E6786}',

      '.xo-callout{margin-top:12px;padding:12px 14px;border-radius:11px;',
      'background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.32)}',
      '.xo-callout b{display:block;font-size:.82rem;color:#A78BFA;margin-bottom:5px}',
      '.xo-callout p{font-size:.82rem;color:#F1ECE1}',

      '.xo-danger{margin-top:16px;padding:14px;border-radius:16px;',
      'background:rgba(224,122,107,.09);border:1px solid rgba(224,122,107,.35)}',
      '.xo-danger b{display:block;font-size:.86rem;color:#E07A6B;margin-bottom:6px}',
      '.xo-danger p{font-size:.8rem;color:#F1ECE1;margin-bottom:10px}',

      '.xo-body{max-height:calc(100vh - 160px);overflow-y:auto}',
      '@media (prefers-reduced-motion:no-preference){.xo-dot{transition:all .25s ease}}'
    ].join('');

    doc.head.appendChild(s);
  }

  global.XinxuOnboarding = {
    mount: mount,
    renderNoticeInto: renderNoticeInto,
    confirmWipe: confirmWipe
  };

  /* 页面脚本可能先跑完自己的初始化，这里等 DOM 就绪再挂载 */
  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})(window);
