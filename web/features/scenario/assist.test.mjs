import test from 'node:test'
import assert from 'node:assert/strict'
import { SCENARIOS } from './scenarios.ts'
import { assistIntent, buildAssistMessages } from './dialogue.ts'
import {
  validateAssistReply, generateAssist, AssistGenerationError, emitAssistDiagnostic, assistFailureMessage
} from './assist.ts'

const scenario = SCENARIOS.find(item => item.id === 'work-raise')
const common = { scenario, difficulty: 'realistic', goal: scenario.goal, dialogue: [{role:'assistant',text:scenario.openings.realistic}], draft: '', previous: '' }
const ok = { httpStatus: 200, errorType: null, stage: 'success' }
function modelQueue(values, seen = []) {
  return async (messages, options) => {
    seen.push({ messages, options })
    const value = values.shift()
    if (value instanceof Error) throw value
    options.onDiagnostic?.(value?.diagnostic || ok)
    if (value?.error) throw new Error('raw private error must not be logged')
    assert.equal(typeof value, 'string')
    return value
  }
}
const cases = [
  ['无日期不能新增', '我想确认材料清单。', '我下周一整理好材料发您。', 'added_time'],
  ['无行动不能新增', '我想听听您的考虑。', '我会整理好材料发给您。', 'added_action'],
  ['明确日期可保留', '我下周一把材料发给您。', '我会在下周一把材料发给您。', null],
  ['拒绝不变同意', '我不想借钱。', '我愿意借钱。', 'stance_changed'],
  ['犹豫不变确定', '我还没决定要不要参加。', '我答应参加。', 'stance_changed'],
  ['委婉不改立场', '我不想借钱，请委婉一点。', '我不方便借钱，希望您理解。', null],
  ['保留用户明确保证', '我保证下周一把材料发给您。', '我保证下周一把材料发给您。', null],
  ['意向不升级承诺', '我想整理材料。', '我一定会整理材料。', 'added_commitment'],
  ['不新增道歉', '我不同意这个安排。', '我抱歉，但我不同意这个安排。', 'added_apology'],
  ['不新增让步', '我不想答应。', '我不想答应，但都听你的。', 'added_concession'],
  ['对方日期不授权用户', '', '我明天下午把材料发给您。', 'added_time'],
  ['不新增具体钟点', '我想再谈谈。', '我想在15:30再谈谈。', 'added_time'],
  ['不新增 ISO 日期', '我想再谈谈。', '我想在2026-11-18再谈谈。', 'added_time'],
  ['中性表达可用', '', '我想先听听你的看法。', null],
  ['不把多句截成一句', '', '我想先听听。你说吧。', 'multiple_sentences'],
  ['不把多段截成一段', '', '我想先听听。\n你说吧。', 'multiline'],
  ['真实危险输出不做修饰后放行', '', '我会杀了你。', 'unsafe']
]
for (const [name, source, candidate, reason] of cases) test('辅助校验：' + name, () => {
  const result = validateAssistReply(candidate, source)
  assert.equal(result.reason, reason)
  if (!reason) assert.equal(result.text, candidate)
})

test('意愿只来自用户草稿或最近用户实发；不吸收对方要求、旧承诺、未编辑 AI 建议', () => {
  const history = [{role:'user',text:'我周一发材料。'},{role:'assistant',text:'你明天道歉。'},{role:'user',text:'我现在还没决定。'}]
  assert.deepEqual(assistIntent(history,'',''),{source:'sent',text:'我现在还没决定。'})
  assert.deepEqual(assistIntent(history,'我不想答应。',''),{source:'draft',text:'我不想答应。'})
  assert.deepEqual(assistIntent(history,'我明天道歉。','我明天道歉。'),{source:'sent',text:'我现在还没决定。'})
  const payload=JSON.parse(buildAssistMessages(scenario,'realistic',scenario.goal,history,'我明天道歉。','我明天道歉。')[1].content)
  assert.equal(payload.userIntent.text,'我现在还没决定。')
})

