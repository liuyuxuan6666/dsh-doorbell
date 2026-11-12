import { createHmac } from 'node:crypto'

/**
 * Feishu custom-bot signature.
 *
 * The string to sign is `${timestamp}\n${secret}`; it is the HMAC-SHA256 key
 * and the message is empty. This matches Feishu's documented custom-bot flow.
 *
 * @param {string|number} timestamp seconds since the epoch
 * @param {string} secret bot signing secret
 * @returns {string} base64 signature
 */
export function feishuSign(timestamp, secret) {
  const stringToSign = `${timestamp}\n${secret}`
  return createHmac('sha256', stringToSign).update('').digest('base64')
}

/** Build the JSON body for a Feishu text message. */
export function buildFeishuPayload({ text, timestamp, secret = '' }) {
  const payload = {
    msg_type: 'text',
    content: { text: String(text ?? '') },
  }
  if (secret) {
    payload.timestamp = String(timestamp)
    payload.sign = feishuSign(timestamp, secret)
  }
  return payload
}

/**
 * Send one text message through a Feishu custom-bot webhook.
 *
 * @param {object} input
 * @param {string} input.webhookUrl
 * @param {string} [input.secret]
 * @param {string} input.text
 * @param {typeof fetch} [input.fetchImpl]
 * @param {number} [input.timeoutMs]
 * @param {number} [input.now]
 * @returns {Promise<{ok:true,status:number,data:unknown}>}
 */
export async function sendFeishu({
  webhookUrl,
  secret = '',
  text,
  fetchImpl = fetch,
  timeoutMs = 5000,
  now = Date.now(),
}) {
  if (!webhookUrl) throw new Error('feishu webhookUrl is empty')
  const timestamp = String(Math.floor(now / 1000))
  const payload = buildFeishuPayload({ text, timestamp, secret })
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`feishu webhook returned HTTP ${response.status}`)
  const data = await response.json().catch(() => null)
  const code = data?.code ?? data?.StatusCode
  if (typeof code === 'number' && code !== 0) {
    const message = String(data?.msg ?? data?.StatusMessage ?? 'unknown error').slice(0, 180)
    throw new Error(`feishu webhook rejected the message: ${code} ${message}`)
  }
  return { ok: true, status: response.status, data }
}
