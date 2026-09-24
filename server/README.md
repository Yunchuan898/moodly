# 心绪 AI 后端

在仓库根目录启动同源页面与接口。Python 3.10+：

```bash
pip install -r server/requirements.txt
uvicorn server.assist:app --host 127.0.0.1 --port 8000
```

真实 AI 对话需要以下环境变量，缺一则 `GET /assist/info` 的 `ready=false`，页面禁止发送：

| 变量 | 用途 |
|---|---|
| `MODEL_BASE_URL` | OpenAI 兼容模型接口地址 |
| `MODEL_API_KEY` | 模型密钥，仅服务端读取 |
| `MODEL_NAME` | 模型名，需支持结构化输出 |
| `AI_PROVIDER_NAME` | 告知用户的实际模型服务方 |
| `AI_PROVIDER_PRIVACY_URL` | 服务方 HTTPS 隐私说明链接 |
| `AI_PROVIDER_RETENTION` | 对本次请求的实际保留规则说明 |

例如在 PowerShell 中先设置上述环境变量，再运行上面的命令。不要提交密钥；不要在无法核实服务方保留规则时填写虚构说明。

`GET /assist/info` 返回供应商告知与版本，`POST /assist` 接收 `input`、`goal`、`stage`、`style`、`history`、`context`、`analysis`、`consent` 和 `consent_version`。用户在 `assist.html` 同意后才会调用。服务端只允许四种目标，从有限策略和行动目录中选取；模型只提出记忆候选，由用户确认后写入本机。明确高风险词句由服务端规则分流，不调用模型。 `GET /health` 返回模型配置和规则加载状态。

这是本机原型：按 IP 的内存限流不能代替正式身份认证或滥用防护；风险规则和输出规则可能漏判，需要专业审阅。不要直接把服务暴露到公网。

