import type { DialogueTurn } from './dialogue'
import { practiceById, type PracticeLayout } from './practice.ts'

export type CharacterExpression = 'neutral' | 'concerned' | 'softened'
export interface ScenarioVisual {
  scenarioId: string
  setting: string
  background: string | null
  layout: PracticeLayout
  character: {
    id: string
    name: string
    alt: string
    expressions: Partial<Record<CharacterExpression, string>> & { neutral: string }
  }
}

export function visualFor(scenarioId: string): ScenarioVisual | null {
  const practice=practiceById(scenarioId)
  return practice ? {scenarioId,setting:practice.presentation.setting,background:practice.presentation.background,
    layout:practice.presentation.layout,character:{id:practice.character.id,name:practice.character.name,
      alt:'临时人物立绘占位，当前角色以名称为准：'+practice.character.name,
      expressions:{neutral:practice.presentation.portrait}}} : null
}

export function portraitFor(visual: ScenarioVisual, expression: CharacterExpression = 'neutral'): string {
  return visual.character.expressions[expression] || visual.character.expressions.neutral
}

// A display projection only. The formal transcript stays complete and unchanged.
export function latestCounterpartLine(messages: readonly DialogueTurn[]): { text: string; index: number } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') return { text: messages[index].text, index }
  }
  return null
}

export function createCharacterStage(visual: ScenarioVisual, messages: readonly DialogueTurn[], options: { busy: boolean; animate: boolean; expression?: CharacterExpression }): HTMLElement {
  const stage = document.createElement('section')
  stage.className = 'scenario-character-stage'
  stage.dataset.layout = visual.layout
  stage.setAttribute('aria-label', visual.setting)
  if (visual.background) stage.style.backgroundImage = `url("${visual.background}")`

  const figure = document.createElement('figure')
  figure.className = 'scenario-character'
  const portrait = document.createElement('img')
  portrait.className = 'scenario-portrait'
  portrait.src = portraitFor(visual, options.expression)
  portrait.alt = visual.character.alt
  portrait.width = 1024
  portrait.height = 1536
  portrait.draggable = false
  const caption = document.createElement('figcaption')
  caption.textContent = visual.character.name + ' · 临时立绘'
  figure.append(portrait, caption)
  portrait.addEventListener('error', () => {
    portrait.hidden = true
    figure.classList.add('is-missing')
    caption.textContent = visual.character.name + ' · 立绘暂时未加载'
  }, { once: true })

  const speech = document.createElement('div')
  speech.className = 'scenario-character-speech' + (options.animate ? ' is-new' : '')
  speech.setAttribute('aria-live', 'polite')
  speech.setAttribute('aria-atomic', 'true')
  const name = document.createElement('span')
  name.className = 'scenario-speech-name'
  name.textContent = visual.character.name
  const text = document.createElement('p')
  text.className = 'scenario-current-line'
  text.textContent = latestCounterpartLine(messages)?.text || '正在准备对方的开场…'
  speech.append(name, text)
  if (options.busy) {
    const waiting = document.createElement('span')
    waiting.className = 'scenario-thinking'
    waiting.textContent = '正在回应…'
    speech.append(waiting)
  }
  stage.append(figure, speech)
  return stage
}

export function createTranscriptViewer(messages: readonly DialogueTurn[], counterpart: string): HTMLElement {
  const viewer = document.createElement('details')
  viewer.className = 'scenario-transcript-viewer'
  const summary = document.createElement('summary')
  summary.textContent = '查看本次对话'
  const transcript = document.createElement('div')
  transcript.className = 'scenario-transcript'
  transcript.setAttribute('role', 'region')
  transcript.setAttribute('aria-label', '本次完整对话记录')
  for (const message of messages) {
    const paragraph = document.createElement('p')
    const label = document.createElement('strong')
    label.textContent = (message.role === 'user' ? '你' : counterpart) + '：'
    paragraph.append(label, document.createTextNode(message.text))
    transcript.append(paragraph)
  }
  viewer.append(summary, transcript)
  return viewer
}
