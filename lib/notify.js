import { sendFeishu } from './providers/feishu.js'
import { sendGeneric } from './providers/generic.js'

/** Resolve the webhook and optional signing secret without logging either. */
export function resolveWebhook(config = {}, env = process.env) {
  const url = String(
    config.webhookUrl || env[config.webhookEnv || 'DSH_DOORBELL_WEBHOOK'] || '',
  ).trim()
  const secret = String(
    config.secret || env[config.secretEnv || 'DSH_DOORBELL_SECRET'] || '',
  ).trim()
  return { url, secret }
}

/**
 * Only HTTPS is allowed, with a loopback exception for local relays and tests.
 * Keeping this strict prevents a typo from sending session details in cleartext.
 */
export function isAllowedWebhook(value) {
  let url
  try {
    url = new URL(String(value))
  } catch {
    return false
  }
  if (url.protocol === 'https:') return true
  if (url.protocol !== 'http:') return false
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
}

/**
 * Create the provider-facing notifier. `notify()` never throws: a broken
 * webhook must not break an agent turn.
 *
 * @param {object} config
 * @param {{env?:Record<string,string|undefined>, fetchImpl?:typeof fetch, logger?:{warn?:Function}}} [deps]
 */
export function createNotifier(
  config = {},
  { env = process.env, fetchImpl = fetch, logger } = {},
) {
  const provider = String(config.provider ?? 'feishu').trim().toLowerCase()
  let warnedMissing = false

  async function notify(message) {
    const { url, secret } = resolveWebhook(config, env)
    if (!url) {
      if (!warnedMissing) {
        warnedMissing = true
        logger?.warn?.('[doorbell] webhook is not configured; notifications are disabled')
      }
      return { ok: false, skipped: 'no-webhook' }
    }
    if (!isAllowedWebhook(url)) {
      logger?.warn?.('[doorbell] refusing a non-HTTPS webhook (loopback is allowed)')
      return { ok: false, error: 'unsafe-webhook' }
    }
    try {
      if (provider === 'feishu') {
        return await sendFeishu({
          webhookUrl: url,
          secret,
          text: message.text,
          fetchImpl,
          timeoutMs: Number(config.requestTimeoutMs ?? 5000),
        })
      }
      if (provider === 'generic') {
        return await sendGeneric({
          webhookUrl: url,
          text: message.text,
          title: message.title,
          kind: message.kind,
          fetchImpl,
          timeoutMs: Number(config.requestTimeoutMs ?? 5000),
        })
      }
      throw new Error(`unsupported provider: ${provider}`)
    } catch (error) {
      const detail = String(error?.message ?? error).slice(0, 180)
      logger?.warn?.(`[doorbell] notification failed: ${detail}`)
      return { ok: false, error: detail }
    }
  }

  return { provider, notify }
}
