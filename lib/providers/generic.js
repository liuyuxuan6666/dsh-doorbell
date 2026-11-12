/** Generic JSON webhook used by local relays and tests. */

/**
 * @param {object} input
 * @param {string} input.webhookUrl
 * @param {string} input.text
 * @param {string} [input.title]
 * @param {string} [input.kind]
 * @param {typeof fetch} [input.fetchImpl]
 * @param {number} [input.timeoutMs]
 */
export async function sendGeneric({
  webhookUrl,
  text,
  title = '',
  kind = '',
  fetchImpl = fetch,
  timeoutMs = 5000,
}) {
  if (!webhookUrl) throw new Error('generic webhookUrl is empty')
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, title, kind, ts: new Date().toISOString() }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`generic webhook returned HTTP ${response.status}`)
  return { ok: true, status: response.status }
}
