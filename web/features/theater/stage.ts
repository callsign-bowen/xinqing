/**
 * 木偶舞台：只负责“把一出剧演出来”，不管弹窗、按钮和数据从哪里来。
 * 弹窗播放器（AI 页「演绎」）和 3D 场景里的电视屏幕共用它。
 *
 * 第 -1 拍是标题卡，最后一拍之后是“完”卡；每一拍按时间轴快照摆好人物、换表情、放动作、出字幕。
 */
import { buildTimeline, openingPositions } from './timeline.mjs'
import { createPuppet, escapeHtml, setPuppetMood } from './puppet'
import './stage.css'

export interface TheaterBeat { actor: string; action: string; mood: string; line: string; certainty: 'said' | 'gist'; target?: string }
export interface TheaterScript { title: string; setting: string; cast: Array<{ id: string; name: string; role: string }>; beats: TheaterBeat[]; unknown?: string }
export interface TheaterEpisode { id: string; round: number; createdAt: number; script: TheaterScript }

interface Step extends TheaterBeat { index: number; positions: Record<string, number>; facing: Record<string, number>; duration: number }

export const ACTION_LABEL: Record<string, string> = {
  enter: '走上前来', exit: '离开了', speak: '开口', shout: '大声喊', point: '指着对方', cross_arms: '抱起胳膊',
  turn_away: '转过身去', step_forward: '逼近一步', step_back: '往后退了一步', stomp: '重重一跺脚', slump: '垂下了头',
  cry: '哭了', shake_head: '摇头', nod: '点头', sigh: '叹了口气', freeze: '愣在原地', wave_off: '摆摆手', hold_head: '抱住了头'
}

/** 没有演绎时舞台上那张说明卡。电视里也用同一套文字。 */
export function emptyNotice(status: string, where: 'page' | 'scene' = 'page'): { title: string; body: string } {
  if (status) return { title: '正在排演', body: '正在根据刚才的对话排木偶剧，稍等一会儿就能看' }
  return where === 'scene'
    ? { title: '还没有开演', body: '先和这里的伙伴聊聊你和别人之间发生的事，排好以后点电视就能看' }
    : { title: '还没有开演', body: '在 AI 页聊聊你和别人之间发生的事，比如和爸妈吵架。AI 回复后会在后台排成木偶剧，排好就能在这里看' }
}

export interface StageState {
  /** -1 开场，0..total-1 各拍，total 谢幕 */
  index: number
  total: number
  playing: boolean
  episode: TheaterEpisode | null
}

export interface TheaterStage {
  element: HTMLElement
  load(episode: TheaterEpisode, autoplay?: boolean): void
  /** 没有剧可演：幕布合着，显示一张说明卡。 */
  empty(title: string, body: string): void
  show(index: number): void
  next(): void
  prev(): void
  restart(): void
  toggle(): void
  pause(): void
  state(): StageState
  clear(): void
}

