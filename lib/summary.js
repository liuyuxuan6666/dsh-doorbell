/**
 * Extractive summary for a notification.
 *
 * Deliberately not an LLM call: a notification must never wait on a model
 * request, and a second model call per turn would double the cost of every
 * turn. Taking the first sentence of the assistant's own reply is free, exact,
 * and enough to recognize which session rang.
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

/** Strip fenced code, collapse whitespace, and keep the first sentence. */
export function firstSentence(value, limit = 140) {
  const text = String(value ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  const stop = text.search(/[。！？!?]|\.\s/)
  const sentence = stop > 0 ? text.slice(0, stop + 1) : text
  return sentence.length > limit ? `${sentence.slice(0, limit - 3).trimEnd()}...` : sentence
}

/**
 * Pick the summary line for one notification.
 *
 * Assistant text wins: it is the answer to whatever the user asked, and it does
 * not repeat the request. Before the model has replied (error, approval,
 * question) the user's own request is the only context there is.
 *
 * @param {{assistantText?:string, userText?:string}} input
 * @returns {string} an empty string when neither side produced text
 */
export function buildSummary({ assistantText, userText } = {}) {
  return firstSentence(assistantText) || firstSentence(userText) || ''
}
