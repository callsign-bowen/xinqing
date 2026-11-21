import { playDiaryPageSound } from './diarySound'

const COVER = new URL('../../assets/diary/tissue-cover-v1.png', import.meta.url).href

function reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches }
function layer(rect: DOMRect) {
  const el = document.createElement('div'); el.className = 'diary-motion-layer'
  Object.assign(el.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' })
  el.setAttribute('aria-hidden', 'true'); el.inert = true
  document.body.append(el)
  return el
}
function snapshot(el: Element) {
  const clone = el.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'))
  clone.querySelectorAll('[data-act]').forEach(n => n.removeAttribute('data-act'))
  clone.querySelectorAll('img').forEach(img => { img.loading = 'eager'; img.decoding = 'sync' })
  const sources = el.querySelectorAll<HTMLElement>('.diary-flow-window')
  clone.querySelectorAll<HTMLElement>('.diary-flow-window').forEach((window,index)=>window.dataset.snapshotScroll=String(sources[index]?.scrollLeft||0))
  return clone
}
function leaf(host: HTMLElement, front: HTMLElement, back: HTMLElement, cover = false) {
  const page = document.createElement('div'); page.className = 'diary-moving-leaf'
  const a = document.createElement('div'); a.className = 'diary-leaf-face' + (cover ? ' diary-cover-front' : '')
  const b = document.createElement('div'); b.className = 'diary-leaf-face diary-leaf-back'
  a.append(front); b.append(back); page.append(a, b); host.append(page)
  return page
}
function artwork() {
  const img = document.createElement('img'); img.src = COVER; img.alt = ''; img.className = 'diary-cover-art'; return img
}
function lining() {
  const el = document.createElement('div'); el.className = 'diary-inside-cover'
  const p = document.createElement('p'); p.textContent = '慢慢写，\n我在这里。'; p.style.whiteSpace = 'pre-line'
  const small = document.createElement('small'); small.textContent = '每一种心情，都可以留下。'
  el.append(p, small); return el
}
async function play(el: HTMLElement, frames: Keyframe[], duration: number) {
  const animation = el.animate(frames, { duration, easing: 'cubic-bezier(.35,0,.2,1)', fill: 'forwards' })
  try { await animation.finished } catch { /* A closed modal or resize can cancel a visual transition. */ }
}

/** The real content is rendered once; the temporary leaf is inert and is always removed. */
export async function openDiary(parent: HTMLElement, render: () => void) {
  const cover = parent.querySelector('.diary-cover-button') as HTMLElement | null
  if (cover) playDiaryPageSound('cover')
  if (!cover || reduced() || !cover.animate) { render(); return }
  const from = cover.getBoundingClientRect()
  render()
  const spread = parent.querySelector('.diary-spread') as HTMLElement | null
  if (!spread) return
  const rect = spread.getBoundingClientRect()
  const host = layer(from), page = leaf(host, artwork(), lining(), true)
  const controls = parent.querySelectorAll<HTMLElement>('.diary-toolbar,.diary-turn,.diary-compose-fold')
  controls.forEach(el => el.style.opacity = '0')
  try {
    await play(host, [{ left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' }, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' }], 260)
    await play(page, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-179.8deg)' }], 820)
    await play(host, [{ opacity: 1 }, { opacity: 0 }], 160)
  } finally { host.remove(); controls.forEach(el => el.style.removeProperty('opacity')) }
}

export async function closeDiary(parent: HTMLElement, render: () => void) {
  const spread = parent.querySelector('.diary-spread') as HTMLElement | null
  if (spread) playDiaryPageSound('cover')
  if (!spread || reduced() || !spread.animate) { render(); return }
  const from = spread.getBoundingClientRect()
  const host = layer(from), page = leaf(host, artwork(), lining(), true)
  const controls = parent.querySelectorAll<HTMLElement>('.diary-toolbar,.diary-turn,.diary-compose-fold')
  controls.forEach(el => el.style.opacity = '0')
  try {
    await play(page, [{ transform: 'rotateY(-179.8deg)' }, { transform: 'rotateY(0deg)' }], 820)
    render()
    const cover = parent.querySelector('.diary-cover-button') as HTMLElement | null
    if (cover) {
      cover.style.visibility = 'hidden'
      const to = cover.getBoundingClientRect()
      await play(host, [{ left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' }, { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px' }], 300)
      cover.style.removeProperty('visibility')
    }
  } finally { host.remove(); controls.forEach(el => el.style.removeProperty('opacity')) }
}

export async function turnDiary(parent: HTMLElement, render: () => void, direction: 'previous' | 'next') {
  const old = parent.querySelector('.diary-spread') as HTMLElement | null
  if (old) playDiaryPageSound()
  if (!old || reduced() || !old.animate) { render(); return }
  const previous = direction === 'previous'
  const front = snapshot(old), scroll = old.querySelector<HTMLElement>('.diary-page')?.scrollTop || 0
  render()
  const spread = parent.querySelector('.diary-spread') as HTMLElement | null
  if (!spread) return
  const host = layer(spread.getBoundingClientRect()), page = leaf(host, front, snapshot(spread))
  host.querySelectorAll<HTMLElement>('[data-snapshot-scroll]').forEach(window=>{window.scrollLeft=Number(window.dataset.snapshotScroll)||0;delete window.dataset.snapshotScroll})
  page.style.transformOrigin = previous ? 'right center' : 'left center'
  const frontContent = front.querySelector<HTMLElement>('.diary-page')
  if (frontContent) frontContent.scrollTop = scroll
  try { await play(page, [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${previous ? 100 : -100}deg)` }], 620) }
  finally { host.remove() }
}

