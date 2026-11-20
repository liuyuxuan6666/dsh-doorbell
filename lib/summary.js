/**
 * Summary for a notification: the opening characters of what the user actually
 * typed.
 *
 * DSH stores injected material as `user/message` events too — plugin preludes,
 * `<system-reminder>` runtime context — each with its own `source.kind`. Only
 * the human's own message carries `kind: "user"`, so the summary is taken from
 * that event alone and never from a system prompt.
 *
 * Deliberately not an LLM call: a notification must never wait on a model
 * request, and a second model call per turn would double the cost of every
 * turn.
 */

/** Join the text blocks of a message or a session event. */
export function textOf(message) {
  const content = message?.content ?? message?.data?.content ?? message?.data?.message?.content ?? []
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join(' ')
}

/**
 * Whether this event is the human's own words rather than injected context.
 *
 * `kind: "user"` is the composer. Plugin preludes carry the plugin's own id
 * (for example `envoy-link-routing`) and runtime context carries
 * `runtime-context`; an event with no source at all is accepted for hosts that
 * predate the field.
 */
export function isHumanAsk(event) {
  const source = event?.data?.source
  if (!source || typeof source !== 'object') return true
  const kind = source.kind
  if (typeof kind !== 'string' || !kind) return true
  return kind === 'user'
}

/** Collapse whitespace so a multi-line message still fits one phone line. */
export function normalizeUserText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Head of the message, capped by code points (so an emoji is never cut in
 * half). A truncated head ends with an ellipsis.
 *
 * @param {string} value raw user text
 * @param {number} [limit] characters to keep, default 20
 * @returns {string} the head, or an empty string when there is no text
 */
export function headSummary(value, limit = 20) {
  const text = normalizeUserText(value)
  if (!text) return ''
  const chars = Array.from(text)
  const cap = Math.max(1, Number(limit) || 20)
  if (chars.length <= cap) return text
  return `${chars.slice(0, cap).join('')}…`
}

/**
 * Pick the summary line for one notification.
 *
 * @param {{userText?:string, limit?:number}} input
 * @returns {string} an empty string when the turn has no user text yet
 */
export function buildSummary({ userText, limit = 20 } = {}) {
  return headSummary(userText, limit)
}
