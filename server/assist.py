"""心绪 · 对话后端（参考实现）

前端（assist.html）里「设置 → 自建后端」填的地址，指的就是这个服务。

为什么编排在后端而不在前端：
  · 模型密钥只能待在服务端。浏览器里的任何东西用户都能看到。
  · 系统提示词是「版本化的规则」，不能由客户端传——否则改个前端就能
    绕过全部边界。
  · 安全层要在每次输入和输出上跑，且独立于主提示词。

契约（与 src/agent.js 的 http provider 对齐）：
  POST /assist
  请求 { input, task, goal, stage, context, safety }
  响应 { reply, strategy, suggest: { memory: [...], entry: {...}|null } }

跑起来：
  pip install -r requirements.txt
  设好 MODEL_BASE_URL / MODEL_API_KEY / MODEL_NAME 三个环境变量
  uvicorn assist:app --port 8000

注意：这是骨架。发上线前至少要补上——真实的、经专业人员审阅的风险
规则，限流，以及部署环境的密钥管理。
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

# ============================================================
# 1. 风险词表
# ============================================================
# 不在这里另抄一份。抄一份的下场是两边慢慢漂开，而漂开的方向通常是
# 服务端这份没人维护——于是线上跑的是最旧的那版。
#
# 前端那份是 src/safety-content.js，它是一个普通脚本，把词表挂在
# window.XinxuSafetyContent 上。这里直接把源文件读出来解析。
# 不够优雅，但保证只有一份真值。

_SAFETY_JS = Path(__file__).resolve().parent.parent / "src" / "safety-content.js"


def load_risk_terms() -> dict[str, list[str]]:
    try:
        src = _SAFETY_JS.read_text(encoding="utf-8")
    except OSError:
        return {"strong": [], "weak": []}

    def grab(field: str) -> list[str]:
        m = re.search(field + r"\s*:\s*\[(.*?)\]", src, re.S)
        return re.findall(r"'([^']+)'", m.group(1)) if m else []

    return {"strong": grab("strong"), "weak": grab("weak")}


RISK = load_risk_terms()


class Safety(BaseModel):
    level: Literal["none", "elevated", "urgent"] = "none"
    reasons: list[str] = Field(default_factory=list)


def assess_input(text: str, intensity: float = 0.0, low_streak: int = 0) -> Safety:
    """判断一句话的风险等级。

    故意压误报：单一弱信号不触发任何东西。误报毁掉的是信任本身——
    一个人被产品背刺过一次，就再也不会在里面写真话了。
    """
    text = text or ""
    if not text.strip():
        return Safety()

    strong = [t for t in RISK["strong"] if t in text]
    if strong:
        return Safety(level="urgent", reasons=[f"strong:{'/'.join(strong)}"])

    weak = [t for t in RISK["weak"] if t in text]
    if not weak:
        return Safety()

    escalated = len(weak) >= 2 or intensity >= 5 or low_streak >= 3
    if not escalated:
        return Safety()

    urgent = (len(weak) >= 2 and intensity >= 5) or low_streak >= 4
    return Safety(
        level="urgent" if urgent else "elevated",
        reasons=[f"weak:{'/'.join(weak)}"],
    )


# 模型说了不该说的话时的兜底。命中就不把那段交给用户。
OUTPUT_PATTERNS = [
    (re.compile(r"你(患有|得了|是)(抑郁症|焦虑症|双相|PTSD|人格障碍)"), "做了诊断"),
    (re.compile(r"(一定能|保证|包你)(治好|痊愈|改善)"), "保证了疗效"),
    (re.compile(r"(停|减)(药|掉药)|不用(吃|看)(药|医生)"), "给了用药建议"),
    (re.compile(r"我(已经|会)(帮你)?(联系|通知)(了)?(你的)?(家人|朋友|医生|警察)"), "声称联系了他人"),
]


def assess_output(text: str) -> list[str]:
    t = text or ""
    return [why for pattern, why in OUTPUT_PATTERNS if pattern.search(t)]


# ============================================================
# 2. 系统提示词（版本化的规则，只在服务端）
# ============================================================
# 改这里等于改产品边界，应当走评审并升版本号。

PROMPT_VERSION = "2026-09-24.1"

SYSTEM = """你是「心绪」里的陪伴者。心绪是一个情绪记录与自我关怀工具，不是治疗服务。

