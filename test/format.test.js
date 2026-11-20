import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMessage, clip } from '../lib/format.js'

test('clip collapses whitespace and caps long text', () => {
  assert.equal(clip('  a\n b  '), 'a b')
  assert.equal(clip('x'.repeat(200), 20), `${'x'.repeat(17)}...`)
})

test('buildMessage merges status and elapsed time on one line', () => {
  const message = buildMessage({
    kind: 'complete',
    session: { workspace: 'system-administration', cwd: '/work/system-administration' },
    durationMs: 173_000,
    summary: '把这条通知改成三行',
  })
  assert.equal(message.title, 'DSH · 完成')
  assert.equal(
    message.text,
    'DSH · 完成 2m 53s\nsystem-administration\n摘要：把这条通知改成三行',
  )
  assert.deepEqual(message.fields.map((f) => f.label), ['状态', '用时', '工作区', '摘要'])
})

test('buildMessage drops the elapsed time when there is none', () => {
  const message = buildMessage({
    kind: 'approval',
    session: { workspace: 'repo' },
    summary: '把服务重新部署一下',
    prefix: 'AGENT',
  })
  assert.equal(message.text, 'AGENT · 等待确认\nrepo\n摘要：把服务重新部署一下')
  assert.deepEqual(message.fields.map((f) => f.label), ['状态', '工作区', '摘要'])
})

test('buildMessage never adds a detail line', () => {
  const message = buildMessage({
    kind: 'error',
    session: { workspace: 'repo' },
    summary: '跑一下测试',
  })
  assert.equal(message.text.split('\n').length, 3)
  assert.doesNotMatch(message.text, /工作区：/)
  assert.doesNotMatch(message.text, /摘要：[\s\S]*\n/)
})

test('buildMessage falls back to an unknown workspace', () => {
  const message = buildMessage({ kind: 'question', session: undefined })
  assert.equal(message.text, 'DSH · 等待回答\n未知工作区')
  assert.equal(message.title, 'DSH · 等待回答')
})
