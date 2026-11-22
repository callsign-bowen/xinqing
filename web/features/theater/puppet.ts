/**
 * 提线木偶：一个人物 = 一个 .theater-puppet 容器，里面是 SVG（或正式素材图片）。
 * 部件分组（data-part）供 CSS 动作动画使用；表情通过 data-mood 切换眉毛和嘴。
 */
import { assetsOf, lookOf, type PuppetPart } from './cast'

const HAIR: Record<string, string> = {
  short: 'M32 33 Q33 8 60 8 Q87 8 88 33 Q80 20 60 20 Q40 20 32 33 Z',
  long: 'M30 38 Q29 6 60 6 Q91 6 90 38 L92 70 Q86 75 81 66 L82 31 Q72 19 60 19 Q48 19 38 31 L39 66 Q34 75 28 70 Z',
  bun: 'M32 33 Q33 10 60 10 Q87 10 88 33 Q80 21 60 21 Q40 21 32 33 Z M60 -1 a10 9 0 1 0 0.1 0 Z',
  spiky: 'M32 32 L35 14 L44 19 L49 6 L58 16 L66 4 L72 16 L82 10 L87 28 Q75 20 60 20 Q44 20 32 32 Z',
  bald: ''
}

export const MOOD_FACE: Record<string, { brows: string; mouth: string }> = {
  calm: { brows: 'M45 30 L54 30 M66 30 L75 30', mouth: 'M53 51 Q60 55 67 51' },
  angry: { brows: 'M44 27 L55 32 M65 32 L76 27', mouth: 'M52 54 Q60 47 68 54' },
  sad: { brows: 'M45 31 L54 27 M66 27 L75 31', mouth: 'M53 54 Q60 49 67 54' },
  hurt: { brows: 'M45 31 L54 28 M66 28 L75 31', mouth: 'M54 53 Q60 50 66 53' },
  anxious: { brows: 'M45 29 Q49 26 54 28 M66 28 Q71 26 75 29', mouth: 'M52 52 Q56 49 60 52 Q64 55 68 52' },
  cold: { brows: 'M45 31 L55 31 M65 31 L75 31', mouth: 'M54 52 L66 52' },
  surprised: { brows: 'M45 25 Q49 22 54 25 M66 25 Q71 22 75 25', mouth: 'M60 47 a4 5 0 1 0 0.1 0 Z' }
}

const ORIGIN: Record<PuppetPart, string> = {
  head: '60px 64px', torso: '60px 150px', armL: '38px 74px', armR: '82px 74px', legL: '48px 150px', legR: '72px 150px'
}

function partImage(src: string): string {
  return `<image href="${src}" x="0" y="0" width="120" height="250" preserveAspectRatio="xMidYMid meet"/>`
}

function svgPuppet(role: string): string {
  const look = lookOf(role)
  const parts = assetsOf(role)?.parts || {}
  const face = MOOD_FACE.calm
  const group = (part: PuppetPart, body: string) =>
    `<g data-part="${part}" style="transform-origin:${ORIGIN[part]}">${parts[part] ? partImage(parts[part]!) : body}</g>`
  const arm = (x: number, hand: number) =>
    `<rect x="${x}" y="70" width="12" height="62" rx="6" fill="${look.cloth}" stroke="#0003"/><circle cx="${hand}" cy="138" r="7" fill="#f2d3b8" stroke="#0002"/><circle cx="${x + 6}" cy="76" r="3" fill="#0002"/>`
  const leg = (x: number) =>
    `<rect x="${x}" y="146" width="13" height="70" rx="6" fill="${look.lower}" stroke="#0003"/><ellipse cx="${x + 6}" cy="221" rx="10" ry="5" fill="#3a3230"/><circle cx="${x + 6}" cy="182" r="2.6" fill="#0003"/>`
  const head = `
    <rect x="54" y="60" width="12" height="10" rx="3" fill="#e8c6a9"/>
    <circle cx="60" cy="38" r="27" fill="#f2d3b8" stroke="#0002"/>
    ${look.hairStyle !== 'bald' ? `<path d="${HAIR[look.hairStyle]}" fill="${look.hair}"/>` : ''}
    <circle cx="35" cy="42" r="4" fill="#ecc5a6"/><circle cx="85" cy="42" r="4" fill="#ecc5a6"/>
    <g class="puppet-eyes"><circle cx="50" cy="38" r="2.8" fill="#2a2422"/><circle cx="70" cy="38" r="2.8" fill="#2a2422"/></g>
    ${look.glasses ? '<g fill="none" stroke="#3a3230" stroke-width="1.6"><circle cx="50" cy="38" r="7"/><circle cx="70" cy="38" r="7"/><path d="M57 38 L63 38"/></g>' : ''}
    <path class="puppet-brows" d="${face.brows}" stroke="#3a3230" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <path class="puppet-mouth" d="${face.mouth}" stroke="#8a4a42" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <g class="puppet-cheeks"><ellipse cx="44" cy="48" rx="5" ry="3" fill="#e88"/><ellipse cx="76" cy="48" rx="5" ry="3" fill="#e88"/></g>
    <g class="puppet-tears"><path d="M48 44 q-2 6 0 8 q2 -2 0 -8 Z" fill="#7cc0e8"/><path d="M72 44 q-2 6 0 8 q2 -2 0 -8 Z" fill="#7cc0e8"/></g>`
  const torso = `
    <path d="M36 68 Q60 62 84 68 L90 152 Q60 158 30 152 Z" fill="${look.cloth}" stroke="#0003"/>
    ${look.tie ? '<path d="M60 70 L56 78 L60 118 L64 78 Z" fill="#a33"/>' : ''}
    <path d="M44 100 Q60 104 76 100" stroke="#0001" stroke-width="2" fill="none"/>`
  return `<svg class="puppet-svg" viewBox="0 -12 120 262" aria-hidden="true">
    <g class="puppet-flip"><g class="puppet-lean">
      ${group('legL', leg(42))}${group('legR', leg(65))}
      ${group('torso', torso)}
      ${group('head', head)}
      ${group('armL', arm(26, 32))}
      ${group('armR', arm(82, 88))}
    </g></g>
  </svg>`
}

export function createPuppet(member: { id: string; name: string; role: string }): HTMLElement {
  const root = document.createElement('div')
  root.className = 'theater-puppet'
  root.dataset.actor = member.id
  root.dataset.role = member.role
  root.dataset.mood = 'calm'
  const full = assetsOf(member.role)?.full
  root.innerHTML = `
    <div class="puppet-control" aria-hidden="true"><span></span></div>
    <div class="puppet-strings" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="puppet-body">${full ? `<img class="puppet-full" src="${full}" alt="">` : svgPuppet(member.role)}</div>
    <span class="puppet-name">${escapeHtml(member.name)}</span>`
  return root
}

export function setPuppetMood(puppet: HTMLElement, mood: string): void {
  const face = MOOD_FACE[mood] || MOOD_FACE.calm
  puppet.dataset.mood = MOOD_FACE[mood] ? mood : 'calm'
  puppet.querySelector('.puppet-brows')?.setAttribute('d', face.brows)
  puppet.querySelector('.puppet-mouth')?.setAttribute('d', face.mouth)
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}
