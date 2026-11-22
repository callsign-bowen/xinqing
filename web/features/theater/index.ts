/**
 * 演绎系统：每轮对话结束后，在后台把这段对话里讲到的人际场景排成一出木偶默剧，存在本机。
 * 不弹出、不打扰；AI 页顶部常驻「演绎」按钮，点开才播放（还没有演绎时显示说明）。
 * 只通过 ctx（事件、chat 服务、api）与外界通信，不 import 其它 features。
 */
import type { Feature } from '../../kernel/types'
import { THEATER_KEY, addEpisode, episodesOf, latestScript, readTheater, removeTheaterSession, theaterHistory, userRound, type TheaterStore } from './store.mjs'
import { createPlayer, type TheaterEpisode } from './player'
import './theater.css'

export const theaterFeature: Feature = {
  id: 'theater',
  init(ctx) {
    const page = document.querySelector<HTMLElement>('#page-ai')
    const actions = page?.querySelector<HTMLElement>('.ai-header-actions')
    if (!page || !actions || document.getElementById('ai-theater-button')) return

    const button = document.createElement('button')
    button.id = 'ai-theater-button'
    button.type = 'button'
    button.className = 'ai-theater-button'
    button.setAttribute('aria-haspopup', 'dialog')
    actions.append(button)

    function load(): TheaterStore {
      try { return readTheater(localStorage.getItem(THEATER_KEY)) } catch { return readTheater(null) }
    }
    function save(store: TheaterStore) {
      try { localStorage.setItem(THEATER_KEY, JSON.stringify(store)) } catch { /* 存不下就跳过这一版，不影响聊天 */ }
    }

    /** 每段对话一条后台队列：正在排演时又来一轮，等这次结束再用最新对话重排一次。 */
    const running = new Set<string>()
    const dirty = new Set<string>()

    const activeId = () => ctx.services.chat?.activeSessionId() || ''

    function statusFor(sessionId: string) {
      return running.has(sessionId) ? '正在根据最新一轮对话排演…' : ''
    }

    function refresh() {
      const id = activeId()
      const count = episodesOf(load(), id).length
      button.textContent = count > 1 ? `演绎 ${count}` : '演绎'
      button.setAttribute('aria-label', count ? `观看这段对话的演绎，共 ${count} 版` : '对话演绎（这段对话还没有演绎）')
      button.dataset.busy = String(running.has(id))
      if (player.isOpen()) player.update(episodesOf(load(), id) as TheaterEpisode[], statusFor(id))
      ctx.events.emit('theater.updated', { sessionId: id })
    }

    async function rehearse(sessionId: string) {
      if (running.has(sessionId)) { dirty.add(sessionId); return }
      const context = ctx.services.chat?.practiceContext()
      if (!context || context.sessionId !== sessionId) return
      const history = theaterHistory(context.messages)
      if (!history.some(item => item.role === 'user')) return
      const round = userRound(context.messages)
      running.add(sessionId)
      refresh()
      try {
        const { script } = await ctx.api.theater.script(history, latestScript(load(), sessionId))
        if (script) {
          const result = addEpisode(load(), sessionId, script, { now: Date.now(), round })
          if (result.added) save(result.store)
        }
      } catch {
        // 后台排演失败不打扰用户，下一轮对话会带着完整上下文重排。
      } finally {
        running.delete(sessionId)
        refresh()
        if (dirty.delete(sessionId) && activeId() === sessionId) void rehearse(sessionId)
      }
    }

    const player = createPlayer({
      onDeleteAll() {
        save(removeTheaterSession(load(), activeId()))
        refresh()
      },
      onClose() { button.setAttribute('aria-expanded', 'false') }
    })

    button.addEventListener('click', () => {
      const id = activeId()
      const episodes = episodesOf(load(), id) as TheaterEpisode[]
      button.setAttribute('aria-expanded', 'true')
      player.open(episodes, statusFor(id))
    })

    ctx.services.theater = {
      episodes: () => episodesOf(load(), activeId()),
      status: () => statusFor(activeId())
    }

    ctx.events.on('chat.roundDelivered', ({ sessionId }) => { void rehearse(sessionId) })
    ctx.events.on('chat.contextChanged', () => refresh())
    ctx.events.on('navigate', () => { if (player.isOpen()) player.close() })
    refresh()
  }
}
