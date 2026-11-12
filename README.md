# dsh-doorbell

Outbound notifications for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).
It rings when a turn finishes, fails, or waits for a human decision — so you can
leave the DSH tab and still know when the agent needs you.

Host-only DSH bundle. No client UI, no inbound chat commands, no session writes.

**Status:** `0.2.0` — Feishu and DingTalk text notifications are implemented;
interactive cards, retries and rate limiting are planned.

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

From GitHub:

```bash
dsh plugin --profile desktop add github:liuyuxuan6666/dsh-doorbell
```

Without Git on the DSH host, install a packed tarball:

```bash
npm pack
dsh plugin --profile desktop add file:C:/path/to/dsh-doorbell-0.2.0.tgz
```

Restart DSH after installing. Then set the webhook environment variables.

## Environment variables

The DSH host reads its own process environment. On Windows desktop, set **user
environment variables** and fully restart DSH; a WSL `export` does not reach the
Windows process.

```powershell
[Environment]::SetEnvironmentVariable('DSH_DOORBELL_WEBHOOK','https://...','User')
[Environment]::SetEnvironmentVariable('DSH_DOORBELL_SECRET','...','User')
```

On Linux/macOS, export them before starting DSH:

```bash
export DSH_DOORBELL_WEBHOOK='https://...'
export DSH_DOORBELL_SECRET='...'
```

Never commit the webhook or secret. `webhookUrl` and `secret` config fields exist
for local testing, but environment variables are the intended path.

## Feishu setup

1. Create a private Feishu group (only you) and add a **Custom Bot** to it.
2. Enable **signature verification** and copy the signing secret.
3. Copy the webhook URL: `https://open.feishu.cn/open-apis/bot/v2/hook/...`.
4. Set `provider: feishu` and the two environment variables above.

Official guide: https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot

## DingTalk setup

1. Create a private DingTalk group and add a **Custom Bot (Webhook)**.
2. Security setting: choose **加签 (sign)** and copy the secret. If you use a
   keyword instead, set the keyword to `DSH` and leave the secret empty.
3. Copy the webhook URL: `https://oapi.dingtalk.com/robot/send?access_token=...`.
4. Set `provider: dingtalk` and the two environment variables above.

The plugin appends `timestamp` and `sign` to the DingTalk webhook URL; the
timestamp is in milliseconds, as DingTalk requires.

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

The `generic` provider posts:

```json
{ "text": "...", "title": "...", "kind": "complete", "ts": "..." }
```

That is useful for a local relay or another chat service.

## Providers

- **Feishu**: text message, optional HMAC-SHA256 signature.
- **DingTalk**: text message, optional `加签` signature appended to the URL.
- **generic**: JSON `POST` with `text`, `title`, `kind` and `ts`.

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
