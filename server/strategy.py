"""有限、可解释的支持策略与行动目录。模型只能从目录中选择。"""

from __future__ import annotations

GOALS = ("be_heard", "understand", "calm", "next_step")
PHASE_FOR_GOAL = {
    "be_heard": "soothe", "understand": "explore", "calm": "soothe", "next_step": "act"
}

STRATEGIES = {
    "reflect": ("倾听与复述", "先准确复述感受与处境，不急着建议，也不说套话。"),
    "clarify": ("探索与澄清", "把理解当作可纠正的假设，最多问一个开放问题。"),
    "ground": ("当下稳定", "先确认用户是否愿意尝试短暂稳定练习，不描述为治疗。"),
    "reframe": ("想法梳理", "帮助区分事实、解释和感受，不争辩或否定体验。"),
    "plan": ("小步行动", "围绕用户认可的目标提供可拒绝的小行动。"),
}

BY_GOAL = {
    "be_heard": ("reflect",),
    "understand": ("clarify", "reframe"),
    "calm": ("ground", "reflect"),
    "next_step": ("plan", "clarify"),
}

ACTIONS = {
    "trigger_note": ("记下这次情境", "只写发生了什么、自己的感受和仍不确定的部分。"),
    "two_columns": ("区分事实与猜测", "把确定发生的事和自己的解释分两栏写下。"),
    "breathe": ("试一分钟慢呼吸", "如果你愿意，放慢呼气；不舒服就停下。"),
    "orient": ("看看周围", "说出眼前能看到的几样东西，把注意力带回当下。"),
    "ten_minutes": ("选一个十分钟步骤", "把今天能做的一件小事缩到十分钟以内。"),
    "ask_support": ("考虑找现实中的支持", "想想是否愿意向信任的人或专业渠道说明需要帮助。"),
}

ACTIONS_BY_GOAL = {
    "be_heard": (),
    "understand": ("trigger_note", "two_columns"),
    "calm": ("orient", "breathe"),
    "next_step": ("ten_minutes", "ask_support"),
}


def choose_strategy(goal: str, stage: str, hint: str | None = None) -> dict[str, str]:
    allowed = BY_GOAL[goal]
    chosen = allowed[0]
    if goal == "understand" and stage == "soothe":
        chosen = "reframe"
    if goal == "calm" and stage == "explore":
        chosen = "reflect"
    if goal == "next_step" and stage == "explore":
        chosen = "clarify"
    if hint in allowed:
        chosen = hint
    label, instruction = STRATEGIES[chosen]
    return {"id": chosen, "label": label, "instruction": instruction}


def candidates(goal: str) -> list[str]:
    return list(ACTIONS_BY_GOAL[goal])


def choose_actions(goal: str, ids: list[str] | None) -> list[dict[str, str]]:
    allowed = ACTIONS_BY_GOAL[goal]
    chosen = list(dict.fromkeys(item for item in (ids or []) if item in allowed))[:2]
    if not chosen and allowed:
        chosen = [allowed[0]]
    return [dict(id=item, title=ACTIONS[item][0], description=ACTIONS[item][1]) for item in chosen]

