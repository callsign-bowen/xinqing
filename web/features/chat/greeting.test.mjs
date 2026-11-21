import test from 'node:test'
import assert from 'node:assert/strict'
import { greetingFor } from './greeting.ts'

test('按时段选择问候，同一天内保持稳定', () => {
  const morning = new Date(2026, 10, 12, 8, 30)
  assert.equal(greetingFor(morning), greetingFor(new Date(2026, 10, 12, 10, 0)))
  assert.match(greetingFor(morning), /早/)
  assert.match(greetingFor(new Date(2026, 10, 12, 15, 0)), /下午好/)
  assert.match(greetingFor(new Date(2026, 10, 12, 22, 0)), /晚上|还没睡|在的/)
})

test('跨天轮换，不是每次都是同一句', () => {
  const lines = new Set()
  for (let day = 0; day < 8; day += 1) lines.add(greetingFor(new Date(2026, 10, 1 + day, 9, 0)))
  assert.ok(lines.size >= 2)
})

test('有称呼时替换，没有称呼时不留占位符', () => {
  const named = []
  const plain = []
  for (let day = 0; day < 40; day += 1) {
    const date = new Date(2026, 8, 1 + day, 21, 0)
    named.push(greetingFor(date, { nickname: 'Amber' }))
    plain.push(greetingFor(date, { nickname: null }))
  }
  assert.ok(named.some(line => line.includes('Amber')))
  for (const line of [...named, ...plain]) {
    assert.doesNotMatch(line, /\{name\}/)
    assert.ok(line.trim().length > 0)
  }
})

test('全年各时段空昵称无错标点，不预设忙累或强制追问',()=>{
  for(let day=0;day<366;day++) for(const hour of [7,14,22]) for(const nickname of [null,'','  ']){
    const line=greetingFor(new Date(2026,0,1+day,hour),{nickname})
    assert.doesNotMatch(line,/，。|，，|[?？]|辛苦|还没睡|忙到|累了/)
    assert.ok(line.length>0)
  }
})
test('空昵称具体回归：11 月 16 日夜间；有昵称仍完整显示',()=>{
  assert.equal(greetingFor(new Date(2026,10,16,20),{}),'晚上好。')
  assert.equal(greetingFor(new Date(2026,10,16,20),{nickname:'测试称呼'}),'晚上好，测试称呼。')
})

