import test from 'node:test'
import assert from 'node:assert/strict'
import {
  approvalDetail,
  baseName,
  errorDetail,
  formatDuration,
  inQuietHours,
  parseQuietHours,
  questionDetail,
  sessionInfo,
  shouldNotify,
} from '../lib/events.js'

test('baseName handles POSIX and Windows paths', () => {
  assert.equal(baseName('/home/user/code-dsh/dsh-doorbell'), 'dsh-doorbell')
  assert.equal(baseName('C:\\Users\\user\\repo\\'), 'repo')
  assert.equal(baseName(''), '')
})

test('sessionInfo reads header fields and falls back to the cwd name', () => {
  assert.deepEqual(
    sessionInfo({
      session: { header: { id: 's1', title: 'Turn 1', cwd: '/work/repo' } },
    }),
    { id: 's1', title: 'Turn 1', cwd: '/work/repo', isSubagent: false },
  )
  assert.equal(
    sessionInfo({ session: { header: { id: 's2', cwd: 'C:\\work\\repo' } } }).title,
    'repo',
  )
  assert.equal(sessionInfo(undefined).title, 'unknown session')
})

test('sessionInfo detects known parent fields as subagents', () => {
  assert.equal(sessionInfo({ session: { header: { parent: 'p1' } } }).isSubagent, true)
  assert.equal(sessionInfo({ session: { header: { parentSessionId: 'p1' } } }).isSubagent, true)
  assert.equal(
    sessionInfo({ session: { header: { origin: { parentSessionId: 'p1' } } } }).isSubagent,
    true,
  )
})

test('formatDuration keeps notifications compact', () => {
  assert.equal(formatDuration(500), '500ms')
  assert.equal(formatDuration(12_400), '12s')
  assert.equal(formatDuration(64_000), '1m 4s')
  assert.equal(formatDuration(3_720_000), '1h 2m')
})

test('quiet hours handle day and overnight windows', () => {
  assert.deepEqual(parseQuietHours('22:00-08:00'), { start: 1320, end: 480 })
  assert.equal(parseQuietHours('nope'), null)
  assert.equal(inQuietHours(new Date(2026, 0, 1, 23, 0), '22:00-08:00'), true)
  assert.equal(inQuietHours(new Date(2026, 0, 1, 7, 0), '22:00-08:00'), true)
  assert.equal(inQuietHours(new Date(2026, 0, 1, 12, 0), '22:00-08:00'), false)
  assert.equal(inQuietHours(new Date(2026, 0, 1, 12, 0), '08:00-22:00'), true)
  assert.equal(inQuietHours(new Date(2026, 0, 1, 23, 0), '08:00-22:00'), false)
  assert.equal(inQuietHours(new Date(2026, 0, 1, 23, 0), ''), false)
})

test('shouldNotify filters short turns, subagents and quiet completion', () => {
  const base = { minTurnDurationMs: 10_000, includeSubagents: false, quietHours: '' }
  const noon = new Date(2026, 0, 1, 12, 0)
  assert.equal(
    shouldNotify({ kind: 'complete', session: { isSubagent: false }, elapsedMs: 2_000, config: base, now: noon }),
    false,
  )
  assert.equal(
    shouldNotify({ kind: 'complete', session: { isSubagent: false }, elapsedMs: 20_000, config: base, now: noon }),
    true,
  )
  assert.equal(
    shouldNotify({ kind: 'complete', session: { isSubagent: true }, elapsedMs: 20_000, config: base, now: noon }),
    false,
  )
  assert.equal(
    shouldNotify({
      kind: 'complete',
      session: { isSubagent: false },
      elapsedMs: 20_000,
      config: { ...base, quietHours: '11:00-13:00' },
      now: noon,
    }),
    false,
  )
  assert.equal(
    shouldNotify({
      kind: 'approval',
      session: { isSubagent: false },
      elapsedMs: 0,
      config: { ...base, quietHours: '11:00-13:00' },
      now: noon,
    }),
    true,
  )
})

test('detail helpers keep only short, useful text', () => {
  assert.equal(approvalDetail({ toolName: 'pwsh', reason: 'run tests' }), 'pwsh — run tests')
  assert.equal(approvalDetail({ toolName: 'pwsh' }), 'pwsh 等待确认')
  assert.equal(questionDetail({ questions: [{ question: '选 A 还是 B？' }] }), '选 A 还是 B？')
  assert.match(errorDetail({ error: new Error('boom') }), /boom/)
  assert.equal(questionDetail({}), '等待你回答问题')
})
