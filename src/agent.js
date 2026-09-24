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

  var NOTICE_VERSION = 'ai-support-v2';

  /* ================= Provider ================= */
  /* 接口契约（与核心架构文档 §3 的 POST /assist 对齐）：
       call(payload) -> Promise<{ text, suggest:{memory,entry}, strategy, raw }>
     payload 里只有用户本次输入、本次目标、用户显式允许的上下文。
     不发全部历史日记、不发沙盘作品内容、不发设备原始数据。 */

  /* --- HTTP provider：接自己的后端，密钥留服务端 --- */
  /* 浏览器里绝不放模型密钥。 */
  var http = {
    name: 'http',
    label: '自建后端',
    call: function (payload) {
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, 30000);
      return fetch('/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      }).then(function (r) {
        clearTimeout(to);
        return r.json().then(function (body) {
          if (!r.ok) throw new Error(body.detail || body.message || '后端返回 ' + r.status);
          return body;
        });
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

  function provider() { return http; }

  /* ================= 上下文 ================= */
  /* 只取需要的，且都做精简。设备与记忆都只取「用户已确认允许」的部分。 */

  function gather(req) {
    var use = req.use || {};
    var ctx = { today: global.XinxuMood ? XinxuMood.todayStr() : null };

    var all = global.XinxuMood ? XinxuMood.loadEntries().entries : [];

    if (use.entries === true && global.XinxuMood) {
      ctx.total = all.length;
      ctx.recent = all.slice(0, 8).map(function (e) {
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

    if (use.sandbox === true && global.Scene) {
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

    if (use.memory === true && global.XinxuMemory) {
      ctx.memory = (XinxuMemory.contextFor() || []).slice(0, 10);
    }

    return ctx;
  }

  /* ================= 请求载荷 ================= */
  /* 注意这里**不发系统提示词**。
     它是版本化的产品边界，不是普通配置：如果由客户端发过去，改个前端
     就能绕过全部限制。权威副本在后端 server/assist.py 的 SYSTEM，
     跟着 PROMPT_VERSION 一起升版本。
     这里只发用户本次输入、本次目标，以及用户显式允许的上下文。 */
  function buildPayload(req, ctx) {
    var sentContext = {};
    Object.keys(ctx).forEach(function (key) { if (key !== 'signals') sentContext[key] = ctx[key]; });
    return {
      input: String(req.input || ''),
      task: req.task || 'chat',
      goal: req.goal || null,
      stage: req.stage || 'explore',
      context: sentContext,
      style: req.style || 'warm',
      history: (req.history || []).slice(-6),
      analysis: req.analysis || {},
      consent: req.consent === true,
      consent_version: NOTICE_VERSION,
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
        return buildPayload(req, ctx);
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
          out.suggest = { memory: [], entry: null };
        }
        return commit(out, req, ctx);
      })
      .then(function (r) {
        actions = r;
        return {
          reply: out.text,
          strategy: out.strategy || '',
          safety: out.raw && out.raw.safety ? out.raw.safety : safety,
          blocked: out.blocked || null,
          generatedBy: out.raw && out.raw.generatedBy ? out.raw.generatedBy : 'model',
          understanding: out.raw && out.raw.understanding ? out.raw.understanding : '',
          actions: out.blocked ? [] : (out.raw && out.raw.actions ? out.raw.actions : []),
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
    provider: provider,
    assessOutput: assessOutput,
    NOTICE_VERSION: NOTICE_VERSION,
  };
})(window);

