# dsh-doorbell

Outbound notifications for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).
It rings when a turn finishes, fails, or waits for a human decision — so you can
leave the DSH tab and still know when the agent needs you.

Host-only DSH bundle. No client UI, no inbound chat commands, no session writes.

**Status:** `0.1.0` — Feishu custom-bot text notifications are implemented;
DingTalk and card rendering are planned.

## What it does

| Situation | DSH event | Result |
|---|---|---|
| Turn completed | `agent/status` running → idle | message with session, workspace and duration |
| Turn failed | `agent/error` | error message; the following completion is suppressed |
| Tool waits for approval | `approval/request` | tool name + reason |
| `ask_user_question` waits | `user-questions/request` | the first question |

Approval and question listeners are observe-only waterfalls: they always call
`next()`, so they never swallow the real answerer.

## Install

From npm (after publication):

```bash
dsh plugin --profile desktop add dsh-doorbell
```

From GitHub before the npm release:

```bash
dsh plugin --profile desktop add github:liuyuxuan6666/dsh-doorbell
```

Restart DSH after installing. Then set the webhook environment variables and
add the config row described below.

## Feishu setup

1. Create a private Feishu group (only you) and add a **Custom Bot** to it.
2. Copy the bot webhook URL.
3. If you enable signature verification, copy the signing secret too.
4. Put both in the environment of the process that runs DSH:

```bash
export DSH_DOORBELL_WEBHOOK='https://open.feishu.cn/open-apis/bot/v2/hook/...'
export DSH_DOORBELL_SECRET='...'
```

Never commit the webhook or secret. `webhookUrl` and `secret` config fields
exist for local testing, but environment variables are the intended path.

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
| `provider` | `feishu` | `feishu` or `generic`; DingTalk planned |
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

The `generic` provider posts:

```json
{ "text": "...", "title": "...", "kind": "complete", "ts": "..." }
```

That is useful for a local relay that speaks DingTalk or another service.

## Security and privacy

- Outbound only: the plugin registers no HTTP server and accepts no commands.
- Only HTTPS webhooks are accepted, except loopback HTTP for local relays.
- Secrets are read from env by default and are never logged.
- Messages contain only the session label, workspace path, duration and a short
  detail; no file contents or full assistant output.
- A notification failure is logged and swallowed; it never breaks a turn.

## Compatibility

- Node `>=20`.
- DSH `>=0.2.0-rc.1 <0.3.0-0`; tested against `0.2.2-rc.1`.
- Bundle patch: `cordis.patch.yml` inserts the `doorbell` row.

## Development

```bash
npm install
npm test
```

Tests use Node's built-in runner and a fake `fetch`; no network or live webhook
is required.

## License

MIT. See [LICENSE](LICENSE).
