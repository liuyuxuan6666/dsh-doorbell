<div align="center">

# dsh-doorbell

**Never miss the moment your agent needs you.**

Outbound Feishu and DingTalk notifications for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — when a turn finishes, fails, or waits for your decision, and on demand through a tool.

[![CI](https://github.com/liuyuxuan6666/dsh-doorbell/actions/workflows/test.yml/badge.svg)](https://github.com/liuyuxuan6666/dsh-doorbell/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![DSH](https://img.shields.io/badge/dsh-0.2.x-4B32C3)](package.json)
[![Status](https://img.shields.io/badge/status-beta-orange)](#roadmap)

[Quick start](#quick-start) · [Message shape](#message-shape) · [On demand](#on-demand) · [Events](#events) · [Configuration](#configuration) · [Security](#security-and-privacy)

<a href="./README.zh-CN.md">简体中文</a>

</div>

---

## Why dsh-doorbell?

Long agent turns are the norm. You start a task, switch to another window, and
come back to find the agent finished five minutes ago — or stuck on a question
the whole time.

`dsh-doorbell` watches the lifecycle events DSH already emits and pushes a short
message to a chat group. No client UI, no inbound commands, no session writes.

```text
DSH · 完成 2m 53s
system-administration
摘要：把这条通知改成三行…
```

## Features

- **One fixed three-line message.** Status and elapsed time share line one, the
  workspace sits on line two, the head of your instruction closes it.
- **A summary you can predict.** The first 16 meaningful characters of the
  instruction you sent, with `…` when it was longer. No model call, no latency.
- **Four events:** turn complete, turn failed, tool approval, and
  `ask_user_question` waiting for an answer.
- **On demand too:** the `doorbell_send` tool lets the agent push a message
  mid-turn, with named templates.
- **Feishu and DingTalk native.** Correct text payloads and optional
  HMAC-SHA256 signatures; no relay required.
- **Quiet when it should be.** Skip short turns, filter subagents, and set a
  quiet-hours window; approval and question alerts still break through.
- **Fail-safe.** A broken webhook is logged and swallowed; it never breaks an
  agent turn.

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

Without Git on the host, install a local tarball:

```bash
npm pack
dsh plugin --profile desktop add file:C:/path/to/dsh-doorbell-0.4.0.tgz
```

Fully restart DSH afterwards. Run a turn longer than 10 seconds and ask the
agent a question; two messages should arrive.

## Message shape

Automatic notifications are always these three lines, whether or not the agent
used the on-demand tool during the turn:

```text
DSH · 完成 2m 53s
system-administration
摘要：把这条通知改成三行…
```

| Line | Content | Notes |
|---|---|---|
| 1 | `{prefix} · {status} {duration}` | Duration only exists on completion |
| 2 | Workspace | Last path component of the session `cwd`, else the session title |
| 3 | `摘要：…` | First 16 meaningful characters of your instruction |

Errors, approvals and questions use the same shape. They carry no duration and
**no error text, tool name or question text**: the workspace and what you asked
for are enough to decide whether to come back.

### What counts as a meaningful character

Whitespace is collapsed, Markdown decoration is stripped (code fences, inline
backticks, `#` headings, list markers, `**bold**`, link targets), then the first
16 characters are kept. Punctuation counts — `这行对吗？` is not `这行对吗` — and
emoji are counted as one character so they are never cut in half.

## On demand

Besides the automatic notifications, the agent can call `doorbell_send` at any
point in a turn. The tool description lists every configured template key with
the first line of its text, so the agent can pick one.

| Parameter | Meaning |
|---|---|
| `template` | Template key to render. Without it and without `text`, the built-in three lines (status `通知`) are used |
| `text` | Send this text verbatim; wins over `template` |
| `vars` | Values for the template placeholders |
| `summary` | Summary line content; defaults to the 16-character head of your instruction |

The result is structured: `{ ok, provider, text, skipped?, error? }`. Quiet
hours (`quiet-hours`), the rate limit (`rate-limited`) and a missing webhook
(`no-webhook`) are reported honestly instead of pretending to send.

### Templates

Templates are `key → text` in the plugin's `templates` config:

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

A JSON object or a `key: text` string (`\n` for newlines) is accepted as well.

| Placeholder | Value |
|---|---|
| `{prefix}` | `titlePrefix`, default `DSH` |
| `{status}` | `完成` / `出错` / `等待确认` / `等待回答` / `通知` |
| `{duration}` | Elapsed time, e.g. `2m 53s`; empty for on-demand sends |
| `{workspace}` | Workspace directory name |
| `{summary}` | Summary line content |
| `{time}` | Local time `HH:MM` |
| `{anything}` | A key passed in `vars` |

A misspelled placeholder (`{summry}`) is **left as written** so the mistake is
visible in the message instead of silently becoming empty.

Templates only serve on-demand sends. Automatic notifications keep the fixed
three lines and are unaffected by templates or by any on-demand call.

## Events

| Situation | DSH seam | You receive |
|---|---|---|
| Turn completed | `agent/status` running → idle | `DSH · 完成 2m 53s` + workspace + summary |
| Turn failed | `agent/error` | `DSH · 出错` + workspace + summary; no follow-up “completed” |
| Approval needed | `approval/request` | `DSH · 等待确认` + workspace + summary |
| Answer needed | `user-questions/request` | `DSH · 等待回答` + workspace + summary |
| On demand | tool `doorbell_send` | Rendered template, or your `text` |

`approval/request` and `user-questions/request` are waterfalls: the listeners
only observe and always call `next()`.

## Providers

| Provider | Content | Signature |
|---|---|---|
| `feishu` | Text message | Optional HMAC-SHA256 (`timestamp` + `sign`) |
| `dingtalk` | Text message | Optional `加签` (`timestamp` + URL-encoded `sign`) |
| `generic` | JSON `{ text, title, kind, ts }` | None; for local relays |

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
        enableTool: true
        manualMinIntervalMs: 3000
        templates: {}
```

| Field | Default | Meaning |
|---|---|---|
| `provider` | `feishu` | `feishu` / `dingtalk` / `generic` |
| `webhookUrl` | `""` | Direct webhook (prefer the env var) |
| `webhookEnv` | `DSH_DOORBELL_WEBHOOK` | Environment variable holding the webhook |
| `secret` | `""` | Direct signing secret (prefer the env var) |
| `secretEnv` | `DSH_DOORBELL_SECRET` | Environment variable holding the secret |
| `notifyOnComplete` | `true` | Notify when a turn finishes |
| `notifyOnError` | `true` | Notify when a turn or step fails |
| `notifyOnApproval` | `true` | Notify when a tool waits for approval |
| `notifyOnQuestion` | `true` | Notify when `ask_user_question` waits |
| `minTurnDurationMs` | `10000` | Skip shorter completions |
| `includeSubagents` | `false` | Also notify for subagent sessions |
| `quietHours` | `""` | `HH:MM-HH:MM`; approvals/questions break through, on-demand sends are held |
| `titlePrefix` | `DSH` | Title prefix |
| `requestTimeoutMs` | `5000` | Webhook timeout |
| `enableTool` | `true` | Register the `doorbell_send` tool |
| `manualMinIntervalMs` | `3000` | Minimum gap between on-demand sends per session; `0` disables it |
| `templates` | `{}` | Named templates: the key is what the agent picks |

## How it works

```text
agent/status ─┐
agent/error  ─┼─▶ index.js ─▶ events.js ─▶ format.js ─▶ notify.js ─▶ provider ─▶ chat
approval/... ─┤              normalize      three lines    config      Feishu
user-questions┘                                                   DingTalk
doorbell_send ─▶ templates.js (placeholders) ─▶ notify.js
```

- `index.js`: event subscriptions, Config schema, the `doorbell_send` tool;
- `lib/events.js`: session identity, workspace name, subagent detection, quiet hours;
- `lib/summary.js`: 16-character heads of the user's instruction;
- `lib/format.js`: the fixed three lines;
- `lib/templates.js`: template parsing and placeholder substitution;
- `lib/notify.js`: provider selection, env resolution, error isolation;
- `lib/providers/*`: Feishu / DingTalk / generic adapters.

Apart from registering one outbound tool the plugin is still one-way: no HTTP
server, no inbound commands, no session-log reads.

## Security and privacy

- Outbound only: no listening port, no command entry point; `doorbell_send` is
  the single on-demand exit.
- HTTPS required, except loopback URLs used by local relays.
- The webhook and secret default to environment variables and are never logged.
- Messages carry the workspace name, elapsed time and a 16-character summary —
  no file contents, error stacks or full replies.
- A notifier failure is logged and swallowed; the agent turn continues.

## Compatibility

- Node `>=20`.
- DSH `>=0.2.0-rc.1 <0.3.0-0`; tested on `0.2.2-rc.1`.
- `cordis.patch.yml` inserts the `doorbell` row.
- 116 tests; CI covers Node 20 / 22 / 24.

## Development

```bash
npm install
npm test
npm pack --dry-run
```

Tests use Node's built-in runner and a fake `fetch`; no network and no live
webhook required.

## Roadmap

- [x] Feishu text notifications
- [x] DingTalk text notifications
- [x] Fixed three-line format with a 16-character instruction summary
- [x] `doorbell_send` on-demand sends and named templates
- [ ] Feishu / DingTalk interactive cards
- [ ] Retry, rate limiting, notification coalescing
- [ ] npm release and compatibility matrix

## Contributing

Issues and PRs welcome. Keep the core provider-agnostic and outbound-only, and
run `npm test` before opening a PR.

## License

MIT, see [LICENSE](LICENSE).
