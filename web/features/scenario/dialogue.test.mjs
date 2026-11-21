import assert from 'node:assert/strict'
import test from 'node:test'
import { SCENARIOS } from './scenarios.ts'
import {
  buildAssistMessages,
  canApplyAssist,
  cleanCounterpartReply,
  cleanAssistReply,
  counterpartPrompt,
  debriefPromptV2,
  hasUnsafeContent,
  openingFor,
  parseDebriefV2
} from './dialogue.ts'

const work = SCENARIOS.find((item) => item.id === 'work-raise')
const family = SCENARIOS.find((item) => item.id === 'family-marriage')
assert.ok(work && family)

test('counterpartPrompt：扮演对方，不替用户说话，包含角色/背景/目标/禁区', () => {
  const prompt = counterpartPrompt(work, 'realistic', work.goal)
  assert.match(prompt, /直属领导/)
  assert.match(prompt, /你不是 AI 助手，也不是用户的语言替身/)
  assert.match(prompt, /用户想练的/)
  assert.match(prompt, /不辱骂、不威胁/)
  assert.doesNotMatch(prompt, /替用户回应/)
  assert.ok(prompt.length < 6000)
})

test('openingFor：正常开场保留；越界开场降级为受控中性句', () => {
  const normal = openingFor(work, 'realistic')
  assert.equal(normal.degraded, false)
  assert.equal(normal.text, work.openings.realistic)

  const toughFamily = openingFor(family, 'tough')
  assert.equal(toughFamily.degraded, true)
  assert.equal(toughFamily.text, '你想说什么？我听着。')
  assert.equal(hasUnsafeContent(family.openings.tough), true)
})

test('辅助消息：只有 system + 一条 user 参考，草稿标为未发送', () => {
  const dialogue = [
    { role: 'assistant', text: '现在？我一会儿还有个会。' },
    { role: 'user', text: '我想聊一下我的项目。' }
  ]
  const messages = buildAssistMessages(work, 'realistic', work.goal, dialogue, '我想说', '上次那句')
  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'system')
  assert.equal(messages[1].role, 'user')
  const payload = JSON.parse(messages[1].content)
  assert.equal(payload.userIntent.text, '我想说')
  assert.match(payload.draftStatus, /未发送/)
  assert.equal(payload.addressee, '直属领导')
  assert.equal(payload.userIntent.source, 'draft')
  assert.equal(payload.recentSentDialogue, undefined)
  assert.deepEqual(payload.recentDialogue, dialogue)
  assert.deepEqual(payload.userIntent,{source:'draft',text:'我想说'})
  assert.match(payload.contextStatus,/不是新的意愿授权/)
  assert.match(messages[0].content,/不扩充 userIntent/)
})

test('cleanAssistReply：去掉前缀/引号，拒绝建议腔、列表、多段长文', () => {
  assert.equal(cleanAssistReply('“我想先把加薪这件事说清楚。”'), '我想先把加薪这件事说清楚。')
  assert.equal(cleanAssistReply('你可以说：我想先把手上的项目过一遍。'), '我想先把手上的项目过一遍。')
  assert.equal(cleanAssistReply('1. 先说结论\n2. 再说理由'), null)
  assert.equal(cleanAssistReply('作为 AI，我建议你直接谈。'), null)
  assert.equal(cleanAssistReply(''), null)
})

test('复盘只从用户实发句子里取，模型 ID 越界时回退到最后一句用户原话', () => {
  const userTexts = ['我想把加薪这件事说清楚。', '我这边项目从 2 个到 5 个。']
  const raw = 'CLOSEST: U2\nTAKEAWAY: U1\nNEXT: 这周五能给我十分钟吗？'
  const parsed = parseDebriefV2(raw, userTexts)
  assert.ok(parsed)
  assert.equal(parsed.closest, '我这边项目从 2 个到 5 个。')
  assert.equal(parsed.takeaway, '我想把加薪这件事说清楚。')
  assert.match(parsed.nextTry, /十分钟/)

  const invalid = parseDebriefV2('CLOSEST: U9\nTAKEAWAY: U9\nNEXT: 先停一下。', userTexts)
  assert.ok(invalid)
  assert.equal(invalid.closest, userTexts.at(-1))
  assert.equal(invalid.takeaway, userTexts[0])
})

test('复盘：没有用户实发内容时返回 null，不伪造', () => {
  assert.equal(parseDebriefV2('CLOSEST: U1', []), null)
  const prompt = debriefPromptV2(family, family.goal, ['我不想现在决定。'])
  assert.doesNotMatch(prompt.user, /以后谁还要你/) // 对方台词不进入候选
  assert.deepEqual(JSON.parse(prompt.user).userSentQuotes, [{id:'U1',text:'我不想现在决定。'}])
})

test('提示长度保护可被调用方检查', async () => {
  const { promptTooLong } = await import('./dialogue.ts')
  assert.equal(promptTooLong('a'.repeat(6000)), false)
  assert.equal(promptTooLong('a'.repeat(6001)), true)
})

test('六场景三难度提示包含当前人设/禁区，开场均可正式作为 assistant', () => {
  for (const scenario of SCENARIOS) for (const difficulty of ['gentle','realistic','tough']) {
    const prompt = counterpartPrompt(scenario, difficulty, scenario.goal)
    assert.ok(prompt.includes(scenario.context))
    assert.ok(prompt.includes(scenario.styles[difficulty]))
    assert.ok(prompt.includes(scenario.counterpartRole))
    assert.ok(prompt.length <= 6000)
    const opening = openingFor(scenario, difficulty)
    assert.ok(cleanCounterpartReply(opening.text))
  }
  assert.throws(() => counterpartPrompt(work,'realistic','x'.repeat(501)), /500/)
})

