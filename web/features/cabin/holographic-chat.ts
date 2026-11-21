import { placeSpeech, projectSpeech, type SpeechItem } from './speech'

/** Reuse the original message nodes and controls; only their presentation moves. */
export function mountHolographicChat(page: HTMLElement, close: () => void, onReply: () => void = () => {}) {
  page.classList.add('cabin-chat', 'page')
  page.setAttribute('aria-label', '与 Nuo 对话')
  const messages = page.querySelector<HTMLElement>('#ai-messages')!
  const inputArea = page.querySelector<HTMLElement>('.ai-input-area')!
  const input = page.querySelector<HTMLTextAreaElement>('#ai-input')!
  const header = page.querySelector<HTMLElement>('.ai-header')!
  const left = header.querySelector<HTMLElement>('.ai-header-left')!

  const transcriptButton = document.createElement('button')
  transcriptButton.type = 'button'; transcriptButton.className = 'cabin-transcript-toggle'
  transcriptButton.textContent = '对话记录'; transcriptButton.setAttribute('aria-expanded', 'false'); transcriptButton.setAttribute('aria-controls', 'cabin-transcript')
  left.appendChild(transcriptButton)
  const exit = document.createElement('button')
  exit.type = 'button'; exit.className = 'cabin-chat-exit'; exit.textContent = '返回月面'; exit.setAttribute('aria-label', '返回月面观星')
  header.prepend(exit); exit.addEventListener('click', close)

  const speech = document.createElement('section')
  speech.className = 'cabin-chat-bubble'; speech.setAttribute('aria-label', 'Nuo 的最新回复')
  speech.innerHTML = '<div class="cabin-speech-heading"><span class="cabin-speech-signal" aria-hidden="true"></span><strong>Nuo</strong><span class="cabin-speech-state"></span></div><div class="cabin-speech-text" role="status" aria-live="polite" aria-atomic="false"></div><div class="cabin-speech-actions"><button class="cabin-speech-stop" type="button" hidden>停止等待</button><button class="cabin-speech-retry" type="button" hidden>重新尝试</button><button class="cabin-speech-history" type="button">查看对话记录 ↗</button></div>'
  page.appendChild(speech)
  const words = speech.querySelector<HTMLElement>('.cabin-speech-text')!
  const speechState = speech.querySelector<HTMLElement>('.cabin-speech-state')!
  const stop = speech.querySelector<HTMLButtonElement>('.cabin-speech-stop')!
  const retry = speech.querySelector<HTMLButtonElement>('.cabin-speech-retry')!

  const transcript = document.createElement('section')
  transcript.id = 'cabin-transcript'; transcript.className = 'cabin-transcript'; transcript.hidden = true
  transcript.setAttribute('role', 'dialog'); transcript.setAttribute('aria-modal', 'true'); transcript.setAttribute('aria-labelledby', 'cabin-transcript-title')
  transcript.innerHTML = '<header><div><span class="cabin-panel-eyebrow">NUO / CONVERSATION LOG</span><h2 id="cabin-transcript-title">对话记录</h2></div><button type="button" aria-label="关闭对话记录">×</button></header><p class="cabin-transcript-note">保留你实际发送的内容与 Nuo 的完整回复。</p>'
  transcript.appendChild(messages); page.appendChild(transcript)
  const transcriptClose = transcript.querySelector<HTMLButtonElement>('button')!
  const transcriptScrim = document.createElement('div'); transcriptScrim.className = 'cabin-transcript-scrim'; transcriptScrim.hidden = true; page.appendChild(transcriptScrim)

  function showTranscript() {
    transcript.hidden = false; transcriptScrim.hidden = false
    transcriptButton.setAttribute('aria-expanded', 'true'); words.setAttribute('aria-live', 'off'); messages.setAttribute('aria-live', 'polite')
    header.inert = true; inputArea.inert = true; speech.inert = true
    transcriptClose.focus({ preventScroll: true })
    requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight })
  }
  function hideTranscript(focus = true) {
    transcript.hidden = true; transcriptScrim.hidden = true
    transcriptButton.setAttribute('aria-expanded', 'false'); words.setAttribute('aria-live', 'polite'); messages.setAttribute('aria-live', 'off')
    header.inert = false; inputArea.inert = false; speech.inert = false
    if (focus) transcriptButton.focus({ preventScroll: true })
  }
  messages.setAttribute('aria-live', 'off')
  transcriptButton.addEventListener('click', showTranscript)
  speech.querySelector('.cabin-speech-history')!.addEventListener('click', showTranscript)
  transcriptClose.addEventListener('click', () => hideTranscript())
  transcriptScrim.addEventListener('click', () => hideTranscript())
  stop.addEventListener('click', () => messages.querySelector<HTMLButtonElement>('.ai-typing-stop')?.click())
  retry.addEventListener('click', () => [...messages.querySelectorAll<HTMLButtonElement>('.ai-send-retry')].at(-1)?.click())

  function updateSpeech() {
    const items: SpeechItem[] = []
    for (const element of messages.children) {
      if (element.classList.contains('ai-typing-message')) items.push({ kind: 'pending' })
      else if (element.classList.contains('ai-send-error')) items.push({ kind: 'error', text: element.querySelector('.ai-send-error-detail')?.textContent || '', retry: !!element.querySelector('.ai-send-retry') })
      else if (element.classList.contains('ai-user')) items.push({ kind: 'user' })
      else if (element.classList.contains('ai-assistant')) items.push({ kind: 'assistant', text: element.querySelector('.ai-message-bubble')?.textContent || '' })
    }
    const view = projectSpeech(items)
    speech.dataset.speechState = view.state
    if (words.textContent !== view.text) {
      words.textContent = view.text; words.scrollTop = words.scrollHeight
      if (view.state === 'reply') onReply()
    }
    speechState.textContent = { reply: '陪你聊聊', thinking: '正在想…', incomplete: '还没收到回复', error: '连接提示', idle: '我在这里' }[view.state]
    stop.hidden = view.state !== 'thinking'; retry.hidden = !view.retry
  }
  const observer = new MutationObserver(updateSpeech)
  observer.observe(messages, { childList: true, subtree: true, characterData: true })
  updateSpeech()

  let head: { x: number; y: number } | null = null
  let size = { width: 380, height: 160 }
  const sizeObserver = new ResizeObserver(entries => {
    const entry = entries[0]
    if (entry.contentRect.width > 0) size = { width: speech.offsetWidth, height: speech.offsetHeight }
    position()
  }); sizeObserver.observe(speech)
  function position() {
    if (page.hidden) return
    const visibleHeight = window.visualViewport ? window.visualViewport.height + window.visualViewport.offsetTop : innerHeight
    const bottom = inputArea.getBoundingClientRect().top - 18
    const placement = placeSpeech({ head, ...size, viewportWidth: innerWidth, viewportHeight: visibleHeight, top: innerWidth < 760 ? 132 : 142, bottom: bottom > 150 ? bottom : visibleHeight - 120 })
    speech.style.left = `${placement.x}px`; speech.style.top = `${placement.y}px`
    speech.style.maxHeight = `${placement.maxHeight}px`; speech.dataset.side = placement.side
    speech.style.setProperty('--speech-tail', `${placement.tail}px`)
  }
  function keyboard() {
    const vv = window.visualViewport
    page.style.setProperty('--cabin-keyboard', `${vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0}px`)
    position()
  }
  window.visualViewport?.addEventListener('resize', keyboard); window.visualViewport?.addEventListener('scroll', keyboard)
  const inputObserver = new ResizeObserver(position); inputObserver.observe(inputArea)
  document.addEventListener('keydown', event => {
    if (page.hidden || transcript.hidden || document.getElementById('ai-sidebar')?.classList.contains('ai-sidebar-open')) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hideTranscript(); return }
    if (event.key !== 'Tab') return
    const targets = [...transcript.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],textarea:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')].filter(node => node.getClientRects().length && !node.closest('[inert]'))
    const first = targets[0], last = targets.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  })

  return {
    show() { updateSpeech(); keyboard(); requestAnimationFrame(position) },
    hide() { hideTranscript(false) },
    anchor(x: number, y: number, visible: boolean) { head = visible ? { x, y } : null; position() },
    focus() { input.focus({ preventScroll: true }) },
    dispose() { observer.disconnect(); sizeObserver.disconnect(); inputObserver.disconnect(); window.visualViewport?.removeEventListener('resize', keyboard); window.visualViewport?.removeEventListener('scroll', keyboard) }
  }
}