export function createTheaterStage(options: {
  /** below：字幕卡在舞台下面（弹窗）；inside：字幕压在画面底部（电视） */
  caption?: 'below' | 'inside'
  /** fill：铺满容器（电视屏幕）；默认按 16:10 自适应宽度 */
  fit?: 'fill'
  onChange?(state: StageState): void
} = {}): TheaterStage {
  const view = document.createElement('div')
  view.className = 'theater-view'
  view.dataset.caption = options.caption || 'below'
  if (options.fit) view.dataset.fit = options.fit
  view.innerHTML = `
    <div class="theater-stage" data-state="closed">
      <div class="theater-wall"></div>
      <div class="theater-sign"></div>
      <div class="theater-spot"></div>
      <div class="theater-floor"></div>
      <div class="theater-cast"></div>
      <div class="theater-curtain theater-curtain-l"></div>
      <div class="theater-curtain theater-curtain-r"></div>
      <div class="theater-valance"></div>
      <div class="theater-intertitle" hidden></div>
    </div>
    <div class="theater-caption" aria-live="polite"><span class="theater-caption-name"></span><p class="theater-caption-line"></p></div>`
  // 字幕压在画面里时，要放进舞台内部才能用舞台的坐标定位。
  const stage = view.querySelector<HTMLElement>('.theater-stage')!
  const caption = view.querySelector<HTMLElement>('.theater-caption')!
  if (options.caption === 'inside') stage.append(caption)
  const $ = (selector: string) => view.querySelector<HTMLElement>(selector)!
  const castLayer = $('.theater-cast')
  const sign = $('.theater-sign')
  const spot = $('.theater-spot')
  const intertitle = $('.theater-intertitle')
  const captionName = $('.theater-caption-name')
  const captionLine = $('.theater-caption-line')

  let current: TheaterEpisode | null = null
  let steps: Step[] = []
  let index = -1
  let playing = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const puppets = new Map<string, HTMLElement>()

  const snapshot = (): StageState => ({ index, total: steps.length, playing, episode: current })
  const notify = () => options.onChange?.(snapshot())
  const nameOf = (id: string) => current?.script.cast.find(member => member.id === id)?.name || ''

  function resetCast() {
    clearTimeout(timer)
    castLayer.innerHTML = ''
    puppets.clear()
  }

  function place(positions: Record<string, number>, facing: Record<string, number>) {
    for (const [id, puppet] of puppets) {
      puppet.style.setProperty('--x', `${positions[id]}%`)
      puppet.dataset.facing = String(facing[id] ?? 1)
      puppet.dataset.offstage = String(positions[id] < -5 || positions[id] > 105)
    }
  }

  /** 每个人截至第 i 拍最后一次出现时的表情。 */
  function moodsUntil(i: number) {
    const moods: Record<string, string> = {}
    for (let k = 0; k <= i && k < steps.length; k++) moods[steps[k].actor] = steps[k].mood
    return moods
  }

  function setCaption(name: string, line: string, gist = false, loud = false) {
    captionName.textContent = name
    captionLine.innerHTML = line ? escapeHtml(line) + (gist ? ' <em>大意</em>' : '') : ''
    caption.dataset.loud = String(loud)
    caption.dataset.empty = String(!name && !line)
  }

  function show(i: number) {
    if (!current) return
    clearTimeout(timer)
    index = Math.max(-1, Math.min(steps.length, i))
    const moods = moodsUntil(index)
    for (const [id, puppet] of puppets) {
      puppet.dataset.act = 'idle'
      puppet.dataset.active = 'false'
      setPuppetMood(puppet, moods[id] || 'calm')
    }
    stage.classList.remove('theater-shake')
    if (index < 0) {
      const opening = openingPositions(current.script)
      place(opening.positions, opening.facing)
      intertitle.hidden = false
      intertitle.innerHTML = `<small>${escapeHtml(current.script.setting)}</small><strong>${escapeHtml(current.script.title)}</strong>`
      setCaption('', '')
      spot.style.opacity = '0'
    } else if (index >= steps.length) {
      const last = steps[steps.length - 1]
      place(last.positions, last.facing)
      intertitle.hidden = false
      intertitle.innerHTML = '<strong>完</strong><small>这是根据你讲的内容排的，可能和当时不完全一样</small>'
      setCaption('', '')
      spot.style.opacity = '0'
    } else {
      const step = steps[index]
      intertitle.hidden = true
      place(step.positions, step.facing)
      const puppet = puppets.get(step.actor)
      if (puppet) {
        void puppet.offsetWidth // 重新触发同名动作的动画
        puppet.dataset.act = step.action
        puppet.dataset.active = 'true'
        spot.style.opacity = '1'
        spot.style.setProperty('--x', `${step.positions[step.actor]}%`)
      }
      if (step.action === 'stomp') { void stage.offsetWidth; stage.classList.add('theater-shake') }
      const name = nameOf(step.actor)
      const target = step.target ? nameOf(step.target) : ''
      if (step.line) setCaption(name, `「${step.line}」`, step.certainty === 'gist', step.action === 'shout')
      else setCaption(name, `（${name}${step.action === 'point' && target ? `指着${target}` : ACTION_LABEL[step.action] || ''}）`)
    }
    if (index >= steps.length) playing = false
    if (playing) timer = setTimeout(() => show(index + 1), index < 0 ? 2400 : steps[index].duration)
    notify()
  }

  const handle: TheaterStage = {
    element: view,
    load(episode, autoplay = true) {
      resetCast()
      current = episode
      steps = buildTimeline(episode.script) as Step[]
      for (const member of episode.script.cast) {
        const puppet = createPuppet(member)
        puppets.set(member.id, puppet)
        castLayer.append(puppet)
      }
      sign.textContent = episode.script.setting
      stage.dataset.state = 'closed'
      requestAnimationFrame(() => requestAnimationFrame(() => { if (current === episode) stage.dataset.state = 'open' }))
      playing = autoplay
      show(-1)
    },
    empty(title, body) {
      resetCast()
      current = null; steps = []; index = -1; playing = false
      sign.textContent = ''
      spot.style.opacity = '0'
      stage.dataset.state = 'closed'
      intertitle.hidden = false
      intertitle.innerHTML = `<strong>${escapeHtml(title)}</strong><small>${escapeHtml(body)}</small>`
      setCaption('', '')
      notify()
    },
    show,
    next() { show(index + 1) },
    prev() { show(index - 1) },
    restart() { playing = true; show(-1) },
    toggle() {
      if (!current) return
      if (index >= steps.length) { handle.restart(); return }
      playing = !playing
      if (playing) show(index); else { clearTimeout(timer); notify() }
    },
    pause() {
      if (!playing) return
      playing = false; clearTimeout(timer); notify()
    },
    state: snapshot,
    clear() {
      resetCast()
      current = null; steps = []; index = -1; playing = false
    }
  }
  return handle
}
