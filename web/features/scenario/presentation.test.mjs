import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { visualFor, portraitFor, latestCounterpartLine } from './presentation.ts'
import { SCENARIOS, CATEGORY_LABELS } from './scenarios.ts'

test('十卡分别映射角色，原型立绘明确占位，未知卡不冒充已有角色', () => {
  assert.equal(Object.keys(CATEGORY_LABELS).length, 8)
  const family=visualFor('family-marriage')
  assert.equal(family.character.id,'mother')
  assert.equal(family.character.name,SCENARIOS.find(s=>s.id==='family-marriage').counterpartRole)
  for(const s of SCENARIOS) {
    const visual=visualFor(s.id)
    assert.equal(visual.character.name,s.counterpartRole)
    assert.equal(visual.background,null)
    assert.match(visual.character.alt,/占位/)
    if(s.id!=='family-marriage') assert.notEqual(visual.character.id,'mother')
  }
  assert.equal(new Set(SCENARIOS.map(s=>visualFor(s.id).character.id)).size,10)
  for(const id of ['family-father','consumer','care','digital','self','__proto__','constructor','']) assert.equal(visualFor(id),null)
})

test('白板不请求背景图片，复用实际立绘资源，表情缺失回退明确', () => {
  const visual=visualFor('family-marriage')
  assert.equal(visual.background,null)
  for(const asset of [portraitFor(visual)]) {
    const bytes=fs.readFileSync(new URL('../../../public'+asset, import.meta.url))
    assert.equal(bytes.subarray(1,4).toString(),'PNG')
    assert.ok(bytes.readUInt32BE(16)>=512)
  }
  assert.equal(portraitFor(visual,'concerned'),portraitFor(visual,'neutral'))
  assert.equal(portraitFor(visual,'softened'),portraitFor(visual,'neutral'))
})

test('五轮投影始终只取最新 assistant，用户实发仍完整保留以供上下文和复盘', () => {
  const messages=[{role:'assistant',text:'对方开场'}]
  for(let i=1;i<=5;i++) {
    messages.push({role:'user',text:'用户真实发送 '+i})
    assert.equal(latestCounterpartLine(messages).text,i===1?'对方开场':'对方回应 '+(i-1))
    messages.push({role:'assistant',text:'对方回应 '+i})
    const snapshot=JSON.stringify(messages)
    assert.deepEqual(latestCounterpartLine(messages),{text:'对方回应 '+i,index:i*2})
    assert.equal(JSON.stringify(messages),snapshot)
  }
  assert.equal(messages.length,11)
  assert.equal(messages.filter(m=>m.role==='user').length,5)
})

test('长对方台词不被展示投影静默截断，空历史和仅用户历史不冒充对方', () => {
  const text='较长的对方台词。'.repeat(120)
  assert.equal(latestCounterpartLine([{role:'assistant',text},{role:'user',text:'用户话'}]).text,text)
  assert.equal(latestCounterpartLine([]),null)
  assert.equal(latestCounterpartLine([{role:'user',text:'不应出现在对方气泡'}]),null)
})