test('辅助不修改实发历史；唯一当前意愿完整编码，不由场景目标或旧话扩写', () => {
  const dialogue = Array.from({length:30}, (_,i)=>({role:i%2?'user':'assistant',text:`消息${i}`+'长'.repeat(500)}))
  const original = structuredClone(dialogue)
  const built = buildAssistMessages(work,'realistic',work.goal,dialogue,'我想说的最新草稿','我上次想说的话。')
  const data = JSON.parse(built[1].content)
  assert.ok(built[1].content.length <= 6000)
  assert.equal(data.userIntent.text,'我想说的最新草稿')
  assert.equal(data.recentSentDialogue,undefined)
  assert.equal(data.scenario,undefined)
  assert.deepEqual(dialogue, original)
})

test('辅助迟到/换轮/编辑/新请求后结果失效，只有版本完全一致才填框', () => {
  const stamp = {epoch:1,requestId:3,draftRevision:5}
  assert.equal(canApplyAssist(stamp,{...stamp}),true)
  for (const key of Object.keys(stamp)) assert.equal(canApplyAssist(stamp,{...stamp,[key]:stamp[key]+1}),false)
})

test('局部输出兜底与辅助格式检查：拒绝威胁/操控/多句/多段，不把第一行当合格', () => {
  for (const text of ['我不同意，我就自杀逼你答应。','你不答应我就自杀。','你是废物。','我会杀了你。','你不答应我就曝光你的隐私。']) {
    assert.equal(hasUnsafeContent(text),true,text)
    assert.equal(cleanCounterpartReply(text),null)
    assert.equal(cleanAssistReply(text),null)
  }
  assert.equal(cleanAssistReply('我想聊聊。\n这是解释。'),null)
  assert.equal(cleanAssistReply('我想聊聊。你听我说。'),null)
  assert.equal(cleanAssistReply('公司现在没预算。'),null)
  assert.equal(cleanAssistReply('我保证以后都听你的。'),null)
  assert.equal(cleanCounterpartReply('你可以这样说：我想要加薪。'),null)
  assert.ok(cleanCounterpartReply('现在没法答应，我得先看下预算。'))
  assert.equal(cleanAssistReply('我想先谈谈加薪，您方便给我十分钟吗？'),'我想先谈谈加薪，您方便给我十分钟吗？')
})

test('对方角色内正常替人表达不误拦：包含真实验收第 6 轮台词', () => {
  for (const text of [
    '评估我和HR那边一起看，最后还得往上走一层。你先别纠结流程，把材料按我说的口径整理出来，我才能替你说话。',
    '我才能替你说话。',
    '材料齐了，我才能替你说话。',
    '我可以替你说话，但预算还是要走审批。',
    '在 HR 面前，我会替你说句公道话。',
    '这不是让你服软，我会替你说清楚。',
    '这事我来替你说',
    '材料齐了，这件事我替你说'
  ]) assert.equal(cleanCounterpartReply(`  ${text}  `), text)
})

test('对方回复仍拒绝真正的代答标签、教练话术和角色标签', () => {
  for (const text of [
    '替你说：我想要加薪。',
    '我来替你说：我想和您谈谈工资。',
    '我可以替你说一句：“我想重新评估薪资。”',
    '让我来替你说一下：我希望约个时间。',
    '好的，我先替你说：我想谈谈项目。',
    '不如我来替你说：我想谈谈加薪。',
    '我来替你说两句：我希望重新评估薪资。',
    '我来替你说一段话：我想要加薪。',
    '替你说',
    '先暂停。\n替你说\n我希望重新评估薪资。',
    '“替你说：我想重新评估薪资。”',
    '你可以这样说：我想要加薪。',
    '作为 AI，我可以帮你组织语言。',
    '用户：我想要加薪。'
  ]) assert.equal(cleanCounterpartReply(text), null, text)
})

test('正常短语不成为安全或格式豁免：威胁、辱骂、列表和长度限制保留', () => {
  for (const text of [
    '我会替你说话，但你不答应我就曝光你的隐私。',
    '我才能替你说话，你是废物。'
  ]) {
    assert.equal(hasUnsafeContent(text), true)
    assert.equal(cleanCounterpartReply(text), null)
  }
  assert.equal(cleanCounterpartReply('1. 我才能替你说话。'), null)
  assert.equal(cleanCounterpartReply('- 我才能替你说话。'), null)
  assert.equal(cleanCounterpartReply(''), null)
  assert.equal(cleanCounterpartReply('我'.repeat(2001)), null)
})

test('长复盘仅选近期完整用户原句，引用 ID 必须严格匹配，危险建议被替换', () => {
  const all = Array.from({length:30}, (_,i)=>`我实际发送第${i}句`+'长'.repeat(500))
  const built = debriefPromptV2(work,work.goal,all)
  assert.ok(built.user.length <= 6000)
  assert.equal(built.userTexts.at(-1), all.at(-1))
  assert.equal(JSON.parse(built.user).userSentQuotes.at(-1).text,all.at(-1))
  const wrong = parseDebriefV2('CLOSEST: A1\nTAKEAWAY: U2 改写\nNEXT: 我会杀了你。', ['我最终修改后的话。'])
  assert.equal(wrong.closest,'我最终修改后的话。')
  assert.equal(wrong.takeaway,'')
  assert.equal(hasUnsafeContent(wrong.nextTry),false)
})
