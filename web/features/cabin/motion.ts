export interface ChatMotionSnapshot { pending: boolean; assistantCount: number }

/** Only class names cross this boundary; no chat text or request data is read. */
export function readChatMotion(classNames: readonly string[], previous: ChatMotionSnapshot) {
  const classes = classNames.map(value => new Set(value.split(/\s+/)))
  const pending = classes.some(value => value.has('ai-typing-message'))
  const assistantCount = classes.filter(value => value.has('ai-assistant') && !value.has('ai-typing-message') && !value.has('ai-user')).length
  return { pending, assistantCount, responded: previous.pending && !pending && assistantCount > previous.assistantCount }
}
