import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, inject, resolveConfig } from '../index.js'

const flush = () => new Promise((resolve) => setImmediate(resolve))

function harness(overrides = {}) {
  const handlers = new Map()
  const warnings = []
  const requests = []
  const tools = []
  const ctx = {
    on(name, handler) {
      handlers.set(name, handler)
      return () => handlers.delete(name)
    },
    effect(factory) {
      return factory()
    },
    tools: {
      register: (definition) => {
        tools.push(definition)
        return () => {}
      },
    },
    logger: { warn: (line) => warnings.push(String(line)) },
  }
  const config = {
    webhookUrl: 'https://open.feishu.cn/hook',
    provider: 'feishu',
    minTurnDurationMs: 0,
    requestTimeoutMs: 1000,
    env: {},
    fetchImpl: async (url, init) => {
      requests.push({ url, init })
      return { ok: true, status: 200, json: async () => ({ code: 0 }) }
    },
    ...overrides,
  }
  const app = apply(ctx, config)
  return { app, ctx, handlers, warnings, requests, tools, config }
}

const agent = (header = {}) => ({
  session: {
    header: {
      id: 's1',
      title: 'repo',
      cwd: 'C:\\work\\system-administration',
      ...header,
    },
  },
})

const sessionOf = (a) => ({ header: a.session.header })
const ask = (text, header) => ({
  type: 'user/message',
  header,
  data: { content: [{ type: 'text', text }] },
})
const bodyOf = (request) => JSON.parse(request.init.body)
const textOfRequest = (request) => bodyOf(request).content.text

test('the plugin declares the tool registry it uses', () => {
  // Touching ctx.tools without this declaration aborts activation, which is
  // exactly how 0.4.0 shipped broken.
  assert.deepEqual(inject, ['tools'])
})

test('resolveConfig keeps defaults and ignores undefined overrides', () => {
  const config = resolveConfig({ provider: undefined, quietHours: '22:00-08:00' })
  assert.equal(config.provider, 'feishu')
  assert.equal(config.quietHours, '22:00-08:00')
  assert.equal(config.enableTool, true)
  assert.deepEqual(config.templates, {})
})

test('a completed turn sends the three-line message', async () => {
  const h = harness()
  const a = agent()
  const header = sessionOf(a)
  h.handlers.get('agent/status')({ agent: a, status: 'running' })
  h.handlers.get('session/event')(header, ask('把这条通知改成三行，摘要取我指令前十六个字', header))
  h.handlers.get('agent/status')({ agent: a, status: 'idle' })
  await flush()

  assert.equal(h.requests.length, 1)
  const lines = textOfRequest(h.requests[0]).split('\n')
  assert.equal(lines.length, 3)
  assert.match(lines[0], /^DSH · 完成( \d+m?s)?$/)
  assert.equal(lines[1], 'system-administration')
  assert.equal(lines[2], '摘要：把这条通知改成三行，摘要取我指令…')
})

test('short turns are skipped', async () => {
  const h = harness({ minTurnDurationMs: 10_000 })
  const a = agent()
  h.handlers.get('agent/status')({ agent: a, status: 'running' })
  h.handlers.get('agent/status')({ agent: a, status: 'idle' })
  await flush()
  assert.equal(h.requests.length, 0)
})

test('an error sends one message and suppresses the completion', async () => {
  const h = harness()
  const a = agent()
  const header = sessionOf(a)
  h.handlers.get('agent/status')({ agent: a, status: 'running' })
  h.handlers.get('session/event')(header, ask('跑一下测试', header))
  h.handlers.get('agent/error')({ agent: a, error: new Error('boom') })
  h.handlers.get('agent/status')({ agent: a, status: 'idle' })
  await flush()

  assert.equal(h.requests.length, 1)
  const text = textOfRequest(h.requests[0])
  assert.equal(text, 'DSH · 出错\nsystem-administration\n摘要：跑一下测试')
  assert.doesNotMatch(text, /boom/)
})

test('approval requests are observed, delegated, and carry no tool detail', async () => {
  const h = harness()
  const a = agent()
  const header = sessionOf(a)
  h.handlers.get('session/event')(header, ask('把服务重新部署一下', header))
  let delegated = 0
  const result = h.handlers.get('approval/request')(
    { agent: a, toolName: 'pwsh', reason: 'run tests' },
    () => { delegated += 1; return 'answer' },
  )
  await flush()
  assert.equal(result, 'answer')
  assert.equal(delegated, 1)
  const text = textOfRequest(h.requests[0])
  assert.equal(text, 'DSH · 等待确认\nsystem-administration\n摘要：把服务重新部署一下')
  assert.doesNotMatch(text, /pwsh/)
})

test('user questions are observed, delegated, and carry no question detail', async () => {
  const h = harness()
  const a = agent()
  const header = sessionOf(a)
  h.handlers.get('session/event')(header, ask('下一步怎么做', header))
  let delegated = 0
  h.handlers.get('user-questions/request')(
    { agent: a, questions: [{ question: '选 A 还是 B？' }] },
    () => { delegated += 1; return 'answer' },
  )
  await flush()
  assert.equal(delegated, 1)
  const text = textOfRequest(h.requests[0])
  assert.equal(text, 'DSH · 等待回答\nsystem-administration\n摘要：下一步怎么做')
  assert.doesNotMatch(text, /选 A 还是 B/)
})