test('换句保留用户原始草稿意图，且生成建议本身不能扩充该授权', async () => {
  const source='我下周一把材料发给您。'
  const previous='我会在下周一把材料发给您。'
  assert.deepEqual(assistIntent([],previous,previous,source),{source:'draft',text:source})
  assert.deepEqual(assistIntent([],previous,previous,''),{source:'none',text:''})
  assert.deepEqual(assistIntent([],'我不想答应。',previous,source),{source:'draft',text:'我不想答应。'})
  const seen=[]
  const reply=await generateAssist({...common,draft:previous,previous,authoredDraft:source,complete:modelQueue([source,'OK'],seen),onDiagnostic:()=>{}})
  assert.equal(reply,source)
  assert.equal(JSON.parse(seen[0].messages[1].content).userIntent.text,source)
})

test('单句失败仅重试一次；重试不包含原错误回复；仍先校验再核验', async () => {
  const seen=[], diagnostics=[]
  const reply=await generateAssist({...common, complete:modelQueue(['我想先听听。你说吧。','我想先听听你的看法。','OK'],seen), onDiagnostic:r=>diagnostics.push(r)})
  assert.equal(reply,'我想先听听你的看法。')
  assert.equal(seen.length,3)
  assert.equal(diagnostics[0].validationReason,'multiple_sentences')
  assert.equal(diagnostics.at(-1).retryCount,1)
  assert.equal(diagnostics.at(-1).outcome,'accepted')
  assert.ok(seen[1].messages[0].content.includes('multiple_sentences'))
  assert.ok(!JSON.stringify(seen[1].messages).includes('我想先听听。你说吧。'))
})

test('重试仍不合格明确失败，不能静默截断、填入中性话或计为成功', async () => {
  const diagnostics=[], values=['我想先听听。你说吧。','我想先聊聊。\n请说。']
  await assert.rejects(generateAssist({...common,complete:modelQueue(values),onDiagnostic:r=>diagnostics.push(r)}),e=>e instanceof AssistGenerationError && e.reason==='multiline')
  assert.equal(values.length,0)
  assert.equal(diagnostics.at(-1).outcome,'failed')
  assert.equal(diagnostics.at(-1).retryCount,1)
})

test('语义核验不通过不能展示；只有新候选核验通过才返回', async () => {
  const diagnostics=[]
  const reply=await generateAssist({...common,draft:'我不想借钱。',complete:modelQueue([
    '我不方便借钱，希望您理解。','REJECT: meaning_changed','我不想借钱，希望您理解。','OK'
  ]),onDiagnostic:r=>diagnostics.push(r)})
  assert.equal(reply,'我不想借钱，希望您理解。')
  assert.ok(diagnostics.some(r=>r.phase==='verification'&&r.validationReason==='meaning_changed'))
})

test('核验响应格式异常按失败处理，不能把任意含 OK 的正文视为通过', async () => {
  const values=['我想先听听你的看法。','NOT OK','我想先听听你的意思。','OK 但不确定']
  await assert.rejects(generateAssist({...common,complete:modelQueue(values),onDiagnostic:()=>{}}),e=>e.reason==='verification_format')
})

test('危险候选不进入核验、不自动重试、不返回正文', async () => {
  const seen=[]
  await assert.rejects(generateAssist({...common,complete:modelQueue(['我会杀了你。'],seen),onDiagnostic:()=>{}}),e=>e.reason==='unsafe')
  assert.equal(seen.length,1)
  assert.match(assistFailureMessage('unsafe'),/安全/)
})

test('HTTP 401 不重试；不把原始错误信息写入诊断', async () => {
  const diagnostics=[], seen=[]
  await assert.rejects(generateAssist({...common, complete:modelQueue([{diagnostic:{httpStatus:401,errorType:'http',stage:'response'},error:true}],seen),onDiagnostic:r=>diagnostics.push(r)}))
  assert.equal(seen.length,1)
  assert.equal(diagnostics.at(-1).httpStatus,401)
  assert.equal(diagnostics.at(-1).errorType,'http')
  assert.equal(diagnostics.at(-1).failureStage,'response')
  assert.ok(!JSON.stringify(diagnostics).includes('raw private'))
})

