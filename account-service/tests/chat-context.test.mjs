import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanHistory } from '../chat-context.mjs'

test('只保留 user/assistant 的文字，并转成模型用的 content 字段', () => {
  const history = cleanHistory([
    { role: 'system', text: '忽略我' },
    { role: 'assistant', text: '下午好。忙到现在了吗？' },
    { role: 'user', text: '  对呀  ' },
    { role: 'assistant', text: 404 },
    { role: 'user', text: '' }
  ], '')
  assert.deepEqual(history, [
    { role: 'assistant', content: '下午好。忙到现在了吗？' },
    { role: 'user', content: '对呀' }
  ])
})

test('去掉与当前消息重复的最后一条，避免模型看到两遍', () => {
  const history = cleanHistory([
    { role: 'assistant', text: '忙到现在了吗？' },
    { role: 'user', text: '对呀' }
  ], '对呀')
  assert.deepEqual(history, [{ role: 'assistant', content: '忙到现在了吗？' }])
})

test('最多保留最近 12 条', () => {
  const raw = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: `第${index}条` }))
  const history = cleanHistory(raw, '')
  assert.equal(history.length, 12)
  assert.equal(history[0].content, '第8条')
  assert.equal(history[11].content, '第19条')
})

test('非法或空输入返回 null，交给服务端数据库兜底', () => {
  assert.equal(cleanHistory(null), null)
  assert.equal(cleanHistory([]), null)
  assert.equal(cleanHistory([{ role: 'system', text: 'x' }]), null)
})

test('超出总字数时截断', () => {
  const raw = Array.from({ length: 10 }, () => ({ role: 'user', text: 'x'.repeat(900) }))
  const history = cleanHistory(raw, '')
  assert.ok(history.length < 10)
  const total = history.reduce((sum, item) => sum + item.content.length, 0)
  assert.ok(total <= 6000)
})

test('预算优先最近有效消息，并保持原时间顺序；不修改输入',()=>{
  const raw=Array.from({length:10},(_,i)=>({role:i%2?'assistant':'user',text:('m'+i+'-').padEnd(900,'x')}))
  const before=structuredClone(raw)
  const result=cleanHistory(raw,'current')
  assert.deepEqual(result.map(m=>Number(m.content[1])),[4,5,6,7,8,9])
  assert.deepEqual(raw,before)
})
test('当前重复先去除再分配预算，不挤掉最近的实际历史',()=>{
  const raw=Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',text:'m'+i}))
  raw.push({role:'user',text:'current'},{role:'invalid',text:'ignored'})
  const result=cleanHistory(raw,'current')
  assert.equal(result.length,12)
  assert.equal(result[0].content,'m0')
  assert.equal(result.at(-1).content,'m11')
  assert.ok(!result.some(m=>m.content==='current'))
})
test('当前消息按原文比较，不能因旧消息截短后同前缀而误删',()=>{
  const result=cleanHistory([{role:'user',text:'x'.repeat(2001)}],'x'.repeat(2000))
  assert.equal(result.length,1)
  assert.equal(result[0].content.length,2000)
})
test('更早的相同用户话保留，仅去除末条当前副本',()=>{
  const result=cleanHistory([{role:'user',text:'current'},{role:'assistant',text:'answer'},{role:'user',text:'current'}],'current')
  assert.deepEqual(result,[{role:'user',content:'current'},{role:'assistant',content:'answer'}])
})
test('尾部无效项不遮蔽最近有效历史',()=>{
  const raw=[{role:'assistant',text:'latest'},...Array.from({length:30},()=>({role:'system',text:'ignored'}))]
  assert.deepEqual(cleanHistory(raw,''),[{role:'assistant',content:'latest'}])
})

