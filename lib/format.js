/** Notification copy. Kept pure so the phone message is easy to test. */

import { formatDuration } from './events.js'

const LABELS = {
  complete: '完成',
  error: '出错',
  approval: '等待确认',
  question: '等待回答',
}

/** Collapse whitespace and cap a fragment so a phone notification stays short. */
export function clip(value, limit = 160) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
}

/**
 * Build the plain-text message shared by every provider.
 *
 * @param {object} input
 * @param {'complete'|'error'|'approval'|'question'} input.kind
 * @param {{id?:string,title?:string,cwd?:string}} input.session
 * @param {number} [input.durationMs]
 * @param {string} [input.detail]
 * @param {string} [input.summary] one-line gist of the turn, already extracted
 * @param {string} [input.prefix]
 * @returns {{kind:string,title:string,text:string,fields:{label:string,value:string}[]}}
 */
export function buildMessage({ kind, session, durationMs, detail, summary, prefix = 'DSH' }) {
  const label = LABELS[kind] ?? '通知'
  const title = `${prefix} · ${label}`
  const name = clip(session?.title, 80) || '未知会话'
  const cwd = clip(session?.cwd, 160)
  const lines = [`会话：${name}`]
  const fields = [{ label: '会话', value: name }]

  const gist = clip(summary, 140)
  if (gist) {
    lines.push(`摘要：${gist}`)
    fields.push({ label: '摘要', value: gist })
  }

  if (cwd) {
    lines.push(`工作区：${cwd}`)
    fields.push({ label: '工作区', value: cwd })
  }
  if (Number.isFinite(durationMs)) {
    const text = formatDuration(durationMs)
    lines.push(`耗时：${text}`)
    fields.push({ label: '耗时', value: text })
  }
  if (detail) {
    lines.push('', clip(detail, 220))
  }
  return { kind, title, text: `${title}\n${lines.join('\n')}`, fields }
}
