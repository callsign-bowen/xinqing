/**
 * 木偶默剧播放器：AI 页「演绎」按钮打开的弹窗。舞台本身在 stage.ts，这里只管弹窗、版本切换和播放按钮。
 */
import { escapeHtml } from './puppet'
import { createTheaterStage, emptyNotice, type StageState, type TheaterEpisode } from './stage'

export type { TheaterBeat, TheaterScript, TheaterEpisode } from './stage'

export interface PlayerHandle {
  open(episodes: TheaterEpisode[], status: string): void
  update(episodes: TheaterEpisode[], status: string): void
  close(): void
  isOpen(): boolean
}

export function createPlayer(options: { onDeleteAll(): void; onClose?(): void }): PlayerHandle {
  const modal = document.createElement('div')
  modal.className = 'theater-modal'
  modal.hidden = true
  modal.innerHTML = `
    <section class="theater-sheet" role="dialog" aria-modal="true" aria-labelledby="theater-heading">
      <header class="theater-head">
        <div><strong id="theater-heading">对话演绎</strong><span>只存在这台设备上，点开才会播放</span></div>
        <button type="button" class="theater-x" data-theater-close aria-label="关闭演绎">×</button>
      </header>
      <div class="theater-episodes" role="tablist" aria-label="每一轮的演绎"></div>
      <div class="theater-stage-slot"></div>
      <div class="theater-controls">
        <button type="button" data-theater-restart aria-label="从头播放">↺</button>
        <button type="button" data-theater-prev aria-label="上一拍">‹</button>
        <button type="button" data-theater-play class="theater-play" aria-label="暂停">❚❚</button>
        <button type="button" data-theater-next aria-label="下一拍">›</button>
        <span class="theater-progress"></span>
      </div>
      <p class="theater-unknown" hidden></p>
      <footer class="theater-foot"><span class="theater-status" role="status"></span><button type="button" data-theater-delete>删除这段对话的演绎</button></footer>
    </section>`
  document.body.append(modal)

  const $ = <T extends HTMLElement>(selector: string) => modal.querySelector<T>(selector)!
  const progress = $('.theater-progress')
  const playButton = $<HTMLButtonElement>('[data-theater-play]')
  const episodeBar = $('.theater-episodes')
  const unknown = $('.theater-unknown')
  const statusEl = $('.theater-status')

  const stage = createTheaterStage({ caption: 'below', onChange: render })
  $('.theater-stage-slot').replaceWith(stage.element)

  let episodes: TheaterEpisode[] = []
  let lastFocus: Element | null = null

  function render(state: StageState) {
    const ended = state.index >= state.total
    playButton.textContent = state.playing ? '❚❚' : '▶'
    playButton.setAttribute('aria-label', state.playing ? '暂停' : ended ? '重新播放' : '播放')
    progress.textContent = state.index < 0 ? '开场' : ended ? '谢幕' : `${state.index + 1} / ${state.total}`
  }

  function renderEpisodes() {
    const currentId = stage.state().episode?.id
    episodeBar.innerHTML = episodes.map((episode, i) =>
      `<button type="button" role="tab" aria-selected="${episode.id === currentId}" data-episode="${episode.id}">第 ${i + 1} 版<small>${escapeHtml(episode.script.title)}</small></button>`
    ).join('')
    episodeBar.hidden = episodes.length < 2
  }

  function choose(id?: string) {
    const target = episodes.find(episode => episode.id === id) || episodes[episodes.length - 1]
    if (!target) return
    modal.dataset.empty = 'false'
    stage.load(target)
    unknown.textContent = target.script.unknown ? `还不清楚：${target.script.unknown}` : ''
    unknown.hidden = !target.script.unknown
    renderEpisodes()
  }

  function showEmpty(status: string) {
    modal.dataset.empty = 'true'
    const notice = emptyNotice(status)
    stage.empty(notice.title, notice.body)
  }

  modal.addEventListener('click', event => {
    const el = event.target as HTMLElement
    if (el === modal || el.closest('[data-theater-close]')) handle.close()
    else if (el.closest('[data-theater-play]')) stage.toggle()
    else if (el.closest('[data-theater-next]')) stage.next()
    else if (el.closest('[data-theater-prev]')) stage.prev()
    else if (el.closest('[data-theater-restart]')) stage.restart()
    else if (el.closest('[data-theater-delete]')) {
      if (window.confirm('删除这段对话的全部演绎？聊天记录不会受影响。')) { options.onDeleteAll(); handle.close() }
    } else {
      const chip = el.closest<HTMLElement>('[data-episode]')
      if (chip) choose(chip.dataset.episode)
    }
  })
  document.addEventListener('keydown', event => {
    if (modal.hidden) return
    if (event.key === 'Escape') { event.preventDefault(); handle.close() }
    else if (event.key === 'ArrowRight') stage.next()
    else if (event.key === 'ArrowLeft') stage.prev()
    else if (event.key === ' ' && (event.target as HTMLElement)?.tagName !== 'BUTTON') { event.preventDefault(); stage.toggle() }
  })
  document.addEventListener('visibilitychange', () => { if (document.hidden && !modal.hidden) stage.pause() })

  const handle: PlayerHandle = {
    open(list, status) {
      episodes = list
      statusEl.textContent = status
      lastFocus = document.activeElement
      modal.hidden = false
      document.documentElement.classList.add('theater-locked')
      if (episodes.length) choose(); else showEmpty(status)
      modal.querySelector<HTMLButtonElement>('[data-theater-close]')?.focus()
    },
    update(list, status) {
      statusEl.textContent = status
      const grew = list.length > episodes.length
      episodes = list
      if (modal.hidden) return
      if (!episodes.length) { showEmpty(status); return }
      const currentId = stage.state().episode?.id
      if (!currentId || !episodes.some(e => e.id === currentId)) choose()
      else renderEpisodes()
      if (grew) statusEl.textContent = status || '新的一版已经排好，点上方切换'
    },
    close() {
      stage.clear()
      modal.hidden = true
      document.documentElement.classList.remove('theater-locked')
      options.onClose?.()
      if (lastFocus instanceof HTMLElement) lastFocus.focus()
    },
    isOpen() { return !modal.hidden }
  }
  return handle
}
