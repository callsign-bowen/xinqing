import test from 'node:test'
import assert from 'node:assert/strict'
import { startIsolatedService } from './support/isolated-service.mjs'
import { NATURAL_DIALOGUE } from '../dialogue-style.mjs'
import { SCENARIOS } from '../../web/features/scenario/scenarios.ts'
import { counterpartPrompt, hasUnsafeContent } from '../../web/features/scenario/dialogue.ts'
import { P11_DIALOGUES } from './fixtures/p11-dialogues.mjs'

test('P1.1 固定评测集：8 日常、4 情景，各六轮；四个独立分支，不修改输入', () => {
  assert.equal(P11_DIALOGUES.length,12)
  assert.equal(P11_DIALOGUES.filter(s=>s.kind==='daily').length,8)
  assert.equal(P11_DIALOGUES.filter(s=>s.kind==='scenario').length,4)
  for(const script of P11_DIALOGUES) {
    assert.ok(Object.isFrozen(script))
    assert.ok(Object.isFrozen(script.turns))
    assert.equal(script.turns.length,6)
    if(script.kind==='scenario') {
      assert.ok(script.alternative && script.alternative!==script.turns[0])
      assert.ok(SCENARIOS.some(s=>s.id===script.scenarioId))
    }
  }
})

test('共享自然原则只出现一次；人物身份、条件反应和 P0 边界独立保留', () => {
  for(const scenario of SCENARIOS) for(const difficulty of ['gentle','realistic','tough']) {
    const prompt=counterpartPrompt(scenario,difficulty,scenario.goal)
    assert.equal(prompt.split(NATURAL_DIALOGUE).length-1,1)
    assert.ok(prompt.includes('assistant 始终是'+scenario.counterpartRole))
    assert.ok(prompt.includes('user 始终是练习者本人'))
    assert.ok(prompt.includes('主观理解'))
    assert.ok(prompt.includes('用户实际说过的话'))
    assert.ok(prompt.includes('不提前替用户完成目标'))
    assert.ok(prompt.includes('不按轮数'))
    assert.ok(prompt.indexOf('【安全与事实边界】')<prompt.indexOf('你正在扮演'))
    assert.ok(prompt.indexOf('你正在扮演')<prompt.indexOf(NATURAL_DIALOGUE))
    assert.equal(hasUnsafeContent(scenario.styles[difficulty]),false)
    assert.doesNotMatch(scenario.styles[difficulty],/打断一次|沉默一次|最多.{0,6}一次/)
    assert.ok(prompt.length<=6000)
    assert.ok(!prompt.includes('你是诺（Nuo）'))
  }
})

