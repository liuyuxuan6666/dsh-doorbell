/**
 * End-to-end check of the listener pipeline: real events in, one HTTP POST out.
 *
 * Runs against a loopback server so it needs no webhook and sends nothing to
 * Feishu. This is the test that fails when the summary wiring regresses.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import { apply } from '../index.js'

/** Start a one-shot loopback receiver and return its URL plus a body collector. */
async function receiver() {
  const bodies = []
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      bodies.push(raw)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}/hook`,
    bodies,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/** Minimal Cordis-shaped context: collect listeners, let the test emit them. */
function harness(config) {
  const listeners = new Map()
  const ctx = {
    logger: { warn() {}, info() {} },
    on(name, handler) {
      if (!listeners.has(name)) listeners.set(name, [])
      listeners.get(name).push(handler)
      return () => {}
    },
  }
  apply(ctx, config)
  const emit = (name, ...args) => (listeners.get(name) ?? []).forEach((fn) => fn(...args))
  return { emit, listeners }
}

function agentFor(session) {
  return { session: { header: session } }
}

test('a completed turn carries the session name and a one-line summary', async () => {
  const sink = await receiver()
  const { emit } = harness({
    provider: 'generic',
    webhookUrl: sink.url,
    minTurnDurationMs: 0,
  })
  const session = { id: 'session-1', title: 'dsh-tally 设计', cwd: '/home/user/code-dsh/dsh-tally' }
  const agent = agentFor(session)

  emit('agent/status', { agent, status: 'running' })
  emit('session/event', { header: session }, { type: 'user/message', data: { content: [{ type: 'text', text: '帮我改一下面板样式' }] } })
  emit('session/event', { header: session }, {
    type: 'assistant/message',
    data: {
      content: [
        { type: 'text', text: '面板已按宿主既有风格重排。\n\n细节：内边距 20/22，只用主题 token。' },
        { type: 'tool-call', id: 'x' },
      ],
    },
  })
  emit('agent/status', { agent, status: 'idle' })

  await new Promise((resolve) => setTimeout(resolve, 60))
  await sink.close()

  assert.equal(sink.bodies.length, 1, 'exactly one notification')
  const payload = JSON.parse(sink.bodies[0])
  assert.match(payload.text, /会话：dsh-tally 设计/)
  assert.match(payload.text, /摘要：面板已按宿主既有风格重排。/)
  assert.doesNotMatch(payload.text, /细节：/)
})

test('an approval before any reply falls back to the user request', async () => {
  const sink = await receiver()
  const { emit } = harness({ provider: 'generic', webhookUrl: sink.url, minTurnDurationMs: 0 })
  const session = { id: 'session-2', title: '部署', cwd: '/tmp/deploy' }
  const agent = agentFor(session)

  emit('session/event', { header: session }, { type: 'user/message', data: { content: [{ type: 'text', text: '把服务重新部署一下' }] } })
  emit('agent/status', { agent, status: 'running' })
  emit('approval/request', { agent, toolName: 'pwsh', reason: '运行 bash 脚本' }, () => Promise.resolve({ kind: 'allow' }))

  await new Promise((resolve) => setTimeout(resolve, 60))
  await sink.close()

  assert.equal(sink.bodies.length, 1)
  const payload = JSON.parse(sink.bodies[0])
  assert.match(payload.text, /摘要：把服务重新部署一下/)
  assert.match(payload.text, /pwsh/)
})
