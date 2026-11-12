import test from 'node:test'
import assert from 'node:assert/strict'
import { createNotifier, isAllowedWebhook, resolveWebhook } from '../lib/notify.js'

const message = { kind: 'complete', title: 'DSH · 完成', text: 'DSH · 完成\n会话：repo' }

test('resolveWebhook prefers explicit config and falls back to env', () => {
  assert.deepEqual(
    resolveWebhook({ webhookUrl: 'https://a', secret: 's' }, {}),
    { url: 'https://a', secret: 's' },
  )
  assert.deepEqual(
    resolveWebhook({ webhookEnv: 'HOOK', secretEnv: 'KEY' }, { HOOK: ' https://b ', KEY: 'k' }),
    { url: 'https://b', secret: 'k' },
  )
})

test('isAllowedWebhook permits HTTPS and loopback HTTP only', () => {
  assert.equal(isAllowedWebhook('https://open.feishu.cn/hook'), true)
  assert.equal(isAllowedWebhook('http://127.0.0.1:8787/notify'), true)
  assert.equal(isAllowedWebhook('http://localhost:8787/notify'), true)
  assert.equal(isAllowedWebhook('http://example.com/notify'), false)
  assert.equal(isAllowedWebhook('file:///tmp/x'), false)
  assert.equal(isAllowedWebhook('not a url'), false)
})

test('notifier sends Feishu text and never leaks the webhook on failure', async () => {
  const warnings = []
  let request
  const notifier = createNotifier(
    {
      provider: 'feishu',
      webhookUrl: 'https://open.feishu.cn/hook',
      secret: 'secret',
      requestTimeoutMs: 1000,
    },
    {
      env: {},
      logger: { warn: (line) => warnings.push(line) },
      fetchImpl: async (url, init) => {
        request = { url, init }
        return { ok: true, status: 200, json: async () => ({ code: 0 }) }
      },
    },
  )
  const result = await notifier.notify(message)
  assert.equal(result.ok, true)
  assert.equal(request.url, 'https://open.feishu.cn/hook')
  assert.equal(JSON.parse(request.init.body).msg_type, 'text')
  assert.deepEqual(warnings, [])
})

test('notifier skips when no webhook is configured', async () => {
  const notifier = createNotifier({ provider: 'feishu' }, { env: {}, fetchImpl: async () => ({}) })
  assert.deepEqual(await notifier.notify(message), { ok: false, skipped: 'no-webhook' })
})

test('notifier rejects a remote cleartext webhook without calling fetch', async () => {
  let called = false
  const notifier = createNotifier(
    { provider: 'generic', webhookUrl: 'http://example.com/notify' },
    { env: {}, fetchImpl: async () => { called = true; return { ok: true } } },
  )
  assert.deepEqual(await notifier.notify(message), { ok: false, error: 'unsafe-webhook' })
  assert.equal(called, false)
})

test('notifier supports the generic provider and swallows failures', async () => {
  let request
  const notifier = createNotifier(
    { provider: 'generic', webhookUrl: 'http://127.0.0.1:8787/notify' },
    {
      env: {},
      logger: { warn: () => {} },
      fetchImpl: async (url, init) => {
        request = { url, init }
        return { ok: true, status: 200 }
      },
    },
  )
  assert.equal((await notifier.notify(message)).ok, true)
  assert.equal(request.url, 'http://127.0.0.1:8787/notify')
  assert.equal(JSON.parse(request.init.body).kind, 'complete')

  const failing = createNotifier(
    { provider: 'feishu', webhookUrl: 'https://open.feishu.cn/hook' },
    { env: {}, logger: { warn: () => {} }, fetchImpl: async () => { throw new Error('network down') } },
  )
  const failed = await failing.notify(message)
  assert.equal(failed.ok, false)
  assert.match(failed.error, /network down/)
})

test('notifier reports an unsupported provider without throwing', async () => {
  const notifier = createNotifier(
    { provider: 'fax', webhookUrl: 'https://example.com/hook' },
    { env: {}, logger: { warn: () => {} }, fetchImpl: async () => ({ ok: true, status: 200 }) },
  )
  const result = await notifier.notify(message)
  assert.equal(result.ok, false)
  assert.match(result.error, /unsupported provider/)
})
