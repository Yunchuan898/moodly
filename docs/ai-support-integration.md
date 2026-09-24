# 心绪 · AI 支持切片集成协议

日期：2026-09-24
工作分支：`feat/ai-support`；此协议供另一位开发者的对话分析模块和后续页面合并使用。

## 模块所有权

| 责任 | 本切片 | 其他模块 |
|---|---|---|
| 用户本次目标、策略选择、支持回应、行动候选 | `ai-support/` | 对话分析可提出有限提示 |
| 用户确认的长期回应偏好 | `ai-support/app.js` 的本机演示存储 | 正式统一记忆实现合并时再确定唯一所有者 |
| 对话分析、意图/情绪信号 | 不实现 | 另一位开发者负责 |
| 穿戴设备授权和数据接口 | 不读取 | 另一位开发者负责 |

## 同源接口

`GET /api/support/info` 返回 `ready`、`consentVersion`、`providerName`、`privacyUrl`、`retention`、`dataSent`。页面必须在 `ready` 为真、展示告知并取得用户确认后，才能调用回应接口。

`POST /api/support/respond` 只接受 `application/json`：

```json
{
  "consent": true,
  "consentVersion": "ai-support-v1",
  "message": "今天事情很多，我想先理清头绪",
  "goal": "understand",
  "phase": "explore",
  "style": "warm",
  "history": [],
  "memory": [],
  "analysis": { "strategyHint": "clarify" }
}
```

`message` 最多 2000 字；`history` 最多六条，每条 `role` 为 `user|assistant`、正文最多 1000 字；`memory` 最多十条、每条最多 120 字。`goal` 只能为 `be_heard|understand|calm|next_step`，`phase` 为 `explore|soothe|act`，`style` 为 `warm|direct`。`analysis` 可省略；`strategyHint` 只能为 `reflect|clarify|ground|reframe|plan`，且只有目标允许时才会采用。不要在 `analysis` 中传原始对话副本、模型提示词或穿戴数据。

成功回应示例：

```json
{
  "generatedBy": "model",
  "reply": "听起来你今天被几件事同时拉扯着。我们可以先挑最占心的一件。",
  "understanding": "你现在更想梳理优先级，而不是立刻获得建议。",
  "phase": "explore",
  "strategy": { "id": "clarify", "label": "探索与澄清" },
  "actions": [{ "id": "trigger_note", "title": "记下这次情境", "description": "只写发生了什么、自己的感受和仍不确定的部分。" }],
  "memoryCandidate": "",
  "safety": null
}
```

高风险规则命中时 `generatedBy` 是 `safety-rule`，`strategy` 为 `null`、`actions` 为空，后端不调用模型。非 2xx 错误返回 `{ "error": "CODE", "message": "可显示给用户的中文提示" }`。页面不得把 `safety-rule` 文案标成 AI 生成。

后端仅允许同源浏览器请求；合并时把对话页面和 `/api/support/*` 放在同一 HTTPS 源，或由同源代理转发。原本静态页面若运行在另一个端口，不能直接跨源调用本地演示服务。正式部署还需身份、访问控制、滥用防护和安全评估，本机演示不能直接暴露公网。

## 与现有 `src/agent.js` 草稿的差异

读取另一位开发者当前尚未提交的草稿时，其 HTTP provider 使用 `input/task/goal/stage/context/safety` 并期待 `reply/strategy/suggest`；本接口使用 `message/goal/phase/history/memory/analysis`，还要求独立 AI 数据告知。合并时需要一个显式适配层：`input → message`、`stage → phase`，并从页面取得四选一的本次目标；`context.memory` 只能在用户本次同意后提取已确认的偏好，不能直接转发完整 `context`，其中可能包含日记、沙盘或设备线索。`suggest.memory` 与本切片的 `memoryCandidate` 需要统一成一种“用户确认后落盘”的格式。不要仅把当前 HTTP endpoint 改成 `/api/support/respond`，否则请求字段和授权语义均不匹配。
