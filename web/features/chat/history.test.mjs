import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHistory } from './history.ts'

const greeting = { role: 'assistant', text: '下午好。忙到现在了吗？' }

test('带上问候，排除当前正在发送的这一条', () => {
  const current = { role: 'user', text: '对呀' }
  const history = buildHistory([greeting, current], current)
  assert.deepEqual(history, [{ role: 'assistant', text: '下午好。忙到现在了吗？' }])
})

test('只取 user/assistant 的文字，保持时间正序', () => {
  const history = buildHistory([
    { role: 'system', text: '忽略' },
    greeting,
    { role: 'user', text: ' 开了三个会 ' },
    { role: 'assistant', text: '' },
    { role: 'user', text: '[图片]' }
  ])
  assert.deepEqual(history, [
    { role: 'assistant', text: '下午好。忙到现在了吗？' },
    { role: 'user', text: '开了三个会' },
    { role: 'user', text: '[图片]' }
  ])
})

test('最多 12 条，取最近的', () => {
  const messages = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: `第${index}条` }))
  const history = buildHistory(messages)
  assert.equal(history.length, 12)
  assert.equal(history[0].text, '第8条')
  assert.equal(history[11].text, '第19条')
})

test('总字数超限时从最旧的开始丢', () => {
  const messages = Array.from({ length: 10 }, () => ({ role: 'user', text: 'x'.repeat(900) }))
  const history = buildHistory(messages)
  assert.ok(history.length < 10)
  assert.ok(history.reduce((sum, item) => sum + item.text.length, 0) <= 6000)
})

test('空输入返回空数组', () => {
  assert.deepEqual(buildHistory(null), [])
  assert.deepEqual(buildHistory([]), [])
})
