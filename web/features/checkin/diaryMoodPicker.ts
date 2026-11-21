import { DIARY_MOODS } from './diaryMood.mjs'

interface Mood { id?: string | number; mascotId?: string; emotion: string }
interface Options {
  fallbackMascotId: string
  stickerFor: (mood: Mood) => string
  onSelect: (emotion: string) => boolean
}
const listeners = new WeakMap<HTMLElement, AbortController>()

export function renderDiaryMoodPicker(parent: HTMLElement, mood: Mood, options: Options) {
  const key = [mood.id ?? 'draft', mood.mascotId ?? '', mood.emotion, options.fallbackMascotId].join(':')
  if (parent.dataset.moodPickerKey === key) return
  parent.dataset.moodPickerKey = key
  listeners.get(parent)?.abort()
  const events = new AbortController(); listeners.set(parent, events)
  parent.replaceChildren(); parent.hidden = false; parent.classList.add('diary-mood-control')
  const trigger = document.createElement('button')
  trigger.type = 'button'; trigger.className = 'diary-mood-trigger'; trigger.textContent = '记录心情'
  trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'diary-mood-choices')
  const panel = document.createElement('div'); panel.id = 'diary-mood-choices'; panel.className = 'diary-mood-choices'; panel.hidden = true
  panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', '选择心情')
  const mascotId = mood.mascotId || options.fallbackMascotId
  for (const emotion of DIARY_MOODS) {
    const choice = document.createElement('button'); choice.type = 'button'; choice.className = 'diary-mood-choice'
    choice.setAttribute('aria-pressed', String(emotion === mood.emotion)); choice.setAttribute('aria-label', emotion)
    const face = document.createElement('span'); face.className = 'diary-mood-choice-face'; face.setAttribute('aria-hidden', 'true')
    face.innerHTML = options.stickerFor({ emotion, mascotId })
    const label = document.createElement('span'); label.textContent = emotion; choice.append(face, label)
    choice.addEventListener('click', () => {
      if (!options.onSelect(emotion)) return
      close(); parent.querySelector<HTMLButtonElement>('.diary-mood-trigger')?.focus({ preventScroll: true })
    })
    panel.append(choice)
  }
  const markup = mood.mascotId ? options.stickerFor(mood) : ''
  parent.append(trigger)
  if (markup) {
    const sticker = document.createElement('span'); sticker.className = 'diary-mood-sticker'
    sticker.setAttribute('role', 'img'); sticker.setAttribute('aria-label', '记录当时的陪伴者：' + mood.emotion)
    sticker.innerHTML = markup; parent.append(sticker)
  }
  parent.append(panel)
  function close() { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false') }
  trigger.addEventListener('click', () => {
    panel.hidden = !panel.hidden; trigger.setAttribute('aria-expanded', String(!panel.hidden))
  })
  parent.closest('.diary-page')?.addEventListener('click', event => { if (!parent.contains(event.target as Node)) close() }, { signal: events.signal })
  parent.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { event.stopPropagation(); close(); trigger.focus() }
  }, { signal: events.signal })
}
