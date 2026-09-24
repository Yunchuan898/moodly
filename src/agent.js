/* 心绪 · 对话与分析的编排
 *
 * 这里不实现模型，只编排流程。模型是可插拔的 provider，换成哪家都行。
 *
 * 为什么要有编排层、而不是直接问模型：
 * 我们有自己的固定动作要做——写日记、更新长期记忆、记会话、跑安全检查。
 * 这些不能交给模型决定要不要做，也不能让它直接写。所以流程是：
 *
 *   汇集我们的数据 → 输入安检 → 构造受约束的请求 → 调模型
 *                 → 输出安检 → ★我们执行固定动作 → 返回
 *
 * ★ 那一步是重点：模型只能「建议」，落盘由我们的代码做，且写用户数据
 *   之前一律经用户确认。
 *
 * 安全层是横切的一层，不是流水线里的一个工位（调研文档 §1 的结论：
 * 风险跨轮累积，单轮检测测不出来）。所以输入和输出两侧都有。
 */
(function (global) {
  'use strict';

  var CFG_KEY = 'xinxu.agent.config.v1';
  var SES_KEY = 'xinxu.agent.sessions.v1';

  /* ---------- 配置 ---------- */
  function config() {
    var c = null;
    try { c = JSON.parse(global.localStorage.getItem(CFG_KEY) || 'null'); } catch (e) {}
    c = c || {};
    if (!c.provider) c.provider = 'stub';
    return c;
  }
  function setConfig(patch) {
    var c = config();
    for (var k in patch) c[k] = patch[k];
    try { global.localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {}
    return c;
  }

  /* ================= Provider ================= */
  /* 接口契约（与核心架构文档 §3 的 POST /assist 对齐）：
       call(payload) -> Promise<{ text, suggest:{memory,entry}, strategy, raw }>
     payload 里只有用户本次输入、本次目标、用户显式允许的上下文。
     不发全部历史日记、不发沙盘作品内容、不发设备原始数据。 */

  /* --- 占位 provider：没有后端时让界面能跑通 --- */
  /* 它不假装自己是模型。回复里会明说当前是占位。 */
  var stub = {
    name: 'stub',
    label: '占位（未接模型）',
    call: function (payload) {
      return new Promise(function (res) {
        setTimeout(function () {
          var c = payload.context || {};
          var bits = [];
          if (c.recent && c.recent.length) bits.push('最近 ' + c.recent.length + ' 条记录');
          if (c.devices) bits.push(c.devices.rows.length + ' 天设备线索');
          if (c.memory) bits.push(c.memory.length + ' 条长期记忆');

          var text =
            '【当前是占位回复，没有真的调用模型】\n\n' +
            '我这边能看到：' + (bits.length ? bits.join('、') : '暂时还没有可用的上下文') + '。\n' +
            '你说的是：「' + String(payload.input || '').slice(0, 40) + '」。\n\n' +
            '接上真实模型后，这里会是它基于上面这些上下文的回应。' +
            '流程（汇总上下文 → 安全检查 → 调模型 → 再检查 → 执行记录）已经走通了，' +
            '换成真的 provider 即可。';

          res({
            text: text,
            strategy: '占位',
            /* 占位器也要把「建议 → 用户确认 → 我们的代码落盘」这条链演示完整，
               否则界面上看不到提议条，也不知道真接上模型后会长什么样。
               真实 provider 的 suggest 由模型给，形状相同。 */
            suggest: {
              memory: [{ kind: 'fact', text: '这是占位 provider 提的一条建议' }],
              entry: { v: 0.42, a: 0.30, note: '（占位建议，不是模型判断的）', tags: [] },
            },
            raw: null,
          });
        }, 420);
      });
    },
  };

  /* --- HTTP provider：接自己的后端，密钥留服务端 --- */
  /* 浏览器里绝不放模型密钥。后端地址由用户填，默认空。 */
  var http = {
    name: 'http',
    label: '自建后端',
    call: function (payload) {
      var c = config();
      if (!c.endpoint) {
        return Promise.reject(new Error('还没有填后端地址'));
      }
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, c.timeoutMs || 30000);
      return fetch(c.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      }).then(function (r) {
        clearTimeout(to);
        if (!r.ok) throw new Error('后端返回 ' + r.status);
        return r.json();
      }).then(function (j) {
        return {
          text: String(j.reply || j.text || ''),
          strategy: j.strategy || '',
          suggest: j.suggest || { memory: [], entry: null },
          raw: j,
        };
      });
    },
  };

  var PROVIDERS = { stub: stub, http: http };
  function provider() { return PROVIDERS[config().provider] || stub; }

  /* ================= 上下文 ================= */
  /* 只取需要的，且都做精简。设备与记忆都只取「用户已确认允许」的部分。 */

  function gather(req) {
    var use = req.use || {};
    var ctx = { today: global.XinxuMood ? XinxuMood.todayStr() : null };

    var all = global.XinxuMood ? XinxuMood.loadEntries().entries : [];

    if (use.entries !== false && global.XinxuMood) {
      ctx.total = all.length;
      ctx.recent = all.slice(0, 20).map(function (e) {
        return {
          date: e.date,
          time: XinxuMood.hmOf(e.ts),
          // 只给坐标和最近的锚点名，不给整段日记原文
          valence: e.v, arousal: e.a,
          near: XinxuMood.nearest(e.v, e.a).label,
          tags: e.tags || [],
          hasNote: !!(e.note && e.note.trim()),
        };
      });
    }

    /* 安全层要的两个量。
       这里以前写死成 0——那等于安全层在最需要它的那类输入上永远不升级，
       因为弱信号必须叠加「强度」或「反复出现」才有意义。 */
    var sig = { intensity: 0, lowStreak: 0 };
    if (all.length && global.XinxuSafety) {
      var last = all[0];
      sig.intensity = XinxuMood.intensity(last.v, last.a);
      sig.lowStreak = XinxuSafety.lowStreak(all, {
        from: XinxuMood.todayStr(),
        valueOf: function (e) { return XinxuMood.legacyVal(e.v); },
      });
    }
    ctx.signals = sig;

    if (use.sandbox !== false && global.Scene) {
      // 沙盘只给「有几次、什么时候、起没起名字」，不给摆放内容。
      // 作品的意义归用户，不该被拿去当模型的素材。
      ctx.sandbox = Scene.listScenes().slice(0, 10).map(function (s) {
        return { date: s.date, named: !!(s.name && s.name !== '未命名'),
                 pieces: (s.data.items || []).length };
      });
    }

    if (use.devices && global.XinxuWearables) {
      ctx.devices = XinxuWearables.contextFor(null, 7);
    }

    if (use.memory !== false && global.XinxuMemory) {
      ctx.memory = XinxuMemory.contextFor();
    }

    return ctx;
  }

  /* ================= 请求载荷 ================= */
  /* 注意这里**不发系统提示词**。
     它是版本化的产品边界，不是普通配置：如果由客户端发过去，改个前端
     就能绕过全部限制。权威副本在后端 server/assist.py 的 SYSTEM，
     跟着 PROMPT_VERSION 一起升版本。
     这里只发用户本次输入、本次目标，以及用户显式允许的上下文。 */
  function buildPayload(req, ctx, safety) {
    return {
      input: String(req.input || ''),
      task: req.task || 'chat',
      goal: req.goal || null,
      stage: req.stage || 'explore',
      context: ctx,
      // 这里给的是「提示」，供后端参考；后端必须自己再判一次并以此为准，
      // 因为客户端是可被改的。
      safety: {
        level: safety.level,
        reasons: safety.reasons,
        intensity: safety.intensity || 0,
        lowStreak: safety.lowStreak || 0,
      },
    };
  }

  /* ================= 输出检查 ================= */
  /* 拆成独立的纯函数，可以单测。这些是「模型说了不该说的话」的兜底。 */
  var OUT_BAD = [
    { re: /你(患有|得了|是)(抑郁症|焦虑症|双相|PTSD|人格障碍)/, why: '做了诊断' },
    { re: /(一定能|保证|包你)(治好|痊愈|改善)/, why: '保证了疗效' },
    { re: /(停|减)(药|掉药)|不用(吃|看)(药|医生)/, why: '给了用药建议' },
    { re: /我(已经|会)(帮你)?(联系|通知)(了)?(你的)?(家人|朋友|医生|警察)/, why: '声称联系了他人' },
  ];
  function assessOutput(text) {
    var t = String(text || '');
    var hits = [];
    OUT_BAD.forEach(function (r) { if (r.re.test(t)) hits.push(r.why); });
    return { ok: hits.length === 0, reasons: hits };
  }

  /* ================= 执行我们的固定动作 ================= */
  /* 模型只能建议。这里是唯一会写用户数据的地方，而且只写「待确认」。 */
  function commit(out, req, ctx) {
    var result = { memory: [], entry: null, notes: [] };

    var sug = out.suggest || {};

    if (sug.memory && sug.memory.length && global.XinxuMemory) {
      // 只接受我们认识的 kind，其余丢掉；长度与去重由 Memory 负责
      result.memory = XinxuMemory.propose(sug.memory.map(function (m) {
        return { kind: m.kind, text: m.text };
      }));
    }

    if (sug.entry && typeof sug.entry === 'object') {
      var v = Number(sug.entry.v), a = Number(sug.entry.a);
      if (isFinite(v) && isFinite(a) && v >= 0 && v <= 1 && a >= 0 && a <= 1) {
        result.entry = {
          v: Math.round(v * 1000) / 1000,
          a: Math.round(a * 1000) / 1000,
          note: String(sug.entry.note || '').slice(0, 200),
          tags: (sug.entry.tags || []).filter(function (t) { return typeof t === 'string'; }).slice(0, 5),
        };
      } else {
        // 坐标越界的建议直接丢掉，而不是夹到边界——那会凭空造出一条用户没说过的记录
        result.notes.push('模型给的心情坐标不合法，已忽略');
      }
    }

    return result;
  }

  /* ================= 会话 ================= */
  function sessions() {
    var a = null;
    try { a = JSON.parse(global.localStorage.getItem(SES_KEY) || '[]'); } catch (e) {}
    return Array.isArray(a) ? a : [];
  }
  function pushTurn(turn) {
    var a = sessions();
    a.push(turn);
    if (a.length > 200) a = a.slice(-200);
    try { global.localStorage.setItem(SES_KEY, JSON.stringify(a)); } catch (e) {}
  }
  function clearSessions() {
    try { global.localStorage.removeItem(SES_KEY); } catch (e) {}
  }

  /* ================= 主流程 ================= */
  /* 每一步都是独立的具名函数，便于单独看与单独测。 */
  function run(req) {
    req = req || {};
    var t0 = Date.now();
    var ctx, safety, payload, out, actions;

    var p = Promise.resolve()
      .then(function () { return gather(req); })
      .then(function (c) {
        ctx = c;
        // 输入安检在调模型之前。用 assess 而不是 XinxuSafety.check：
        // check() 有「同一天只提醒一次」的逻辑，那是给日记保存用的；
        // 对话里第 20 轮才浮现的危机信号不能被那条日限静默掉。
        safety = global.XinxuSafety
          ? XinxuSafety.assess(req.input, ctx.signals)
          : { level: 'none', reasons: [], intensity: 0, lowStreak: 0 };
        safety.intensity = ctx.signals.intensity;
        safety.lowStreak = ctx.signals.lowStreak;
        return buildPayload(req, ctx, safety);
      })
      .then(function (pl) {
        payload = pl;
        return provider().call(pl);
      })
      .then(function (o) {
        out = o;
        var oc = assessOutput(o.text);
        if (!oc.ok) {
          // 模型越界时，不把这段话交给用户，换成一句安全的说明 + 走人工兜底
          out.text = '这句话我不能这么说，已拦下。\n\n' +
                     '如果我刚才的判断让你觉得被下了结论，那不是你的问题——是我的。' +
                     '你可以换一种说法再问我一次，或者直接说说现在的感受。';
          out.blocked = oc.reasons;
        }
        return commit(out, req, ctx);
      })
      .then(function (r) {
        actions = r;
        pushTurn({
          ts: Date.now(),
          input: String(req.input || ''),
          reply: out.text,
          provider: provider().name,
          safety: safety.level,
          blocked: out.blocked || null,
        });
        return {
          reply: out.text,
          strategy: out.strategy || '',
          safety: safety,
          blocked: out.blocked || null,
          // 待用户确认的，不是已执行的
          suggest: { memory: actions.memory, entry: actions.entry },
          notes: actions.notes,
          meta: { provider: provider().name, ms: Date.now() - t0 },
        };
      });

    return p;
  }

  global.XinxuAgent = {
    run: run,
    config: config, setConfig: setConfig,
    providers: PROVIDERS, provider: provider,
    assessOutput: assessOutput,
    sessions: sessions, clearSessions: clearSessions,
    CFG_KEY: CFG_KEY, SES_KEY: SES_KEY,
  };
})(window);
