import { createHmac } from 'node:crypto'

/**
 * DingTalk custom-robot "加签" signature.
 *
 * HMAC-SHA256 keyed by the secret over `${timestamp}\n${secret}`, where the
 * timestamp is in milliseconds. The result is base64 and must be URL-encoded
 * when appended to the webhook.
 *
 * @param {string|number} timestamp milliseconds since the epoch
 * @param {string} secret robot signing secret
 * @returns {string} base64 signature
 */
export function dingtalkSign(timestamp, secret) {
  const stringToSign = `${timestamp}\n${secret}`
  return createHmac('sha256', secret).update(stringToSign).digest('base64')
}

/** Append `timestamp` and `sign` to a DingTalk webhook URL. */
export function buildDingtalkUrl(webhookUrl, { timestamp, secret = '' }) {
  if (!secret) return String(webhookUrl)
  const url = new URL(String(webhookUrl))
  url.searchParams.set('timestamp', String(timestamp))
  url.searchParams.set('sign', dingtalkSign(timestamp, secret))
  return url.toString()
}

/** Build the JSON body for a DingTalk text message. */
export function buildDingtalkPayload({ text }) {
  return { msgtype: 'text', text: { content: String(text ?? '') } }
}

/**
 * Send one text message through a DingTalk custom-robot webhook.
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
export async function sendDingTalk({
  webhookUrl,
  secret = '',
  text,
  fetchImpl = fetch,
  timeoutMs = 5000,
  now = Date.now(),
}) {
  if (!webhookUrl) throw new Error('dingtalk webhookUrl is empty')
  const timestamp = String(Math.floor(now))
  const url = buildDingtalkUrl(webhookUrl, { timestamp, secret })
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildDingtalkPayload({ text })),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`dingtalk webhook returned HTTP ${response.status}`)
  const data = await response.json().catch(() => null)
  if (data && typeof data.errcode === 'number' && data.errcode !== 0) {
    const message = String(data?.errmsg ?? 'unknown error').slice(0, 180)
    throw new Error(`dingtalk webhook rejected the message: ${data.errcode} ${message}`)
  }
  return { ok: true, status: response.status, data }
}
