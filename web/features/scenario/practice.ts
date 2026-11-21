import { SCENARIOS, type Scenario } from './scenarios.ts'

export type PracticeLayout = 'side' | 'stacked'
interface CharacterProfile {
  id: string; relationship: string; background: string; personality: string
  initialEmotion: string; tendencies: string; setting: string; layout: PracticeLayout; openingRule: string
}
// Fictional practice settings, not statements about the actual user's life.
const PROFILES: Record<string, CharacterProfile> = {
  'work-raise': { id:'manager',relationship:'有评估与管理权的直属上级',background:'忙于项目与成本安排，具体审批权限尚未确认。',personality:'谨慎、简洁，重视工作依据',initialEmotion:'忙碌、保留意见',tendencies:'空泛要求时压低预期；具体职责和结果出现时回应实质依据。',setting:'工作沟通',layout:'side',openingRule:'以忙碌的直属领导身份先开口，给用户表达机会；不预先批准加薪，不编造政策或评估日期。' },
  'work-blame': { id:'coworker',relationship:'需要共同澄清项目分工的平级同事',background:'项目受到追问，担心自己被追责，尚未核对分工记录。',personality:'怕承担后果，表达容易含糊',initialEmotion:'着急、防御',tendencies:'可能希望对方先承担；遇到明确记录要回应或核对。',setting:'项目沟通',layout:'side',openingRule:'从项目被追问的当下开口，不先承认用户负责，也不编造分工结果。' },
  'family-marriage': { id:'mother',relationship:'关心孩子婚姻安排的妈妈',background:'过年在家谈到婚姻，容易用自己的经验和亲友比较表达担忧。',personality:'关心但急切，习惯劝说',initialEmotion:'着急、担忧',tendencies:'不理解时会追问或解释；听到清晰计划和边界后可以仍担心但缓和。',setting:'家庭沟通',layout:'side',openingRule:'以妈妈的口吻先谈自己的担忧，不编造具体亲戚、年龄、城市或婚姻期限。' },
  'intimacy-cold': { id:'partner-withdrawn',relationship:'近期回避沟通的伴侣',background:'最近三天回应很少，面对沟通容易回避；原因没有给出。',personality:'防御、寡言，怕争吵',initialEmotion:'紧绷、想回避',tendencies:'指责可能使其防御；具体感受和可承受的沟通边界可以使其多解释一点。',setting:'伴侣沟通',layout:'stacked',openingRule:'从不太愿意说话的当前态度开口，不编造原因，不先解决冷战。' },
  'friend-loan': { id:'friend-borrower',relationship:'向用户借款尚未归还的朋友',background:'借款五千已超过原约定，手头紧但没有给出具体财务细节。',personality:'在意交情和面子，容易含糊拖延',initialEmotion:'尴尬、回避',tendencies:'泛泛催促时可能拖延；具体要求出现后讨论自己能回应的部分，不虚构收入和到账日。',setting:'朋友沟通',layout:'side',openingRule:'从借款拖延的尴尬开口，不一开始就替双方定还款计划。' },
  'intimacy-breakup': { id:'partner-attached',relationship:'希望维持关系、尚不知道用户决定的伴侣',background:'感到关系有所变化，具体过往没有给出。',personality:'在意关系，怕被否定，容易挽留',initialEmotion:'不安、不理解',tendencies:'含糊表达时可能求确认；明确决定后回应决定，不固定承诺改变或用自伤挽留。',setting:'关系沟通',layout:'stacked',openingRule:'从察觉对方有话想说开始，不先替用户提出分手，不自伤要挟。' },
  'self-boundary': { id:'club-peer',relationship:'熟悉但没有权利替用户安排时间的社团同学',background:'希望有人替自己周末摆摊，双方没有承担约定。',personality:'熟络、想省事，偶尔把请求说得理所当然',initialEmotion:'期待、有点着急',tendencies:'可能再争取一次；用户明确拒绝后要回应边界，不能把交情变成义务。',setting:'练习表达边界',layout:'stacked',openingRule:'以请求帮忙的同学先开口，不假定用户有空或已经答应。' },
  'consumer-refund': { id:'after-sales',relationship:'需要核对商品问题的售后工作人员',background:'尚未核对订单、商品问题与处理条件。',personality:'务实、谨慎，重视必要信息',initialEmotion:'中性、专注处理',tendencies:'信息不够时核对；事实清楚时讨论下一步，不伪造店规、法律或退款结果。',setting:'商品售后',layout:'side',openingRule:'先了解商品或订单问题，不宣布退款成功，也不先认定责任。' },
  'care-visit': { id:'older-brother',relationship:'与用户共同承担家人陪诊安排的哥哥',background:'担心影响工作，尚未确认具体可用时间和分工。',personality:'看重工作安排，关心家人但容易回避成本',initialEmotion:'为难、想推迟决定',tendencies:'笼统要求时可能推回去；面对具体分工要谈自己的限制和能承担的事。',setting:'照护分工',layout:'stacked',openingRule:'从陪诊安排的现实顾虑开口，不编造病情、复诊日期或谁已经请假。' },
  'digital-rumor': { id:'group-member',relationship:'同一个群聊中尚未核实消息的群友',background:'把转发当作分享，原消息来源不明。',personality:'随意、在意面子，受到质疑时容易防御',initialEmotion:'随意、略有防御',tendencies:'被人身指责时可能争辩；明确核实请求和事实边界可以促使其承认不确定。',setting:'群聊沟通',layout:'side',openingRule:'围绕这条未核实消息开口，不生成具体新闻、人物隐私或传播细节。' }
}

export function practiceFor(scenario: Scenario) {
  const profile=PROFILES[scenario.id]
  if (!Object.hasOwn(PROFILES,scenario.id)) return null
  return {
    scenarioId:scenario.id, name:scenario.title, event:scenario.context, counterpart:scenario.counterpartRole,
    character:{ id:profile.id, name:scenario.counterpartRole, identity:scenario.counterpartRole,
      relationship:profile.relationship, background:profile.background, personality:profile.personality,
      initialEmotion:profile.initialEmotion, behaviorTendencies:profile.tendencies },
    presentation:{ layout:profile.layout, setting:profile.setting, background:null,
      portrait:'/scenario/family-marriage/mother-neutral-v1.png', placeholder:true },
    openingRule:profile.openingRule
  }
}

export function practiceById(id: string) {
  const scenario=SCENARIOS.find(item=>item.id===id)
  return scenario ? practiceFor(scenario) : null
}
