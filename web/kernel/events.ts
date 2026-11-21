/**
 * 事件总线：构件之间唯一允许的“互相通知”方式。
 * 发事件的人不关心有没有人听；没注册的构件被摘掉后，其它块不受影响。
 */
export type NuoEventMap = {
  'emotion.saved': { id: number }
  'journal.openDay': { day: string }
  'theme.changed': { theme: string }
  'mascot.changed': { id: string }
  'chat.risk': { level: 'low' | 'medium' | 'high' }
  'chat.userSaid': { text: string }
  'chat.contextChanged': { sessionId: string }
  'profile.updated': { source: 'intro' | 'chat' }
  'account.nicknameChanged': { nickname: string }
  'navigate': { page: string }
  'auth.loggedIn': { username: string }
  'auth.loggedOut': { username: string }
  'scene.changed': { sessionId: string }
  'scene.pickRequested': Record<string, never>
}

type Handler<K extends keyof NuoEventMap> = (payload: NuoEventMap[K]) => void

export interface EventBus {
  on<K extends keyof NuoEventMap>(event: K, handler: Handler<K>): () => void
  emit<K extends keyof NuoEventMap>(event: K, payload: NuoEventMap[K]): void
}

export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<(payload: unknown) => void>>()

  return {
    on(event, handler) {
      const key = event as string
      let set = listeners.get(key)
      if (!set) {
        set = new Set()
        listeners.set(key, set)
      }
      const wrapped = handler as (payload: unknown) => void
      set.add(wrapped)
      return () => {
        set?.delete(wrapped)
      }
    },
    emit(event, payload) {
      const set = listeners.get(event as string)
      if (!set) return
      for (const handler of set) handler(payload)
    }
  }
}
