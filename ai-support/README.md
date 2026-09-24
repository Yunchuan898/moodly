# AI 支持独立切片

这是与现有情绪日记、沙盘及另一位开发者的 Agent 对话分析隔离的实现。它提供“探索 → 安抚 → 行动”的演示页面、有限策略选择、用户确认后的本机记忆、目标对应的行动候选，以及同源后端。代码不包含模型密钥，也不接收穿戴设备数据。

## 运行

需要 Node.js 20+。后端依赖标准库，无需安装 npm 包。先在运行进程的环境变量中填写真实模型服务和实际数据处理信息；下面是 PowerShell 示例：

```powershell
$env:MODEL_API_URL = 'https://你的模型服务地址/v1/chat/completions'
$env:MODEL_API_KEY = '你的密钥'
$env:MODEL_NAME = '已开通的模型名'
$env:AI_PROVIDER_NAME = '真实模型服务方名称'
$env:AI_PROVIDER_PRIVACY_URL = 'https://服务方的隐私政策地址'
$env:AI_PROVIDER_RETENTION = '根据合同与政策核实后的请求保留说明'
node ai-support/server.mjs
```

访问 `http://127.0.0.1:8787/ai-support/`。模型接口须兼容 Chat Completions 的 `messages`、`response_format: {"type":"json_object"}`、`store: false` 及 `choices[0].message.content`。不兼容时应修改 `model.mjs` 适配器，保留其余接口。未填全配置时页面仍可打开，但 `/api/support/respond` 会拒绝请求；不会用静态文案冒充 AI 回应。

默认仅监听本机 `127.0.0.1`。这里没有正式用户鉴权、HTTPS 部署、安全评测或经过专业审核的危机处理；不要直接公开部署。供应商是否保留请求、是否用于训练、处理地点及跨境传输必须在真实部署前核实，不能仅凭本演示的本机删除按钮作承诺。

## 数据与控制

| 数据 | 位置与规则 |
|---|---|
| 当前输入 | 用户点击发送后由后端转发模型；明确高风险规则命中时不发模型 |
| 最近会话 | 浏览器内存最多六条随下一次请求发送；关闭或清空页面后消失 |
| 已确认记忆 | `localStorage` 的 `xinxu.ai.memory.v1`；用户可增改删；只有本次勾选后才发送 |
| 数据告知记录 | `localStorage` 的 `xinxu.ai.consent.v1`；绑定供应商名称、政策地址和保留说明，变化后需重新确认 |
| 模型密钥 | 仅在后端进程环境变量中；不得进入浏览器 |
| 日记、沙盘、联系人、穿戴数据 | 当前切片不读取、不发送 |

本机浏览器存储不是加密保险箱。服务端不持久化对话正文、记忆或行动；供应商的实际保留与删除取决于其政策与合同。细节见[数据告知](../docs/ai-support-data-notice.md)。

## 接口与合并

接口示例、字段边界及与另一位开发者模块的衔接见[集成协议](../docs/ai-support-integration.md)。本切片没有改动 `index.html`、`sandbox.html`、`assist.html` 或现有 `src/` 文件。合并后，正式入口需要改写原页面“没有服务器接收内容”等只适用于本地原型的说明；不能把本切片的演示规则称为正式安全能力。
