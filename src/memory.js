/* 心绪 · 长期记忆
 *
 * 存什么、不存什么，是这块最要紧的决定。
 * 按产品设计总纲的「长期偏好」一行：称呼、喜欢/不喜欢的回应方式、
 * 已经确认过有效的办法。除此之外一律不主动记。
 *
 * 三条约束：
 *   1. 经用户确认才保存。agent 只能 propose，不能直接写。
 *      一个会自己偷偷记住你说了什么的产品，比不记更让人不舒服。
 *   2. 用户随时能看见、能改、能删。不是黑箱。
 *   3. 不记风险事件原文。那类内容归安全层管，且原则上不留原文。
 */
(function (global) {
  'use strict';

  var KEY = 'xinxu.memory.v1';
  var MAX = 40;                       // 再多就不是「记忆」，是档案了

  var KINDS = [
    { key: 'address', name: '称呼',     hint: '希望怎么被称呼' },
    { key: 'like',    name: '偏好的方式', hint: '喜欢被怎样回应' },
    { key: 'dislike', name: '不喜欢的',   hint: '不希望被怎样回应' },
    { key: 'method',  name: '有用的办法', hint: '试过、确实有点用的' },
    { key: 'fact',    name: '基本情况',   hint: '你提过、且愿意让我记得的' },
  ];
  function kindByKey(k) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].key === k) return KINDS[i];
    return KINDS[KINDS.length - 1];
  }

  function read(key, fb) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fb;
    } catch (e) { return fb; }
  }
  function write(key, val) {
    try { global.localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  /* ---------- 已确认的记忆 ---------- */
  function list() {
    var a = read(KEY, []);
    return Array.isArray(a) ? a : [];
  }

  function add(kind, text, source) {
    text = String(text || '').trim();
    if (!text) return null;
    var a = list();
    if (a.length >= MAX) return null;
    // 同一件事不重复记
    var dup = a.filter(function (m) { return m.text === text; })[0];
    if (dup) return dup;
    var item = {
      id: Date.now() + '-' + Math.floor(Math.random() * 1000),
      kind: kindByKey(kind).key,
      text: text,
      source: source || 'user',       // user | agent
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    a.push(item);
    write(KEY, a);
    return item;
  }

  function update(id, text) {
    var a = list(), hit = null;
    a.forEach(function (m) { if (m.id === id) hit = m; });
    if (!hit) return false;
    hit.text = String(text || '').trim();
    hit.updatedAt = Date.now();
    return write(KEY, a);
  }

  function remove(id) {
    return write(KEY, list().filter(function (m) { return m.id !== id; }));
  }

  function clear() { return write(KEY, []); }

  /* ---------- 待确认的提议 ---------- */
  /* agent 只能走到这里。用户在界面上按下「记住」才进 list()。 */
  var PENDING = 'xinxu.memory.pending.v1';

  function pending() {
    var a = read(PENDING, []);
    return Array.isArray(a) ? a : [];
  }

  function propose(items) {
    if (!items || !items.length) return [];
    var known = {};
    list().forEach(function (m) { known[m.kind + '|' + m.text] = 1; });
    var cur = pending();
    cur.forEach(function (m) { known[m.kind + '|' + m.text] = 1; });

    var added = [];
    (items || []).forEach(function (it) {
      var kind = kindByKey(it.kind).key;
      var text = String(it.text || '').trim();
      if (!text || text.length > 60) return;            // 太长的不像一条记忆
      if (known[kind + '|' + text]) return;
      known[kind + '|' + text] = 1;
      added.push({
        id: 'p' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        kind: kind, text: text, source: 'agent', proposedAt: Date.now(),
      });
    });
    if (added.length) write(PENDING, cur.concat(added));
    return added;
  }

  /* accept: 传 id 数组则只接受这些；传 true 表示全部接受 */
  function resolve(accept) {
    var cur = pending();
    var keep = [], yes = [];
    cur.forEach(function (p) {
      var take = accept === true || (Array.isArray(accept) && accept.indexOf(p.id) !== -1);
      if (take) yes.push(p); else keep.push(p);
    });
    write(PENDING, keep);
    yes.forEach(function (p) { add(p.kind, p.text, 'agent'); });
    return yes.length;
  }

  function dropPending() { return write(PENDING, []); }

  /* ---------- 给 agent 的记忆 ---------- */
  /* 只给已确认的。未确认的提议绝不进入上下文——否则「提议」就成了
     「已经记住了」的后门。 */
  function contextFor() {
    var a = list();
    if (!a.length) return null;
    return a.map(function (m) {
      return { kind: kindByKey(m.kind).name, text: m.text };
    });
  }

  global.XinxuMemory = {
    KINDS: KINDS, kindByKey: kindByKey, MAX: MAX,
    list: list, add: add, update: update, remove: remove, clear: clear,
    pending: pending, propose: propose, resolve: resolve, dropPending: dropPending,
    contextFor: contextFor,
    KEY: KEY, PENDING_KEY: PENDING,
  };
})(window);
