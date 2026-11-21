import { MAX_DIARY_TEXT } from './records.mjs'

interface FlowEntry { key: string; text: string; images: string[] }
interface FlowOptions {
  day: string; leading: HTMLElement; initialPage?: number
  onText(key: string, text: string): void
  onPhotoRemove(key: string, index: number): void
  onPhotoOpen(src: string): void
  onPage(page: number, total: number): void
  onLimit?(): void
}

/** Browser text fragmentation keeps real text, selection and IME across paper faces.
 * Only the visible column is shown. Photos are indivisible blocks in the same flow. */
export function createDiaryFlow(viewport: HTMLElement, entries: FlowEntry[], options: FlowOptions) {
  const track = document.createElement('div'); track.className = 'diary-flow-track'
  const pen = document.createElement('span'); pen.className = 'diary-pen-caret diary-inline-pen'; pen.hidden = true; pen.setAttribute('aria-hidden','true')
  pen.innerHTML = '<svg viewBox="0 0 14 22" fill="none"><path d="M3 2h8l-1.1 8L7 20 4.1 10Z" fill="#dcc89d" stroke="#6b5739"/><path d="M7 20V9M4 7h6" stroke="#6b5739" stroke-width=".9"/><circle cx="7" cy="8.5" r="1.2" fill="#6b5739"/></svg>'
  viewport.append(track, pen); track.append(options.leading)
  let current = Math.max(0, options.initialPage || 0), total = 1, stride = 1, frame = 0, follow = false, disposed = false, composing = false, first = true
  let armedPhoto: HTMLElement | null = null, penEditor: HTMLElement | null = null
  const editors = new Map<string, HTMLElement>(), cleanups: Array<() => void> = []
  const gap = 48

  function selectedEditor() {
    const active = document.activeElement
    return active instanceof HTMLElement && active.classList.contains('diary-inline-editor') && track.contains(active) ? active : null
  }
  function caretRect() {
    const editor = selectedEditor(), selection = window.getSelection()
    if (!editor || !selection?.isCollapsed || !selection.rangeCount || !editor.contains(selection.anchorNode)) return null
    const range = selection.getRangeAt(0), rect = range.getClientRects()[0]
    if (rect) return rect
    const node = range.startContainer, offset = range.startOffset
    if (node.nodeType === Node.TEXT_NODE && offset > 0) {
      const previous = range.cloneRange(); previous.setStart(node,offset-1)
      const box = [...previous.getClientRects()].at(-1)
      if (box) return new DOMRect(box.right,box.top,0,box.height)
    }
    const element = node instanceof HTMLElement ? node : node.parentElement
    const next = element?.childNodes[offset]
    if (next instanceof HTMLElement) { const box=next.getClientRects()[0]; if(box)return box }
    return element?.getClientRects()[0] || (!editor.textContent ? editor.getClientRects()[0] : null)
  }
  function hidePen() { pen.hidden = true; penEditor?.classList.remove('diary-with-inline-pen'); penEditor = null }
  function positionPen() {
    const editor = selectedEditor(), rect = caretRect(), bounds = viewport.getBoundingClientRect()
    if (!editor || !rect || composing || rect.top < bounds.top - 2 || rect.bottom > bounds.bottom + 2 || rect.left < bounds.left - 2 || rect.left > bounds.right + 2) { hidePen(); return }
    if (penEditor !== editor) { hidePen(); penEditor = editor; editor.classList.add('diary-with-inline-pen') }
    const size = Math.min(19, Math.max(13, parseFloat(getComputedStyle(editor).fontSize)))
    pen.style.width = size * 14 / 22 + 'px'; pen.style.height = size + 'px'
    pen.style.transform = `translate3d(${rect.left - bounds.left + viewport.scrollLeft - size * 7 / 22}px,${rect.top - bounds.top + Math.max(0,(rect.height-size)/2)}px,0)`
    pen.hidden = false
  }
  function report() {
    viewport.dataset.sheet = String(current + 1); viewport.dataset.sheets = String(total)
    options.onPage(current, total)
  }
  function reflow() {
    frame = 0
    if (disposed || !viewport.isConnected || composing || viewport.clientWidth < 20 || viewport.clientHeight < 20) return
    const width = viewport.clientWidth, height = viewport.clientHeight
    track.classList.toggle('diary-compact-flow',height<260); track.classList.toggle('diary-tiny-flow',height<110)
    stride = width + gap
    track.style.setProperty('--diary-photo-width', Math.max(40, Math.min(205, width * .7, height - 66)) + 'px')
    total = Math.max(1, Math.ceil((track.scrollWidth + gap - 2) / stride))
    if (first) { if (options.initialPage === -1) current = total - 1; first = false }
    const rect = follow && caretRect(), bounds = viewport.getBoundingClientRect()
    if (rect) current = Math.floor(Math.max(0, rect.left - bounds.left + viewport.scrollLeft + 1) / stride)
    follow = false; current = Math.max(0, Math.min(total - 1, current))
    viewport.scrollLeft = current * stride; viewport.scrollTop = 0
    report(); positionPen()
  }
  function schedule(withCaret = false) {
    if (disposed) return
    follow ||= withCaret
    if (!frame) frame = requestAnimationFrame(reflow)
  }
  function focusEnd() {
    const editor = editors.get('draft') || [...editors.values()].at(-1)
    if (!editor) return
    editor.focus({preventScroll:true})
    const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false)
    let tail: Node = editor
    while (tail.lastChild) tail = tail.lastChild
    if (tail.nodeType === Node.TEXT_NODE) range.setStart(tail, (tail.nodeValue?.length || 0) - (tail.nodeValue?.endsWith('\n') ? 1 : 0))
    else if (tail.nodeName === 'BR') range.setStartBefore(tail)
    range.collapse(true)
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); schedule(true)
  }
  for (const entry of entries) {
    if (!entry.text && entry.key !== 'draft') continue
    const editor = document.createElement('div'); editor.className = 'diary-inline-editor'; editor.contentEditable = 'plaintext-only'
    editor.dataset.key = entry.key; editor.setAttribute('role','textbox'); editor.setAttribute('aria-multiline','true')
    editor.setAttribute('aria-label', entry.key === 'draft' ? '日记正文' : '日记文字，点击编辑')
    // A final native newline is the caret's empty visual line, not another
    // authored newline. Supply the same sentinel when restoring plain text.
    editor.spellcheck = false; editor.textContent = entry.text + (entry.text.endsWith('\n') ? '\n' : ''); editors.set(entry.key, editor); track.append(editor)
    editor.addEventListener('compositionstart', () => { composing = true; hidePen() })
    editor.addEventListener('compositionend', () => { composing = false; capture(); schedule(true) })
    function capture() {
      let text = editor.innerText.replace(/\r\n/g,'\n').replace(/\n$/,'')
      if (text.length > MAX_DIARY_TEXT) { text = text.slice(0, MAX_DIARY_TEXT); editor.textContent = text + (text.endsWith('\n') ? '\n' : ''); options.onLimit?.() }
      if (text !== entry.text) { entry.text = text; options.onText(entry.key, text) }
    }
    editor.addEventListener('input', () => { capture(); if (!composing) schedule(true) })
    editor.addEventListener('focus', () => schedule(true))
    editor.addEventListener('keyup', () => schedule(true))
  }
  for (const entry of entries) entry.images.forEach((src, index) => {
    const photo = document.createElement('figure'); photo.className = 'diary-photo diary-flow-photo'; photo.dataset.photoKey = entry.key; photo.dataset.photoIndex = String(index)
    const open = document.createElement('button'); open.type = 'button'; open.className = 'diary-photo-open'; open.setAttribute('aria-label','放大日记照片')
    open.setAttribute('aria-description','长按照片可显示删除按钮；键盘可按 Shift+F10')
    const image = document.createElement('img'); image.src = src; image.alt = '日记照片'; image.draggable = false
    const date = document.createElement('small'); date.textContent = options.day.replaceAll('-', ' . ')
    open.append(image, date)
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'diary-photo-remove'; remove.textContent = '×'; remove.hidden = true; remove.setAttribute('aria-label','删除这张照片')
    const slot = document.createElement('div'); slot.className = 'diary-photo-slot'
    photo.append(open, remove); slot.append(photo); track.append(slot)
    let timer = 0, x = 0, y = 0, suppressUntil = 0
    function cancel() { clearTimeout(timer); timer = 0 }
    function reveal() {
      cancel(); disarm(); armedPhoto = photo; photo.classList.add('diary-photo-armed'); remove.hidden = false; suppressUntil = Date.now() + 800
    }
    open.addEventListener('pointerdown', event => { if (event.button !== 0) return; x = event.clientX; y = event.clientY; cancel(); timer = window.setTimeout(reveal, 500) })
    open.addEventListener('pointermove', event => { if (Math.hypot(event.clientX-x,event.clientY-y)>9) cancel() })
    for (const type of ['pointerup','pointercancel','pointerleave','lostpointercapture']) open.addEventListener(type,cancel)
    open.addEventListener('contextmenu', event => { event.preventDefault(); reveal() })
    open.addEventListener('keydown', event => { if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { event.preventDefault(); reveal(); remove.focus({preventScroll:true}) } })
    open.addEventListener('click', event => { event.stopPropagation(); if (Date.now() < suppressUntil) { event.preventDefault(); return }; disarm(); options.onPhotoOpen(src) })
    remove.addEventListener('click', event => { event.stopPropagation(); cancel(); disarm(); options.onPhotoRemove(entry.key,index) })
    cleanups.push(cancel)
  })
  function disarm() {
    if (!armedPhoto) return
    armedPhoto.classList.remove('diary-photo-armed'); const button = armedPhoto.querySelector<HTMLButtonElement>('.diary-photo-remove'); if (button) button.hidden = true; armedPhoto = null
  }
  function outside(event: Event) { if (armedPhoto && !event.composedPath().includes(armedPhoto)) disarm() }
  function selectionChanged() { if (selectedEditor()) schedule(true); else hidePen() }
  function key(event: KeyboardEvent) { if (event.key === 'Escape') disarm() }
  function scroll() { if (viewport.scrollTop) viewport.scrollTop = 0; schedule(!!selectedEditor()) }
  function fonts() { schedule(!!selectedEditor()) }
  function wheel(event: WheelEvent) { if (!event.ctrlKey) event.preventDefault() }
  viewport.addEventListener('click', event => { if (event.target === viewport || event.target === track) focusEnd() })
  viewport.addEventListener('scroll', scroll); viewport.addEventListener('wheel', wheel, {passive:false})
  document.addEventListener('pointerdown',outside); document.addEventListener('selectionchange',selectionChanged); document.addEventListener('focusin',selectionChanged); document.addEventListener('keydown',key)
  document.fonts.addEventListener('loadingdone',fonts)
  const resize = new ResizeObserver(() => schedule(!!selectedEditor())); resize.observe(viewport)
  function dispose() {
    if (disposed) return
    disposed = true; cancelAnimationFrame(frame); resize.disconnect(); cleanups.forEach(fn=>fn()); hidePen()
    viewport.removeEventListener('scroll',scroll); viewport.removeEventListener('wheel',wheel)
    document.removeEventListener('pointerdown',outside); document.removeEventListener('selectionchange',selectionChanged); document.removeEventListener('focusin',selectionChanged); document.removeEventListener('keydown',key); document.fonts.removeEventListener('loadingdone',fonts)
  }
  reflow(); void document.fonts.ready.then(()=>{if(!disposed)schedule()})
  return {
    dispose, focusEnd, refresh: () => schedule(),
    get page() { return current }, get total() { return total },
    setPage(index: number) { disarm(); current = Math.max(0,Math.min(total-1,index)); viewport.scrollLeft=current*stride; report(); hidePen() }
  }
}
