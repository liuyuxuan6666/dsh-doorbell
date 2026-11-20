<div align="center">

# dsh-doorbell

**别再错过 agent 需要你的那一刻。**

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的飞书 / 钉钉出站通知：回合完成、失败、等待审批、等你回答时，往群里推一条消息；也可以由 agent 主动推。

[![CI](https://github.com/liuyuxuan6666/dsh-doorbell/actions/workflows/test.yml/badge.svg)](https://github.com/liuyuxuan6666/dsh-doorbell/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![DSH](https://img.shields.io/badge/dsh-0.2.x-4B32C3)](package.json)
[![Status](https://img.shields.io/badge/status-beta-orange)](#路线图)

[快速开始](#快速开始) · [消息格式](#消息格式) · [主动调用](#主动调用) · [事件](#事件) · [配置](#配置) · [安全](#安全与隐私)

<a href="./README.md">English</a>

</div>

---

## 为什么做这个

Agent 跑长任务是常态。你切到别的窗口，回来发现它五分钟前就干完了；或者更糟——它一直卡在某个问题前等你。

`dsh-doorbell` 监听 DSH 已有的事件，往你的群聊推一条短信。没有客户端 UI，没有入站命令，不写会话日志。

```text
DSH · 完成 2m 53s
system-administration
摘要：我知道怎么表述有效字符了，指的是去掉系统…
```

## 特性

- **三行固定格式**：状态和用时合并成第一行，工作区一行，你的指令开头一行。
- **摘要取你自己那句话**：去掉系统/插件注入的部分，只取你本人消息的前 20 个字符，超长加 `…`；不调用模型、不增加延迟。
- **四类事件**：回合完成、回合失败、工具等待审批、`ask_user_question` 等你回答。
- **可以主动调用**：`doorbell_send` 工具让 agent 在回合中途按需推一条，配合命名模板。
- **飞书 / 钉钉原生**：正确的文本 payload 和可选的 HMAC-SHA256 签名，不需要中转服务。
- **该安静时安静**：短回合过滤、子代理过滤、静默时段；审批和提问不受静默时段影响。
- **失败不冒泡**：webhook 出错只记日志，不打断 agent 回合。

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
dsh plugin --profile desktop add file:C:/path/to/dsh-doorbell-0.4.0.tgz
```

安装后**完全重启 DSH**。然后跑一个超过 10 秒的回合，并让 agent 问你一个问题，群里应该收到两条消息。

## 消息格式

自动通知永远是这三行，和 agent 这一回合有没有用过主动调用无关：

```text
DSH · 完成 2m 53s
system-administration
摘要：我知道怎么表述有效字符了，指的是去掉系统…
```

| 行 | 内容 | 说明 |
|---|---|---|
| 1 | `{前缀} · {状态} {用时}` | 用时只有「完成」才有；没有用时就没有后面的空格 |
| 2 | 工作区 | 会话 `cwd` 的最后一段目录名；取不到时退回会话标题 |
| 3 | `摘要：…` | 你本人这条消息的前 20 个字符，超长补 `…` |

出错、等待确认、等待回答用同一格式，`DSH · 出错` 这类标题**不带用时，也不再附带错误信息、工具名或问题内容**——手机上只看「哪个工作区、我刚才让它干什么」就够判断要不要回去。

### 「有效字符」怎么算

只认**你本人发的那条消息**。DSH 会把注入内容也存成 `user/message`：插件前置说明（如 `envoy-link-routing`）、`<system-reminder>` 运行时上下文，各自带 `source.kind`；只有你自己的消息是 `kind: "user"`，其余一律不参与摘要。

拿到你的文字后只做一件事：把换行和连续空白折叠成一个空格，然后取前 **20** 个字符，超长补 `…`。不做 Markdown 清洗——你打的字原样进摘要，标点算字符，emoji 按一个字符算、不会被劈开。长度用 `summaryChars` 调。

## 主动调用

自动通知之外，agent 可以在回合中途调 `doorbell_send` 推一条。工具描述里会列出所有已配置模板的 key 和首行，agent 据此挑一条。

| 参数 | 说明 |
|---|---|
| `template` | 用哪条已配置模板（key）。不传也没有 `text` 时用内置三行格式（状态为「通知」） |
| `text` | 直接发送这段文本，优先级高于 `template` |
| `vars` | 填进模板占位符的键值对 |
| `summary` | 摘要行内容，默认仍是你本人这条消息的前 20 个字符 |

返回值是结构化的：`{ ok, provider, text, skipped?, error? }`。静默时段（`quiet-hours`）、限流（`rate-limited`）、没配 webhook（`no-webhook`）都会如实返回，agent 知道没发出去。

### 模板

模板是 key → 文本，配在插件配置的 `templates` 里（设置页就是这段配置）：

```yaml
id: doorbell
name: dsh-doorbell
config:
  templates:
    deploy: |
      DSH · 部署
      {workspace}
      摘要：{summary}
    remind: |
      DSH · 提醒 {time}
      {workspace}
      {note}
```

`templates` 也可以写成一段 JSON 或 `key: 文本` 的文本（Windows 换行写成 `\n`），两种都会解析。

占位符：

| 占位符 | 值 |
|---|---|
| `{prefix}` | `titlePrefix`，默认 `DSH` |
| `{status}` | `完成` / `出错` / `等待确认` / `等待回答` / `通知` |
| `{duration}` | 用时，如 `2m 53s`；主动调用时为空 |
| `{workspace}` | 工作区目录名 |
| `{summary}` | 摘要行内容 |
| `{time}` | 本地时间 `HH:MM` |
| `{任意键}` | `vars` 里传的值 |

写错的占位符（`{summry}`）**原样保留**，在消息里一眼就能看见，不会静默变成空。

模板只服务于主动调用；自动通知固定用上面的三行格式，不受模板和主动调用影响。

## 事件

| 事件 | DSH 事件 seam | 你会收到 |
|---|---|---|
| 回合完成 | `agent/status` running → idle | `DSH · 完成 2m 53s` + 工作区 + 摘要 |
| 回合失败 | `agent/error` | `DSH · 出错` + 工作区 + 摘要；不会再补一条「完成」 |
| 等待审批 | `approval/request` | `DSH · 等待确认` + 工作区 + 摘要 |
| 等待回答 | `user-questions/request` | `DSH · 等待回答` + 工作区 + 摘要 |
| 主动调用 | 工具 `doorbell_send` | 模板渲染结果，或你给的 `text` |

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
        enableTool: true
        summaryChars: 20
        manualMinIntervalMs: 3000
        templates: {}
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
| `quietHours` | `""` | `HH:MM-HH:MM`；审批/提问不受影响，主动调用会被拦下 |
| `titlePrefix` | `DSH` | 消息标题前缀 |
| `requestTimeoutMs` | `5000` | webhook 超时 |
| `enableTool` | `true` | 是否注册 `doorbell_send` 工具 |
| `summaryChars` | `20` | 摘要保留你本人消息的前几个字符 |
| `manualMinIntervalMs` | `3000` | 同一会话两次主动调用的最小间隔；`0` 关闭限流 |
| `templates` | `{}` | 命名模板：key 给 agent 选，value 是实际发送的文本 |

## 工作方式

```text
agent/status ─┐
agent/error  ─┼─▶ index.js ─▶ events.js ─▶ format.js ─▶ notify.js ─▶ provider ─▶ 群聊
approval/... ─┤                归一化      渲染三行      解析配置      Feishu
user-questions┘                                                   DingTalk
doorbell_send ─▶ templates.js（占位符替换）─▶ notify.js
```

- `index.js`：DSH 事件订阅、Config schema、`doorbell_send` 工具；
- `lib/events.js`：会话身份、工作区名、子代理判断、静默时段、耗时格式化；
- `lib/summary.js`：把用户指令压成 16 个有效字符；
- `lib/format.js`：固定三行消息；
- `lib/templates.js`：模板解析与占位符替换；
- `lib/notify.js`：provider 选择、环境变量解析、错误隔离；
- `lib/providers/*`：Feishu / DingTalk / generic 适配器。

插件除了注册一个发送工具之外仍然只出不进：不监听端口、不接受入站命令、不读会话日志。

## 安全与隐私

- 只出不进：不监听端口，不提供命令入口；唯一的主动出口是 `doorbell_send`。
- 只允许 HTTPS，本地 relay 例外（loopback HTTP）。
- secret 默认从环境变量读取，绝不写日志。
- 消息只包含工作区名、用时和 16 字摘要；不含文件内容、错误堆栈或完整回复。
- 通知失败只记日志并吞掉，不影响 agent 回合。

## 兼容性

- Node `>=20`；
- DSH `>=0.2.0-rc.1 <0.3.0-0`，已在 `0.2.2-rc.1` 上测试；
- `cordis.patch.yml` 插入 `doorbell` 行；
- 118 个测试，CI 覆盖 Node 20 / 22 / 24。

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
- [x] 固定三行格式，摘要只取你本人消息的前 20 个字符
- [x] `doorbell_send` 主动调用与命名模板
- [ ] 飞书 / 钉钉交互卡片
- [ ] 重试、限频、通知合并
- [ ] npm 发布与兼容性矩阵

## 贡献

欢迎 issue 和 PR。请保持 provider 无关、默认入口只出不进，并在提交 PR 前跑 `npm test`。

## License

MIT，见 [LICENSE](LICENSE)。
