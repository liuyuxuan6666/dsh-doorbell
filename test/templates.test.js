import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_TEMPLATE,
  describeTemplates,
  parseTemplates,
  renderTemplate,
  templateVars,
} from '../lib/templates.js'

test('parseTemplates reads a key/value object', () => {
  assert.deepEqual(parseTemplates({ done: 'a', skip: '' , blank: '   ' }), { done: 'a' })
  assert.deepEqual(parseTemplates({}), {})
  assert.deepEqual(parseTemplates(undefined), {})
})

test('parseTemplates also accepts the text form', () => {
  assert.deepEqual(parseTemplates('{"done":"a\\nb"}'), { done: 'a\nb' })
  assert.deepEqual(parseTemplates('done: a\\nb\n# 注释\n\nalert = c'), { done: 'a\nb', alert: 'c' })
})

test('renderTemplate substitutes known placeholders and keeps unknown ones', () => {
  const out = renderTemplate('{prefix} · {status} {duration}\n{workspace}\n{missing}', {
    prefix: 'DSH',
    status: '完成',
    duration: '',
    workspace: 'repo',
  })
  assert.equal(out, 'DSH · 完成\nrepo\n{missing}')
})

test('renderTemplate trims the end of each line', () => {
  assert.equal(renderTemplate('a  \nb\t\n', {}), 'a\nb')
})

test('templateVars fills the documented set', () => {
  const vars = templateVars({
    kind: 'complete',
    session: { workspace: 'repo' },
    durationMs: 64_000,
    summary: '摘要',
    prefix: 'DSH',
    now: new Date(2026, 0, 1, 9, 5),
  })
  assert.deepEqual(vars, {
    prefix: 'DSH',
    status: '完成',
    kind: 'complete',
    duration: '1m 4s',
    workspace: 'repo',
    summary: '摘要',
    time: '09:05',
  })
})

test('templateVars lets extra vars win, except an explicit summary', () => {
  const vars = templateVars({
    kind: 'note',
    session: { workspace: 'repo' },
    summary: '真摘要',
    extra: { workspace: 'other', task: '部署', summary: '别名' },
  })
  assert.equal(vars.workspace, 'other')
  assert.equal(vars.task, '部署')
  assert.equal(vars.summary, '真摘要')
  assert.equal(vars.duration, '')
})

test('describeTemplates lists one key per line', () => {
  const text = describeTemplates({ done: 'DSH · 完成 {duration}\n其余', alert: '注意' })
  assert.match(text, /- done: DSH · 完成 \{duration\}/)
  assert.match(text, /- alert: 注意/)
  assert.match(describeTemplates({}), /没有配置模板/)
})

test('the built-in template matches the documented three lines', () => {
  const text = renderTemplate(DEFAULT_TEMPLATE, templateVars({
    kind: 'complete',
    session: { workspace: 'system-administration' },
    durationMs: 173_000,
    summary: '把这条通知改成三行',
  }))
  assert.equal(text, 'DSH · 完成 2m 53s\nsystem-administration\n摘要：把这条通知改成三行')
})