test('实际日常 HTTP：自然 JSON、SSE、当前消息、安全、图片与五栏协议回归', async t => {
  const service=await startIsolatedService({respond:body=>{
    const system=body.messages[0].content
    if(system.includes('用户改过了五栏表')) return '我保留你改过的内容。\n<<<FIVE>>>\n'+JSON.stringify({problem:'用户修改',feeling:'烦',belief:'不确定',origin:'已说的经历',step:'先核对'})
    return '这是测试中的自然回复。'
  }})
  t.after(service.close)
  const post=data=>fetch(service.origin+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
  await t.test('正式消息和参数完整，只有一个首位 system，去除重复当前 user',async()=>{
    const response=await post({message:'给我三个桌面整理步骤。',conversationId:'p11-context',history:[
      {role:'assistant',text:'先前可见回复。'},{role:'user',text:'给我三个桌面整理步骤。'}
    ]})
    assert.equal(response.status,200)
    assert.equal((await response.json()).reply,'这是测试中的自然回复。')
    const request=service.requests.at(-1),system=request.messages[0].content
    assert.equal(request.messages.filter(m=>m.role==='system').length,1)
    assert.equal(request.messages.filter(m=>m.content==='给我三个桌面整理步骤。').length,1)
    assert.equal(request.messages.at(-2).content,'先前可见回复。')
    assert.equal(request.temperature,0.85)
    assert.equal(request.max_tokens,1000)
    assert.equal(system.split(NATURAL_DIALOGUE).length-1,1)
    assert.ok(system.indexOf('【安全与事实边界】')<system.indexOf('你是诺（Nuo）'))
    assert.ok(system.indexOf('你是诺（Nuo）')<system.indexOf(NATURAL_DIALOGUE))
    assert.ok(system.includes('清晰步骤或列表'))
    assert.doesNotMatch(system,/先问“你想听建议吗”|连续两轮|每 2–3 轮|一条回复最多一句长句/)
    assert.ok(system.includes('稳，不慌，有分寸'))
    assert.ok(system.includes('高风险与依赖'))
    assert.ok(!system.includes('只返回一个 JSON'))
  })
  await t.test('SSE 使用相同新提示，保留流式契约',async()=>{
    const response=await post({message:'这是流式测试。',conversationId:'p11-stream',stream:true})
    assert.equal(response.status,200)
    assert.match(response.headers.get('content-type'),/text\/event-stream/)
    const frames=await response.text()
    assert.match(frames,/event: delta/)
    assert.match(frames,/event: done/)
    assert.match(frames,/这是测试中的自然回复/)
    assert.ok(service.requests.at(-1).messages[0].content.includes(NATURAL_DIALOGUE))
    assert.equal(service.requests.at(-1).stream,true)
  })
  await t.test('高风险仍走原处理，不调用模型',async()=>{
    const before=service.requests.length
    const response=await post({message:'我想自杀',conversationId:'p11-risk'})
    assert.equal(response.status,200)
    assert.equal((await response.json()).replySource,'safety')
    assert.equal(service.requests.length,before)
  })
  await t.test('图片仍为原有多模态消息结构',async()=>{
    const response=await post({message:'看看这张合成测试图。',image:'data:image/png;base64,YQ==',conversationId:'p11-image'})
    assert.equal(response.status,200)
    assert.equal((await response.json()).sawImage,true)
    const content=service.requests.at(-1).messages.at(-1).content
    assert.equal(content[0].type,'text')
    assert.equal(content[1].type,'image_url')
  })
  await t.test('五栏编辑请求参数与提示协议保持兼容，不灌通用聊天格式',async()=>{
    const response=await post({message:'已修改',reviseSheet:true,sheet:{problem:'用户修改'},conversationId:'p11-sheet'})
    assert.equal(response.status,200)
    const data=await response.json()
    assert.equal(data.reply,'我保留你改过的内容。')
    // Full sheet extraction has a confirmed pre-existing failure in both baselines.
    // This test covers the unchanged request/protocol, not a claim that extraction succeeds.
    const body=service.requests.at(-1)
    assert.ok(body.messages[0].content.includes('<<<FIVE>>>'))
    assert.ok(!body.messages[0].content.includes(NATURAL_DIALOGUE))
    assert.equal(body.temperature,0.6)
    assert.equal(body.max_tokens,700)
    assert.match(body.messages.at(-1).content,/用户修改/)
  })
})

test('guided 旧协议兼容：新自然原则作用于 reply，JSON 状态格式继续保留',async t=>{
  const service=await startIsolatedService({chatMode:'guided',respond:()=>JSON.stringify({
    reply:'先按你给的条件处理。',mode:'daily',question:null,quote:'',restart:false
  })})
  t.after(service.close)
  const response=await fetch(service.origin+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'给我一个方向。',conversationId:'p11-guided'})})
  assert.equal(response.status,200)
  assert.equal((await response.json()).reply,'先按你给的条件处理。')
  const system=service.requests.at(-1).messages[0].content
  assert.ok(system.includes(NATURAL_DIALOGUE))
  assert.ok(system.includes('只返回一个 JSON'))
  assert.ok(system.indexOf('只返回一个 JSON')>system.indexOf(NATURAL_DIALOGUE))
})

