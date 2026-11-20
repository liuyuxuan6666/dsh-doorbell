# dsh-doorbell — design and scope

Outbound notification plugin for DeepSeek Harness (DSH). It rings when a turn
finishes, errors, or waits for a human decision, and the agent can also push a
message on demand. It never receives commands and never writes to a session.

## Goal

Tell the user when attention is needed, without keeping the DSH tab open:

- a turn completed;
- a turn or step failed;
- a tool call is waiting for approval;
- `ask_user_question` is waiting for an answer;
- the agent decides a short push is useful right now.

Every automatic message has one fixed shape:

```text
DSH · 完成 2m 53s
system-administration
摘要：把这条通知改成三行…
```

Line one merges status and elapsed time. Line two names the workspace (the last
component of the session `cwd`). Line three is the first 16 meaningful
characters of the user's own instruction.

Feishu (Lark) and DingTalk custom-bot webhooks are implemented behind the same
adapter boundary; a generic JSON webhook backs local relays and tests.

## Non-goals

- No inbound chat commands or bot replies.
- No client UI, no custom panel, no session viewer.
- No shell execution, file writes, or session-log reads.
- No dependency on `dsh-notification`, `dsh-bridge`, or any other plugin.
- No provider-specific behavior in the core event layer.
- No interactive cards yet; the payload stays plain text.

## Events

| Situation | DSH seam | Notes |
|---|---|---|
| Turn completed | `agent/status` running → idle | capture start time; skip short turns |
| Turn failed | `agent/error` | mark the agent so completion does not double-send |
| Approval needed | `approval/request` | waterfall, must `return next()` |
| Answer needed | `user-questions/request` | waterfall, must `return next()` |
| On-demand push | tool `doorbell_send` | agent picks a template key or passes `text` |

`agent/status`, `approval/request` and `user-questions/request` all carry an
`agent`; session identity comes from `agent.session.header` with safe fallbacks.

The summary never needs a model call: the listener keeps the latest `user/message`
per session, and the notification renders its first 16 meaningful characters.
Messages whose `source.kind` starts with `plugin` are skipped, so an automatic
continuation cannot overwrite the user's real instruction.

## Architecture

```
DSH events -> lib/events.js -> lib/format.js -> lib/notify.js -> provider adapter
              normalize/filter  three lines     resolve config     HTTP POST

doorbell_send -> lib/templates.js (placeholders) -> lib/notify.js
```

- `lib/events.js`: pure session/turn helpers, workspace name, subagent
  detection, quiet hours, duration formatting.
- `lib/summary.js`: instruction head extraction (whitespace collapse, Markdown
  strip, 16 code points, ellipsis).
- `lib/format.js`: the fixed three-line message for the four automatic events.
- `lib/templates.js`: template map parsing, placeholder substitution, the
  documented `{prefix}` / `{status}` / `{duration}` / `{workspace}` /
  `{summary}` / `{time}` set.
- `lib/providers/feishu.js`: Feishu payload and optional signature.
- `lib/providers/dingtalk.js`: DingTalk payload, signature and signed URL.
- `lib/providers/generic.js`: JSON webhook for local relays and tests.
- `lib/notify.js`: provider selection, env-based secrets, timeout, error
  isolation.
- `index.js`: DSH `Config` schema, event subscriptions and the tool definition;
  no network logic.

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
        enableTool: true
        manualMinIntervalMs: 3000
        templates: {}
```

Secrets come from environment variables by default. A direct `webhookUrl` may
be used for local testing, but the repository must never contain one.

`templates` is a `key → text` map. Keys are what the agent chooses from; the
tool description lists each key with the first line of its text. Unknown
placeholders are left in place so a typo stays visible.

## Milestones

- `v0.1`: Feishu text notifications; four events; env config; min-duration and
  subagent filters; unit tests.
- `v0.2`: DingTalk text provider with `加签`; provider dispatch; docs and
  changelog.
- `v0.3`: summary line from the turn's own reply; integration tests.
- `v0.4`: fixed three-line format with a 16-character instruction head;
  `doorbell_send` with named templates, quiet hours and a rate limit.
- `v1.0`: compatibility matrix, live integration notes, npm release.

## Testing

- Node's built-in test runner: `node --test`.
- Unit tests for pure helpers, payload construction and signature.
- Integration tests with a fake `ctx` that emits DSH events and a fake `fetch`;
  assert waterfall listeners call `next()`.
- Tool tests exercise the registered definition directly (no host required).
- No live webhook in tests; no network access.

## Security and privacy

- Outbound only; no listening HTTP server and no inbound commands. The single
  on-demand exit is the `doorbell_send` tool.
- Webhook URL and secret are secrets; never log or commit them.
- Notification text carries only the workspace name, elapsed time and a
  16-character summary; no file contents, error stacks or full assistant output.
- HTTPS is required except loopback URLs used by local relays.
- A notifier failure must never break the agent loop.

## Compatibility

- Node `>=20`.
- DSH `>=0.2.0-rc.1 <0.3.0-0`; `engines.dsh` and `dsh.compatibility.dsh` both
  declare the tested range.
- Bundle: `dsh.bundle.patch`, no `dsh.client`; the tool is registered through
  `ctx.tools` when the service is present.
