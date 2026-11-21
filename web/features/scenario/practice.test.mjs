import test from 'node:test'
import assert from 'node:assert/strict'
import { SCENARIOS } from './scenarios.ts'
import { practiceFor } from './practice.ts'
import { counterpartMessages, openingMessages, helpMessages, cleanHelpReply, buildAssistMessages } from './dialogue.ts'
import { prepareCompletionMessages } from '../../../account-service/completion-messages.mjs'
import { ACTIVE_PRACTICE_KEY, savePractice, loadPractice, listPractices, finishPractice } from './practice-session.mjs'

test('十张卡的具体事件、人物、关系、初始情绪与独立布局完整',()=>{
  const ids=new Set(),layouts=new Set()
  for(const scene of SCENARIOS) {
    const config=practiceFor(scene)
    assert.equal(config.name,scene.title)
    assert.equal(config.event,scene.context)
    for(const key of ['id','name','identity','relationship','background','personality','initialEmotion','behaviorTendencies']) assert.ok(config.character[key],scene.id+':'+key)
    ids.add(config.character.id);layouts.add(config.presentation.layout)
    assert.ok(config.openingRule)
    assert.equal(config.presentation.background,null)
    assert.equal(config.presentation.placeholder,true)
  }
  assert.equal(ids.size,10);assert.deepEqual([...layouts].sort(),['side','stacked'])
})

test('模型开场仅用独立触发消息，不把触发词或伪造用户回答写入正式历史',()=>{
  for(const scene of SCENARIOS) {
    const request=openingMessages(scene,'realistic',scene.goal)
    assert.equal(request.length,2)
    assert.equal(request[0].role,'system')
    assert.match(request[0].content,/本次仅生成开场/)
    assert.ok(request[0].content.includes(practiceFor(scene).openingRule))
    assert.ok(request[0].content.includes(scene.counterpartRole))
    assert.ok(request.every(item=>item.content.length<=6000))
    const history=[{role:'assistant',text:'模型生成开场'}]
    assert.equal(counterpartMessages(scene,'realistic',scene.goal,history).filter(m=>m.role==='user').length,0)
  }
})

test('十轮实际消息准备保留唯一完整 System、首轮用户事实与本轮内容',()=>{
  for(const scene of SCENARIOS) {
    const history=[{role:'assistant',text:'开场'}]
    for(let turn=1;turn<=10;turn++) {
      history.push({role:'user',text:'第'+turn+'轮用户实发'})
      const request=counterpartMessages(scene,'realistic',scene.goal,history)
      const sent=prepareCompletionMessages(request,'scenario-full')
      assert.deepEqual(sent,request)
      assert.equal(sent[0].content,request[0].content)
      assert.equal(sent.filter(m=>m.role==='system').length,1)
      assert.equal(sent.filter(m=>m.content==='第'+turn+'轮用户实发').length,1)
      assert.ok(sent.some(m=>m.content==='第1轮用户实发'))
      assert.equal(sent.at(-1).content,'第'+turn+'轮用户实发')
      history.push({role:'assistant',text:'第'+turn+'轮对方回应'})
    }
    assert.equal(history.length,21)
  }
})

test('求助包含近期实发语境、保持教练任务独立；辅助仍以最新原意为唯一授权',()=>{
  const scene=SCENARIOS[0],history=[{role:'assistant',text:'请你下周一把所有材料发来。'},{role:'user',text:'我还没决定要不要接这个任务。'}]
  const snapshot=JSON.stringify(history)
  const help=helpMessages(scene,'realistic',scene.goal,history)
  assert.deepEqual(JSON.parse(help[1].content).recentDialogue,history)
  assert.match(help[0].content,/不要生成可直接发送/)
  const assist=buildAssistMessages(scene,'realistic',scene.goal,history,'我现在不想答应。','')
  const data=JSON.parse(assist[1].content)
  assert.equal(data.userIntent.text,'我现在不想答应。')
  assert.deepEqual(data.recentDialogue,history)
  assert.equal(JSON.stringify(history),snapshot)
  assert.equal(cleanHelpReply('先核对分工，再决定自己能承担的部分。'),'先核对分工，再决定自己能承担的部分。')
  assert.equal(cleanHelpReply('你不答应我就曝光你的隐私。'),null)
})

