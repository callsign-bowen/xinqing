/**
 * 应用装配：保留首页 / 情绪 / AI / 我的四页，3D 仅挂载在 AI 顶部窗口。
 * 情景练习暂不挂载；保留其代码与记录，不改变对话、存储和 API。
 * 危机面板必须先于对话页创建，chatSessions 初始化时会直接取 .crisis-panel。
 */
import { createEventBus } from './kernel/events'
import { createStorage } from './kernel/storage'
import { createApi } from './kernel/api'
import { createContext } from './kernel/context'
import type { Feature } from './kernel/types'

import { shellFeature, shellSwapFeature } from './features/shell'
import { reportFeature } from './features/report'
import { historyFeature } from './features/history'
import { checkinFeature } from './features/checkin'
import { mascotFeature } from './features/mascot'
import { chatFeature, chatSessionsFeature } from './features/chat'
import { sceneWindowFeature } from './features/scene-window'
import { profileFeature } from './features/profile'
import { crisisFeature } from './features/crisis'
import { energyFeature } from './features/energy'
import { onboardingFeature } from './features/onboarding'
import { encourageFeature } from './features/encourage'

const FEATURES: Feature[] = [
  shellFeature,
  reportFeature,
  historyFeature,
  checkinFeature,
  mascotFeature,
  chatFeature,
  profileFeature,
  crisisFeature,
  chatSessionsFeature,
  energyFeature,
  onboardingFeature,
  encourageFeature,
  shellSwapFeature,
  sceneWindowFeature
]

function boot(): void {
  const ctx = createContext(createEventBus(), createStorage(), createApi())
  for (const feature of FEATURES) {
    feature.init(ctx)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
