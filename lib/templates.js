/** Template text and wildcard substitution. Pure, so the phone copy stays testable. */

import { formatDuration } from './events.js'

/** Status label shown on the merged first line. */
export const LABELS = {
  complete: '完成',
  error: '出错',
  approval: '等待确认',
  question: '等待回答',
  note: '通知',
}

/**
 * The built-in format. `{duration}` is empty for events that have no elapsed
 * time, and renderTemplate trims the trailing space it leaves behind.
 */
export const DEFAULT_TEMPLATE = '{prefix} · {status} {duration}\n{workspace}\n摘要：{summary}'

/** Placeholder syntax shared by the built-in and user templates. */
const PLACEHOLDER = /\{([a-zA-Z_][\w.-]*)\}/g

/** Read a template map, accepting an object or a text form. */
export function parseTemplates(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) {
    const out = {}
    for (const [key, text] of Object.entries(value)) {
      const name = String(key ?? '').trim()
      if (!name || text === null || text === undefined) continue
      const body = String(text)
      if (body.trim()) out[name] = body
    }
    return out
  }
  const raw = String(value).trim()
  if (!raw) return {}
  if (raw.startsWith('{')) {
    try {
      return parseTemplates(JSON.parse(raw))
    } catch {
      /* fall through to the line form */
    }
  }
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = /^([^:=]+)[:=]\s*(.*)$/.exec(trimmed)
    if (!match) continue
    const name = match[1].trim()
    const body = match[2].replace(/\\n/g, '\n')
    if (name && body.trim()) out[name] = body
  }
  return out
}

/** One line per template: the key, then the first line of its text. */
export function describeTemplates(templates) {
  const keys = Object.keys(templates ?? {})
  if (!keys.length) {
    return '当前没有配置模板：可以只传 text，或用内置三行格式（DSH · 通知 / 工作区 / 摘要）。'
  }
  return keys
    .map((key) => {
      const first = String(templates[key]).split('\n')[0].replace(/\s+/g, ' ').trim()
      return `- ${key}: ${first.length > 40 ? `${first.slice(0, 40)}…` : first}`
    })
    .join('\n')
}

/**
 * Replace `{name}` with its value. Unknown placeholders are left alone on
 * purpose: a typo should show up in the message, not silently vanish.
 */
export function renderTemplate(template, vars = {}) {
  const text = String(template ?? '').replace(PLACEHOLDER, (whole, name) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) return whole
    const value = vars[name]
    return value === null || value === undefined ? '' : String(value)
  })
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim()
}

/** Build the placeholder values for one message. */
export function templateVars({
  kind = 'note',
  session,
  durationMs,
  summary = '',
  prefix = 'DSH',
  now = new Date(),
  extra = {},
} = {}) {
  const workspace = String(session?.workspace ?? '').trim()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const meta = {
    prefix,
    status: LABELS[kind] ?? LABELS.note,
    kind,
    duration: Number.isFinite(durationMs) && durationMs > 0 ? formatDuration(durationMs) : '',
    workspace,
    summary: String(summary ?? ''),
    time: `${hours}:${minutes}`,
  }
  const supplied = extra && typeof extra === 'object' ? extra : {}
  const vars = { ...meta, ...supplied }
  // An explicit summary argument still wins over a vars.summary alias.
  if (summary) vars.summary = String(summary)
  return vars
}
