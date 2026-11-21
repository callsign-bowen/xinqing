export type SpeechItem = { kind: 'assistant' | 'user' | 'pending' | 'error'; text?: string; retry?: boolean }
export interface SpeechView { state: 'reply' | 'thinking' | 'incomplete' | 'error' | 'idle'; text: string; retry: boolean }

/** Presentation only: never append this projection to the actual conversation. */
export function projectSpeech(items: readonly SpeechItem[]): SpeechView {
  if (items.some(item => item.kind === 'pending')) return { state: 'thinking', text: 'Nuo 正在想，稍等一下…', retry: false }
  const last = items.at(-1)
  if (last?.kind === 'error') return { state: 'error', text: last.text?.trim() || '这次没有收到完整回复，请稍后重试。', retry: !!last.retry }
  if (last?.kind === 'user') return { state: 'incomplete', text: '这条消息暂未收到完整回复，你可以继续说，或查看对话记录。', retry: false }
  const reply = [...items].reverse().find(item => item.kind === 'assistant' && item.text?.trim())
  if (reply) return { state: 'reply', text: reply.text!, retry: false }
  return { state: 'idle', text: '想说什么，随时告诉我。', retry: false }
}

export interface SpeechLayoutInput {
  head: { x: number; y: number } | null
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
  top: number
  bottom: number
}

/** Keep speech beside the face on desktop, above it on mobile, outside input. */
export function placeSpeech(input: SpeechLayoutInput) {
  const margin = 16
  const w = Math.max(1, input.viewportWidth), h = Math.max(1, input.viewportHeight)
  const width = Math.min(input.width, Math.max(1, w - margin * 2))
  const head = input.head || { x: w * .74, y: h * .48 }
  const top = Math.max(margin, input.top)
  const bottom = Math.max(top + 60, Math.min(h - margin, input.bottom))
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)))
  if (w < 760) {
    const maxHeight = Math.max(60, Math.min(240, bottom - top, head.y - 78 - top))
    const height = Math.min(input.height, maxHeight)
    const x = clamp(head.x - width / 2, margin, w - width - margin)
    const y = clamp(head.y - 78 - height, top, bottom - height)
    return { x, y, maxHeight, side: 'above' as const, tail: clamp(head.x - x, 24, width - 24) }
  }
  const maxHeight = Math.max(60, Math.min(340, bottom - top))
  const height = Math.min(input.height, maxHeight)
  const side = head.x - width - 76 >= margin ? 'left' : 'right'
  const x = clamp(side === 'left' ? head.x - width - 76 : head.x + 76, margin, w - width - margin)
  const y = clamp(head.y - height * .58, top, bottom - height)
  return { x, y, maxHeight, side, tail: clamp(head.y - y, 26, height - 26) }
}