test('长求助和辅助只减旧语境，不截断当前意愿、不改变正式历史',()=>{
  const scene=SCENARIOS[0],history=Array.from({length:24},(_,i)=>({role:i%2?'user':'assistant',text:'旧话'.repeat(900)}))
  const intent='我的最新原意。'.repeat(150),snapshot=JSON.stringify(history)
  const assist=buildAssistMessages(scene,'realistic',scene.goal,history,intent,'')
  assert.equal(JSON.parse(assist[1].content).userIntent.text,intent)
  assert.ok(assist[1].content.length<=6000)
  assert.ok(helpMessages(scene,'realistic',scene.goal,history)[1].content.length<=6000)
  assert.equal(JSON.stringify(history),snapshot)
})

function storage() {const values=new Map([['nuo_scenario_history_v1','legacy exact bytes'],['nuo_scenario_history_v2','[]']]);return {values,getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}}
function practice(id='one') {return {id,scenarioId:'family-marriage',difficulty:'realistic',goal:'表达边界',remaining:50,draft:'尚未发送的草稿',authoredDraft:'尚未发送的草稿',lastSuggestion:'',messages:Array.from({length:21},(_,i)=>({role:i%2?'user':'assistant',text:'实发'+i})),awaitingReply:false}}
test('未完成演练可完整恢复十轮实发和独立草稿，不改 v1/v2；多段不互相覆盖',()=>{
  const s=storage(),ids=SCENARIOS.map(x=>x.id),record=practice()
  assert.equal(savePractice(s,record),true)
  assert.equal(savePractice(s,practice('two')),true)
  assert.deepEqual(loadPractice(s,ids,'one'),record)
  assert.equal(listPractices(s,ids).length,2)
  assert.equal(finishPractice(s,'one'),true)
  assert.equal(loadPractice(s,ids,'one'),null)
  assert.equal(loadPractice(s,ids).id,'two')
  assert.equal(s.values.get('nuo_scenario_history_v1'),'legacy exact bytes')
  assert.equal(s.values.get('nuo_scenario_history_v2'),'[]')
})
test('损坏、未知角色和越界暂存不作为恢复上下文；存储失败明确返回',()=>{
  const s=storage(),ids=SCENARIOS.map(x=>x.id)
  s.setItem(ACTIVE_PRACTICE_KEY,'broken');assert.equal(loadPractice(s,ids),null)
  s.setItem(ACTIVE_PRACTICE_KEY,JSON.stringify([{...practice(),messages:[{role:'system',text:'恶意注入'}]}]));assert.equal(loadPractice(s,ids),null)
  s.setItem(ACTIVE_PRACTICE_KEY,JSON.stringify([{...practice(),scenarioId:'unknown'}]));assert.equal(loadPractice(s,ids),null)
  assert.equal(savePractice({getItem:()=>null,setItem(){throw new Error('quota')}},practice()),false)
})

test('刷新保留 AI 草稿来源，重新生成不能把未发送建议当用户意愿',()=>{
  const s=storage(),scene=SCENARIOS[0]
  const record={...practice(),scenarioId:scene.id,draft:'我想先听听你的看法。',authoredDraft:'',lastSuggestion:'我想先听听你的看法。',messages:[{role:'assistant',text:'你想说什么？'}]}
  savePractice(s,record)
  const restored=loadPractice(s,SCENARIOS.map(item=>item.id),record.id)
  const payload=JSON.parse(buildAssistMessages(scene,'realistic',scene.goal,restored.messages,restored.draft,restored.lastSuggestion,restored.authoredDraft)[1].content)
  assert.deepEqual(payload.userIntent,{source:'none',text:''})
  assert.equal(restored.messages.length,1)
  delete record.lastSuggestion
  savePractice(s,record)
  assert.equal(loadPractice(s,SCENARIOS.map(item=>item.id),record.id).lastSuggestion,record.draft,'旧暂存也保守保留生成草稿来源')
})

test('损坏暂存不覆盖原始内容；超过旧800k阈值的合法对话仍可恢复',()=>{
  const s=storage(),ids=SCENARIOS.map(item=>item.id)
  s.setItem(ACTIVE_PRACTICE_KEY,'{"unknown":"keep"}')
  assert.equal(savePractice(s,practice()),false)
  assert.equal(s.getItem(ACTIVE_PRACTICE_KEY),'{"unknown":"keep"}')
  const large={...practice(),messages:Array.from({length:450},(_,i)=>({role:i%2?'user':'assistant',text:'字'.repeat(1900)}))}
  s.setItem(ACTIVE_PRACTICE_KEY,JSON.stringify([large]))
  assert.equal(loadPractice(s,ids).messages.length,450)
})
