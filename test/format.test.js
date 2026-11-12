import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMessage, clip } from '../lib/format.js'

test('clip collapses whitespace and caps long text', () => {
  assert.equal(clip('  a\n b  '), 'a b')
  assert.equal(clip('x'.repeat(200), 20), `${'x'.repeat(17)}...`)
})

test('buildMessage renders completion with session context', () => {
  const message = buildMessage({
    kind: 'complete',
    session: { title: 'repo', cwd: '/home/user/code-dsh/repo' },
    durationMs: 64_000,
    detail: 'done',
  })
  assert.equal(message.title, 'DSH · 完成')
  assert.match(message.text, /会话：repo/)
  assert.match(message.text, /工作区：\/home\/user\/code-dsh\/repo/)
  assert.match(message.text, /耗时：1m 4s/)
  assert.match(message.text, /done/)
  assert.deepEqual(message.fields.map((f) => f.label), ['会话', '工作区', '耗时'])
})

test('buildMessage handles approval without a workspace', () => {
  const message = buildMessage({
    kind: 'approval',
    session: { title: 'repo', cwd: '' },
    detail: 'pwsh — run tests',
    prefix: 'AGENT',
  })
  assert.equal(message.title, 'AGENT · 等待确认')
  assert.match(message.text, /pwsh — run tests/)
  assert.doesNotMatch(message.text, /工作区：/)
})

test('buildMessage falls back to an unknown session', () => {
  const message = buildMessage({ kind: 'question', session: undefined })
  assert.match(message.text, /会话：未知会话/)
  assert.equal(message.title, 'DSH · 等待回答')
})