test('subagents are filtered unless explicitly included', async () => {
  const h = harness()
  h.handlers.get('agent/status')({ agent: agent({ parent: 'p1' }), status: 'running' })
  h.handlers.get('agent/status')({ agent: agent({ parent: 'p1' }), status: 'idle' })
  await flush()
  assert.equal(h.requests.length, 0)

  const included = harness({ includeSubagents: true })
  included.handlers.get('agent/status')({ agent: agent({ parent: 'p1' }), status: 'running' })
  included.handlers.get('agent/status')({ agent: agent({ parent: 'p1' }), status: 'idle' })
  await flush()
  assert.equal(included.requests.length, 1)
})

test('quiet hours suppress completion but not approval', async () => {
  const h = harness({ quietHours: '00:00-23:59' })
  const a = agent()
  h.handlers.get('agent/status')({ agent: a, status: 'running' })
  h.handlers.get('agent/status')({ agent: a, status: 'idle' })
  await flush()
  assert.equal(h.requests.length, 0)

  h.handlers.get('approval/request')({ agent: a }, () => 'ok')
  await flush()
  assert.equal(h.requests.length, 1)
})

test('a missing webhook degrades without throwing', async () => {
  const h = harness({ webhookUrl: '', webhookEnv: 'MISSING' })
  assert.doesNotThrow(() => {
    h.handlers.get('user-questions/request')({ agent: agent(), questions: [{ question: 'q' }] }, () => 'ok')
  })
  await flush()
  assert.equal(h.requests.length, 0)
  assert.match(h.warnings.join('\n'), /webhook is not configured/)
})

test('plugin-injected messages never become the summary', async () => {
  const h = harness()
  const a = agent()
  const header = sessionOf(a)
  h.handlers.get('session/event')(header, ask('真正的指令', header))
  h.handlers.get('session/event')(header, {
    type: 'user/message',
    header,
    data: { source: { kind: 'plugin.goal' }, content: [{ type: 'text', text: '自动续跑注入' }] },
  })
  h.handlers.get('agent/status')({ agent: a, status: 'running' })
  h.handlers.get('agent/status')({ agent: a, status: 'idle' })
  await flush()
  assert.match(textOfRequest(h.requests[0]), /摘要：真正的指令/)
})

test('the send tool is registered with the template catalogue', () => {
  const h = harness({
    templates: { done: 'DSH · 完成 {duration}\n{workspace}\n摘要：{summary}', note: '注意 {time}' },
  })
  assert.equal(h.tools.length, 1)
  const tool = h.tools[0]
  assert.equal(tool.name, 'doorbell_send')
  assert.deepEqual(tool.parameters.properties.template.enum, ['done', 'note'])
  assert.match(tool.description, /- done: DSH · 完成 \{duration\}/)
  assert.match(tool.description, /- note: 注意 \{time\}/)
})

test('the send tool can be turned off', () => {
  const h = harness({ enableTool: false })
  assert.equal(h.tools.length, 0)
})

test('the send tool renders the chosen template and reports success', async () => {
  const h = harness({
    templates: { deploy: '部署完成\n{workspace}\n摘要：{summary}' },
    manualMinIntervalMs: 0,
  })
  const tool = h.tools[0]
  const value = await tool.execute({ template: 'deploy' }, { agent: agent() })
  assert.equal(value.ok, true)
  assert.equal(value.provider, 'feishu')
  assert.match(value.text, /^部署完成\nsystem-administration\n摘要：/)
})

test('the send tool falls back to the built-in format', async () => {
  const h = harness({ manualMinIntervalMs: 0 })
  const a = agent()
  const header = sessionOf(a)
  h.handlers.get('session/event')(header, ask('把这条通知改成三行', header))
  const value = await h.tools[0].execute({}, { agent: a })
  assert.equal(value.text, 'DSH · 通知\nsystem-administration\n摘要：把这条通知改成三行')
})

test('the send tool passes vars into the template and keeps unknown placeholders', async () => {
  const h = harness({
    templates: { task: '{status} | {task} | {missing}' },
    manualMinIntervalMs: 0,
  })
  const value = await h.tools[0].execute({ template: 'task', vars: { task: '部署' } }, { agent: agent() })
  assert.equal(value.text, '通知 | 部署 | {missing}')
})

test('the send tool rejects an unknown template and lists the known ones', async () => {
  const h = harness({ templates: { done: 'a' }, manualMinIntervalMs: 0 })
  const value = await h.tools[0].execute({ template: 'nope' }, { agent: agent() })
  assert.equal(value.ok, false)
  assert.match(value.error, /nope/)
  assert.match(value.error, /done/)
  assert.equal(h.requests.length, 0)
})

test('the send tool respects the rate limit and quiet hours', async () => {
  const limited = harness({ manualMinIntervalMs: 60_000 })
  const first = await limited.tools[0].execute({ text: 'a' }, { agent: agent() })
  const second = await limited.tools[0].execute({ text: 'b' }, { agent: agent() })
  assert.equal(first.ok, true)
  assert.equal(second.ok, false)
  assert.equal(second.skipped, 'rate-limited')
  assert.equal(limited.requests.length, 1)

  const quiet = harness({ quietHours: '00:00-23:59', manualMinIntervalMs: 0 })
  const value = await quiet.tools[0].execute({ text: 'a' }, { agent: agent() })
  assert.equal(value.ok, false)
  assert.equal(value.skipped, 'quiet-hours')
  assert.equal(quiet.requests.length, 0)
})

test('the send tool reports a missing webhook instead of pretending to send', async () => {
  const h = harness({ webhookUrl: '', manualMinIntervalMs: 0 })
  const value = await h.tools[0].execute({ text: 'a' }, { agent: agent() })
  assert.equal(value.ok, false)
  assert.equal(value.skipped, 'no-webhook')
})
