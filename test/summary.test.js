import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSummary, firstSentence, textOf } from '../lib/summary.js'

test('textOf joins text blocks and ignores everything else', () => {
  assert.equal(
    textOf({ content: [{ type: 'text', text: 'a' }, { type: 'tool-call', id: 'x' }, { type: 'text', text: 'b' }] }),
    'a b',
  )
  assert.equal(textOf({ data: { content: [{ type: 'text', text: 'nested' }] } }), 'nested')
  assert.equal(textOf({ content: 'plain' }), 'plain')
  assert.equal(textOf(undefined), '')
})

test('firstSentence keeps one sentence and drops code', () => {
  assert.equal(firstSentence('改好了。还有一件事等你确认。'), '改好了。')
  assert.equal(firstSentence('Done. Next step is yours.'), 'Done.')
  assert.equal(firstSentence('```js\nconst a = 1\n```\n摘要在这里'), '摘要在这里')
  assert.equal(firstSentence(''), '')
})

test('firstSentence caps a run-on sentence', () => {
  const out = firstSentence('x'.repeat(200), 40)
  assert.equal(out.length, 40)
  assert.ok(out.endsWith('...'))
})

test('buildSummary prefers the assistant reply, falls back to the request', () => {
  assert.equal(buildSummary({ assistantText: '已完成部署。细节在 README。', userText: '帮我部署' }), '已完成部署。')
  assert.equal(buildSummary({ assistantText: '', userText: '帮我部署一下这个仓库' }), '帮我部署一下这个仓库')
  assert.equal(buildSummary({}), '')
})
