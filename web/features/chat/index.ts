import type { Feature } from '../../kernel/types'
import { chatPageFeature } from './page'
import { chatSessionsFeature } from './sessions'
import { initVoiceInput } from './voice'

/** AI 页：页面显隐、语音输入、对话与侧栏。情景练习和 3D 场景不在这里。 */
export const chatFeature: Feature = {
  id: 'chat',
  init(ctx) {
    chatPageFeature.init(ctx)
    initVoiceInput(ctx)
  }
}

export { chatSessionsFeature }
