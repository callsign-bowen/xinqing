/** Keep a native textarea and its selection/IME behavior; only draw the small caret ornament. */
export function attachPenCaret(input: HTMLTextAreaElement) {
  const host = document.createElement('div'); host.className = 'diary-pen-editor'
  input.before(host); host.append(input)
  const pen = document.createElement('span'); pen.className = 'diary-pen-caret'; pen.hidden = true; pen.setAttribute('aria-hidden', 'true')
  pen.innerHTML = '<svg viewBox="0 0 14 22" fill="none"><path d="M3 2h8l-1.1 8L7 20 4.1 10Z" fill="#dcc89d" stroke="#6b5739" stroke-width="1"/><path d="M7 20V9M4 7h6" stroke="#6b5739" stroke-width=".9"/><circle cx="7" cy="8.5" r="1.2" fill="#6b5739"/></svg>'
  host.append(pen)
  const mirror = document.createElement('div'); mirror.className = 'diary-caret-mirror'; mirror.setAttribute('aria-hidden', 'true'); document.body.append(mirror)
  let frame = 0, disposed = false, reveal = false
  const copied = ['boxSizing','fontFamily','fontSize','fontWeight','fontStyle','fontVariant','letterSpacing','lineHeight','textIndent','textTransform','textAlign','wordSpacing','tabSize','paddingTop','paddingBottom','paddingLeft','paddingRight','borderTopWidth','borderBottomWidth','borderLeftWidth','borderRightWidth','overflowWrap','wordBreak'] as const
  function hide() { pen.hidden = true; input.classList.remove('diary-with-pen') }
  function update() {
    frame = 0
    const revealCaret = reveal; reveal = false
    if (disposed || !input.isConnected) return
    if (document.activeElement !== input || input.selectionStart !== input.selectionEnd || !input.getClientRects().length) { hide(); return }
    const style = getComputedStyle(input), bounds = input.getBoundingClientRect(), parent = host.getBoundingClientRect()
    for (const name of copied) mirror.style[name] = style[name]
    // The textarea's scrollbar consumes layout width; mirror the actual wrapping width.
    const borders = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
    mirror.style.width = (input.clientWidth + borders) + 'px'
    mirror.replaceChildren(document.createTextNode(input.value.slice(0, input.selectionStart)))
    const marker = document.createElement('span'); marker.textContent = input.value.slice(input.selectionStart) || '\u200b'; mirror.append(marker)
    const position = marker.getClientRects()[0], source = mirror.getBoundingClientRect()
    if (!position) { hide(); return }
    const size = Math.max(13, Math.min(19, parseFloat(style.fontSize)))
    const caretY = position.top - source.top
    if (revealCaret) {
      const bottom = parseFloat(style.paddingBottom), top = parseFloat(style.paddingTop)
      if (caretY + size > input.scrollTop + input.clientHeight - bottom) input.scrollTop = caretY + size + bottom - input.clientHeight
      else if (caretY < input.scrollTop + top) input.scrollTop = Math.max(0, caretY - top)
    }
    const x = bounds.left - parent.left + position.left - source.left - input.scrollLeft
    const y = bounds.top - parent.top + position.top - source.top - input.scrollTop + Math.max(0, (position.height - size) / 2)
    if (!Number.isFinite(x + y) || x < 0 || x > input.clientWidth + 2 || y < 0 || y + size > input.clientHeight + 3) { hide(); return }
    pen.style.height = size + 'px'; pen.style.width = (size * 14 / 22) + 'px'; pen.style.transform = `translate3d(${x - size * 7 / 22}px,${y}px,0)`
    pen.hidden = false; input.classList.add('diary-with-pen')
  }
  function schedule(event?: Event) {
    if (event && ['input','keyup','click','focus','selectionchange','compositionend'].includes(event.type)) reveal = true
    if (!disposed && !frame) frame = requestAnimationFrame(update)
  }
  const events = ['input','keyup','click','scroll','select','focus','blur','compositionstart','compositionupdate','compositionend']
  for (const event of events) input.addEventListener(event, schedule)
  document.addEventListener('selectionchange', schedule)
  document.fonts.addEventListener('loadingdone', schedule)
  const resize = new ResizeObserver(() => schedule()); resize.observe(input)
  const removal = new MutationObserver(() => { if (!input.isConnected) dispose() }); removal.observe(document.body, { childList: true, subtree: true })
  function dispose() {
    if (disposed) return; disposed = true; cancelAnimationFrame(frame)
    for (const event of events) input.removeEventListener(event, schedule)
    document.removeEventListener('selectionchange', schedule); document.fonts.removeEventListener('loadingdone', schedule); resize.disconnect(); removal.disconnect(); mirror.remove(); hide()
  }
  void document.fonts.ready.then(() => schedule())
  schedule()
  return { refresh: schedule, dispose }
}

/** Mobile keyboards resize the visible sheet while leaving the native text input in charge. */
export function followDiaryViewport(modal: HTMLElement) {
  function sync() {
    const view = window.visualViewport
    if (view && Math.abs(view.scale - 1) < .05) modal.style.setProperty('--diary-viewport-height', view.height + 'px')
    else modal.style.removeProperty('--diary-viewport-height')
  }
  window.visualViewport?.addEventListener('resize', sync)
  window.addEventListener('resize', sync)
  sync()
}
