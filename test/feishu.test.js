import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFeishuPayload, feishuSign, sendFeishu } from '../lib/providers/feishu.js'

test('feishuSign matches the documented HMAC construction', () => {
  assert.equal(
    feishuSign('1700000000', 'secret'),
    'fiWS2+gh28DOydAv7hzONH/mDn9+b1Y4Y5ivXWXy8vA=',
  )
})

test('buildFeishuPayload only signs when a secret is present', () => {
  const plain = buildFeishuPayload({ text: 'hello', timestamp: '1700000000' })
  assert.deepEqual(plain, { msg_type: 'text', content: { text: 'hello' } })

  const signed = buildFeishuPayload({
    text: 'hello',
    timestamp: '1700000000',
    secret: 'secret',
  })
  assert.equal(signed.msg_type, 'text')
  assert.equal(signed.timestamp, '1700000000')
  assert.equal(signed.sign, 'fiWS2+gh28DOydAv7hzONH/mDn9+b1Y4Y5ivXWXy8vA=')
})

test('sendFeishu posts the payload and accepts a successful response', async () => {
  let request
  const result = await sendFeishu({
    webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
    text: 'hello',
    now: 1_700_000_000_000,
    fetchImpl: async (url, init) => {
      request = { url, init }
      return { ok: true, status: 200, json: async () => ({ code: 0, msg: 'success' }) }
    },
  })
  assert.equal(result.ok, true)
  assert.equal(request.url, 'https://open.feishu.cn/open-apis/bot/v2/hook/test')
  assert.equal(request.init.method, 'POST')
  assert.deepEqual(JSON.parse(request.init.body), {
    msg_type: 'text',
    content: { text: 'hello' },
  })
})

test('sendFeishu rejects a non-zero Feishu code', async () => {
  await assert.rejects(
    () =>
      sendFeishu({
        webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
        text: 'hello',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ code: 19001, msg: 'bad sign' }),
        }),
      }),
    /19001 bad sign/,
  )
})

test('sendFeishu rejects a non-2xx response', async () => {
  await assert.rejects(
    () =>
      sendFeishu({
        webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
        text: 'hello',
        fetchImpl: async () => ({ ok: false, status: 500, json: async () => null }),
      }),
    /HTTP 500/,
  )
})
