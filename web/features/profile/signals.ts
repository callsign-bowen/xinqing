import type { ProfileAnswers } from '../../kernel/storage'

const HIGH_RISK = ['想死', '自杀', '轻生', '不想活', '结束生命', '割腕', '跳楼', '活不下去']

const COMPANY_RULES: Array<[string, RegExp]> = [
  ['先听我说', /先听我说|别问了|先别问|你听我说|不要问我|少问我/],
  ['陪我把事情理一理', /帮我理|理一理|一起看看问题|一起理/],
  ['轻松聊聊天就好', /轻松聊|随便聊聊|聊聊天就好/]
]

const PACE_RULES: Array<[string, RegExp]> = [
  ['你少问，让我多说', /少问|让我多说|别问了|先别问/],
  ['短一点，我看着累', /说短一点|简短一点|太长了|看着累/],
  ['可以直接一点', /直接说|别绕|不用委婉/],
  ['你可以问我一句', /你可以问我|问我一句/]
]

const FOCUS_RULES: Array<[string, RegExp]> = [
  ['学业', /作业|考试|论文|学习|上课|绩点|考研|复习/],
  ['和人相处', /朋友|室友|恋爱|分手|同学|男朋友|女朋友/],
  ['家里的事', /爸妈|父母|家里|家人|我妈|我爸/],
  ['睡觉和身体', /睡不着|失眠|睡觉|熬夜|头疼|头痛/],
  ['对自己的看法', /觉得自己|讨厌自己|自卑|看轻自己/],
  ['说不上来，只是有点沉', /说不上|不知道怎么了|有点沉|空落落|说不清/]
]

const FREE_RULES: Array<[string, RegExp]> = [
  ['散步', /去散步|喜欢散步|散了步|散步的时候/],
  ['听歌', /听了歌|喜欢听歌|听首歌|听了首歌/],
  ['看剧', /看剧|追剧|看了部剧/],
  ['画画或写东西', /画画|写东西|写了点东西|写日记/],
  ['运动', /去运动|跑步|打了球|去健身/],
  ['打游戏', /打游戏|玩了会游戏|打了会游戏/],
  ['暂时没有', /什么都不想做|暂时没有爱好|空下来也不想动/]
]

function sameList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const sortedLeft = left.slice().sort()
  const sortedRight = right.slice().sort()
  return sortedLeft.every((item, index) => item === sortedRight[index])
}

function firstMatch(text: string, rules: Array<[string, RegExp]>): string {
  for (const [label, pattern] of rules) {
    if (pattern.test(text)) return label
  }
  return ''
}

function allMatches(text: string, rules: Array<[string, RegExp]>, exclusive: string): string[] {
  const found = rules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label)
  if (found.length > 1 && found.includes(exclusive)) return found.filter((label) => label !== exclusive)
  return found
}

function listText(items: string[]): string {
  return items.join('、')
}

export function describeProfileChange(previous: ProfileAnswers, next: ProfileAnswers): string {
  const parts: string[] = []
  if (next.company && next.company !== previous.company) parts.push(`陪伴方式改成了「${next.company}」。`)
  if (!sameList(previous.focus, next.focus) && next.focus.length) parts.push(`最近常提到${listText(next.focus)}。`)
  if (next.pace && next.pace !== previous.pace) parts.push(`说话节奏改成了「${next.pace}」。`)
  if (!sameList(previous.freeTime, next.freeTime) && next.freeTime.length) parts.push(`空下来更常做${listText(next.freeTime)}。`)
  return parts.join('')
}

export function applyChatSignal(current: ProfileAnswers, message: string): { answers: ProfileAnswers; note: string } | null {
  const text = message.trim()
  if (!text || HIGH_RISK.some((word) => text.includes(word))) return null
  const next: ProfileAnswers = {
    company: current.company,
    focus: current.focus.slice(),
    pace: current.pace,
    freeTime: current.freeTime.slice()
  }
  const company = firstMatch(text, COMPANY_RULES)
  const pace = firstMatch(text, PACE_RULES)
  const focus = allMatches(text, FOCUS_RULES, '说不上来，只是有点沉')
  const freeTime = allMatches(text, FREE_RULES, '暂时没有')
  if (company) next.company = company
  if (pace) next.pace = pace
  if (focus.length) next.focus = focus
  if (freeTime.length) next.freeTime = freeTime
  const note = describeProfileChange(current, next)
  if (!note) return null
  return { answers: next, note }
}
