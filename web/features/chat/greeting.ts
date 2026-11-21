/**
 * 开场白：按时段轮换，带上对方的称呼，不再用三条固定模板。
 * 同一天内保持稳定，跨天换一句，避免每次进来都是同一句自动回复。
 */
export interface GreetingContext {
  nickname?: string | null
}

const MORNING = [
  '早，{name}。',
  '早上好。',
  '早呀，我在。',
  '早。想聊什么都行。',
  '早上好，想说的时候再说。'
]

const AFTERNOON = [
  '下午好，{name}。',
  '下午好，我在。',
  '下午好，{name}，想说什么就说。',
  '下午好。聊点什么都行。',
  '下午好，见到你了。'
]

const NIGHT = [
  '晚上好，{name}。',
  '晚上好，我在。',
  '晚上好，想说的时候就说。',
  '在的。聊什么都行。',
  '晚上好，不用特意组织语言。'
]

function poolFor(hour: number): string[] {
  if (hour >= 5 && hour < 11) return MORNING
  if (hour >= 11 && hour < 18) return AFTERNOON
  return NIGHT
}

/** 用年内第几天做偏移：同一整天稳定，换一天换一句。 */
function rotation(date: Date, size: number): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000)
  return ((day % size) + size) % size
}

function withName(line: string, nickname?: string | null): string {
  const name = (nickname || '').trim()
  if (name) return line.replace('{name}', name)
  return line.replace(/，?\{name\}/g, '').replace(/，([。！？])/g, '$1').trim()
}

export function greetingFor(date: Date, context: GreetingContext = {}): string {
  const pool = poolFor(date.getHours())
  return withName(pool[rotation(date, pool.length)], context.nickname)
}
