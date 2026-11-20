/**
 * Pure helpers for turning DSH agent/event data into notification facts.
 * Nothing here performs I/O, so it is safe to unit test without a host.
 */

/** Take the last path component from either POSIX or Windows paths. */
export function baseName(value) {
  const text = String(value ?? '').replace(/[\\/]+$/, '')
  const slash = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
  return slash >= 0 ? text.slice(slash + 1) : text
}

/** Read the stable session fields DSH exposes on an agent, with fallbacks. */
export function sessionInfo(agent) {
  const header = agent?.session?.header ?? agent?.header ?? agent?.session ?? {}
  const id = String(header?.id ?? agent?.session?.id ?? '')
  const cwd = String(header?.cwd ?? '')
  const title = String(header?.title ?? '').trim() || baseName(cwd) || id || 'unknown session'
  // The message shows the workspace, not the session title: the folder name is
  // the fastest way to tell which window rang, and it costs no lookup.
  const workspace = baseName(cwd) || title
  const parent =
    header?.parent ??
    header?.parentSessionId ??
    header?.parentId ??
    header?.origin?.parentSessionId ??
    ''
  return { id, title, cwd, workspace, isSubagent: Boolean(parent) }
}

/** Human-readable elapsed time, compact enough for a phone notification. */
export function formatDuration(ms) {
  const value = Math.max(0, Number(ms) || 0)
  if (value < 1000) return `${Math.round(value)}ms`
  const seconds = Math.round(value / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return `${minutes}m ${rest}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

/** Parse `HH:MM-HH:MM`; a bad or empty range means "no quiet hours". */
export function parseQuietHours(range) {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(String(range ?? '').trim())
  if (!match) return null
  const [startHour, startMinute, endHour, endMinute] = match.slice(1).map(Number)
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return null
  return { start: startHour * 60 + startMinute, end: endHour * 60 + endMinute }
}

/** Whether a local clock time falls in a possibly overnight quiet window. */
export function inQuietHours(now, range) {
  const window = parseQuietHours(range)
  if (!window) return false
  if (window.start === window.end) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  return window.start < window.end
    ? minutes >= window.start && minutes < window.end
    : minutes >= window.start || minutes < window.end
}

/**
 * Decide whether one event should ring.
 *
 * Approval and question events are never suppressed by quiet hours: they block
 * the agent until the user acts.
 */
export function shouldNotify({ kind, session, elapsedMs, config, now = new Date() }) {
  if (session?.isSubagent && config.includeSubagents !== true) return false
  if (kind === 'complete' && elapsedMs < Number(config.minTurnDurationMs ?? 10000)) return false
  if (kind !== 'approval' && kind !== 'question' && inQuietHours(now, config.quietHours)) return false
  return true
}
