/* 心绪 · 本地档案层
 *
 * 账号、同意记录、紧急联系人档案的读写。只管数据，不碰界面。
 *
 * 关于「登录」的定位，说清楚免得后人误解：
 * 数据全部存在本地，这里没有鉴权，也没有任何服务端。所谓登录，
 * 是让用户有一个「这是我的空间」的归属感，同时把数据结构留成将来
 * 可以迁移到云端的形状。指望它保护数据是不现实的。
 */
(function (global) {
  'use strict';

  var ACCOUNT_KEY = 'xinxu.account.v1';
  var CONSENT_KEY = 'xinxu.consent.v1';
  var PROMPT_KEY = 'xinxu.safety.lastPrompt.v1';

  var CONTENT = global.XinxuSafetyContent;

  /* ---------- 底层读写 ---------- */

  function read(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, val) {
    try {
      global.localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      return false;
    }
  }

  function drop(key) {
    try { global.localStorage.removeItem(key); } catch (e) {}
  }

  /* ---------- 口令 ---------- */

  function toHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    }
    return out;
  }

  function randomSalt() {
    var a = new Uint8Array(16);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(a);
    } else {
      for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
    }
    return toHex(a);
  }

  /* 非安全上下文（部分浏览器的 file://）拿不到 crypto.subtle，降级用 FNV-1a。
     前缀让它一眼能看出来是降级结果。两条路径都不构成安全防护，只是避免明文口令落盘。 */
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return 'fnv1a.' + h.toString(16);
  }

  /* 注意：这不是安全防护。
     同一台设备上，任何人都能用开发者工具读到 localStorage 里的全部内容。
     加盐哈希的唯一作用，是避免明文口令直接落盘。 */
  function hashPass(pass, salt) {
    var data = salt + '|' + pass;
    try {
      if (global.crypto && global.crypto.subtle && global.TextEncoder) {
        return global.crypto.subtle
          .digest('SHA-256', new global.TextEncoder().encode(data))
          .then(function (buf) { return toHex(new Uint8Array(buf)); })
          .catch(function () { return fnv1a(data); });
      }
    } catch (e) { /* 落到下面的降级路径 */ }
    return Promise.resolve(fnv1a(data));
  }

  /* ---------- 账号 ---------- */

  function getAccount() {
    return read(ACCOUNT_KEY, null);
  }

  function hasAccount() {
    var a = getAccount();
    return !!(a && a.nickname && a.passHash);
  }

  function register(nickname, pass) {
    nickname = String(nickname || '').trim();
    if (!nickname) return Promise.resolve({ ok: false, error: '请填一个称呼' });
    if (String(pass || '').length < 4) return Promise.resolve({ ok: false, error: '口令至少 4 位' });
    if (hasAccount()) return Promise.resolve({ ok: false, error: '这台设备上已经有账号了' });

    var salt = randomSalt();
    return hashPass(pass, salt).then(function (h) {
      var account = {
        nickname: nickname,
        salt: salt,
        passHash: h,
        trustedContact: null,
        createdAt: new Date().toISOString()
      };
      if (!write(ACCOUNT_KEY, account)) {
        return { ok: false, error: '这个浏览器不允许保存数据，可能开了无痕模式' };
      }
      return { ok: true, account: account };
    });
  }

  function login(nickname, pass) {
    var a = getAccount();
    // 不区分「没这个账号」和「口令不对」，避免泄露本机是否存过某个称呼
    var fail = { ok: false, error: '称呼或口令对不上' };
    if (!a) return Promise.resolve(fail);
    if (String(nickname || '').trim() !== a.nickname) return Promise.resolve(fail);

    return hashPass(pass, a.salt).then(function (h) {
      return h === a.passHash ? { ok: true, account: a } : fail;
    });
  }

  /* ---------- 紧急联系人 ---------- */

  function updateContact(contact) {
    var a = getAccount();
    if (!a) return false;
    a.trustedContact = contact || null;
    return write(ACCOUNT_KEY, a);
  }

  function getContact() {
    var a = getAccount();
    return (a && a.trustedContact) || null;
  }

  /* ---------- 知情同意 ---------- */

  function hasConsented() {
    var c = read(CONSENT_KEY, null);
    // 版本对不上就当作没同意过：用户同意的是当时那一版须知，不是这一版
    return !!(c && c.noticeVersion === CONTENT.NOTICE_VERSION);
  }

  function recordConsent() {
    return write(CONSENT_KEY, {
      noticeVersion: CONTENT.NOTICE_VERSION,
      agreedAt: new Date().toISOString()
    });
  }

  function getConsent() {
    return read(CONSENT_KEY, null);
  }

  /* ---------- 提醒冷却 ---------- */

  function promptedToday(dateStr) {
    return read(PROMPT_KEY, null) === dateStr;
  }

  function markPrompted(dateStr) {
    drop(PROMPT_KEY);
    write(PROMPT_KEY, dateStr);
  }

  /* ---------- 清除 ---------- */

  /* 清除本机全部数据。
     日记与沙盘的键归各自模块所有，这里照样要清——不然「清除全部数据」
     就名不副实，而用户是照着这句话做的决定。
     新增存储键时记得回来补进这张表。 */
  var OWNED_ELSEWHERE = [
    'xinxu.entries.v1',           // 情绪日记
    'xinxu.sandbox.draft.v1',     // 沙盘草稿
    'xinxu.sandbox.scenes.v1',    // 沙盘存档
    'xinxu.sandbox.marks.v1'      // 沙盘见证
  ];

  function clearAll() {
    var keys = [ACCOUNT_KEY, CONSENT_KEY, PROMPT_KEY].concat(OWNED_ELSEWHERE);
    for (var i = 0; i < keys.length; i++) drop(keys[i]);
  }

  global.XinxuVault = {
    getAccount: getAccount,
    hasAccount: hasAccount,
    register: register,
    login: login,
    updateContact: updateContact,
    getContact: getContact,
    hasConsented: hasConsented,
    recordConsent: recordConsent,
    getConsent: getConsent,
    promptedToday: promptedToday,
    markPrompted: markPrompted,
    clearAll: clearAll
  };
})(window);
