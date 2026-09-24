import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { GOALS, PHASES, STYLES, actionCandidates, chosenActions, selectStrategy } from './strategies.mjs';
import { assessInput } from './safety.mjs';
import { generateSupport } from './model.mjs';

const NOTICE_VERSION = 'ai-support-v1';
const HOST = process.env.AI_SUPPORT_HOST || '127.0.0.1';
const PORT = Number(process.env.AI_SUPPORT_PORT || 8787);
const MAX_BODY_BYTES = 24000;
const hits = new Map();

function configuredUrl(value) {
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (url.protocol === 'https:' || (loopback && url.protocol === 'http:')) ? url.href : '';
  } catch { return ''; }
}

const config = {
  apiUrl: configuredUrl(process.env.MODEL_API_URL),
  apiKey: process.env.MODEL_API_KEY || '',
  model: process.env.MODEL_NAME || '',
  providerName: process.env.AI_PROVIDER_NAME || '',
  privacyUrl: configuredUrl(process.env.AI_PROVIDER_PRIVACY_URL),
  retention: process.env.AI_PROVIDER_RETENTION || ''
};
const ready = Object.values(config).every(Boolean);

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(JSON.stringify(body));
}

function error(status, code, message) { return { status, code, message }; }

async function readJson(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw error(415, 'CONTENT_TYPE', '请发送 JSON 请求。');
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw error(413, 'TOO_LARGE', '内容过长，请缩短后重试。');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw error(400, 'BAD_JSON', '请求格式无法读取。'); }
}

function textField(value, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) return null;
  return value.trim();
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'BAD_INPUT', '请求格式不正确。');
  if (body.consentVersion !== NOTICE_VERSION || body.consent !== true) throw error(403, 'CONSENT_REQUIRED', '请先阅读并确认本次 AI 数据告知。');
  const message = textField(body.message, 2000, true);
  if (!message || !GOALS.includes(body.goal) || !PHASES.includes(body.phase) || !STYLES.includes(body.style)) throw error(400, 'BAD_INPUT', '消息、目标或回应方式不正确。');
  if (!Array.isArray(body.history) || body.history.length > 6 || !Array.isArray(body.memory) || body.memory.length > 10) throw error(400, 'BAD_INPUT', '上下文数量超出限制。');
  const history = body.history.map(item => {
    const content = textField(item?.content, 1000, true);
    if (!content || !['user', 'assistant'].includes(item?.role)) throw error(400, 'BAD_INPUT', '会话历史格式不正确。');
    return { role: item.role, content };
  });
  const memory = body.memory.map(item => {
    const content = textField(item, 120, true);
    if (!content) throw error(400, 'BAD_INPUT', '记忆内容过长或为空。');
    return content;
  });
  const hint = body.analysis?.strategyHint;
  const strategyHint = typeof hint === 'string' && ['reflect', 'clarify', 'ground', 'reframe', 'plan'].includes(hint) ? hint : null;
  return { message, goal: body.goal, phase: body.phase, style: body.style, history, memory, analysis: { strategyHint } };
}

function rateLimited(req) {
  const key = req.socket.remoteAddress || 'local';
  const now = Date.now();
  const recent = (hits.get(key) || []).filter(time => now - time < 60000);
  if (recent.length >= 20) return true;
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 1000) for (const [ip, times] of hits) if (times.every(time => now - time >= 60000)) hits.delete(ip);
  return false;
}

async function handleRespond(req, res) {
  if (!ready) return json(res, 503, { error: 'NOT_CONFIGURED', message: '模型或供应商数据告知尚未配置，当前不能发送 AI 请求。' });
  if (rateLimited(req)) return json(res, 429, { error: 'RATE_LIMIT', message: '请求太频繁，请稍后再试。' });
  let input;
  try { input = validate(await readJson(req)); }
  catch (err) { return json(res, err.status || 400, { error: err.code || 'BAD_INPUT', message: err.message || '请求无效。' }); }

  const risk = assessInput(input.message) || input.history.filter(item => item.role === 'user').map(item => assessInput(item.content)).find(Boolean);
  if (risk) return json(res, 200, { generatedBy: 'safety-rule', reply: risk.message, understanding: '', phase: input.phase, strategy: null, actions: [], memoryCandidate: '', safety: risk });

  const strategy = selectStrategy(input);
  const candidates = actionCandidates(input.goal);
  try {
    const generated = await generateSupport(config, input, strategy, candidates);
    return json(res, 200, {
      generatedBy: 'model',
      reply: generated.reply,
      understanding: generated.understanding,
      phase: strategy.phase,
      strategy: { id: strategy.id, label: strategy.label },
      actions: chosenActions(input.goal, generated.actionIds),
      memoryCandidate: generated.memoryCandidate,
      safety: null
    });
  } catch (err) {
    const code = ['MODEL_TIMEOUT', 'MODEL_FORMAT', 'MODEL_UNSAFE'].includes(err.message) ? err.message : 'MODEL_UPSTREAM';
    const messages = {
      MODEL_TIMEOUT: '回应超时了，请稍后重试。',
      MODEL_FORMAT: '这次回应的格式不符合要求，请重试。',
      MODEL_UNSAFE: '这次回应未通过安全检查，请换一种表达或寻求真人支持。',
      MODEL_UPSTREAM: '模型服务暂时不可用，请稍后重试。'
    };
    return json(res, 502, { error: code, message: messages[code] });
  }
}

async function serveFile(res, file, type) {
  try {
    const body = await readFile(new URL(file, import.meta.url));
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'"
    });
    res.end(body);
  } catch { json(res, 500, { error: 'FILE_ERROR', message: '页面暂时无法读取。' }); }
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('AI_SUPPORT_PORT 必须是 1–65535 的整数');
async function route(req, res) {
  const path = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
  if (req.method === 'GET' && (path === '/' || path === '/ai-support/')) return serveFile(res, './index.html', 'text/html; charset=utf-8');
  if (req.method === 'GET' && path === '/ai-support/app.js') return serveFile(res, './app.js', 'text/javascript; charset=utf-8');
  if (req.method === 'GET' && path === '/api/support/info') {
    return json(res, 200, { ready, consentVersion: NOTICE_VERSION, providerName: config.providerName || null, privacyUrl: config.privacyUrl || null, retention: config.retention || null, dataSent: ['本次消息', '最近最多六条会话', '本次勾选允许使用的已确认记忆', '本次目标、阶段与回应方式'], serverStorage: '服务端不保存对话正文；模型供应商的数据处理以其政策及实际配置为准。' });
  }
  if (req.method === 'POST' && path === '/api/support/respond') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) return json(res, 403, { error: 'ORIGIN', message: '请从同源页面发起请求。' });
    return handleRespond(req, res);
  }
  return json(res, 404, { error: 'NOT_FOUND', message: '未找到该地址。' });
}
http.createServer((req, res) => {
  route(req, res).catch(() => {
    if (!res.headersSent) json(res, 500, { error: 'SERVER_ERROR', message: '服务暂时无法处理请求。' });
    else res.end();
  });
}).listen(PORT, HOST, () => {
  process.stdout.write(`心绪 AI 支持切片已启动：http://${HOST}:${PORT}/ai-support/\n`);
  if (!ready) process.stdout.write('模型或供应商告知配置不完整，AI 请求会被拒绝。\n');
});
