export const GOALS = ['be_heard', 'understand', 'calm', 'next_step'];
export const PHASES = ['explore', 'soothe', 'act'];
export const STYLES = ['warm', 'direct'];

const STRATEGIES = {
  reflect: { id: 'reflect', label: '倾听与复述', phase: 'soothe', instruction: '先准确复述用户的感受与处境；不急着解决，不说套话。' },
  clarify: { id: 'clarify', label: '探索与澄清', phase: 'explore', instruction: '把理解作为可纠正的假设，最多问一个开放问题，不推断单一原因。' },
  ground: { id: 'ground', label: '当下稳定', phase: 'soothe', instruction: '先确认用户是否愿意做简短的当下稳定练习；不把练习描述为治疗。' },
  reframe: { id: 'reframe', label: '想法梳理', phase: 'explore', instruction: '帮助区分事实、解释和感受，避免争辩或否定用户体验。' },
  plan: { id: 'plan', label: '小步行动', phase: 'act', instruction: '围绕用户自己认可的目标，提出低负担、可拒绝的小步行动。' }
};

const BY_GOAL = {
  be_heard: ['reflect'],
  understand: ['clarify', 'reframe'],
  calm: ['ground', 'reflect'],
  next_step: ['plan', 'clarify']
};

export const ACTIONS = Object.freeze({
  pause: { id: 'pause', title: '给自己一点缓冲', description: '暂停几分钟，先不用决定接下来必须做什么。' },
  share_draft: { id: 'share_draft', title: '写一段想说的话', description: '先写给自己看；是否分享给信任的人，由你决定。' },
  trigger_note: { id: 'trigger_note', title: '记下这次情境', description: '只写发生了什么、自己的感受和仍不确定的部分。' },
  two_columns: { id: 'two_columns', title: '区分事实与猜测', description: '把确定发生的事和自己的解释分两栏写下。' },
  breathe: { id: 'breathe', title: '试一分钟慢呼吸', description: '如果你愿意，放慢呼气；不舒服就立刻停下。' },
  orient: { id: 'orient', title: '看看周围', description: '说出眼前能看到的几样东西，把注意力带回当下。' },
  ten_minutes: { id: 'ten_minutes', title: '选一个十分钟步骤', description: '把今天能做的一件小事缩到十分钟以内。' },
  ask_support: { id: 'ask_support', title: '考虑找现实中的支持', description: '想想是否愿意向信任的人或专业渠道说明需要帮助。' }
});

const ACTIONS_BY_GOAL = {
  be_heard: ['pause', 'share_draft'],
  understand: ['trigger_note', 'two_columns'],
  calm: ['orient', 'breathe'],
  next_step: ['ten_minutes', 'ask_support']
};

export function selectStrategy({ goal, phase, analysis }) {
  const allowed = BY_GOAL[goal];
  const hint = analysis?.strategyHint;
  let id = allowed[0];
  if (goal === 'understand' && phase === 'soothe') id = 'reframe';
  if (goal === 'calm' && phase === 'explore') id = 'reflect';
  if (goal === 'next_step' && phase === 'explore') id = 'clarify';
  if (allowed.includes(hint)) id = hint;
  const chosen = STRATEGIES[id];
  return { ...chosen, phase: chosen.phase };
}

export function actionCandidates(goal) {
  return ACTIONS_BY_GOAL[goal].map(id => ACTIONS[id]);
}

export function chosenActions(goal, ids) {
  const allowed = ACTIONS_BY_GOAL[goal];
  const selected = Array.isArray(ids) ? [...new Set(ids.filter(id => allowed.includes(id)))] : [];
  return (selected.length ? selected : allowed.slice(0, 1)).slice(0, 2).map(id => ACTIONS[id]);
}
