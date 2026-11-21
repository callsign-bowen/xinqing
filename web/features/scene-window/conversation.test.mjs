import test from 'node:test'
import assert from 'node:assert/strict'
import { sceneConversation, hasSceneReply, sceneAnchor } from './conversation.ts'

test('发送新消息后不把上轮回复冒充成本轮回应', () => {
  const messages = [{ kind: 'assistant', text: '上一轮回复' }, { kind: 'user', text: '新的问题' }]
  assert.equal(sceneConversation(messages, true).state, 'thinking')
  assert.equal(sceneConversation(messages, false).state, 'unanswered')
})

test('流式回复尚未持久化时，场景同步当前已显示的正文', () => {
  const messages = [{ kind: 'user', text: '你好' }, { kind: 'assistant', text: '我在这里，' }]
  assert.deepEqual(sceneConversation(messages, true), { state: 'reply', text: '我在这里，' })
  assert.equal(messages.length, 2)
})

test('发送失败保留真实失败状态，不回退到上轮回复或生成成功台词', () => {
  const messages = [{ kind: 'assistant', text: '上一轮回复' }, { kind: 'user', text: '新的问题' }, { kind: 'error', text: '连接超时' }]
  assert.deepEqual(sceneConversation(messages, false), { state: 'error', text: '连接超时' })
})

test('空对话和已收到的长回复均可投影，不截断正文', () => {
  assert.equal(sceneConversation([], false).state, 'idle')
  const text = '完整的回复。'.repeat(400)
  assert.equal(sceneConversation([{ kind: 'assistant', text }], false).text, text)
})

test('人物只在同一会话成功收到新回复时响应', () => {
  const before = { sessionId: 'a', pending: true, assistantCount: 1 }
  assert.equal(hasSceneReply(before, { ...before, pending: false, assistantCount: 2 }), true)
  assert.equal(hasSceneReply(before, { ...before, pending: false }), false)
  assert.equal(hasSceneReply(before, { sessionId: 'b', pending: false, assistantCount: 6 }), false)
  assert.equal(hasSceneReply(undefined, { ...before, pending: false }), false)
})

test('人物锚点拒绝无效坐标，处理出画情况', () => {
  for (const value of [null, {}, { x: NaN, y: .5 }, { x: 0, y: Infinity }, { x: '0.5', y: .5 }]) assert.equal(sceneAnchor(value), undefined)
  assert.deepEqual(sceneAnchor({ x: -3, y: 4, visible: false }), { x: 0, y: 1, visible: false })
  assert.deepEqual(sceneAnchor({ x: .3, y: .6, visible: true }), { x: .3, y: .6, visible: true })
})
