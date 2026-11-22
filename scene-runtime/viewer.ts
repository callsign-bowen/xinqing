import { createWindowViewport, type AmbientSceneKind, type WindowViewport } from './web/ambientWindowViewport'
import { createScreenTheater } from './web/screenTheater'
import type { TheaterEpisode } from '../web/features/theater/stage'

const host = document.querySelector<HTMLElement>('#scene')!
const requested = new URLSearchParams(location.search).get('scene')
const kinds = ['forest','ocean','window','lunar','bedroom']
const kind = kinds.includes(requested || '') ? requested as AmbientSceneKind : 'lunar'
const lifetime = new AbortController()
let viewport: WindowViewport | undefined
let active = false
const send = (type: string, detail: Record<string, unknown> = {}) => parent.postMessage({ type: `xinqing-3d:${type}`, ...detail }, location.origin)
// 点场景里的电视等物件：镜头飞过去，在屏幕上播放这段对话的演绎。演绎内容由外层页面送进来。
const screenTheater = createScreenTheater(host, { onLeave: () => viewport?.leaveScreen?.() })
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'xinqing-3d:command') return
  const { command, value } = event.data
  if (command === 'active') { active = value === true; if (active) viewport?.resume(); else { viewport?.pause(); screenTheater.pause() } }
  if (command === 'theater' && screenTheater.isOpen()) {
    const payload = value as { episodes?: TheaterEpisode[]; status?: string } | undefined
    screenTheater.setEpisodes(Array.isArray(payload?.episodes) ? payload.episodes : [], typeof payload?.status === 'string' ? payload.status : '')
  }
  if (command === 'leave-screen') viewport?.leaveScreen?.()
  if (command === 'chat' && (value === 'idle' || value === 'listen' || value === 'think' || value === 'talk')) viewport?.setChatMood?.(value)
  if (command === 'reset') viewport?.resetView()
  if (command === 'greet') viewport?.greet()
  if (command === 'reply') viewport?.reactToReply()
  if (command === 'dispose') { lifetime.abort(); viewport?.dispose() }
})
host.addEventListener('ambient-viewport-error', () => send('error'))
host.addEventListener('ambient-screens', event => send('screens', { labels: (event as CustomEvent<{ labels: string[] }>).detail.labels }))
host.addEventListener('ambient-screen-watch', event => {
  const { label, rect } = (event as CustomEvent).detail
  screenTheater.open(rect, label)
  send('screen', { state: 'watching', label })
})
host.addEventListener('ambient-screen-rect', event => screenTheater.setRect((event as CustomEvent).detail.rect))
host.addEventListener('ambient-screen-leave', () => { screenTheater.close(); send('screen', { state: 'idle' }) })
host.addEventListener('ambient-character-activate', () => send('activate'))
host.addEventListener('ambient-kitten-anchor', event => {
  const point = (event as CustomEvent<{ x: number; y: number; visible: boolean }>).detail
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return
  send('anchor', { x: point.x / Math.max(1, host.clientWidth), y: point.y / Math.max(1, host.clientHeight), visible: point.visible === true })
})
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return
  // 正在看电视时，Esc 先回到原来的视角，再按一次才关闭场景。
  if (screenTheater.isOpen()) viewport?.leaveScreen?.(); else send('close')
})
window.addEventListener('pagehide', () => { lifetime.abort(); viewport?.dispose() }, { once: true })
void createWindowViewport(host, host, kind, lifetime.signal).then(result => {
  if (lifetime.signal.aborted) { result.dispose(); return }
  viewport = result
  if (active) result.resume(); else result.pause()
  send('ready')
}).catch(() => { if (!lifetime.signal.aborted) send('error') })
