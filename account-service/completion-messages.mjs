/**
 * 通用补全接口的消息准备（纯函数，可独立测试）。
 *
 * 规则：
 * - 标准结构：唯一 system 在首位；system 永不参与条数截断。
 * - 对话历史最多保留 19 条（总预算 20 条）。
 * - 无 system 通用请求仍取末 20 条，但当前 user 也必须通过长度检查。
 * - system 或本轮最后一条 user 超长时报错，不静默截短。
 * - 多 system / system 不在首位：报错，不猜测合并。
 */

export const MAX_MESSAGES = 20
export const MAX_HISTORY = 19
export const MAX_CONTENT = 6000
export const MAX_SCENARIO_MESSAGES = 401
export const MAX_SCENARIO_CHARS = 120000

export class CompletionMessageError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'CompletionMessageError'
    this.status = status
  }
}

const ROLES = new Set(['system', 'user', 'assistant'])

function cleanMessages(rawMessages) {
  return (Array.isArray(rawMessages) ? rawMessages : [])
    .filter((item) => item && typeof item.content === 'string' && ROLES.has(item.role))
    .map((item) => ({ role: item.role, content: String(item.content) }))
}

export function prepareCompletionMessages(rawMessages, contextMode) {
  const raw = Array.isArray(rawMessages) ? rawMessages : []
  const systems = raw.filter((item) => item?.role === 'system')
  if (systems.length > 1 || (systems.length === 1 && raw[0] !== systems[0])) {
    throw new CompletionMessageError('消息结构不正确：只允许一条位于首位的 system')
  }
  if (systems.length && (typeof systems[0].content !== 'string' || !systems[0].content.trim())) {
    throw new CompletionMessageError('系统提示不能为空，且必须是文字')
  }
  const clean = cleanMessages(rawMessages)
  if (!clean.length) throw new CompletionMessageError('缺少对话内容')

  // Opt-in for counterpart dialogue only. Never silently drop the opening or early facts.
  if (contextMode === 'scenario-full') {
    if (systems.length !== 1 || clean.length !== raw.length || clean.length < 2
      || clean.some(item => !item.content.trim())) {
      throw new CompletionMessageError('情景消息结构不正确')
    }
    if (clean.some(item => item.content.length > MAX_CONTENT)) {
      throw new CompletionMessageError('情景消息过长，请保留记录后开始新演练')
    }
    if (clean.length > MAX_SCENARIO_MESSAGES || clean.reduce((sum, item) => sum + item.content.length, 0) > MAX_SCENARIO_CHARS) {
      throw new CompletionMessageError('本次演练上下文已达容量，请结束复盘后开始新演练', 413)
    }
    return clean
  }

  const lastUser = [...clean].reverse().find((item) => item.role === 'user')
  if (lastUser && lastUser.content.length > MAX_CONTENT) {
    throw new CompletionMessageError('这句话太长了，请缩短后重试')
  }

  const systemCount = clean.filter((item) => item.role === 'system').length
  if (systemCount === 0) {
    // 旧的无 system 通用请求：保持原有行为，不扩大修改。
    return clean
      .slice(-MAX_MESSAGES)
      .map((item) => ({ role: item.role, content: item.content.slice(0, MAX_CONTENT) }))
  }
  if (systemCount > 1 || clean[0].role !== 'system') {
    throw new CompletionMessageError('消息结构不正确：只允许一条位于首位的 system')
  }

  const system = clean[0].content
  if (system.length > MAX_CONTENT) {
    throw new CompletionMessageError('系统提示过长，请缩短后重试')
  }

  const history = clean.slice(1)

  const recent = history
    .slice(-MAX_HISTORY)
    .map((item) => ({ role: item.role, content: item.content.slice(0, MAX_CONTENT) }))

  return [{ role: 'system', content: system }, ...recent]
}
