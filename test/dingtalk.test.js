import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDingtalkPayload,
  buildDingtalkUrl,
  dingtalkSign,
  sendDingTalk,
} from '../lib/providers/dingtalk.js'

test('dingtalkSign matches the documented HMAC construction', () => {
  assert.equal(
    dingtalkSign('1700000000000', 'secret'),
    'OuzzJR5+xZ4/EYwqtNt6sMYZQMTa/HEGvc9miJe7XzY=',
  )
})

test('buildDingtalkUrl preserves access_token and appends encoded signature', () => {
  const url = buildDingtalkUrl('https://oapi.dingtalk.com/robot/send?access_token=abc', {
    timestamp: '1700000000000',
    secret: 'secret',
  })
  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('access_token'), 'abc')
  assert.equal(parsed.searchParams.get('timestamp'), '1700000000000')
  assert.equal(parsed.searchParams.get('sign'), 'OuzzJR5+xZ4/EYwqtNt6sMYZQMTa/HEGvc9miJe7XzY=')
  assert.match(url, /sign=OuzzJR5%2BxZ4%2FEYwqtNt6sMYZQMTa%2FHEGvc9miJe7XzY%3D/)
})

test('buildDingtalkUrl leaves an unsigned webhook unchanged', () => {
  assert.equal(
    buildDingtalkUrl('https://oapi.dingtalk.com/robot/send?access_token=abc', {
      timestamp: '1700000000000',
    }),
    'https://oapi.dingtalk.com/robot/send?access_token=abc',
  )
})

test('buildDingtalkPayload wraps text for a custom robot', () => {
  assert.deepEqual(buildDingtalkPayload({ text: 'hello' }), {
    msgtype: 'text',
    text: { content: 'hello' },
  })
})

test('sendDingTalk posts the signed payload and accepts a successful response', async () => {
  let request
  const result = await sendDingTalk({
    webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
    secret: 'secret',
    text: 'hello',
    now: 1_700_000_000_000,
    fetchImpl: async (url, init) => {
      request = { url, init }
      return { ok: true, status: 200, json: async () => ({ errcode: 0, errmsg: 'ok' }) }
    },
  })
  assert.equal(result.ok, true)
  const url = new URL(request.url)
  assert.equal(url.searchParams.get('timestamp'), '1700000000000')
  assert.equal(url.searchParams.get('sign'), 'OuzzJR5+xZ4/EYwqtNt6sMYZQMTa/HEGvc9miJe7XzY=')
  assert.deepEqual(JSON.parse(request.init.body), {
    msgtype: 'text',
    text: { content: 'hello' },
  })
})

test('sendDingTalk rejects a non-zero errcode', async () => {
  await assert.rejects(
    () =>
      sendDingTalk({
        webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
        text: 'hello',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ errcode: 310000, errmsg: 'sign not match' }),
        }),
      }),
    /310000 sign not match/,
  )
})

test('sendDingTalk rejects a non-2xx response', async () => {
  await assert.rejects(
    () =>
      sendDingTalk({
        webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
        text: 'hello',
        fetchImpl: async () => ({ ok: false, status: 500, json: async () => null }),
      }),
    /HTTP 500/,
  )
})
