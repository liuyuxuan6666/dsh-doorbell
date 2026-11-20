import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSummary,
  headSummary,
  isHumanAsk,
  normalizeUserText,
  textOf,
} from '../lib/summary.js'

test('textOf joins text blocks and ignores everything else', () => {
  assert.equal(
    textOf({ content: [{ type: 'text', text: 'a' }, { type: 'tool-call', id: 'x' }, { type: 'text', text: 'b' }] }),
    'a b',
  )
  assert.equal(textOf({ data: { content: [{ type: 'text', text: 'nested' }] } }), 'nested')
  assert.equal(textOf({ content: 'plain' }), 'plain')
  assert.equal(textOf(undefined), '')
})

test('isHumanAsk accepts only the composer, not injected context', () => {
  assert.equal(isHumanAsk({ data: { source: { kind: 'user' } } }), true)
  assert.equal(isHumanAsk({ data: { source: { kind: 'runtime-context', form: 'snapshot' } } }), false)
  assert.equal(isHumanAsk({ data: { source: { kind: 'envoy-link-routing' } } }), false)
  assert.equal(isHumanAsk({ data: { source: { kind: 'plugin.goal' } } }), false)
  // Hosts without a source field are trusted, as before.
  assert.equal(isHumanAsk({ data: {} }), true)
  assert.equal(isHumanAsk({}), true)
})

test('normalizeUserText keeps the words and collapses whitespace', () => {
  assert.equal(normalizeUserText('  第一行\n\n第二行  '), '第一行 第二行')
  assert.equal(normalizeUserText('`npm test` 报错了吗？'), '`npm test` 报错了吗？')
  assert.equal(normalizeUserText('   '), '')
})

test('headSummary keeps 20 characters and marks a truncation', () => {
  assert.equal(
    headSummary('把这条通知改成三行，摘要取我本人指令的前二十个字'),
    '把这条通知改成三行，摘要取我本人指令的前…',
  )
  assert.equal(headSummary('帮我改一下面板样式'), '帮我改一下面板样式')
  assert.equal(headSummary(''), '')
  assert.equal(headSummary(undefined), '')
})

test('headSummary honours a custom limit and counts code points', () => {
  assert.equal(headSummary('把这条通知改成三行', 5), '把这条通知…')
  const emoji = '😀'.repeat(30)
  const out = headSummary(emoji, 20)
  assert.equal(Array.from(out).length, 21)
  assert.ok(out.endsWith('…'))
})

test('buildSummary is the head of the user text', () => {
  assert.equal(buildSummary({ userText: '帮我部署一下这个仓库' }), '帮我部署一下这个仓库')
  assert.equal(buildSummary({}), '')
  assert.equal(buildSummary({ userText: '一'.repeat(40) }).length, 21)
})
