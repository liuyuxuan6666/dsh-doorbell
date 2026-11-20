# Changelog

## [0.4.1] - 2026-11-20

### Fixed

- Activation no longer aborts with `cannot get property "tools" without inject`.
  The plugin now declares `inject = ['tools']` and reads the registry through
  `ctx.tools`. 0.4.0 reached for it without declaring the dependency, so the
  whole plugin — including the four automatic notifications — stayed unloaded
  after the restart, which looked like "the webhook stopped working".
- A regression test pins the declaration.

## [0.4.0] - 2026-11-20

### Changed

- **Fixed three-line message.** `DSH · 完成 2m 53s` puts status and elapsed time
  on one line, the workspace directory name follows, and `摘要：…` closes the
  message. The `会话：` / `工作区：` / `耗时：` labels are gone.
- **The summary is now the head of your instruction.** Every notification
  summarizes the first 16 meaningful characters of the user's own message
  (whitespace collapsed, Markdown decoration stripped, punctuation kept, `…`
  when truncated) instead of the assistant's first sentence. Messages injected
  by other plugins are ignored, so an automatic continuation never becomes the
  summary.

### Removed

- Per-event detail lines: error text, tool names and question texts no longer
  appear in notifications.

### Added

- **`doorbell_send` tool** (`enableTool`, default on): the agent can push a
  message mid-turn. The result is structured — `ok`, `provider`, `text`, and
  `skipped` / `error` when it did not go out.
- **Named templates** (`templates`): a `key → text` map with `{prefix}`,
  `{status}`, `{duration}`, `{workspace}`, `{summary}`, `{time}` and any `vars`
  key. Unknown placeholders stay visible. The tool description lists every key
  with the first line of its text so the agent can pick one.
- On-demand sends honour quiet hours and a per-session rate limit
  (`manualMinIntervalMs`, default 3s). Automatic notifications are unaffected by
  templates or by any on-demand call.
- `lib/templates.js` for template parsing and placeholder substitution.

### Tests

- 115 tests (was 42), including the tool registration, template rendering, the
  rate limit and quiet-hours refusal.

## [0.3.0] - 2026-11-14

### Added

- **Summary line in every notification.** The listener tracks the turn's last
  `assistant/message` (and, before any reply, the user's request) from the
  committed `session/event` feed and renders its first sentence as
  `摘要：…`. Extractive only — no model call, no added latency.
- Integration tests that drive the real listeners against a loopback HTTP
  receiver, asserting the summary reaches the payload.

### Notes

- Code fences and inline code are stripped before summarizing, so a chatty
  reply with a big patch still yields a readable one-liner.
- The first user request per session is kept for the session's lifetime; the
  last reply is reset at every turn start.

## [0.2.0] - 2026-11-12

### Added

- DingTalk custom-robot provider with `加签` (HMAC-SHA256, millisecond
  timestamp) and signed webhook URL.
- Provider dispatch for `feishu`, `dingtalk` and `generic`.
- DingTalk provider and dispatch tests.

## [0.1.0] - 2026-11-12

### Added

- Host-only DSH bundle for outbound notifications.
- Feishu custom-bot text provider with optional signature.
- Generic JSON webhook provider for local relays.
- Completion, error, approval-request and user-question events.
- Minimum turn duration, subagent filtering, quiet hours and HTTPS/loopback
  webhook validation.
- Unit and integration tests using a fake `fetch`; no network required.
