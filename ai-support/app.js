const MEMORY_KEY = 'xinxu.ai.memory.v1';
const CONSENT_KEY = 'xinxu.ai.consent.v1';
const $ = id => document.getElementById(id);
const state = { info: null, history: [], busy: false, controller: null, requestId: 0, goal: 'be_heard' };
const PHASE_FOR_GOAL = { be_heard: 'soothe', understand: 'explore', calm: 'soothe', next_step: 'act' };

function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { status('浏览器无法保存本机数据，请检查存储设置。'); return false; }
}
function remove(key) {
  try { localStorage.removeItem(key); return true; }
  catch { status('浏览器无法清除本机数据，请检查存储设置。'); return false; }
}
function memory() {
  const value = read(MEMORY_KEY, []);
  return Array.isArray(value) ? value.filter(x => typeof x === 'string' && x.trim()).slice(0, 10) : [];
}
function status(text) { $('status').textContent = text; }
function button(label, className = 'secondary') {
  const el = document.createElement('button');
  el.type = 'button'; el.className = className; el.textContent = label;
  return el;
}

function renderMemory() {
  const host = $('memoryList');
  host.replaceChildren();
  const items = memory();
  if (!items.length) {
    const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = '目前没有已保存的记忆。'; host.append(empty);
  }
  items.forEach((text, index) => {
    const row = document.createElement('div'); row.className = 'item';
    const input = document.createElement('input'); input.type = 'text'; input.maxLength = 120; input.value = text; input.setAttribute('aria-label', `第 ${index + 1} 条记忆`);
    const save = button('保存修改');
    save.addEventListener('click', () => {
      const next = input.value.trim();
      if (!next) return status('记忆不能为空。');
      const all = memory(); all[index] = next;
      if (write(MEMORY_KEY, all)) { renderMemory(); status('修改已保存到本机。'); }
    });
    const remove = button('删除');
    remove.addEventListener('click', () => {
      const all = memory(); all.splice(index, 1);
      if (write(MEMORY_KEY, all)) { renderMemory(); status('已从本机删除这条记忆。'); }
    });
    row.append(input, save, remove); host.append(row);
  });
}

function addMemory(text) {
  const value = String(text || '').trim();
  const all = memory();
  if (!value || value.length > 120) return status('请把偏好写在 120 字以内。');
  if (all.length >= 10) return status('最多保存 10 条记忆，请先删除不需要的。');
  if (all.includes(value)) return status('这条偏好已经保存。');
  if (write(MEMORY_KEY, [...all, value])) { $('memoryInput').value = ''; renderMemory(); status('偏好已保存到本机；只有勾选后才会发送。'); }
}

function consentRecord() {
  const info = state.info;
  return { version: info.consentVersion, providerName: info.providerName, privacyUrl: info.privacyUrl, retention: info.retention, agreedAt: new Date().toISOString() };
}
function consentMatches() {
  if (!state.info) return false;
  const saved = read(CONSENT_KEY, null);
  const current = consentRecord();
  return !!saved && ['version', 'providerName', 'privacyUrl', 'retention'].every(key => saved[key] === current[key]);
}

function showBubble(kind, value, label) {
  const node = document.createElement('div'); node.className = `bubble ${kind}`;
  const caption = document.createElement('small'); caption.textContent = label;
  const body = document.createElement('div'); body.textContent = value;
  node.append(caption, body); $('chat').append(node);
}

function renderResult(data) {
  const panel = $('resultPanel'); panel.classList.remove('hide');
  $('strategy').textContent = data.strategy ? `本次方式：${data.strategy.label}。想换一种方式，可以直接点上方目标按钮。` : '这次已转为安全提示，未调用模型。';
  $('understanding').replaceChildren(); $('actions').replaceChildren(); $('memoryCandidate').replaceChildren();
  if (data.understanding) {
    const area = $('understanding');
    const title = document.createElement('p'); title.textContent = `我目前的理解：${data.understanding}`;
    const correct = button('纠正这个理解');
    correct.addEventListener('click', () => { $('message').value = '我想纠正你的理解：'; $('message').focus(); });
    area.append(title, correct);
  }
  if (Array.isArray(data.actions) && data.actions.length) {
    const title = document.createElement('h2'); title.textContent = '你可以考虑的行动'; $('actions').append(title);
    data.actions.forEach(action => {
      const row = document.createElement('div'); row.className = 'item';
      const name = document.createElement('strong'); name.textContent = action.title;
      const desc = document.createElement('p'); desc.textContent = action.description;
      const edit = document.createElement('textarea'); edit.value = `${action.title}：${action.description}`; edit.maxLength = 300; edit.setAttribute('aria-label', `编辑行动：${action.title}`);
      const choose = button('我选择这一步');
      choose.addEventListener('click', () => { status(`已选择：${edit.value.trim() || action.title}。本页不会自动提醒或发送给任何人。`); });
      const skip = button('这步不适合我');
      skip.addEventListener('click', () => { row.remove(); status('已跳过这条建议。'); });
      row.append(name, desc, edit, choose, skip); $('actions').append(row);
    });
  }
  if (data.memoryCandidate) {
    const row = $('memoryCandidate');
    const title = document.createElement('h2'); title.textContent = 'AI 建议记住的回应偏好';
    const input = document.createElement('input'); input.type = 'text'; input.maxLength = 120; input.value = data.memoryCandidate; input.setAttribute('aria-label', '编辑拟保存的记忆');
    const save = button('确认后保存'); save.addEventListener('click', () => { addMemory(input.value); row.replaceChildren(); });
    const reject = button('不保存'); reject.addEventListener('click', () => row.replaceChildren());
    row.append(title, input, save, reject);
  }
}

