/** Notification copy. Kept pure so the phone message is easy to test. */

import { formatDuration } from './events.js'
import { LABELS } from './templates.js'

/** Collapse whitespace and cap a fragment so a phone notification stays short. */
export function clip(value, limit = 160) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
}

/**
 * Build the fixed three-line message used by every automatic event:
 *
 *   DSH · 完成 2m 53s
 *   system-administration
 *   摘要：把这条通知改成三行
 *
 * Status and elapsed time share line one, the workspace sits on line two, and
 * the head of the user's instruction closes the message. There is no separate
 * "工作区：" label and no event detail line.
 *
 * @param {object} input
 * @param {'complete'|'error'|'approval'|'question'} input.kind
 * @param {{id?:string,title?:string,cwd?:string,workspace?:string}} input.session
 * @param {number} [input.durationMs]
 * @param {string} [input.summary] head of the user's instruction, already capped
 * @param {string} [input.prefix]
 * @returns {{kind:string,title:string,text:string,fields:{label:string,value:string}[]}}
 */
export function buildMessage({ kind, session, durationMs, summary, prefix = 'DSH' }) {
  const label = LABELS[kind] ?? LABELS.note
  const title = [prefix, '·', label].filter(Boolean).join(' ')
  const elapsed = Number.isFinite(durationMs) && durationMs > 0 ? formatDuration(durationMs) : ''
  const head = elapsed ? `${title} ${elapsed}` : title
  const workspace = clip(session?.workspace, 80) || '未知工作区'
  const gist = clip(summary, 60)

  const lines = [head, workspace]
  if (gist) lines.push(`摘要：${gist}`)

  const fields = [{ label: '状态', value: label }]
  if (elapsed) fields.push({ label: '用时', value: elapsed })
  fields.push({ label: '工作区', value: workspace })
  if (gist) fields.push({ label: '摘要', value: gist })

  return { kind, title, text: lines.join('\n'), fields }
}
