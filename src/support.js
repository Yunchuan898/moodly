/* 心绪 · 安全与支持面板
 *
 * 顶栏常驻入口。紧急联系人、求助热线、重读须知、清除数据都在这里。
 *
 * 紧急联系人只在这个面板里露面，别处一概不出现——
 * 不在用户脆弱的时候，替用户决定要不要联系谁。
 */
(function (global) {
  'use strict';

  var V = global.XinxuVault;
  var C = global.XinxuSafetyContent;
  var STYLE_ID = 'xsup-style';
  var ENTRY_ID = 'xinxuSafe';

  function el(tag, cls, text) {
    var n = global.document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- 面板 ---------- */

  function open() {
    injectStyle();
    var doc = global.document;

    var mask = el('div', 'xsup-mask');
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', '安全与支持');

    var card = el('div', 'xsup-card');

    var head = el('div', 'xsup-head');
    head.appendChild(el('h3', 'xsup-h3', '安全与支持'));
    var close = el('button', 'xsup-x', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    head.appendChild(close);
    card.appendChild(head);

    var body = el('div', 'xsup-body');
    card.appendChild(body);

    mask.appendChild(card);
    doc.body.appendChild(mask);

    function shut() {
      mask.remove();
      doc.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') shut(); }

    close.onclick = shut;
    mask.onclick = function (e) { if (e.target === mask) shut(); };
    doc.addEventListener('keydown', onKey);

    renderMain(body, shut);
    setTimeout(function () { close.focus(); }, 60);
  }

  /* ---------- 主视图 ---------- */

  function renderMain(body, shut) {
    body.textContent = '';

    body.appendChild(contactSection(body, shut));
    body.appendChild(hotlineSection());
    body.appendChild(noticeSection(body, shut));
    body.appendChild(dataSection(body, shut));
  }

  /* 紧急联系人 */
  function contactSection(body, shut) {
    var s = el('section', 'xsup-sec');
    s.appendChild(el('h4', 'xsup-h4', '紧急联系人'));

    var c = V.getContact();

    if (c && c.phone) {
      s.appendChild(el('p', 'xsup-p', c.name + (c.relation ? '（' + c.relation + '）' : '')));
      var a = el('a', 'xsup-tel', c.phone);
      a.href = 'tel:' + String(c.phone).replace(/[^0-9+]/g, '');
      s.appendChild(a);
    } else {
      s.appendChild(el('p', 'xsup-p xsup-warn',
        '你还没有留紧急联系人。填一个你信得过的人，只为在你自己需要的时候能立刻找到。'));
    }

    var bar = el('div', 'xsup-actions');
    var edit = el('button', 'xsup-btn', c && c.phone ? '修改' : '填写');
    edit.type = 'button';
    bar.appendChild(edit);
    s.appendChild(bar);

    edit.onclick = function () {
      body.textContent = '';
      renderContactForm(body, shut, c);
    };

    return s;
  }

  function renderContactForm(body, shut, existing) {
    var s = el('section', 'xsup-sec');
    s.appendChild(el('h4', 'xsup-h4', existing && existing.phone ? '修改紧急联系人' : '填写紧急联系人'));
    s.appendChild(el('p', 'xsup-p',
      '这条信息只存在本机。心绪不会自动联系任何人——要不要说、什么时候说，由你自己决定。'));

    var name = formField(s, 'TA 怎么称呼', existing ? existing.name : '', '名字或昵称');
    var rel = formField(s, 'TA 是你的', existing ? existing.relation : '', '朋友 / 家人 / 伴侣…');
    var phone = formField(s, '联系电话', existing ? existing.phone : '', '手机号', 'tel');

    var err = el('p', 'xsup-err');
    err.hidden = true;
    s.appendChild(err);

    var bar = el('div', 'xsup-actions');
    var back = el('button', 'xsup-btn', '返回');
    back.type = 'button';
    var save = el('button', 'xsup-btn primary', '保存');
    save.type = 'button';
    bar.appendChild(save);
    bar.appendChild(back);
    s.appendChild(bar);

    back.onclick = function () { renderMain(body, shut); };
    save.onclick = function () {
      var next = { name: name.value.trim(), relation: rel.value.trim(), phone: phone.value.trim() };
      if (!next.name || !next.phone) {
        err.textContent = '至少填上个称呼和电话，不然真到那天找不到人';
        err.hidden = false;
        return;
      }
      V.updateContact(next);
      renderMain(body, shut);
    };

    body.appendChild(s);
    name.focus();
  }

  function formField(host, label, value, placeholder, inputmode) {
    var row = el('label', 'xsup-field');
    row.appendChild(el('span', 'xsup-label', label));
    var input = el('input', 'xsup-input');
    if (inputmode) input.inputMode = inputmode;
    input.placeholder = placeholder || '';
    input.value = value || '';
    row.appendChild(input);
    host.appendChild(row);
    return input;
  }

  /* 求助热线 */
  function hotlineSection() {
    var s = el('section', 'xsup-sec');
    s.appendChild(el('h4', 'xsup-h4', '现在可以打的电话'));

    var ul = el('ul', 'xsup-list');
    C.HOTLINES.forEach(function (h) {
      var li = el('li');
      var a = el('a', 'xsup-tel', h.name + ' ' + h.tel);
      a.href = 'tel:' + String(h.tel).replace(/[^0-9+]/g, '');
      li.appendChild(a);
      li.appendChild(el('span', 'xsup-n', h.note));
      ul.appendChild(li);
    });
    s.appendChild(ul);
    return s;
  }

  /* 重读须知 */
  function noticeSection(body, shut) {
    var s = el('section', 'xsup-sec');
    s.appendChild(el('h4', 'xsup-h4', '安全须知'));

    var consent = V.getConsent();
    s.appendChild(el('p', 'xsup-p', consent
      ? '你在 ' + String(consent.agreedAt).slice(0, 10) + ' 读完了这一版须知并同意。'
      : '这份须知你还没有读过。'));

    var bar = el('div', 'xsup-actions');
    var read = el('button', 'xsup-btn', '重读');
    read.type = 'button';
    bar.appendChild(read);
    s.appendChild(bar);

    read.onclick = function () {
      body.textContent = '';

      var view = el('section', 'xsup-sec');
      view.appendChild(el('h4', 'xsup-h4', '安全须知'));

      var box = el('div', 'xsup-notice');
      global.XinxuOnboarding.renderNoticeInto(box);   // 正文只有一份，不在这里重抄
      view.appendChild(box);

      var backBar = el('div', 'xsup-actions');
      var back = el('button', 'xsup-btn', '返回');
      back.type = 'button';
      backBar.appendChild(back);
      view.appendChild(backBar);

      back.onclick = function () { renderMain(body, shut); };
      body.appendChild(view);
    };

    return s;
  }

  /* 数据 */
  function dataSection(body, shut) {
    var s = el('section', 'xsup-sec');
    s.appendChild(el('h4', 'xsup-h4', '你的数据'));
    s.appendChild(el('p', 'xsup-p',
      '全部记录只保存在这台设备的浏览器里。清除之后无法恢复，换设备也不会带过去。'));

    var bar = el('div', 'xsup-actions');
    var wipe = el('button', 'xsup-btn danger', '清除本机全部数据');
    wipe.type = 'button';
    bar.appendChild(wipe);
    s.appendChild(bar);

    var box = el('div');
    s.appendChild(box);

    wipe.onclick = function () {
      global.XinxuOnboarding.confirmWipe(box);   // 销毁确认只此一份
    };

    return s;
  }

  /* ---------- 样式与入口 ---------- */

  function injectStyle() {
    var doc = global.document;
    if (doc.getElementById(STYLE_ID)) return;

    var s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      /* 顶栏入口。自带样式，不去动各页原有的 topbar 规则。 */
      '.xsup-entry{background:none;border:1px solid #3B3358;color:#9C94B4;border-radius:99px;',
      'padding:4px 11px;font-size:.74rem;font-family:inherit;cursor:pointer;line-height:1.5;',
      'transition:color .2s,border-color .2s;white-space:nowrap}',
      '.xsup-entry:hover{color:#F0B36A;border-color:#F0B36A}',

      '.xsup-mask{position:fixed;inset:0;z-index:9400;display:flex;align-items:center;justify-content:center;',
      'padding:20px;overflow:auto;background:rgba(34,29,54,.86);backdrop-filter:blur(6px);',
      'color:#F1ECE1;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;',
      'line-height:1.7;-webkit-font-smoothing:antialiased}',

      '.xsup-card{width:100%;max-width:480px;background:#2A2440;border:1px solid #3B3358;border-radius:22px;',
      'box-shadow:0 24px 60px rgba(0,0,0,.5);display:flex;flex-direction:column;max-height:86vh}',

      '.xsup-head{display:flex;align-items:center;justify-content:space-between;',
      'padding:20px 22px 14px;border-bottom:1px solid #3B3358}',
      '.xsup-h3{font-family:"Noto Serif SC","Songti SC",serif;font-size:1.08rem;font-weight:700}',
      '.xsup-x{background:none;border:none;color:#9C94B4;font-size:1.5rem;line-height:1;',
      'cursor:pointer;padding:0 4px;font-family:inherit}',
      '.xsup-x:hover{color:#F1ECE1}',

      '.xsup-body{padding:18px 22px 22px;overflow-y:auto}',
      '.xsup-sec{margin-bottom:22px}',
      '.xsup-sec:last-child{margin-bottom:0}',
      '.xsup-h4{font-size:.8rem;color:#F0B36A;letter-spacing:.08em;margin-bottom:9px;font-weight:600}',
      '.xsup-p{font-size:.85rem;color:#9C94B4;margin-bottom:8px}',
      '.xsup-p.xsup-warn{color:#E07A6B}',

      '.xsup-list{list-style:none}',
      '.xsup-list li{margin-bottom:9px;font-size:.86rem}',
      '.xsup-list li:last-child{margin-bottom:0}',
      '.xsup-tel{display:block;color:#F1ECE1;text-decoration:none;font-weight:600;font-size:.92rem;',
      'border-bottom:1px solid rgba(240,179,106,.3);width:fit-content}',
      '.xsup-tel:hover{color:#F0B36A;border-bottom-color:#F0B36A}',
      '.xsup-n{display:block;font-size:.74rem;color:#6E6786}',

      '.xsup-actions{display:flex;gap:9px;margin-top:10px}',
      '.xsup-btn{border:1px solid #3B3358;background:#332C4E;color:#F1ECE1;border-radius:11px;',
      'padding:9px 15px;font-size:.84rem;font-family:inherit;cursor:pointer;transition:filter .2s}',
      '.xsup-btn:hover{filter:brightness(1.14)}',
      '.xsup-btn.primary{background:#F0B36A;border-color:#F0B36A;color:#221D36;font-weight:600}',
      '.xsup-btn.danger{background:none;border-color:rgba(224,122,107,.5);color:#E07A6B}',
      '.xsup-btn.danger:hover{background:rgba(224,122,107,.12)}',

      '.xsup-field{display:block;margin-bottom:13px}',
      '.xsup-label{display:block;font-size:.76rem;color:#9C94B4;margin-bottom:5px}',
      '.xsup-input{width:100%;background:#221D36;border:1px solid #3B3358;border-radius:11px;',
      'padding:10px 13px;color:#F1ECE1;font-size:.9rem;font-family:inherit;outline:none;transition:border-color .2s}',
      '.xsup-input:focus{border-color:#F0B36A}',
      '.xsup-input::placeholder{color:#6E6786}',
      '.xsup-err{font-size:.8rem;color:#E07A6B;margin-top:8px}',

      '.xsup-notice{background:#221D36;border:1px solid #3B3358;border-radius:16px;padding:18px;margin-top:6px}',
      '.xsup-notice .xo-sec{margin-bottom:20px}',
      '.xsup-notice .xo-sec:last-child{margin-bottom:0}',
      '.xsup-notice .xo-sec-t{font-family:"Noto Serif SC","Songti SC",serif;font-size:.96rem;font-weight:700;',
      'color:#F0B36A;margin-bottom:7px}',
      '.xsup-notice .xo-p{font-size:.85rem;color:#F1ECE1;margin-bottom:8px}',
      '.xsup-notice .xo-p:last-child{margin-bottom:0}',
      '.xsup-notice .xo-tail{color:#9C94B4}',
      '.xsup-notice .xo-tel{list-style:none;margin:10px 0 0}',
      '.xsup-notice .xo-tel-i{margin-bottom:9px;font-size:.85rem}',
      '.xsup-notice .xo-tel-a{color:#F0B36A;text-decoration:none;font-weight:600}',
      '.xsup-notice .xo-tel-n{display:block;font-size:.74rem;color:#6E6786}',
      '.xsup-notice .xo-callout{margin-top:12px;padding:12px 14px;border-radius:11px;',
      'background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.32)}',
      '.xsup-notice .xo-callout b{display:block;font-size:.8rem;color:#A78BFA;margin-bottom:5px}',
      '.xsup-notice .xo-callout p{font-size:.8rem;color:#F1ECE1}'
      /* 销毁确认块（.xo-danger 及其内部）沿用 onboarding 注入的全局样式，
         不在这里重抄一遍——同一件东西只有一处定义。 */
    ].join('');

    doc.head.appendChild(s);
  }

  /* 绑定顶栏按钮。按钮由各页面自己写在 topbar 里，这里只负责挂事件——
     免得在两个 HTML 里各写一遍逻辑。 */
  function bindEntry() {
    var btn = global.document.getElementById(ENTRY_ID);
    if (!btn || btn.dataset.xsupBound) return;
    btn.dataset.xsupBound = '1';
    btn.onclick = open;
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', bindEntry);
  } else {
    bindEntry();
  }

  global.XinxuSupport = { open: open };
})(window);
