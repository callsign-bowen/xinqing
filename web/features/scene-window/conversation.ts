export interface SceneMessage {
  kind: 'assistant' | 'user' | 'pending' | 'error'
  text: string
}

/** Project the visible conversation without creating or storing another chat. */
export function sceneConversation(messages: readonly SceneMessage[], pending: boolean) {
  const last = messages.at(-1)
  if (last?.kind === 'error') return { state: 'error', text: last.text || '这条消息没有发出去，可以在聊天记录里重试。' }
  // Streaming text is already visible in the main chat before it is persisted.
  if (last?.kind === 'assistant' && last.text.trim()) return { state: 'reply', text: last.text }
  if (pending || last?.kind === 'pending') return { state: 'thinking', text: 'Nuo 正在想，稍等一下…' }
  if (last?.kind === 'user') return { state: 'unanswered', text: '这条消息还没有收到完整回复，可以继续说，或在聊天记录里查看。' }
  return { state: 'idle', text: '点一下场景里的伙伴，和 Nuo 聊聊吧。' }
}

export interface SceneChatProgress { sessionId: string; pending: boolean; assistantCount: number }

export function hasSceneReply(previous: SceneChatProgress | undefined, next: SceneChatProgress) {
  return !!previous && previous.sessionId === next.sessionId && previous.pending && !next.pending && next.assistantCount > previous.assistantCount
}

export function sceneAnchor(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const point = value as { x?: unknown; y?: unknown; visible?: unknown }
  if (typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined
  return { x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)), visible: point.visible === true }
}
