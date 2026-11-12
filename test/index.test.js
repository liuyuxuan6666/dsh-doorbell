import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, resolveConfig } from '../index.js'

function harness(overrides = {}) {
  const handlers = new Map()
  const warnings = []
  const requests = []
  const ctx = {
    on(name, handler) {
      handlers.set(name, handler)
      return () => handlers.delete(name)
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
  return { app, ctx, handlers, warnings, requests, config }
}

const agent = (header = {}) => ({
  session: { header: { id: 's1', title: 'repo', cwd: '/home/user/code-dsh/repo', ...header } },
})

const flush = () => new Promise((resolve) => setImmediate(resolve))

test('resolveConfig keeps defaults and ignores undefined overrides', () => {
  const config = resolveConfig({ provider: undefined, quietHours: '22:00-08:00' })
  assert.equal(config.provider, 'feishu')
  assert.equal(config.quietHours, '22:00-08:00')
})

test('a completed turn sends one Feishu message with session context', async () => {
  const h = harness()
  h.handlers.get('agent/status')({ agent: agent(), status: 'running' })
  h.handlers.get('agent/status')({ agent: agent(), status: 'idle' })
  await flush()
  assert.equal(h.requests.length, 1)
  const body = JSON.parse(h.requests[0].init.body)
  assert.equal(body.msg_type, 'text')
  assert.match(body.content.text, /DSH · 完成/)
  assert.match(body.content.text, /会话：repo/)
})

test('short turns are skipped', async () => {
  const h = harness({ minTurnDurationMs: 10_000 })
  h.handlers.get('agent/status')({ agent: agent(), status: 'running' })
  h.handlers.get('agent/status')({ agent: agent(), status: 'idle' })
  await flush()
  assert.equal(h.requests.length, 0)
})

test('an error sends one message and suppresses the completion', async () => {
  const h = harness()
  const a = agent()
  h.handlers.get('agent/status')({ agent: a, status: 'running' })
  h.handlers.get('agent/error')({ agent: a, error: new Error('boom') })
  h.handlers.get('agent/status')({ agent: a, status: 'idle' })
  await flush()
  assert.equal(h.requests.length, 1)
  assert.match(JSON.parse(h.requests[0].init.body).content.text, /DSH · 出错/)
  assert.match(JSON.parse(h.requests[0].init.body).content.text, /boom/)
})

test('approval requests are observed and delegated', async () => {
  const h = harness()
  let delegated = 0
  const result = h.handlers.get('approval/request')(
    { agent: agent(), toolName: 'pwsh', reason: 'run tests' },
    () => { delegated += 1; return 'answer' },
  )
  await flush()
  assert.equal(result, 'answer')
  assert.equal(delegated, 1)
  assert.match(JSON.parse(h.requests[0].init.body).content.text, /等待确认/)
  assert.match(JSON.parse(h.requests[0].init.body).content.text, /pwsh/)
})

test('user questions are observed and delegated', async () => {
  const h = harness()
  let delegated = 0
  h.handlers.get('user-questions/request')(
    { agent: agent(), questions: [{ question: '选 A 还是 B？' }] },
    () => { delegated += 1; return 'answer' },
  )
  await flush()
  assert.equal(delegated, 1)
  assert.match(JSON.parse(h.requests[0].init.body).content.text, /等待回答/)
  assert.match(JSON.parse(h.requests[0].init.body).content.text, /选 A 还是 B/)
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
  h.handlers.get('agent/status')({ agent: agent(), status: 'running' })
  h.handlers.get('agent/status')({ agent: agent(), status: 'idle' })
  await flush()
  assert.equal(h.requests.length, 0)

  h.handlers.get('approval/request')({ agent: agent(), toolName: 'pwsh' }, () => 'ok')
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