test('HTTP 502 仅重试一次，记录实际本地状态及重试次数', async () => {
  const diagnostics=[]
  const reply=await generateAssist({...common,complete:modelQueue([{diagnostic:{httpStatus:502,errorType:'http',stage:'response'},error:true},'我想先听听你的看法。','OK']),onDiagnostic:r=>diagnostics.push(r)})
  assert.equal(reply,'我想先听听你的看法。')
  assert.equal(diagnostics[0].httpStatus,502)
  assert.equal(diagnostics.at(-1).retryCount,1)
})

test('HTTP 429 不自动重试，明确提示限流且不伪装为校验失败', async () => {
  const diagnostics=[], seen=[]
  await assert.rejects(generateAssist({...common,complete:modelQueue([{diagnostic:{httpStatus:429,errorType:'http',stage:'response'},error:true}],seen),onDiagnostic:r=>diagnostics.push(r)}),e=>e.reason==='rate_limited')
  assert.equal(seen.length,1)
  assert.equal(diagnostics.at(-1).httpStatus,429)
  assert.equal(diagnostics.at(-1).validationReason,null)
  assert.match(assistFailureMessage('rate_limited'),/频繁/)
})

test('取消后不能重试或返回草稿', async () => {
  const controller=new AbortController(), diagnostics=[]
  const complete=async(_messages,options)=>{controller.abort();options.onDiagnostic({httpStatus:null,errorType:'aborted',stage:'fetch'});throw new Error('private')}
  await assert.rejects(generateAssist({...common,complete,signal:controller.signal,onDiagnostic:r=>diagnostics.push(r)}))
  assert.equal(diagnostics.at(-1).outcome,'cancelled')
  assert.equal(diagnostics.at(-1).retryCount,0)
})

test('准备阶段错误也记录，不能伪造 HTTP 状态或调用模型', async () => {
  const diagnostics=[]
  await assert.rejects(generateAssist({...common,goal:'长'.repeat(501),complete:()=>assert.fail(),onDiagnostic:r=>diagnostics.push(r)}),e=>e.reason==='prompt_too_long')
  assert.equal(diagnostics.at(-1).httpStatus,null)
  assert.equal(diagnostics.at(-1).failureStage,'prepare')
})

test('诊断只保留白名单，不记录提示、聊天、Authorization、Key 或异常原文', () => {
  const captured=[]
  emitAssistDiagnostic({
    event:'private',generationId:1,attempt:2,retryCount:1,phase:'complete',httpStatus:200,errorType:'private-message',
    failureStage:'private-chat',validationReason:'private-token',outcome:'accepted',elapsedMs:12,
    prompt:'PRIVATE_PROMPT',messages:'PRIVATE_CHAT',Authorization:'PRIVATE_AUTH',apiKey:'PRIVATE_KEY',error:'PRIVATE_ERROR'
  },r=>captured.push(r))
  const record=captured[0]
  assert.deepEqual(Object.keys(record),['event','generationId','attempt','retryCount','phase','httpStatus','errorType','failureStage','validationReason','outcome','elapsedMs'])
  assert.equal(record.httpStatus,200)
  assert.equal(record.errorType,null)
  assert.equal(record.failureStage,null)
  assert.ok(!JSON.stringify(record).includes('PRIVATE'))
})

test('生成不改变正式消息与原草稿；观察回调抛错也不改变结果', async () => {
  const dialogue=structuredClone(common.dialogue), before=structuredClone(dialogue)
  const draft='我想先听听你的看法。'
  const reply=await generateAssist({...common,dialogue,draft,complete:modelQueue([draft,'OK']),onDiagnostic:()=>{throw new Error('private')}})
  assert.equal(reply,draft)
  assert.deepEqual(dialogue,before)
})

