import Schema from '@deepseek-ai/schemastery'

import { inQuietHours, sessionInfo, shouldNotify } from './lib/events.js'
import { buildMessage } from './lib/format.js'
import { buildSummary, headSummary, isHumanAsk, textOf } from './lib/summary.js'
import { createNotifier } from './lib/notify.js'
import { DEFAULT_TEMPLATE, describeTemplates, parseTemplates, renderTemplate, templateVars } from './lib/templates.js'

export const name = 'dsh-doorbell'

// The on-demand send tool needs the tool registry. The service must be
// declared here: touching ctx.tools without inject throws at activation.
export const inject = ['tools']

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
  enableTool: Schema.boolean().default(true)
    .description('Expose doorbell_send so the agent can push a notification on demand.'),
  summaryChars: Schema.number().default(20)
    .description('How many characters of your own message the summary keeps.'),
  manualMinIntervalMs: Schema.number().default(3000)
    .description('Minimum gap between two doorbell_send calls in one session; 0 disables the limit.'),
  templates: Schema.dict(Schema.string()).default({})
    .description('Named message templates: key is what the agent picks, value is the text it sends.'),
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
  enableTool: true,
  summaryChars: 20,
  manualMinIntervalMs: 3000,
  templates: {},
}

const FLAGS = {
  complete: 'notifyOnComplete',
  error: 'notifyOnError',
  approval: 'notifyOnApproval',
  question: 'notifyOnQuestion',
}

/** Merge defaults without letting an undefined config key erase one. */
export function resolveConfig(config = {}) {
  const settings = { ...DEFAULTS, templates: {} }
  for (const [key, value] of Object.entries(config ?? {})) {
    if (value !== undefined) settings[key] = value
  }
  return settings
}

