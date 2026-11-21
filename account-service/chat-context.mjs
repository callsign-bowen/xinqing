/**
 * 本段对话快照的清洗与封顶。
 * 客户端只发当前这段对话里可见的文字；服务端不信任字段，统一转成模型能用的 history。
 */
export function cleanHistory(raw, currentMessage = '') {
  if (!Array.isArray(raw)) return null
  const items = []
  let chars = 0
  let sawLatestValid = false
  for (let index = raw.length - 1; index >= 0 && items.length < 12; index -= 1) {
    const item = raw[index]
    if (!item || typeof item !== 'object') continue
    const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : ''
    if (!role) continue
    const text = typeof item.text === 'string' ? item.text.trim().slice(0, 2000) : ''
    if (!text) continue
    // Only the last valid item can be the client-duplicated current user message.
    // Compare before clipping, then reserve the budget for actual preceding history.
    const duplicateCurrent = !sawLatestValid && role === 'user' && currentMessage && item.text.trim() === currentMessage
    sawLatestValid = true
    if (duplicateCurrent) continue
    if (chars + text.length > 6000) break
    items.unshift({ role, content: text })
    chars += text.length
  }
  // The route appends the full current user message separately after this history.
  return items.length ? items : null
}