硬性边界，任何情况下都不越过：
· 不做诊断、不做心理状态判定、不给症状贴标签。
· 不宣称能治疗、不保证效果、不冒充专业人士。
· 不解读用户作品或情绪的象征含义——解释权归用户。
· 不替用户联系任何人，不给紧急情况下的替代方案。
· 不使用量表打分。

怎么回应：
· 先接住，再给选择。不要一上来就给建议。
· 说具体的事，不说「你要多休息」这类空话。
· 用户说「只听我说」「换种方式」「别给建议」时，照做。
· 不确定就说不确定。

关于上下文：
· 下面可能带情绪坐标、设备数据和长期记忆。设备数据只是背景线索，
  绝不能据此推断情绪或心理状态。睡眠短不等于心情差。
· 不要逐条复述用户的历史记录，那会像被监视。
"""


# ============================================================
# 3. 结构化输出
# ============================================================
# 用 with_structured_output 而不是让模型吐 JSON 再自己 parse——
# 后者在中文回复里很容易被引号和换行打乱。


class MemoryItem(BaseModel):
    kind: Literal["address", "like", "dislike", "method", "fact"] = Field(
        description="称呼 / 偏好的方式 / 不喜欢的 / 有用的办法 / 基本情况"
    )
    text: str = Field(description="一条具体的记忆，一句话，不要超过 40 字")


class EntrySuggestion(BaseModel):
    v: float = Field(ge=0, le=1, description="效价：0 极不愉快，1 极愉快")
    a: float = Field(ge=0, le=1, description="唤醒度：0 极平静，1 极激活")
    note: str = Field(default="", description="用户自己说的话，不要代笔")


class Reply(BaseModel):
    reply: str = Field(description="给用户的回复")
    strategy: str = Field(default="", description="这次用了什么支持方式，一句话，给用户看的")
    memory: list[MemoryItem] = Field(
        default_factory=list, description="值得长期记住的。没有就给空数组，不要凑数"
    )
    entry: Optional[EntrySuggestion] = Field(
        default=None, description="只有用户表达了明确的心情坐标才给，否则 null"
    )


# ============================================================
# 4. 模型
# ============================================================
# base_url 可换，只要是 OpenAI 兼容接口（DeepSeek / 通义 / 智谱 / 本地 vLLM 都行）。
# 密钥只从环境变量读，不落代码、不落日志。

_model = ChatOpenAI(
    model=os.environ.get("MODEL_NAME", "deepseek-chat"),
    base_url=os.environ.get("MODEL_BASE_URL", "https://api.deepseek.com/v1"),
    api_key=os.environ.get("MODEL_API_KEY", ""),
    temperature=0.7,
    timeout=30,
    max_retries=1,
)

_prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM),
    ("system", "本次上下文（用户已允许使用）：\n{context}"),
    ("human", "{input}"),
])

# 建议用链式的写法，方便以后插中间件
_chain = _prompt | _model.with_structured_output(Reply)


def render_context(ctx: dict) -> str:
    """把上下文压成短文本。

    这里要克制：只给用户明确允许的，且做聚合。整段日记原文、
    沙盘摆放内容都不给——作品的意义归用户，不该被拿去当素材。
    """
    lines: list[str] = []

    recent = (ctx or {}).get("recent") or []
    if recent:
        lines.append(f"最近 {len(recent)} 次情绪采样（坐标 + 最近的锚点，不含原文）：")
        for e in recent[:8]:
            lines.append(
                f"  {e.get('date')} {e.get('time')}  效价 {e.get('valence')} "
                f"唤醒 {e.get('arousal')}  靠近「{e.get('near')}」"
                + (f"  标签 {e.get('tags')}" if e.get("tags") else "")
            )

    sandbox = (ctx or {}).get("sandbox") or []
    if sandbox:
        lines.append(f"沙盘：摆过 {len(sandbox)} 次（只给次数与时间，不给内容）")

    devices = (ctx or {}).get("devices")
    if devices and devices.get("rows"):
        lines.append(f"设备背景线索（最近 {devices.get('span')} 天，只作背景，不得据此推断情绪）：")
        for r in devices["rows"]:
            lines.append(
                f"  {r.get('date')}  睡眠 {r.get('sleepMin')} 分钟  "
                f"压力 {r.get('stressAvg')}  静息心率 {r.get('rhr')}"
            )

    memory = (ctx or {}).get("memory") or []
    if memory:
        lines.append("长期记忆（用户确认过的）：")
        for m in memory:
            lines.append(f"  [{m.get('kind')}] {m.get('text')}")

    return "\n".join(lines) if lines else "（这次没有附带上下文）"


# ============================================================
# 5. 接口
# ============================================================

app = FastAPI(title="心绪 · assist", version=PROMPT_VERSION)

# 开发用。上线要收紧成具体来源。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


class Request(BaseModel):
    input: str = ""
    task: Literal["chat", "analyze"] = "chat"
    goal: Optional[str] = None
    stage: Literal["explore", "soothe", "act"] = "explore"
    context: dict = Field(default_factory=dict)
    safety: dict = Field(default_factory=dict)


def crisis_reply() -> dict:
    """高风险时不走模型。

    模型可能把危机话题当成一般的情绪低落来接，那是最危险的失败模式；
    而且这种情况下该给的是出口，不是一段生成的话。
    """
    return {
        "reply": "我注意到你刚才说的。我不做判断，也分不清你是在写气话，还是真的撑不住了——"
                 "所以不猜。\n\n"
                 "如果你现在很难受，下面这些电话是有人接的。要不要打，由你决定。",
        "strategy": "求助入口",
        "suggest": {"memory": [], "entry": None},
        "safety": {"level": "urgent", "reasons": ["server"]},
    }


@app.post("/assist")
def assist(req: Request) -> dict:
    # 服务端自己再判一次。前端的判定只用来提前提示，不能作为依据——
    # 客户端是可以被改的。
    low_streak = int(req.safety.get("lowStreak") or 0)
    intensity = float(req.safety.get("intensity") or 0)
    s = assess_input(req.input, intensity, low_streak)

    if s.level == "urgent":
        return crisis_reply()

    out: Reply = _chain.invoke({
        "input": req.input,
        "context": render_context(req.context),
    })

    bad = assess_output(out.reply)
    if bad:
        # 不把越界的那段交给用户
        return {
            "reply": "这句话我不能这么说，已拦下。\n\n"
                     "如果我刚才的判断让你觉得被下了结论，那不是你的问题——是我的。"
                     "你可以换一种说法再问我一次。",
            "strategy": "",
            "suggest": {"memory": [], "entry": None},
            "safety": {"level": s.level, "reasons": bad},
        }

    return {
        "reply": out.reply,
        "strategy": out.strategy,
        # 注意：这里回的是「建议」。落盘由前端在用户确认之后做，
        # 服务端不直接写任何用户数据。
        "suggest": {
            "memory": [m.model_dump() for m in out.memory],
            "entry": out.entry.model_dump() if out.entry else None,
        },
        "safety": {"level": s.level, "reasons": s.reasons},
    }


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "prompt_version": PROMPT_VERSION,
        "model": _model.model_name,
        "risk_terms": {k: len(v) for k, v in RISK.items()},
    }