/**
 * Attach the four DSH listeners and, when enabled, the on-demand send tool.
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
  // The instruction that opened the current turn, per session. The summary is
  // its head, so nothing here needs a model call.
  const lastAsk = new Map()
  // Last successful on-demand send, per session, for the rate limit.
  const lastManualAt = new Map()

  // Prefer the durable session id: DSH may hand a fresh agent object to a
  // later event, while the session identity stays stable.
  function sessionKey(agent) {
    const id = sessionInfo(agent).id
    return id || agent
  }

  /** Remember the human's own words; injected preludes and context never count. */
  function remember(session, event) {
    if (event?.type !== 'user/message') return
    if (!isHumanAsk(event)) return
    const id = String(session?.header?.id ?? session?.id ?? '')
    if (!id) return
    const text = textOf(event?.data ?? event)
    if (text.trim()) lastAsk.set(id, text)
  }

  ctx.on('session/event', (session, event) => {
    try {
      remember(session, event)
    } catch {
      /* never let bookkeeping break the session feed */
    }
  })

  function ring(kind, agent, durationMs) {
    try {
      if (!settings[FLAGS[kind]]) return
      const session = sessionInfo(agent)
      const elapsedMs = Number.isFinite(durationMs) ? durationMs : 0
      if (!shouldNotify({ kind, session, elapsedMs, config: settings, now: new Date() })) return
      const summary = buildSummary({
        userText: lastAsk.get(session.id),
        limit: settings.summaryChars,
      })
      const message = buildMessage({
        kind,
        session,
        durationMs: kind === 'complete' ? elapsedMs : undefined,
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
    ring('complete', agent, Date.now() - started)
  })

  ctx.on('agent/error', (event = {}) => {
    const agent = event.agent ?? event.data?.agent
    if (agent) errored.add(sessionKey(agent))
    ring('error', agent)
  })

  // Both are waterfalls: observe, then delegate to the real answerer.
  ctx.on('approval/request', (request, next) => {
    ring('approval', request?.agent)
    return next()
  })

  ctx.on('user-questions/request', (request, next) => {
    ring('question', request?.agent)
    return next()
  })

  ctx.on('agent/disposed', ({ agent } = {}) => {
    if (!agent) return
    const key = sessionKey(agent)
    startedAt.delete(key)
    lastManualAt.delete(key)
    const id = sessionInfo(agent).id
    if (id) lastAsk.delete(id)
  })

  /** Send one notification on the agent's instruction, never throwing. */
  async function sendManual(args = {}, exec) {
    const now = new Date()
    const session = sessionInfo(exec?.agent)
    const key = session.id || 'session'
    if (inQuietHours(now, settings.quietHours)) {
      return { ok: false, skipped: 'quiet-hours', text: '' }
    }
    const minInterval = Math.max(0, Number(settings.manualMinIntervalMs) || 0)
    if (minInterval > 0 && now.getTime() - (lastManualAt.get(key) ?? 0) < minInterval) {
      return { ok: false, skipped: 'rate-limited', text: '' }
    }

    const templates = parseTemplates(settings.templates)
    const templateKey = String(args.template ?? '').trim()
    const direct = String(args.text ?? '').trim()
    const summary = String(args.summary ?? '').trim() ||
      headSummary(lastAsk.get(session.id), settings.summaryChars)
    const extra = args.vars && typeof args.vars === 'object' ? args.vars : {}
    const vars = templateVars({
      kind: 'note',
      session,
      summary,
      prefix: settings.titlePrefix,
      now,
      extra,
    })

    let text
    if (direct) {
      text = direct
    } else if (templateKey) {
      if (templates[templateKey] === undefined) {
        return {
          ok: false,
          error: `没有名为 "${templateKey}" 的模板；可用：${Object.keys(templates).join(', ') || '无'}`,
          text: '',
        }
      }
      text = renderTemplate(templates[templateKey], vars)
    } else {
      text = renderTemplate(DEFAULT_TEMPLATE, vars)
    }
    if (!text) return { ok: false, error: '渲染结果为空', text: '' }

    const result = await notifier.notify({
      kind: 'note',
      title: [settings.titlePrefix, '·', '通知'].filter(Boolean).join(' '),
      text,
    })
    if (result?.ok) lastManualAt.set(key, now.getTime())
    return {
      ok: result?.ok !== false,
      provider: notifier.provider,
      text,
      ...(result?.skipped ? { skipped: String(result.skipped) } : {}),
      ...(result?.error ? { error: String(result.error) } : {}),
    }
  }

  /** The on-demand send tool. Its description carries the template catalogue. */
  function createSendTool() {
    const templates = parseTemplates(settings.templates)
    const keys = Object.keys(templates)
    const properties = {
      text: {
        type: 'string',
        description: '直接发送这段文本；给了它就忽略 template。',
      },
      summary: {
        type: 'string',
        description: '摘要行内容，默认取你这条指令的开头（summaryChars 个字）。',
      },
      vars: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: '填充模板里的 {name} 占位符；未提供的占位符原样保留。',
      },
      template: {
        type: 'string',
        description: '使用哪条已配置模板（key）。不传也没有 text 时用内置三行格式。',
        ...(keys.length ? { enum: keys } : {}),
      },
    }

    return {
      name: 'doorbell_send',
      description: [
        '主动往你的飞书/钉钉群推一条短通知（不影响回合结束时自动发送的那条）。',
        '用 template 选一条已配置模板，或直接给 text。',
        '可用模板（key — 首行）：',
        describeTemplates(templates),
        '模板占位符：{prefix} {status} {duration} {workspace} {summary} {time}，以及 vars 里传入的任意键。',
        '遵守静默时段；同一会话短时间重复调用会被限流。',
      ].join('\n'),
      parameters: { type: 'object', properties, required: [] },
      output: {
        schema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            provider: { type: 'string' },
            text: { type: 'string' },
            skipped: { type: 'string' },
            error: { type: 'string' },
          },
        },
        render(_args, value) {
          if (value?.ok) return [{ type: 'text', text: `已发送（${value.provider}）\n${value.text}` }]
          if (value?.skipped) return [{ type: 'text', text: `未发送：${value.skipped}` }]
          return [{ type: 'text', text: `未发送：${value?.error ?? 'unknown error'}` }]
        },
      },
      presentCall: (args) => ({
        card: 'generic',
        title: `发送通知${args?.template ? `：${args.template}` : ''}`,
        kind: 'other',
        rawInput: args,
      }),
      async execute(args, exec) {
        try {
          return await sendManual(args ?? {}, exec)
        } catch (error) {
          const detail = String(error?.message ?? error).slice(0, 180)
          logger?.warn?.(`[doorbell] on-demand send failed: ${detail}`)
          return { ok: false, error: detail, text: '' }
        }
      },
    }
  }

  const tools = ctx?.tools
  if (settings.enableTool !== false && typeof tools?.register === 'function') {
    const tool = createSendTool()
    if (typeof ctx?.effect === 'function') {
      ctx.effect(() => tools.register(tool), 'dsh-doorbell: send tool')
    } else {
      tools.register(tool)
    }
  }

  return { notifier }
}
