<div align="center">

# dsh-doorbell

**别再错过 agent 需要你的那一刻。**

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的飞书 / 钉钉出站通知：回合完成、失败、等待审批、等你回答时，往群里推一条消息。

[![CI](https://github.com/liuyuxuan6666/dsh-doorbell/actions/workflows/test.yml/badge.svg)](https://github.com/liuyuxuan6666/dsh-doorbell/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![DSH](https://img.shields.io/badge/dsh-0.2.x-4B32C3)](package.json)
[![Status](https://img.shields.io/badge/status-beta-orange)](#路线图)

[快速开始](#快速开始) · [事件](#事件) · [配置](#配置) · [Provider](#provider) · [安全](#安全与隐私)

<a href="./README.md">English</a>

</div>

---

## 为什么做这个

Agent 跑长任务是常态。你切到别的窗口，回来发现它五分钟前就干完了；或者更糟——它一直卡在某个问题前等你。

`dsh-doorbell` 是一个**宿主侧** DSH 插件：监听 DSH 已有的事件，往你的群聊推一条短消息。没有客户端 UI，没有入站命令，不写会话日志。

```text
DSH · 完成
会话：job-hunt / 腾讯投递
工作区：~/code-dsh/job-hunt
耗时：3m 12s
```

## 特性

- **四类事件**：回合完成、回合失败、工具等待审批、`ask_user_question` 等你回答。
- **飞书 / 钉钉原生**：正确的文本 payload 和可选的 HMAC-SHA256 签名，不需要中转服务。
- **带上下文**：消息里有会话名、工作区和耗时，手机上扫一眼就知道该不该回去。
- **该安静时安静**：短回合过滤、子代理过滤、静默时段；审批和提问不受静默时段影响。
- **宿主侧、失败不冒泡**：不监听端口、不注册工具、不写会话；webhook 失败只记日志，不打断 agent。

## 快速开始

### 1. 建机器人

**飞书**：建一个只有你的群，添加**自定义机器人**，开启**签名校验**，复制 webhook 和 secret。
[官方指南](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot)

**钉钉**：建一个只有你的群，添加**自定义机器人（Webhook）**，安全设置选**加签**，复制 webhook 和 secret。
[安全设置](https://open.dingtalk.com/document/robots/customize-robot-security-settings)

### 2. 设置环境变量

DSH 桌面版读的是它自己的进程环境。Windows 下请设置**用户环境变量**，然后完全退出并重开 DSH；WSL 里的 `export` 不会传给 Windows 进程。

```powershell
[Environment]::SetEnvironmentVariable('DSH_DOORBELL_WEBHOOK','https://...','User')
[Environment]::SetEnvironmentVariable('DSH_DOORBELL_SECRET','...','User')
```

Linux/macOS：

```bash
export DSH_DOORBELL_WEBHOOK='https://...'
export DSH_DOORBELL_SECRET='...'
```

### 3. 安装并重启

```bash
dsh plugin --profile desktop add github:liuyuxuan6666/dsh-doorbell
```

DSH 宿主机没有 Git？打包后装本地 tarball：

```bash
npm pack
dsh plugin --profile desktop add file:C:/path/to/dsh-doorbell-0.2.0.tgz
```

安装后**完全重启 DSH**。然后跑一个超过 10 秒的回合，并让 agent 问你一个问题，群里应该收到两条消息。

## 事件

| 事件 | DSH 事件 seam | 你会收到 |
|---|---|---|
| 回合完成 | `agent/status` running → idle | 会话、工作区、耗时 |
| 回合失败 | `agent/error` | 错误摘要；不会再补一条“完成” |
| 等待审批 | `approval/request` | 工具名 + 原因 |
| 等待回答 | `user-questions/request` | 第一个问题 |

`approval/request` 和 `user-questions/request` 是 waterfall。监听器只观察，并且始终 `next()`，不会吞掉真正的回答方。

## Provider

| Provider | 内容 | 签名 |
|---|---|---|
| `feishu` | 文本消息 | 可选 HMAC-SHA256（`timestamp` + `sign`） |
| `dingtalk` | 文本消息 | 可选加签（`timestamp` + URL 编码的 `sign`） |
| `generic` | JSON `{ text, title, kind, ts }` | 无；适合本地 relay |

## 配置

```yaml
- insert:
    - id: doorbell
      name: dsh-doorbell
      config:
        provider: feishu
        webhookEnv: DSH_DOORBELL_WEBHOOK
        secretEnv: DSH_DOORBELL_SECRET
        notifyOnComplete: true
        notifyOnError: true
        notifyOnApproval: true
        notifyOnQuestion: true
        minTurnDurationMs: 10000
        includeSubagents: false
        quietHours: ""
        titlePrefix: DSH
        requestTimeoutMs: 5000
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `provider` | `feishu` | `feishu` / `dingtalk` / `generic` |
| `webhookUrl` | `""` | 直接指定 webhook（优先用环境变量） |
| `webhookEnv` | `DSH_DOORBELL_WEBHOOK` | 存 webhook 的环境变量名 |
| `secret` | `""` | 直接指定签名 secret（优先用环境变量） |
| `secretEnv` | `DSH_DOORBELL_SECRET` | 存 secret 的环境变量名 |
| `notifyOnComplete` | `true` | 回合完成时通知 |
| `notifyOnError` | `true` | 回合/步骤失败时通知 |
| `notifyOnApproval` | `true` | 工具等待审批时通知 |
| `notifyOnQuestion` | `true` | `ask_user_question` 等待回答时通知 |
| `minTurnDurationMs` | `10000` | 短于这个时长的完成不通知 |
| `includeSubagents` | `false` | 是否也通知子代理会话 |
| `quietHours` | `""` | `HH:MM-HH:MM`；审批/提问不受影响 |
| `titlePrefix` | `DSH` | 消息标题前缀 |
| `requestTimeoutMs` | `5000` | webhook 超时 |

## 工作方式

```text
agent/status ─┐
agent/error  ─┼─▶ index.js ─▶ events.js ─▶ format.js ─▶ notify.js ─▶ provider ─▶ 群聊
approval/... ─┤                归一化      渲染        解析配置      Feishu
user-questions┘                                                   DingTalk
```

- `index.js`：DSH 事件订阅和 Config schema；
- `lib/events.js`：会话身份、子代理判断、静默时段、耗时格式化；
- `lib/format.js`：紧凑消息渲染；
- `lib/notify.js`：provider 选择、环境变量解析、错误隔离；
- `lib/providers/*`：Feishu / DingTalk / generic 适配器。

插件刻意保持 **host-only**：没有 `dsh.client`、没有 UI、没有入站 webhook、不读会话日志。

## 安全与隐私

- 只出不进：不监听端口，不提供命令入口。
- 只允许 HTTPS，本地 relay 例外（loopback HTTP）。
- secret 默认从环境变量读取，绝不写日志。
- 消息只包含会话名、工作区、耗时和短摘要，不包含文件内容或完整回复。
- 通知失败只记日志并吞掉，不影响 agent 回合。

## 兼容性

- Node `>=20`；
- DSH `>=0.2.0-rc.1 <0.3.0-0`，已在 `0.2.2-rc.1` 上测试；
- `cordis.patch.yml` 插入 `doorbell` 行；
- 42 个测试，CI 覆盖 Node 20 / 22 / 24。

## 开发

```bash
npm install
npm test
npm pack --dry-run
```

测试使用 Node 内置 runner 和 fake `fetch`，不需要网络，也不需要真实 webhook。

## 路线图

- [x] 飞书文本通知
- [x] 钉钉文本通知
- [ ] 飞书 / 钉钉交互卡片
- [ ] 重试、限频、通知合并
- [ ] npm 发布与兼容性矩阵

## 贡献

欢迎 issue 和 PR。请保持核心 host-only、provider 无关，并在提交 PR 前跑 `npm test`。

## License

MIT，见 [LICENSE](LICENSE)。
