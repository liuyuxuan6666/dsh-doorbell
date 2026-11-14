import Schema from '@deepseek-ai/schemastery'

import {
  approvalDetail,
  errorDetail,
  questionDetail,
  sessionInfo,
  shouldNotify,
} from './lib/events.js'
import { buildMessage } from './lib/format.js'
import { buildSummary, textOf } from './lib/summary.js'
import { createNotifier } from './lib/notify.js'

export const name = 'dsh-doorbell'

export const Config = Schema.object({
  provider: Schema.string().default('feishu')
    .description('Notification provider: feishu, dingtalk, generic.'),
  webhookUrl: Schema.string().default('')
    .description('Direct webhook URL. Prefer webhookEnv so the secret stays out of config.'),
  webhookEnv: Schema.string().default('DSH_DOORBELL_WEBHOOK')
    .description('Environment variable holding the webhook URL.'),
  secret: Schema.string().default('')
    .description('Direct signing secret. Prefer secretEnv.'),
  secretEnv: Schema.string().default('DSH_DOORBELL_SECRET')
    .description('Environment variable holding the signing secret, if the bot uses signatures.'),
  notifyOnComplete: Schema.boolean().default(true)
    .description('Notify when a turn finishes.'),
  notifyOnError: Schema.boolean().default(true)
    .description('Notify when a turn or step fails.'),
  notifyOnApproval: Schema.boolean().default(true)
    .description('Notify when a tool call waits for approval.'),
  notifyOnQuestion: Schema.boolean().default(true)
    .description('Notify when ask_user_question waits for an answer.'),
  minTurnDurationMs: Schema.number().default(10000)
    .description('Skip completion notifications for turns shorter than this.'),
  includeSubagents: Schema.boolean().default(false)
    .description('Also notify for subagent sessions.'),
  quietHours: Schema.string().default('')
    .description('Optional HH:MM-HH:MM window; approval and question alerts still fire.'),
  titlePrefix: Schema.string().default('DSH')
    .description('Prefix for notification titles.'),
  requestTimeoutMs: Schema.number().default(5000)
    .description('Webhook request timeout in milliseconds.'),
})

const DEFAULTS = {
  provider: 'feishu',
  webhookUrl: '',
  webhookEnv: 'DSH_DOORBELL_WEBHOOK',
  secret: '',
  secretEnv: 'DSH_DOORBELL_SECRET',
  notifyOnComplete: true,
  notifyOnError: true,
  notifyOnApproval: true,
  notifyOnQuestion: true,
  minTurnDurationMs: 10000,
  includeSubagents: false,
  quietHours: '',
  titlePrefix: 'DSH',
  requestTimeoutMs: 5000,
}

const FLAGS = {
  complete: 'notifyOnComplete',
  error: 'notifyOnError',
  approval: 'notifyOnApproval',
  question: 'notifyOnQuestion',
}

/** Merge defaults without letting an undefined config key erase one. */
export function resolveConfig(config = {}) {
  const settings = { ...DEFAULTS }
  for (const [key, value] of Object.entries(config ?? {})) {
    if (value !== undefined) settings[key] = value
  }
  return settings
}

/**
 * Attach the four DSH listeners. Host-only: no client half, no tools, no
 * session writes.
 *
 * @param {object} ctx DSH plugin context
 * @param {object} [config] validated plugin config
 */
export function apply(ctx, config = {}) {
  const settings = resolveConfig(config)
  const logger = ctx?.logger
  const notifier = createNotifier(settings, {
    env: settings.env ?? process.env,
    fetchImpl: settings.fetchImpl ?? fetch,
    logger,
  })
  const startedAt = new Map()
  const errored = new Set()
  // Last assistant reply and first user request per session, used to build the
  // one-line summary without another model call.
  const lastReply = new Map()
  const firstAsk = new Map()

  // Prefer the durable session id: DSH may hand a fresh agent object to a
  // later event, while the session identity stays stable.
  function sessionKey(agent) {
    const id = sessionInfo(agent).id
    return id || agent
  }

  /**
   * Remember the conversation text a notification will summarize. Reading the
   * committed session log keeps this exact: the model has already produced
   * these words, so nothing is invented.
   */
  function remember(session, event) {
    const id = String(session?.header?.id ?? session?.id ?? '')
    if (!id) return
    const type = event?.type
    if (type === 'assistant/message') {
      const text = textOf(event?.data ?? event)
      if (text.trim()) lastReply.set(id, text)
      return
    }
    if (type === 'user/message' && !firstAsk.has(id)) {
      const source = event?.data?.source?.kind
      if (typeof source === 'string' && source.startsWith('plugin')) return
      const text = textOf(event?.data ?? event)
      if (text.trim()) firstAsk.set(id, text)
    }
  }

  ctx.on('session/event', (session, event) => {
    try {
      remember(session, event)
    } catch {
      /* never let bookkeeping break the session feed */
    }
  })

  function ring(kind, agent, detail, durationMs) {
    try {
      if (!settings[FLAGS[kind]]) return
      const session = sessionInfo(agent)
      const elapsedMs = Number.isFinite(durationMs) ? durationMs : 0
      if (!shouldNotify({ kind, session, elapsedMs, config: settings, now: new Date() })) return
      const summary = buildSummary({
        assistantText: lastReply.get(session.id),
        userText: firstAsk.get(session.id),
      })
      const message = buildMessage({
        kind,
        session,
        durationMs: kind === 'complete' ? elapsedMs : undefined,
        detail,
        summary,
        prefix: settings.titlePrefix,
      })
      // Fire and forget: a slow webhook must never hold up the agent.
      void notifier.notify(message)
    } catch (error) {
      logger?.warn?.(`[doorbell] could not build a notification: ${String(error?.message ?? error).slice(0, 160)}`)
    }
  }

  ctx.on('agent/status', ({ agent, status } = {}) => {
    if (!agent) return
    const key = sessionKey(agent)
    if (status === 'running') {
      startedAt.set(key, Date.now())
      const id = sessionInfo(agent).id
      if (id) lastReply.delete(id)
      return
    }
    if (status !== 'idle') return
    const started = startedAt.get(key)
    startedAt.delete(key)
    if (started === undefined) return
    // A failed turn already produced an error notification; do not follow it
    // with a misleading "completed" message.
    if (errored.has(key)) {
      errored.delete(key)
      return
    }
    ring('complete', agent, '', Date.now() - started)
  })

  ctx.on('agent/error', (event = {}) => {
    const agent = event.agent ?? event.data?.agent
    if (agent) errored.add(sessionKey(agent))
    ring('error', agent, errorDetail(event))
  })

  // Both are waterfalls: observe, then delegate to the real answerer.
  ctx.on('approval/request', (request, next) => {
    ring('approval', request?.agent, approvalDetail(request))
    return next()
  })

  ctx.on('user-questions/request', (request, next) => {
    ring('question', request?.agent, questionDetail(request))
    return next()
  })

  ctx.on('agent/disposed', ({ agent } = {}) => {
    if (!agent) return
    startedAt.delete(sessionKey(agent))
    const id = sessionInfo(agent).id
    if (id) {
      lastReply.delete(id)
      firstAsk.delete(id)
    }
  })

  return { notifier }
}