async function loadInfo() {
  try {
    const response = await fetch('/api/support/info', { cache: 'no-store' });
    if (!response.ok) throw new Error('INFO');
    const info = await response.json(); state.info = info;
    $('provider').textContent = info.ready ? `模型服务方：${info.providerName}` : '模型服务与数据告知尚未配置，此页面暂不能发送 AI 请求。';
    $('retention').textContent = info.retention ? `供应商保留说明：${info.retention}` : '';
    if (info.privacyUrl) {
      const link = document.createElement('a'); link.href = info.privacyUrl; link.rel = 'noopener noreferrer'; link.target = '_blank'; link.textContent = '查看模型服务方隐私政策'; $('policy').append(link);
    }
    $('consent').checked = consentMatches();
    $('send').disabled = !info.ready;
  } catch { $('provider').textContent = '无法读取模型服务信息，当前不能发送。'; status('请确认本地服务已启动。'); }
}

async function send() {
  if (state.busy || !state.info?.ready) return;
  const message = $('message').value.trim();
  if (!message) return status('先写下你想说的话。');
  if (!$('consent').checked) return status('请先阅读并确认本次 AI 数据告知。');
  if (!consentMatches() && !write(CONSENT_KEY, consentRecord())) return;
  const body = {
    consent: true, consentVersion: state.info.consentVersion,
    message, goal: state.goal, phase: PHASE_FOR_GOAL[state.goal], style: 'warm',
    history: state.history.slice(-6), memory: $('includeMemory').checked ? memory() : []
  };
  state.busy = true; $('send').disabled = true; status('正在等待回应……');
  const requestId = ++state.requestId;
  const controller = new AbortController(); state.controller = controller;
  try {
    const response = await fetch('/api/support/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    const result = await response.json();
    if (requestId !== state.requestId) return;
    if (!response.ok) throw new Error(result.message || '发送失败，请稍后再试。');
    showBubble('user', message, '你');
    showBubble('assistant', result.reply, result.generatedBy === 'model' ? 'AI 回应' : '安全提示 · 未调用模型');
    $('message').value = '';
    if (result.generatedBy === 'model') state.history.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });
    state.history = state.history.slice(-6);
    renderResult(result);
    status(result.safety ? '本次未调用模型；请优先考虑现实中的支持。' : '回应已完成；行动和记忆都由你决定。');
  } catch (err) { if (requestId === state.requestId) status(err.message || '发送失败，请稍后再试。'); }
  finally { if (requestId === state.requestId) { state.busy = false; state.controller = null; $('send').disabled = !state.info?.ready; } }
}

function endSession() {
  state.requestId += 1;
  state.controller?.abort(); state.controller = null; state.busy = false;
  state.history = []; $('chat').replaceChildren(); $('resultPanel').classList.add('hide'); $('message').value = '';
  $('send').disabled = !state.info?.ready;
}

$('addMemory').addEventListener('click', () => addMemory($('memoryInput').value));
$('goalChoices').addEventListener('click', event => {
  const target = event.target.closest('button[data-goal]');
  if (!target) return;
  state.goal = target.dataset.goal;
  $('goalChoices').querySelectorAll('button[data-goal]').forEach(choice => choice.setAttribute('aria-pressed', String(choice === target)));
});
$('clearMemory').addEventListener('click', () => { if (remove(MEMORY_KEY)) { renderMemory(); status('本机记忆已清除。已发送中的请求无法撤回。'); } });
$('send').addEventListener('click', send);
$('endSession').addEventListener('click', () => { endSession(); status('本次会话已清空。已发送中的请求无法撤回。'); });
$('clearAll').addEventListener('click', () => {
  if (!remove(MEMORY_KEY) || !remove(CONSENT_KEY)) return;
  endSession(); $('consent').checked = false; $('includeMemory').checked = false; renderMemory(); status('本机 AI 会话、记忆和同意记录已清除。已发送中的请求无法撤回。');
});
renderMemory(); loadInfo();
