import type { Feature } from '../../kernel/types'
import { SCENES, type SceneId } from './catalog'
import { sceneConversation, hasSceneReply, sceneAnchor, type SceneMessage, type SceneChatProgress } from './conversation'
import './scene-window.css'

/** An optional viewport inside AI. The four original pages stay in place. */
export const sceneWindowFeature: Feature = {
  id: 'scene-window',
  init(ctx) {
    const page = document.querySelector<HTMLElement>('#page-ai')
    const header = page?.querySelector<HTMLElement>('.ai-header')
    const actions = header?.querySelector<HTMLElement>('.ai-header-actions')
    const messages = page?.querySelector<HTMLElement>('#ai-messages')
    const input = page?.querySelector<HTMLTextAreaElement>('#ai-input')
    if (!page || !header || !actions || !messages || !input || document.getElementById('ai-3d-button')) return
    const button = document.createElement('button')
    button.id = 'ai-3d-button'; button.type = 'button'; button.className = 'ai-3d-button'
    button.textContent = '3D'; button.setAttribute('aria-label', '3D 场景聊天')
    button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'ai-3d-picker')
    actions.append(button)
    const picker = document.createElement('section')
    picker.id = 'ai-3d-picker'; picker.className = 'ai-3d-picker'; picker.hidden = true
    picker.setAttribute('role', 'dialog'); picker.setAttribute('aria-label', '选择 3D 场景')
    picker.innerHTML = `<div class="ai-3d-picker-heading"><strong>选择 3D 场景</strong><button type="button" aria-label="关闭场景选择">×</button></div><div class="ai-3d-choices">${SCENES.map(scene => `<button type="button" data-scene="${scene.id}" aria-pressed="false"><strong>${scene.name}</strong><span>${scene.description}</span></button>`).join('')}</div>`
    header.append(picker)
    const stage = document.createElement('section')
    stage.id = 'ai-scene-window'; stage.className = 'ai-scene-window'; stage.hidden = true
    stage.setAttribute('role', 'region'); stage.setAttribute('aria-label', '3D 场景窗口')
    stage.innerHTML = '<header class="ai-scene-window-bar"><strong class="ai-scene-name"></strong><div><button type="button" data-scene-reset disabled>归位</button><button type="button" data-scene-greet disabled>打招呼</button><button type="button" data-scene-chat disabled>聊聊</button><button type="button" data-scene-speech-toggle aria-pressed="true" disabled>收起回复</button><button type="button" data-scene-close aria-label="关闭 3D 窗口">×</button></div></header><div class="ai-scene-viewport"><aside class="ai-scene-speech" aria-label="Nuo 的当前回复" hidden><strong class="ai-scene-speaker"></strong><div class="ai-scene-speech-text" tabindex="0"></div></aside><span class="ai-scene-hint" hidden>点伙伴聊聊 · 拖动环视</span><div class="ai-scene-loading" role="status"><span>正在打开场景…</span><button type="button" data-scene-retry hidden>重试</button></div></div>'
    header.after(stage)
    const world = stage.querySelector<HTMLElement>('.ai-scene-viewport')!
    const status = stage.querySelector<HTMLElement>('.ai-scene-loading')!
    const retry = stage.querySelector<HTMLButtonElement>('[data-scene-retry]')!
    const controls = stage.querySelectorAll<HTMLButtonElement>('[data-scene-reset],[data-scene-greet],[data-scene-chat],[data-scene-speech-toggle]')
    const speech = stage.querySelector<HTMLElement>('.ai-scene-speech')!
    const speechText = stage.querySelector<HTMLElement>('.ai-scene-speech-text')!
    const speechToggle = stage.querySelector<HTMLButtonElement>('[data-scene-speech-toggle]')!
    const hint = stage.querySelector<HTMLElement>('.ai-scene-hint')!
    let showSpeech = true
    let progress: SceneChatProgress | undefined
    let frame: HTMLIFrameElement | undefined
    let loading: AbortController | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    let selected: SceneId | undefined
    const visible = () => !stage.hidden && page.classList.contains('ai-page-visible') && !document.hidden
    const command = (command: string, value?: unknown) => frame?.contentWindow?.postMessage({ type: 'xinqing-3d:command', command, value }, location.origin)
    /** 场景里的电视正在播放时，把当前这段对话的演绎送进去；排好新一版时再送一次。 */
    function sendTheater() {
      if (stage.dataset.watching !== 'true') return
      command('theater', { episodes: ctx.services.theater?.episodes() ?? [], status: ctx.services.theater?.status() ?? '' })
    }
    function focusChat() {
      if (!visible()) return
      input!.focus({ preventScroll: true })
    }
    function syncSpeech() {
      if (stage.dataset.state !== 'ready' || !selected) { speech.hidden = hint.hidden = true; return }
      const items = Array.from(messages!.children).flatMap<SceneMessage>(child => {
        if (child.matches('.ai-send-error')) return [{ kind: 'error' as const, text: child.querySelector('.ai-send-error-detail')?.textContent || '' }]
        if (child.matches('.ai-typing-message')) return [{ kind: 'pending' as const, text: '' }]
        const text = child.querySelector('.ai-message-bubble')?.textContent || ''
        if (child.matches('.ai-assistant')) return [{ kind: 'assistant' as const, text }]
        if (child.matches('.ai-user')) return [{ kind: 'user' as const, text }]
        return []
      })
      const view = sceneConversation(items, ctx.services.chat?.practiceContext().pending === true)
      if (speechText.textContent !== view.text) speechText.textContent = view.text
      speech.dataset.state = view.state
      speech.hidden = !showSpeech
      hint.hidden = false
    }
    function syncChatProgress() {
      const current = ctx.services.chat?.practiceContext()
      if (!current) return
      const next = { sessionId: current.sessionId, pending: current.pending, assistantCount: current.messages.filter(turn => turn.role === 'assistant').length }
      if (hasSceneReply(progress, next) && visible() && stage.dataset.state === 'ready') command('reply')
      progress = next
      syncSpeech()
    }
    function closePicker(focus = false) {
      picker.hidden = true; button.setAttribute('aria-expanded', 'false')
      if (focus) button.focus({ preventScroll: true })
    }
    function release() {
      command('dispose'); loading?.abort(); clearTimeout(timeout); frame?.remove(); frame = undefined
      speech.hidden = hint.hidden = true
      delete speech.dataset.side
      delete stage.dataset.watching
      hint.textContent = '点伙伴聊聊 · 拖动环视'
    }
    function closeWindow() {
      release(); selected = undefined; stage.hidden = true; delete stage.dataset.scene; delete stage.dataset.state
      picker.querySelectorAll('[data-scene]').forEach(choice => choice.setAttribute('aria-pressed', 'false'))
      button.focus({ preventScroll: true })
    }
    function failed() {
      release()
      stage.dataset.state = 'error'; status.hidden = false; retry.hidden = false
      status.querySelector('span')!.textContent = '场景暂时没有打开，可以重试。'
      controls.forEach(control => { control.disabled = true })
    }
    function choose(id: SceneId) {
      const scene = SCENES.find(item => item.id === id)!
      closePicker(); release(); selected = id; stage.hidden = false
      stage.dataset.scene = id; stage.dataset.state = 'loading'
      stage.querySelector('.ai-scene-name')!.textContent = scene.name
      stage.querySelector('.ai-scene-speaker')!.textContent = `${scene.character} · Nuo`
      status.hidden = false; retry.hidden = true; status.querySelector('span')!.textContent = `正在打开${scene.name}…`
      controls.forEach(control => { control.disabled = true })
      picker.querySelectorAll<HTMLElement>('[data-scene]').forEach(choice => choice.setAttribute('aria-pressed', String(choice.dataset.scene === id)))
      const lifetime = new AbortController(); loading = lifetime
      const next = document.createElement('iframe'); frame = next
      next.title = `${scene.name} 3D 场景`; next.className = 'ai-scene-frame'
      next.src = `${import.meta.env.BASE_URL}scene-runtime/viewer.html?scene=${id}`
      window.addEventListener('message', event => {
        if (event.origin !== location.origin || event.source !== next.contentWindow) return
        if (event.data?.type === 'xinqing-3d:ready') {
          clearTimeout(timeout); stage.dataset.state = 'ready'; status.hidden = true
          controls.forEach(control => { control.disabled = false }); command('active', visible()); syncSpeech()
        }
        if (event.data?.type === 'xinqing-3d:error') { clearTimeout(timeout); failed() }
        if (event.data?.type === 'xinqing-3d:close') closeWindow()
        if (event.data?.type === 'xinqing-3d:activate') focusChat()
        if (event.data?.type === 'xinqing-3d:screens' && Array.isArray(event.data.labels) && event.data.labels.length) {
          hint.textContent = `点伙伴聊聊 · 点${String(event.data.labels[0]).slice(0, 6)}看演绎`
        }
        if (event.data?.type === 'xinqing-3d:screen') {
          if (event.data.state === 'watching') { stage.dataset.watching = 'true'; sendTheater() }
          else delete stage.dataset.watching
        }
        if (event.data?.type === 'xinqing-3d:anchor') {
          const point = sceneAnchor(event.data)
          if (point) speech.dataset.side = point.visible && point.x > .5 ? 'left' : 'right'
        }
      }, { signal: lifetime.signal })
      next.addEventListener('error', failed, { signal: lifetime.signal })
      timeout = setTimeout(failed, 90000)
      world.prepend(next)
      button.focus({ preventScroll: true })
    }
    button.addEventListener('click', () => {
      const open = picker.hidden; picker.hidden = !open; button.setAttribute('aria-expanded', String(open))
      if (open) picker.querySelector<HTMLButtonElement>('[data-scene]')?.focus({ preventScroll: true })
    })
    picker.querySelector('.ai-3d-picker-heading button')!.addEventListener('click', () => closePicker(true))
    picker.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(choice => choice.addEventListener('click', () => choose(choice.dataset.scene as SceneId)))
    stage.querySelector('[data-scene-close]')!.addEventListener('click', closeWindow)
    stage.querySelector('[data-scene-reset]')!.addEventListener('click', () => command('reset'))
    stage.querySelector('[data-scene-greet]')!.addEventListener('click', () => command('greet'))
    stage.querySelector('[data-scene-chat]')!.addEventListener('click', focusChat)
    speechToggle.addEventListener('click', () => {
      showSpeech = !showSpeech
      speechToggle.textContent = showSpeech ? '收起回复' : '显示回复'
      speechToggle.setAttribute('aria-pressed', String(showSpeech)); syncSpeech()
    })
    retry.addEventListener('click', () => { if (selected) choose(selected) })
    document.addEventListener('pointerdown', event => {
      if (!picker.hidden && event.target instanceof Node && !picker.contains(event.target) && !button.contains(event.target)) closePicker()
    })
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !picker.hidden) { event.preventDefault(); closePicker(true) }
    })
    const sync = () => { command('active', visible()); if (!page.classList.contains('ai-page-visible')) closePicker() }
    const observer = new MutationObserver(sync)
    observer.observe(page, { attributes: true, attributeFilter: ['class'] })
    document.addEventListener('visibilitychange', sync)
    const chatObserver = new MutationObserver(syncSpeech)
    chatObserver.observe(messages, { childList: true, subtree: true, characterData: true })
    const unsubscribe = ctx.events.on('chat.contextChanged', syncChatProgress)
    const unsubscribeTheater = ctx.events.on('theater.updated', sendTheater)
    syncChatProgress()
    window.addEventListener('pagehide', event => { if (event.persisted) command('active', false); else { release(); observer.disconnect(); chatObserver.disconnect(); unsubscribe(); unsubscribeTheater() } })
    window.addEventListener('pageshow', sync)
  }
}
