import type { Feature } from '../../kernel/types'
import './cabin.css'
import type { LunarViewport } from '../lunar/viewport'
import { mountHolographicChat } from './holographic-chat'
import './holographic.css'
import '../lunar/lunar.css'

type Section = 'journal' | 'chat' | 'emotion' | 'profile'

// Business destinations stay independent of the three-dimensional presentation.
const DEVICES: Record<Section, {
  nav: string; selector: string; title: string; subtitle: string
  icon: string
}> = {
  journal: { nav: '首页', selector: '.app', title: '首页', subtitle: '记录心情 · 翻阅日记', icon: '<path d="M12 6C9 4 6 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1v14"/>' },
  emotion: { nav: '情绪', selector: '#page-report', title: '情绪', subtitle: '看看最近的自己', icon: '<path d="M4 18v-5m8 5V6m8 12V9"/>' },
  chat: { nav: 'AI', selector: '#page-ai', title: 'AI', subtitle: '和宇航员 Nuo 聊聊', icon: '<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>' },
  profile: { nav: '我的', selector: '#page-profile', title: '我的', subtitle: '资料 · 陪伴偏好', icon: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16m-10 4h4"/>' }
}

function icon(paths: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
}

export const cabinFeature: Feature = {
  id: 'cabin',
  init() {
    if (document.getElementById('companion-cabin')) return
    const entries = (Object.entries(DEVICES) as [Section, typeof DEVICES[Section]][])
      .map(([key, device]) => ({ key, device, page: document.querySelector<HTMLElement>(device.selector), nav: document.querySelector<HTMLButtonElement>(`[data-nav="${device.nav}"]`) }))
    // Leave the original interface intact if the expected page structure is absent.
    if (entries.some(entry => !entry.page || !entry.nav)) return

    const room = document.createElement('main')
    room.id = 'companion-cabin'
    room.className = 'cabin lunar-home'
    room.setAttribute('aria-label', '心晴 · 月面观星')
    room.innerHTML = `
      <div class="cabin-viewport" role="region" aria-label="月面观星三维场景，拖动空白处或按方向键环视，Home 键归位，点击宇航员进入 AI 对话"></div>
      <nav class="cabin-device-layer lunar-nav" aria-label="四个主页面">
          ${entries.map(({ key, device }) => `
            <button type="button" class="cabin-device cabin-device-${key}" data-cabin-open="${key}"
              aria-label="打开${device.title}" aria-haspopup="dialog" aria-controls="cabin-panel">
              <span class="cabin-device-label"><span class="cabin-device-icon">${icon(device.icon)}</span><span class="cabin-device-copy"><strong>${device.title}</strong><small>${device.subtitle}</small></span></span>
            </button>`).join('')}
      </nav>
      <header class="cabin-header">
        <div class="cabin-brand"><span class="cabin-brand-symbol" aria-hidden="true">☾</span><div><h1>心晴<span> · 月面观星</span></h1><p>和 Nuo 一起，在星空下坐一会儿</p></div></div>
        <div class="lunar-actions"><button type="button" data-lunar-greet disabled>打招呼</button><button type="button" data-lunar-reset disabled>视角归位</button><button class="cabin-guide-toggle" type="button" aria-expanded="false" aria-controls="cabin-guide">${icon('<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>')}<span>功能导览</span></button></div>
      </header>
      <section id="cabin-guide" class="cabin-guide" aria-label="功能导览" hidden>
        <p>从这里打开原来的四个页面，关闭面板即可回到月面。</p>
        ${entries.map(({ key, device }) => `<button type="button" data-cabin-open="${key}"><span class="cabin-device-icon">${icon(device.icon)}</span><span><strong>${device.title}</strong><small>${device.subtitle}</small></span></button>`).join('')}
      </section>
      <footer class="cabin-footer"><p class="cabin-hint">拖动空白处环顾星空 · 点击宇航员开始聊天</p></footer>
      <div class="cabin-pan-controls"><button type="button" data-cabin-pan="-1" aria-label="向左环顾月面">‹</button><button type="button" data-cabin-pan="1" aria-label="向右环顾月面">›</button></div>
      <div class="cabin-scene-status" role="status"><span class="cabin-loading-orbit" aria-hidden="true"></span><strong>正在准备月面与星空</strong><p>四个页面现在就可以打开。</p><button type="button" data-lunar-retry hidden>重试加载</button></div>`

    const scrim = document.createElement('div')
    scrim.className = 'cabin-scrim'
    scrim.hidden = true
    const panel = document.createElement('section')
    panel.id = 'cabin-panel'
    // .page lets existing diary modal focus/background handling recognize this shell.
    panel.className = 'cabin-panel page'
    panel.hidden = true
    panel.tabIndex = -1
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    panel.setAttribute('aria-labelledby', 'cabin-panel-title')
    panel.innerHTML = `<header class="cabin-panel-header"><div><p class="cabin-panel-eyebrow">心晴 / 月面观星</p><h2 id="cabin-panel-title"></h2><p id="cabin-panel-subtitle"></p></div><button type="button" class="cabin-panel-close" aria-label="返回月面观星">${icon('<path d="m6 6 12 12M6 18 18 6"/>')}</button></header><div class="cabin-panel-body"></div>`
    const content = panel.querySelector<HTMLElement>('.cabin-panel-body')!
    const guide = room.querySelector<HTMLElement>('#cabin-guide')!
    const guideToggle = room.querySelector<HTMLButtonElement>('.cabin-guide-toggle')!
    const closeButton = panel.querySelector<HTMLButtonElement>('.cabin-panel-close')!
    const viewport = room.querySelector<HTMLElement>('.cabin-viewport')!
    let sceneController: LunarViewport | undefined
    let sceneLifetime: AbortController | undefined
    let returnFocus: HTMLElement | null = null
    let current: Section | null = null

    entries.forEach(({ key, page, nav }) => {
      page!.classList.add('cabin-source')
      page!.dataset.cabinSource = key
      page!.hidden = true
      if (key !== 'chat') content.appendChild(page!)
      nav!.addEventListener('click', () => activate(key))
    })
    document.body.append(room, scrim, panel)
    const chatPage = entries.find(entry => entry.key === 'chat')!.page!
    document.body.appendChild(chatPage)
    const chatView = mountHolographicChat(chatPage, close, () => sceneController?.reactToReply())
    room.querySelector('.cabin-device-chat')?.setAttribute('aria-controls', 'page-ai')
    room.querySelector('.cabin-device-chat')?.removeAttribute('aria-haspopup')
    document.body.classList.add('cabin-enabled', 'lunar-enabled')
    const chatTitle = document.querySelector('.ai-header-title > span:last-child')
    if (chatTitle) chatTitle.textContent = 'Nuo · 月面陪伴'

    function closeGuide() {
      guide.hidden = true
      guideToggle.setAttribute('aria-expanded', 'false')
    }

    function activate(key: Section) {
      current = key
      document.body.dataset.cabinSection = key
      if (key === 'chat') { sceneController?.resetView(); sceneController?.resume() }
      else sceneController?.pause()
      closeGuide()
      entries.forEach(entry => { entry.page!.hidden = entry.key !== key })
      panel.dataset.section = key
      scrim.dataset.section = key
      panel.querySelector('#cabin-panel-title')!.textContent = DEVICES[key].title
      panel.querySelector('#cabin-panel-subtitle')!.textContent = DEVICES[key].subtitle
      panel.hidden = key === 'chat'
      scrim.hidden = key === 'chat'
      room.inert = key !== 'chat'
      content.scrollTop = 0
      if (key === 'chat') {
        chatView.show()
        if (matchMedia('(pointer: fine)').matches) chatView.focus()
      } else {
        chatView.hide()
        closeButton.focus({ preventScroll: true })
      }
      // Charts originally initialized via nav; resize after the panel has a layout.
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'))
        if (key === 'chat') {
          const messages = document.getElementById('ai-messages')
          if (messages) messages.scrollTop = messages.scrollHeight
        }
      })
    }

    function open(key: Section, trigger: HTMLElement) {
      returnFocus = trigger
      entries.find(entry => entry.key === key)!.nav!.click()
    }

    function close() {
      if (!current) return
      document.getElementById('ai-sidebar-close')?.click()
      // Also ends active speech recognition through the existing page observer.
      document.getElementById('page-ai')?.classList.remove('ai-page-visible')
      document.getElementById('page-report')?.classList.remove('report-visible')
      document.getElementById('page-profile')?.classList.remove('profile-page-visible')
      entries.forEach(entry => { entry.page!.hidden = true })
      current = null
      delete document.body.dataset.cabinSection
      chatView.hide()
      sceneController?.resume()
      panel.hidden = true
      scrim.hidden = true
      room.inert = false
      const target = returnFocus?.isConnected && !returnFocus.closest('[hidden]') ? returnFocus : guideToggle
      target.focus({ preventScroll: true })
    }

    room.querySelectorAll<HTMLButtonElement>('[data-cabin-open]').forEach(button => {
      button.addEventListener('click', () => open(button.dataset.cabinOpen as Section, button))
    })
    guideToggle.addEventListener('click', () => {
      guide.hidden = !guide.hidden
      guideToggle.setAttribute('aria-expanded', String(!guide.hidden))
    })
    closeButton.addEventListener('click', close)
    scrim.addEventListener('click', close)
    // The existing homepage shortcut changes the original page directly.
    // Mirror that transition in the cabin shell without changing its send logic.
    const aiCard = document.getElementById('aiCard')
    aiCard?.addEventListener('click', () => activate('chat'))
    aiCard?.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') activate('chat') })

    function foregroundOverlay(): boolean {
      return [...document.querySelectorAll<HTMLElement>('[role="dialog"],[aria-modal="true"],.ai-sidebar-open,.image-lightbox-visible')]
        .some(element => element !== panel && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
    }
    document.addEventListener('keydown', event => {
      // Nested diary, account, mascot and history dialogs keep their own handling.
      if (foregroundOverlay()) return
      if (!current) {
        if (event.key === 'Escape' && !guide.hidden) { closeGuide(); guideToggle.focus() }
        return
      }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
      if (current === 'chat') return
      if (event.key !== 'Tab') return
      const focusable = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'))
      const first = focusable[0], last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }, { capture: true })

    room.querySelectorAll<HTMLButtonElement>('[data-cabin-pan]').forEach(button => button.addEventListener('click', () => {
      sceneController?.pan(Number(button.dataset.cabinPan))
    }))
    room.querySelector('[data-lunar-reset]')!.addEventListener('click', () => sceneController?.resetView())
    room.querySelector('[data-lunar-greet]')!.addEventListener('click', () => sceneController?.greet())
    viewport.addEventListener('lunar-character-anchor', event => {
      const { x, y, visible } = (event as CustomEvent<{ x: number; y: number; visible: boolean }>).detail
      chatView.anchor(x, y, visible)
    })
    viewport.addEventListener('lunar-character-activate', () => {
      if (current !== 'chat') open('chat', room.querySelector<HTMLButtonElement>('.cabin-device-chat')!)
    })
    // The lunar renderer is the only scene loaded by this entry. The four
    // original page nodes, their storage and API handlers are reused in place.
    const status = room.querySelector<HTMLElement>('.cabin-scene-status')!
    const retry = room.querySelector<HTMLButtonElement>('[data-lunar-retry]')!
    const sceneButtons = room.querySelectorAll<HTMLButtonElement>('[data-lunar-reset],[data-lunar-greet],[data-cabin-pan]')
    function failed(error: unknown) {
      viewport.dataset.state = 'unavailable'; viewport.dataset.error = error instanceof Error ? error.name : 'Error'
      status.hidden = false; status.classList.add('cabin-scene-unavailable')
      status.querySelector('strong')!.textContent = '月面场景暂时没有加载完成'
      status.querySelector('p')!.textContent = '可以重试；首页、情绪、AI 和我的仍可正常打开。'
      retry.hidden = false
      sceneButtons.forEach(button => { button.disabled = true })
      guide.hidden = false; guideToggle.setAttribute('aria-expanded', 'true')
    }
    async function loadScene() {
      sceneLifetime?.abort(); sceneController = undefined
      const lifetime = new AbortController(); sceneLifetime = lifetime
      viewport.dataset.state = 'loading'; status.hidden = false
      status.classList.remove('cabin-scene-unavailable'); retry.hidden = true
      status.querySelector('strong')!.textContent = '正在准备月面与星空'
      status.querySelector('p')!.textContent = '四个页面现在就可以打开。'
      sceneButtons.forEach(button => { button.disabled = true })
      try {
        const { createLunarViewport } = await import('../lunar/viewport')
        if (lifetime.signal.aborted) return
        const assets = new URL(`${import.meta.env.BASE_URL}lunar/`, location.origin).href
        const result = await createLunarViewport(viewport, viewport, lifetime.signal, assets)
        if (lifetime.signal.aborted) { result.dispose(); return }
        sceneController = result; viewport.dataset.state = 'ready'; status.hidden = true
        sceneButtons.forEach(button => { button.disabled = false })
        if (!current || current === 'chat') result.resume()
      } catch (error) { if (!lifetime.signal.aborted) failed(error) }
    }
    viewport.addEventListener('lunar-viewport-error', event => failed((event as CustomEvent).detail))
    retry.addEventListener('click', () => { void loadScene() })
    void loadScene()
    window.addEventListener('pagehide', event => {
      if (event.persisted) sceneController?.pause()
      else { sceneLifetime?.abort(); chatView.dispose() }
    })
    window.addEventListener('pageshow', () => { if (!current || current === 'chat') sceneController?.resume() })
  }
}
