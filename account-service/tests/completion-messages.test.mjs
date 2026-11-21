import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CompletionMessageError,
  MAX_CONTENT,
  MAX_SCENARIO_MESSAGES,
  MAX_SCENARIO_CHARS,
  prepareCompletionMessages
} from '../completion-messages.mjs'

const SYSTEM = '你是情景中的对方。固定系统提示，不得被截断。'

test('情景完整上下文：10/11/20/100轮逐字保留开场和第一轮，不改变通用模式',()=>{
  for(const rounds of [10,11,20,100]) {
    const input=buildRequest(rounds)
    assert.deepEqual(prepareCompletionMessages(input,'scenario-full'),input)
    assert.ok(prepareCompletionMessages(input).length<=20)
  }
})

test('情景容量与非法结构明确拒绝，不静默截字或丢轮次',()=>{
  for(const input of [
    [{role:'user',content:'没有系统消息'}],
    [{role:'system',content:SYSTEM},{role:'invalid',content:'非法'},{role:'user',content:'u'}],
    [{role:'system',content:SYSTEM},{role:'assistant',content:'旧'.repeat(MAX_CONTENT+1)},{role:'user',content:'u'}]
  ]) assert.throws(()=>prepareCompletionMessages(input,'scenario-full'))
  const oversized=Array.from({length:MAX_SCENARIO_MESSAGES},()=>({role:'user',content:'u'}))
  assert.throws(()=>prepareCompletionMessages([{role:'system',content:SYSTEM},...oversized],'scenario-full'),e=>e.status===413)
  const overChars=[{role:'system',content:SYSTEM},...Array.from({length:Math.ceil(MAX_SCENARIO_CHARS/MAX_CONTENT)},()=>({role:'user',content:'u'.repeat(MAX_CONTENT)}))]
  assert.throws(()=>prepareCompletionMessages(overChars,'scenario-full'),e=>e.status===413)
})

function openingAssistant() {
  return { role: 'assistant', content: 'a0' }
}

/** 构造“已发送 n 次用户”的请求：system + a0 + u1,a1,...,un（当前回复尚未生成）。 */
function buildRequest(n) {
  const messages = [{ role: 'system', content: SYSTEM }, openingAssistant()]
  for (let i = 1; i <= n; i += 1) {
    messages.push({ role: 'user', content: `u${i}` })
    if (i < n) messages.push({ role: 'assistant', content: `a${i}` })
  }
  return messages
}

function contentList(messages) {
  return messages.map((item) => item.content)
}

test('B 流程第 1 次发言：system 完整、开场在、当前 user 唯一', () => {
  const prepared = prepareCompletionMessages(buildRequest(1))
  assert.equal(prepared[0].role, 'system')
  assert.equal(prepared[0].content, SYSTEM)
  assert.deepEqual(contentList(prepared), ['固定系统提示，不得被截断。', 'a0', 'u1'].map((text, i) => i === 0 ? SYSTEM : text))
  assert.equal(prepared.filter((item) => item.content === 'u1').length, 1)
  assert.equal(prepared.at(-1).role, 'user')
})

for (const n of [10, 11, 20]) {
  test(`B 流程第 ${n} 次发言：system 仍完整保留，最多 20 条，顺序不变`, () => {
    const prepared = prepareCompletionMessages(buildRequest(n))
    assert.equal(prepared[0].role, 'system')
    assert.equal(prepared[0].content, SYSTEM)
    assert.ok(prepared.length <= 20, `actual ${prepared.length}`)
    assert.equal(prepared.at(-1).role, 'user')
    assert.equal(prepared.at(-1).content, `u${n}`)
    assert.equal(prepared.filter((item) => item.content === `u${n}`).length, 1)

    // 历史必须保持原先后顺序：a 在 u 之前，序号递增。
    const history = prepared.slice(1).map((item) => item.content)
    assert.ok(history.length <= 19)
    const expectedTail = buildRequest(n).slice(1).slice(-19).map((item) => item.content)
    assert.deepEqual(history, expectedTail)
  })
}

