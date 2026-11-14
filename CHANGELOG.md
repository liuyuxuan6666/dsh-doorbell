# Changelog

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

### Notes

- DingTalk and Feishu interactive cards are planned for later releases.
- Approval and `user-questions/request` listeners are observe-only waterfalls
  and always delegate with `next()`.
