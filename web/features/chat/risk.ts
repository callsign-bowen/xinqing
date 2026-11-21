/**
 * 聊天风险词表：前端离线/请求失败时的判断必须和服务端 riskOf 一致。
 * 之前前端把“累、难过、焦虑”当成高风险，断网时会误弹危机干预。
 */
export type ChatRiskLevel = 'low' | 'medium' | 'high'

const HIGH = ['想死', '自杀', '轻生', '不想活', '想消失', '结束生命', '割腕', '跳楼', '活不下去', '东西都送人了', '房间也收拾好了', '最后一次找你', '我已经想好了，你不用劝我', '我走了以后', '我不想醒过来', '活着没什么意思', '查过方法', '药都攒够', '被人打了', '不敢回家']
const MEDIUM = ['难受', '崩溃', '撑不住', '撑不下去', '焦虑', '难过', '压力', '紧张', '累']

export function riskOfText(text: string): ChatRiskLevel {
  const value = String(text || '')
  if (HIGH.some(word => value.includes(word))) return 'high'
  if (MEDIUM.some(word => value.includes(word))) return 'medium'
  return 'low'
}
