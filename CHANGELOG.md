# Changelog

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
