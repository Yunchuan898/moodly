# AI 交流整合接口

2026-09-24。独立 `ai-support/` 演示切片已并入现有 `assist.html`、`src/agent.js`、`src/memory.js` 与 `server/assist.py`，只保留一个交流入口和一个模型网关。登录后 `index.html` 是唯一主页；交流页作为同源子视图从主页打开。未登录时直接访问子页面仍先回到日记主页；已登录时可定位到主页中的对应模块。

## 页面与接口

交流页有四个直接可见按钮：听我说 `be_heard`、理清原因 `understand`、先缓一缓 `calm`、找下一步 `next_step`。用户可以随时切换。前端将目标映射到 `soothe/explore/act`；服务端从 `server/strategy.py` 的有限策略与行动目录选取，模型只能建议行动 ID，不能直接执行。

`GET /assist/info` 返回 `ready`、`noticeVersion`、`providerName`、`privacyUrl`、`retention` 和 `dataSent`。缺少真实供应商告知时禁止发送。`POST /assist` 请求包含：

```json
{
  "input": "今天事情很多，我想理清头绪",
  "goal": "understand",
  "stage": "explore",
  "style": "warm",
  "history": [],
  "context": {},
  "analysis": {},
  "consent": true,
  "consent_version": "ai-support-v2"
}
```

`history` 最多六条本页会话。 `context` 仅包含用户本次勾选的情绪记录摘要、已确认记忆或设备线索；沙盘内容与日记原文不传。后端返回 `reply`、`generatedBy`、`strategy`、`understanding`、`actions`、`suggest` 和 `safety`。记忆候选由现有记忆模块暂存，用户确认才写入；行动可采用、编辑或跳过，不自动写日记或联系他人。

对话分析模块后续可传 `analysis.strategyHint`，限 `reflect/clarify/ground/reframe/plan`，服务端仅在本次目标允许时采用。穿戴模块只通过现有 `XinxuWearables.contextFor` 接入，页面默认不发送。真实设备授权仍由该模块负责。

## 部署边界

页面与 API 同源，由 `uvicorn server.assist:app` 提供。本机原型没有正式账号鉴权、人工接管或临床审阅；不得直接公开部署。

