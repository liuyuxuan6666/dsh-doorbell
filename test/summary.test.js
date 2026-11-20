import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSummary, headSummary, normalizeInstruction, textOf } from '../lib/summary.js'

test('textOf joins text blocks and ignores everything else', () => {
  assert.equal(
    textOf({ content: [{ type: 'text', text: 'a' }, { type: 'tool-call', id: 'x' }, { type: 'text', text: 'b' }] }),
    'a b',
  )
  assert.equal(textOf({ data: { content: [{ type: 'text', text: 'nested' }] } }), 'nested')
  assert.equal(textOf({ content: 'plain' }), 'plain')
  assert.equal(textOf(undefined), '')
})

test('normalizeInstruction drops markdown decoration but keeps punctuation', () => {
  assert.equal(normalizeInstruction('  ## 标题\n\n- 第一条'), '标题 第一条')
  assert.equal(normalizeInstruction('**加粗** 和 ~~删除~~'), '加粗 和 删除')
  assert.equal(normalizeInstruction('看 [文档](https://x.y) 这里'), '看 文档 这里')
  assert.equal(normalizeInstruction('`npm test` 报错了吗？'), 'npm test 报错了吗？')
  assert.equal(normalizeInstruction('```js\nconst a = 1\n```\n摘要在这里'), '摘要在这里')
  assert.equal(normalizeInstruction('1. 第一步\n2. 第二步'), '第一步 第二步')
  assert.equal(normalizeInstruction('   '), '')
})

test('headSummary keeps 16 characters and marks a truncation', () => {
  assert.equal(headSummary('把这条通知改成三行，摘要取指令前十六个字'), '把这条通知改成三行，摘要取指令前…')
  assert.equal(headSummary('帮我改一下面板样式'), '帮我改一下面板样式')
  assert.equal(headSummary(''), '')
  assert.equal(headSummary(undefined), '')
})

test('headSummary counts code points, never half a character', () => {
  const emoji = '😀'.repeat(20)
  const out = headSummary(emoji, 16)
  assert.equal(Array.from(out).length, 17)
  assert.ok(out.endsWith('…'))
})

test('buildSummary is the instruction head', () => {
  assert.equal(buildSummary({ userText: '帮我部署一下这个仓库' }), '帮我部署一下这个仓库')
  assert.equal(buildSummary({}), '')
  assert.equal(buildSummary({ userText: '一'.repeat(40) }).length, 17)
})
