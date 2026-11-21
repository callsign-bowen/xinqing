// Explicitly invoked real-model acceptance. No mock responses or credential handling.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { SCENARIOS } from '../../web/features/scenario/scenarios.ts'
import { practiceFor } from '../../web/features/scenario/practice.ts'
import { openingMessages, counterpartMessages, cleanCounterpartReply, helpMessages, cleanHelpReply, debriefPromptV2, parseDebriefV2 } from '../../web/features/scenario/dialogue.ts'
import { generateAssist } from '../../web/features/scenario/assist.ts'

const {origin}=JSON.parse(await fs.readFile(new URL('../../tmp/scenario-v4-runtime.json',import.meta.url),'utf8'))
const file=new URL('../../docs/情景聊天V4-真实服务结果.json',import.meta.url)
const result={origin,startedAt:new Date().toISOString(),source:'real existing DeepSeek configuration via server.mjs',scenarios:[],tools:{}}
const write=()=>fs.writeFile(file,JSON.stringify(result,null,2))
async function complete(messages,opts={}) {
  const response=await fetch(origin+'/api/ai/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({messages,temperature:opts.temperature??0.85,maxTokens:opts.maxTokens??320,...(opts.contextMode?{contextMode:opts.contextMode}:{})}),signal:AbortSignal.timeout(30000)})
  opts.onDiagnostic?.({httpStatus:response.status,errorType:response.ok?null:'http',stage:response.ok?'success':'response'})
  assert.equal(response.status,200)
  const data=await response.json()
  if(opts.contextMode) assert.equal(data.contextMode,opts.contextMode)
  assert.ok(data.content)
  return data.content
}
const inputs={
  'work-raise':['我负责的项目从两个增加到五个，想和您谈一下薪资调整。','我不要求您马上答应，想先确认评估需要哪些工作依据。'],
  'work-blame':['我核对过分工记录，这部分不是我负责的，我不能直接认下。','我愿意一起核对记录，但希望在群里先澄清责任。'],
  'family-marriage':['妈，我知道你担心我，但我现在没有结婚的打算。','我愿意跟你聊我的生活，但不想再被比较或催着做决定。'],
  'intimacy-cold':['这三天你很少回应，我感到难受，想知道你愿不愿意谈谈。','如果你需要空间可以直接告诉我，但我不能接受一直没有回应。'],
  'friend-loan':['半年前借你的五千元，说好三个月还，现在已经超过约定了。','我希望谈一个具体还款安排，不想一直没有明确说法。'],
  'intimacy-breakup':['我认真想过，我想结束这段恋爱关系。','我知道这很难接受，但我的决定是分手，不想给你模糊的期待。'],
  'self-boundary':['我这次周末不方便，不能替你去摆摊。','我明白你在找人，但我这次还是不能接下。'],
  'consumer-refund':['收到的水杯会漏水，我想协商退换。','可以先告诉我需要核对哪些订单信息和漏水情况吗？'],
  'care-visit':['这次陪诊需要我们一起分工，我不想一个人包揽。','先说说我们各自能承担的部分，再核对复诊安排好吗？'],
  'digital-rumor':['这条消息来源还没核实，我希望先暂停继续转发。','我没有在指责你，想先一起确认原始出处。']
}
for(const scenario of SCENARIOS) {
  const record={id:scenario.id,category:scenario.category,character:practiceFor(scenario).character,messages:[],checks:[],status:'running'}
  result.scenarios.push(record)
  try {
    const opening=await complete(openingMessages(scenario,'realistic',scenario.goal),{contextMode:'scenario-full'})
    assert.ok(cleanCounterpartReply(opening),'valid opening')
    record.messages.push({role:'assistant',text:opening})
    for(const text of inputs[scenario.id]) {
      record.messages.push({role:'user',text})
      const raw=await complete(counterpartMessages(scenario,'realistic',scenario.goal,record.messages),{contextMode:'scenario-full'})
      assert.ok(cleanCounterpartReply(raw),'valid counterpart line')
      record.messages.push({role:'assistant',text:raw})
    }
    record.status='passed';record.checks=['real generated opening','two contextual replies','safe counterpart-only output','independent character context']
  } catch(error) {record.status='failed';record.error=error.message}
  await write()
  console.log(JSON.stringify({id:record.id,status:record.status}))
}
const scenario=SCENARIOS.find(s=>s.id==='self-boundary')
const dialogue=result.scenarios.find(s=>s.id===scenario.id).messages
try {
  const draft='我这次不方便帮忙。'
  const suggestion=await generateAssist({complete,scenario,difficulty:'realistic',goal:scenario.goal,dialogue,draft,previous:''})
  const regenerated=await generateAssist({complete,scenario,difficulty:'realistic',goal:scenario.goal,dialogue,draft:suggestion,authoredDraft:draft,previous:suggestion})
  result.tools.assist={status:'passed',draft,suggestion,regenerated,formalMessageCount:dialogue.length}
} catch(error) {result.tools.assist={status:'failed',reason:error.reason||error.message}}
try {
  const help=await complete(helpMessages(scenario,'realistic',scenario.goal,dialogue),{temperature:0.3,maxTokens:600})
  assert.ok(cleanHelpReply(help));result.tools.help={status:'passed',text:help}
  const sent=dialogue.filter(t=>t.role==='user').map(t=>t.text)
  const built=debriefPromptV2(scenario,scenario.goal,sent)
  const raw=await complete([{role:'system',content:built.system},{role:'user',content:built.user}],{temperature:0.5,maxTokens:500})
  const parsed=parseDebriefV2(raw,built.userTexts)
  assert.ok(sent.includes(parsed.closest));assert.ok(!parsed.takeaway||sent.includes(parsed.takeaway))
  result.tools.debrief={status:'passed',raw,parsed}
} catch(error) {result.tools.helpOrDebrief={status:'failed',error:error.message}}
result.finishedAt=new Date().toISOString()
await write()
console.log(JSON.stringify({finished:true,scenarios:result.scenarios.map(s=>({id:s.id,status:s.status})),tools:result.tools}))