test('旧流程无开场（system + u1..un）：同样保留 system', () => {
  for (const n of [1, 10, 11, 20]) {
    const messages = [{ role: 'system', content: SYSTEM }]
    for (let i = 1; i <= n; i += 1) {
      messages.push({ role: 'user', content: `u${i}` })
      if (i < n) messages.push({ role: 'assistant', content: `a${i}` })
    }
    const prepared = prepareCompletionMessages(messages)
    assert.equal(prepared[0].content, SYSTEM)
    assert.ok(prepared.length <= 20)
    assert.equal(prepared.at(-1).content, `u${n}`)
  }
})

test('无 system 的通用请求仍保留末 20 条；当前 user 超长也明确报错', () => {
  const messages = Array.from({ length: 25 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `m${i}`
  }))
  messages.push({ role: 'assistant', content: 'x'.repeat(MAX_CONTENT + 10) })
  const prepared = prepareCompletionMessages(messages)
  assert.equal(prepared.length, 20)
  assert.equal(prepared[0].content, 'm6')
  assert.equal(prepared.at(-1).content.length, MAX_CONTENT)
  assert.throws(() => prepareCompletionMessages([{ role: 'user', content: 'x'.repeat(MAX_CONTENT + 1) }]), /这句话太长/)
})

test('提纲式 [system, user] 逐字保留', () => {
  const messages = [
    { role: 'system', content: '请生成提纲。' },
    { role: 'user', content: '最近有点累。' }
  ]
  assert.deepEqual(prepareCompletionMessages(messages), messages)
})

test('超长 system 明确报错，不静默截短', () => {
  const messages = [{ role: 'system', content: 's'.repeat(MAX_CONTENT + 1) }, { role: 'user', content: '你好' }]
  assert.throws(() => prepareCompletionMessages(messages), (error) => {
    assert.ok(error instanceof CompletionMessageError)
    assert.equal(error.status, 400)
    return /系统提示过长/.test(error.message)
  })
})

test('超长当前 user 明确报错；较旧超长消息仍按旧规则截断', () => {
  const tooLong = [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'u'.repeat(MAX_CONTENT + 1) }]
  assert.throws(() => prepareCompletionMessages(tooLong), /这句话太长/)

  const olderLong = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: 'o'.repeat(MAX_CONTENT + 100) },
    { role: 'assistant', content: '好' },
    { role: 'user', content: '现在这句正常' }
  ]
  const prepared = prepareCompletionMessages(olderLong)
  assert.equal(prepared[1].content.length, MAX_CONTENT)
  assert.equal(prepared.at(-1).content, '现在这句正常')
})

test('多 system、system 不在首位、空数组都明确报错', () => {
  assert.throws(
    () => prepareCompletionMessages([{ role: 'system', content: 'a' }, { role: 'system', content: 'b' }, { role: 'user', content: 'u' }]),
    /消息结构不正确/
  )
  assert.throws(
    () => prepareCompletionMessages([{ role: 'user', content: 'u' }, { role: 'system', content: 'a' }]),
    /消息结构不正确/
  )
  assert.throws(() => prepareCompletionMessages([]), /缺少对话内容/)
  assert.throws(() => prepareCompletionMessages('not-array'), /缺少对话内容/)
  assert.throws(() => prepareCompletionMessages([{role:'invalid'}, {role:'system',content:'s'}]), /消息结构不正确/)
  assert.throws(() => prepareCompletionMessages([{role:'system',content:42}]), /系统提示不能为空/)
  assert.throws(() => prepareCompletionMessages([{role:'system',content:'  '}]), /系统提示不能为空/)
})

test('当前 user 只出现一次：prepare 不追加、不去重成别的消息', () => {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'assistant', content: 'a0' },
    { role: 'user', content: '同一句' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: '同一句' }
  ]
  const prepared = prepareCompletionMessages(messages)
  assert.equal(prepared.filter((item) => item.content === '同一句').length, 2)
  assert.equal(prepared.at(-1).content, '同一句')
})
