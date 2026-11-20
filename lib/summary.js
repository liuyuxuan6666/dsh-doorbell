/**
 * Summary for a notification: the first N meaningful characters of the
 * instruction the user actually sent.
 *
 * Deliberately not an LLM call: a notification must never wait on a model
 * request, and a second model call per turn would double the cost of every
 * turn. Taking the opening of the user's own words is free, exact, and enough
 * to recognize which session rang.
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
 * Strip the Markdown decoration that would waste the summary budget, then
 * collapse whitespace. Punctuation is content and stays: it often carries the
 * intent ("这样对吗？" reads very differently from "这样对吗").
 */
export function normalizeInstruction(value) {
  let text = String(value ?? '')
  // Fenced code carries no intent; inline code keeps its words.
  text = text.replace(/```[\s\S]*?```/g, ' ')
  text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  text = text.replace(/`([^`]*)`/g, '$1')
  text = text.replace(/^\s{0,3}#{1,6}[ \t]+/gm, '')
  text = text.replace(/^\s{0,3}>+[ \t]?/gm, '')
  text = text.replace(/^\s{0,3}[-*+][ \t]+/gm, '')
  text = text.replace(/^\s{0,3}\d+[.)][ \t]+/gm, '')
  text = text.replace(/\*\*|__|~~/g, '')
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Head of the instruction, capped by code points (so a surrogate pair or an
 * emoji never gets cut in half). A truncated head ends with an ellipsis.
 *
 * @param {string} value raw user text
 * @param {number} [limit] characters to keep, default 16
 * @returns {string} the head, or an empty string when there is no text
 */
export function headSummary(value, limit = 16) {
  const text = normalizeInstruction(value)
  if (!text) return ''
  const chars = Array.from(text)
  const cap = Math.max(1, Number(limit) || 16)
  if (chars.length <= cap) return text
  return `${chars.slice(0, cap).join('')}…`
}

/**
 * Pick the summary line for one notification.
 *
 * @param {{userText?:string, limit?:number}} input
 * @returns {string} an empty string when the turn has no user text yet
 */
export function buildSummary({ userText, limit = 16 } = {}) {
  return headSummary(userText, limit)
}
