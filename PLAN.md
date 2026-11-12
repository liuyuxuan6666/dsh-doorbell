# dsh-doorbell — design and scope

Outbound notification plugin for DeepSeek Harness (DSH). It rings when a turn
finishes, errors, or waits for a human decision. It never receives commands and
never writes to a session.

## Goal

Tell the user when attention is needed, without keeping the DSH tab open:

- a turn completed;
- a turn or step failed;
- a tool call is waiting for approval;
- `ask_user_question` is waiting for an answer.

The first provider is Feishu (Lark) custom-bot webhook. DingTalk and a generic
JSON webhook follow behind the same adapter boundary.

## Non-goals

- No inbound chat commands or bot replies.
- No client UI, no custom panel, no session viewer.
- No shell execution, file writes, or session-log reads.
- No dependency on `dsh-notification`, `dsh-bridge`, or any other plugin.
- No provider-specific behavior in the core event layer.

## Events

| Situation | DSH seam | Notes |
|---|---|---|
| Turn completed | `agent/status` running → idle | capture start time; skip short turns |
| Turn failed | `agent/error` | mark the agent so completion does not double-send |
| Approval needed | `approval/request` | waterfall, must `return next()` |
| Answer needed | `user-questions/request` | waterfall, must `return next()` |

`agent/status`, `approval/request` and `user-questions/request` all carry an
`agent`; session identity comes from `agent.session.header` with safe fallbacks.

## Architecture

```
DSH events -> lib/events.js -> lib/format.js -> lib/notify.js -> provider adapter
              normalize/filter   render text       resolve config     HTTP POST
```

- `lib/events.js`: pure session/turn helpers, subagent detection, quiet hours,
  duration formatting.
- `lib/format.js`: pure message rendering for the four event kinds.
- `lib/providers/feishu.js`: Feishu payload and optional signature.
- `lib/providers/generic.js`: JSON webhook for local relays and tests.
- `lib/notify.js`: provider selection, env-based secrets, timeout, error
  isolation.
- `index.js`: DSH `Config` schema and event subscriptions; no network logic.

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
```

Secrets come from environment variables by default. A direct `webhookUrl` may
be used for local testing, but the repository must never contain one.

## Milestones

- `v0.1`: Feishu text notifications; four events; env config; min-duration and
  subagent filters; unit tests.
- `v0.2`: Feishu interactive card; session title/workspace/summary; quiet hours;
  rate limit and retry.
- `v0.3`: DingTalk adapter; generic webhook documented.
- `v1.0`: README, changelog, CI, compatibility matrix, npm release.

## Testing

- Node's built-in test runner: `node --test`.
- Unit tests for pure helpers, payload construction and signature.
- Integration test with a fake `ctx` that emits DSH events and a fake `fetch`;
  assert waterfall listeners call `next()`.
- No live webhook in tests; no network access.

## Security and privacy

- Outbound only; no listening HTTP server.
- Webhook URL and secret are secrets; never log or commit them.
- Notification text carries only session label, workspace, duration and a
  short detail; no file contents or full assistant output.
- HTTPS is required except loopback URLs used by local relays.
- A notifier failure must never break the agent loop.

## Compatibility

- Node `>=20`.
- DSH `>=0.2.0-rc.1 <0.3.0-0`; `engines.dsh` and `dsh.compatibility.dsh` both
  declare the tested range.
- Host-only bundle: `dsh.bundle.patch`, no `dsh.client`.
