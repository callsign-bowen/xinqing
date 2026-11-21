import { createWindowViewport, type AmbientSceneKind, type WindowViewport } from './web/ambientWindowViewport'

const host = document.querySelector<HTMLElement>('#scene')!
const requested = new URLSearchParams(location.search).get('scene')
const kinds = ['forest','ocean','window','lunar','bedroom']
const kind = kinds.includes(requested || '') ? requested as AmbientSceneKind : 'lunar'
const lifetime = new AbortController()
let viewport: WindowViewport | undefined
let active = false
const send = (type: string, detail: Record<string, unknown> = {}) => parent.postMessage({ type: `xinqing-3d:${type}`, ...detail }, location.origin)
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'xinqing-3d:command') return
  const { command, value } = event.data
  if (command === 'active') { active = value === true; if (active) viewport?.resume(); else viewport?.pause() }
  if (command === 'reset') viewport?.resetView()
  if (command === 'greet') viewport?.greet()
  if (command === 'reply') viewport?.reactToReply()
  if (command === 'dispose') { lifetime.abort(); viewport?.dispose() }
})
host.addEventListener('ambient-viewport-error', () => send('error'))
host.addEventListener('ambient-character-activate', () => send('activate'))
host.addEventListener('ambient-kitten-anchor', event => {
  const point = (event as CustomEvent<{ x: number; y: number; visible: boolean }>).detail
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return
  send('anchor', { x: point.x / Math.max(1, host.clientWidth), y: point.y / Math.max(1, host.clientHeight), visible: point.visible === true })
})
document.addEventListener('keydown', event => { if (event.key === 'Escape') send('close') })
window.addEventListener('pagehide', () => { lifetime.abort(); viewport?.dispose() }, { once: true })
void createWindowViewport(host, host, kind, lifetime.signal).then(result => {
  if (lifetime.signal.aborted) { result.dispose(); return }
  viewport = result
  if (active) result.resume(); else result.pause()
  send('ready')
}).catch(() => { if (!lifetime.signal.aborted) send('error') })
