<div align="center">

# dsh-doorbell

**Never miss the moment your agent needs you.**

Outbound Feishu and DingTalk notifications for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — when a turn finishes, fails, or waits for your decision.

[![CI](https://github.com/liuyuxuan6666/dsh-doorbell/actions/workflows/test.yml/badge.svg)](https://github.com/liuyuxuan6666/dsh-doorbell/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![DSH](https://img.shields.io/badge/dsh-0.2.x-4B32C3)](package.json)
[![Status](https://img.shields.io/badge/status-beta-orange)](#roadmap)

[Quick start](#quick-start) · [Events](#events) · [Configuration](#configuration) · [Providers](#providers) · [Security](#security-and-privacy)

<a href="./README.zh-CN.md">简体中文</a>

</div>

---

## Why dsh-doorbell?

Long agent turns are the norm. You start a task, switch to another window, and
come back to find the agent finished five minutes ago — or stuck on a question
the whole time.

`dsh-doorbell` is a **host-only** DSH bundle that watches the lifecycle events
DSH already emits and pushes a short message to a chat group. No client UI, no
inbound commands, no session writes.

```text
DSH · Turn complete
Session: job-hunt / Tencent application
Workspace: ~/code-dsh/job-hunt
Duration: 3m 12s
```

## Features

- **Four events, not just “done”.** Turn complete, turn failed, tool approval,
  and `ask_user_question` waiting for an answer.
- **Feishu and DingTalk native.** Correct text payloads and optional
  HMAC-SHA256 signatures for both providers; no relay required.
- **Session-aware.** The message says *which* session, workspace and turn
  duration, so a phone notification is enough to decide what to do.
- **Quiet when it should be.** Skip short turns, filter subagents, and set a
  quiet-hours window; approval and question alerts still break through.
- **Host-only and fail-safe.** No HTTP server, no tools, no session writes.
  A broken webhook is logged and swallowed; it never breaks an agent turn.

## Quick start

### 1. Create a bot

**Feishu** — create a private group, add a **Custom Bot**, enable signature
verification, copy the webhook and secret.
[Official guide](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot)

**DingTalk** — create a private group, add a **Custom Bot (Webhook)**, choose
**加签 (sign)**, copy the webhook and secret.
[Security settings](https://open.dingtalk.com/document/robots/customize-robot-security-settings)

### 2. Set the environment

The DSH host reads its own process environment. On Windows desktop, set user
environment variables and fully restart DSH; a WSL `export` does not reach the
Windows process.

```powershell
[Environment]::SetEnvironmentVariable('DSH_DOORBELL_WEBHOOK','https://...','User')
[Environment]::SetEnvironmentVariable('DSH_DOORBELL_SECRET','...','User')
```

On Linux/macOS:

```bash
export DSH_DOORBELL_WEBHOOK='https://...'
export DSH_DOORBELL_SECRET='...'
```

### 3. Install and restart

```bash
dsh plugin --profile desktop add github:liuyuxuan6666/dsh-doorbell
```

No Git on the DSH host? Pack and install a local tarball:

```bash
npm pack
dsh plugin --profile desktop add file:C:/path/to/dsh-doorbell-0.2.0.tgz
```

Fully restart DSH after installing. Then run a turn longer than 10 seconds and
ask the agent a question; the group should receive both notifications.

## Events

| Event | DSH seam | What you receive |
|---|---|---|
| Turn completed | `agent/status` running → idle | session, one-line summary, workspace, duration |
| Turn failed | `agent/error` | error detail; the completion alert is suppressed |
| Tool approval | `approval/request` | tool name and reason |
| Answer needed | `user-questions/request` | the first question |

### What the message looks like

```text
DSH · 完成
会话：dsh-tally 设计
摘要：面板已按宿主既有风格重排。
工作区：/home/user/code-dsh/dsh-tally
耗时：4m 12s
```

The summary is **extracted, not generated**: the listener keeps the last
`assistant/message` of the turn from the committed `session/event` feed and
takes its first sentence (code fences and inline code are stripped). No second
model call, no added latency, nothing invented. Before the model has replied —
an error, an approval, a question — the user's own request is used instead.

`approval/request` and `user-questions/request` are waterfalls. The listener
only observes and always delegates with `next()`; it never consumes the real
answerer.

## Providers

| Provider | Payload | Signing |
|---|---|---|
| `feishu` | text message | optional HMAC-SHA256 (`timestamp` + `sign`) |
| `dingtalk` | text message | optional 加签 (`timestamp` + URL-encoded `sign`) |
| `generic` | JSON `{ text, title, kind, ts }` | none; useful for local relays |

## Configuration

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

| Field | Default | Meaning |
|---|---|---|
| `provider` | `feishu` | `feishu`, `dingtalk` or `generic` |
| `webhookUrl` | `""` | direct webhook override (prefer env) |
| `webhookEnv` | `DSH_DOORBELL_WEBHOOK` | env var holding the webhook URL |
| `secret` | `""` | direct signing secret override (prefer env) |
| `secretEnv` | `DSH_DOORBELL_SECRET` | env var holding the signing secret |
| `notifyOnComplete` | `true` | notify when a turn finishes |
| `notifyOnError` | `true` | notify when a turn or step fails |
| `notifyOnApproval` | `true` | notify when a tool waits for approval |
| `notifyOnQuestion` | `true` | notify when `ask_user_question` waits |
| `minTurnDurationMs` | `10000` | skip completion alerts for short turns |
| `includeSubagents` | `false` | also notify for subagent sessions |
| `quietHours` | `""` | `HH:MM-HH:MM`; approval and question alerts still fire |
| `titlePrefix` | `DSH` | title prefix in the message |
| `requestTimeoutMs` | `5000` | webhook request timeout |

## How it works

```text
agent/status ─┐
agent/error  ─┼─▶ index.js ─▶ events.js ─▶ format.js ─▶ notify.js ─▶ provider ─▶ chat
approval/... ─┤                 normalize    render       resolve       Feishu
user-questions┘                                            config       DingTalk
```

- `index.js` owns the DSH event subscriptions and config schema.
- `lib/events.js` holds pure helpers: session identity, subagent detection,
  quiet hours, duration formatting.
- `lib/format.js` builds the compact text message.
- `lib/notify.js` picks the provider, resolves env secrets and isolates errors.
- `lib/providers/*` contains Feishu, DingTalk and generic adapters.

The plugin is deliberately **host-only**: no `dsh.client`, no UI, no inbound
webhook. It reads no session logs.

## Security and privacy

- Outbound only: no listening HTTP server, no command endpoint.
- HTTPS required, except loopback HTTP for local relays and tests.
- Secrets come from env by default and are never logged.
- Messages contain only session label, workspace path, duration and a short
  detail — no file contents or full assistant output.
- A notification failure is logged and swallowed; the agent loop is unaffected.

## Compatibility

- Node `>=20`.
- DSH `>=0.2.0-rc.1 <0.3.0-0`; tested against `0.2.2-rc.1`.
- Bundle patch: `cordis.patch.yml` inserts the `doorbell` row.
- 42 tests, CI on Node 20 / 22 / 24.

## Development

```bash
npm install
npm test
npm pack --dry-run
```

Tests use Node's built-in runner and a fake `fetch`; no network or live webhook
is required.

## Roadmap

- [x] Feishu text notifications
- [x] DingTalk text notifications
- [ ] Feishu / DingTalk interactive cards
- [ ] Retry, rate limiting and notification coalescing
- [ ] npm release and compatibility matrix

## Contributing

Issues and pull requests are welcome. Please keep the core host-only and
provider-agnostic, and run `npm test` before opening a PR.

## License

MIT. See [LICENSE](LICENSE).
