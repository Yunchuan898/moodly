/* 心绪 · 设备数据（前端接口层）
 *
 * 目前只做界面与数据形状，没有真实接入。真接的话每家都要 OAuth +
 * 后端回调 + 商务审批，见下面的 PLATFORMS 备注。
 *
 * 一条必须守住的原则（产品设计总纲 §7 已确认）：
 *   这些数据只能作为背景线索，不能直接推断情绪或心理状态。
 *   界面上说「昨晚睡了 5 小时 42 分」，不说「你很疲惫」。
 *   睡眠差和心情差不是同一件事，把心率变异直接翻译成「你今天焦虑」
 *   是过度推断，而且会让用户觉得被一个算法judged了。
 */
(function (global) {
  'use strict';

  var KEY = 'xinxu.devices.v1';

  /* ---------- 平台 ---------- */
  /* `ready` 表示前端接口是否已经能演示。真实接入的门槛写在 note 里，
     免得后人以为「按钮点了就连上了」。 */
  var PLATFORMS = [
    { key: 'apple',  name: 'Apple Watch', short: '苹果',
      note: 'HealthKit 没有面向第三方的云接口。必须做一个原生 iOS app 读健康数据再同步，网页读不到。',
      ready: false },
    { key: 'huawei', name: '华为运动健康', short: '华为',
      note: 'Health Kit 开放平台，需企业开发者认证与审核。',
      ready: false },
    { key: 'garmin', name: 'Garmin', short: '佳明',
      note: 'Garmin Health API，需申请成为合作伙伴，走商务审批。',
      ready: false },
    { key: 'coros',  name: 'COROS', short: '高驰',
      note: '相对开放的开放平台，同样需要开发者申请。',
      ready: false },
    { key: 'xiaomi', name: '小米运动健康', short: '小米',
      note: '开放能力有限，需申请。',
      ready: false },
  ];

  function byKey(k) {
    for (var i = 0; i < PLATFORMS.length; i++) if (PLATFORMS[i].key === k) return PLATFORMS[i];
    return null;
  }

  /* ---------- 指标 ---------- */
  /* 每项都写清楚「这是什么」和「不能拿它推断什么」。
     第二列会在界面上以浅色小字出现。 */
  var METRICS = [
    { key: 'sleepMin',  name: '睡眠时长', unit: 'min', fmt: 'dur',
      hint: '一段睡着的时间。睡少不等于心情差，只是背景。' },
    { key: 'sleepScore', name: '睡眠评分', unit: '', fmt: 'int',
      hint: '设备自己算的分，各家算法不同，不能跨设备比较。' },
    { key: 'stressAvg', name: '压力均值', unit: '', fmt: 'int',
      hint: '设备用 HRV 推的。它是身体的激活程度，不是你的情绪。' },
    { key: 'rhr',       name: '静息心率', unit: 'bpm', fmt: 'int',
      hint: '安静时的心率。个体差异很大，看自己的变化趋势才有意义。' },
    { key: 'hrv',       name: 'HRV', unit: 'ms', fmt: 'int',
      hint: '心跳间隔的波动。影响因素很多，单日数值说明不了什么。' },
    { key: 'steps',     name: '步数', unit: '步', fmt: 'int',
      hint: '活动量。' },
  ];

  function metricByKey(k) {
    for (var i = 0; i < METRICS.length; i++) if (METRICS[i].key === k) return METRICS[i];
    return null;
  }

  /* ---------- 存储 ---------- */
  function read() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return [];
      var v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function write(list) {
    try { global.localStorage.setItem(KEY, JSON.stringify(list || [])); return true; }
    catch (e) { return false; }
  }

  /* 读所有已连接设备的逐日数据，按日期升序 */
  function days(limit) {
    var all = [];
    read().forEach(function (d) {
      (d.days || []).forEach(function (row) {
        var c = { date: row.date };
        for (var k in row) if (k !== 'date') c[k] = row[k];
        c.__platform = d.platform;
        all.push(c);
      });
    });
    all.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return limit ? all.slice(-limit) : all;
  }

  function dayOf(dateStr) {
    var hit = null;
    days().forEach(function (d) { if (d.date === dateStr) hit = d; });
    return hit;
  }

  function connected() { return read(); }

  function isConnected(platform) {
    return read().some(function (d) { return d.platform === platform; });
  }

  /* ---------- 连接 / 断开 ---------- */
  /* 这里没有真的发起 OAuth。它记一条「已连接」，并生成占位数据，
     目的只是让界面能跑通、数据形状定下来。真接入时把 sync() 换掉即可。 */
  function connect(platform) {
    var p = byKey(platform);
    if (!p) return Promise.resolve({ ok: false, error: '不认识的设备' });
    if (isConnected(platform)) return Promise.resolve({ ok: false, error: '这台已经连过了' });

    var list = read();
    list.push({
      platform: platform,
      connectedAt: Date.now(),
      lastSyncAt: null,
      stub: true,                       // 界面据此显示「接口占位」标记
    });
    if (!write(list)) return Promise.resolve({ ok: false, error: '存不下，可能开了无痕模式' });
    return sync(platform);
  }

  function disconnect(platform) {
    write(read().filter(function (d) { return d.platform !== platform; }));
    return true;
  }

  /* ---------- 占位数据 ---------- */
  /* 明确是假的：形状真实、数值随机、日期连续。
     界面上必须标出来，不能让任何人误以为是真数据。 */
  function seedDays(n) {
    var out = [], today = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(today); d.setDate(d.getDate() - i);
      var m = String(d.getMonth() + 1); if (m.length < 2) m = '0' + m;
      var dd = String(d.getDate());     if (dd.length < 2) dd = '0' + dd;
      var wob = Math.sin(i / 2.7) * 0.5 + 0.5;                   // 让曲线别太平
      out.push({
        date: d.getFullYear() + '-' + m + '-' + dd,
        sleepMin: Math.round(330 + wob * 150 + Math.random() * 60),
        sleepScore: Math.round(58 + wob * 30 + Math.random() * 12),
        stressAvg: Math.round(62 - wob * 30 + Math.random() * 14),
        rhr: Math.round(61 + Math.random() * 9),
        hrv: Math.round(34 + wob * 22 + Math.random() * 10),
        steps: Math.round(3800 + Math.random() * 7000),
      });
    }
    return out;
  }

  function sync(platform) {
    var list = read(), hit = null;
    list.forEach(function (d) { if (d.platform === platform) hit = d; });
    if (!hit) return Promise.resolve({ ok: false, error: '还没连过这台设备' });

    // 真接入时：这里换成向自己的后端拉取，由后端持 token 调各家 API。
    // 前端不该也不能直接拿各家的 token。
    hit.days = seedDays(14);
    hit.lastSyncAt = Date.now();
    write(list);
    return Promise.resolve({ ok: true, platform: platform, days: hit.days.length });
  }

  /* ---------- 给 agent 的背景线索 ---------- */
  /* 只给数字和日期，不给任何解释性文字——解释由模型在受约束的提示下做，
     而且必须写成「这可能是背景，也可能无关」。 */
  function contextFor(dateStr, spanDays) {
    var all = days().filter(function (d) { return !dateStr || d.date <= dateStr; });
    var recent = all.slice(-(spanDays || 7));
    if (!recent.length) return null;
    return {
      span: recent.length,
      rows: recent.map(function (d) {
        return { date: d.date, sleepMin: d.sleepMin, sleepScore: d.sleepScore,
                 stressAvg: d.stressAvg, rhr: d.rhr, hrv: d.hrv, steps: d.steps };
      }),
    };
  }

  /* ---------- 格式化 ---------- */
  function fmt(metricKey, val) {
    var m = metricByKey(metricKey);
    if (m == null || val == null) return '—';
    if (m.fmt === 'dur') {
      var h = Math.floor(val / 60), mi = Math.round(val % 60);
      return h + ' 小时' + (mi ? ' ' + mi + ' 分' : '');
    }
    return String(Math.round(val)) + (m.unit ? ' ' + m.unit : '');
  }

  global.XinxuWearables = {
    PLATFORMS: PLATFORMS, METRICS: METRICS,
    byKey: byKey, metricByKey: metricByKey,
    connected: connected, isConnected: isConnected,
    connect: connect, disconnect: disconnect, sync: sync,
    days: days, dayOf: dayOf,
    contextFor: contextFor, fmt: fmt,
    KEY: KEY,
  };
})(window);
