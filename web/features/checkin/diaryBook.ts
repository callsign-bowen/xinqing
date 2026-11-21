import { diaryNavigation } from './diaryPages.mjs'
import { partsFromDay } from './records.mjs'
import { createDiaryDatePicker } from './diaryDatePicker'
import './diaryBook.css'

function node(tag: string, cls = '', text = ''): HTMLElement {
  const element = document.createElement(tag); element.className = cls; element.textContent = text; return element
}
function action(text: string, act: string, day?: string) {
  const button = node('button','',text) as HTMLButtonElement; button.type = 'button'; button.dataset.act = act
  if(day) button.dataset.day = day
  return button
}
export function renderDiaryCover(parent: HTMLElement) {
  const view = node('div', 'diary-closed-view')
  const cover = action('', 'diary-open-book'); cover.className = 'diary-cover-button'
  cover.setAttribute('aria-label', '打开日记本封面'); cover.setAttribute('aria-expanded', 'false')
  const image = document.createElement('img'); image.src = new URL('../../assets/diary/tissue-cover-v1.png', import.meta.url).href
  image.alt = '手绘封面：笑脸纸巾盒、蓝色雨滴，Crying is okay，I’m here'; image.className = 'diary-cover-art'; image.draggable = false
  cover.append(image)
  view.append(cover, node('p', 'diary-cover-caption', '我的日记本'), node('p', 'diary-cover-hint', '轻轻点一下，翻开今天。'))
  parent.append(view)
}
interface Entry { id: string | number; day: string; emotion: string; mascotId?: string; text: string; images: string[] }
interface DiaryOptions { weatherControl?: HTMLElement; stickerFor?: (record: Pick<Entry, 'mascotId' | 'emotion'>) => string }
export function renderDiaryStickers(parent: HTMLElement, entries: Array<Pick<Entry, 'mascotId' | 'emotion'>>, stickerFor: DiaryOptions['stickerFor']) {
  const fingerprint = entries.filter(record => record.mascotId).map(record => record.mascotId + ':' + record.emotion).join('|')
  if (parent.dataset.stickerKey === fingerprint) return
  parent.dataset.stickerKey = fingerprint
  parent.replaceChildren()
  const seen = new Set<string>()
  for (const record of entries) {
    if (!record.mascotId) continue
    const key = record.mascotId + ':' + record.emotion
    if (seen.has(key)) continue
    const markup = stickerFor?.(record)
    if (!markup) continue
    const sticker = node('span', 'diary-mood-sticker')
    sticker.setAttribute('role', 'img'); sticker.setAttribute('aria-label', '记录当时的陪伴者：' + record.emotion)
    // Only the mascot service's bundled, trusted assets are passed here.
    sticker.innerHTML = markup; parent.append(sticker); seen.add(key)
  }
  parent.hidden = !parent.childElementCount
}
function icon(name: 'plus' | 'camera' | 'pen') {
  const mark = node('span', 'diary-tool-icon'); mark.setAttribute('aria-hidden', 'true')
  const shapes = { plus: '<path d="M12 5v14M5 12h14"/>', camera: '<path d="M4 7h4l2-3h4l2 3h4v13H4Z"/><circle cx="12" cy="13" r="4"/>', pen: '<path d="m5 19 1-5L16 4l4 4L10 18Z"/><path d="m14 6 4 4M5 19l5-1"/>' }
  mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+shapes[name]+'</svg>'
  return mark
}
export function showDiaryWriter(parent: HTMLElement, focus = true) {
  const editable = parent.querySelector<HTMLElement>('.diary-inline-editor[data-key="draft"]')
  if (editable) {
    if (focus) {
      editable.focus({preventScroll:true})
      const range = document.createRange(); range.selectNodeContents(editable); range.collapse(false)
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
    }
    return
  }
  const compose = parent.querySelector<HTMLElement>('.diary-compose')
  if (!compose) return
  compose.hidden = false
  const input = compose.querySelector<HTMLTextAreaElement>('textarea')
  if (focus && input) { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length) }
}
export function renderDiaryBook(parent: HTMLElement, day: string, records: Entry[], today: string, draftDays: string[] = [], options: DiaryOptions = {}) {
  const parts = partsFromDay(day)!, navigation = diaryNavigation([...records,...draftDays.map(day=>({day}))],day,today)
  const entries = records.filter(record=>record.day===day).sort((a,b)=>Number(a.id)-Number(b.id))
  const toolbar = node('div','diary-toolbar')
  const topRow = node('div', 'diary-top-row')
  const close = action('合上', 'diary-close-book'); close.className = 'diary-close-book'; close.setAttribute('aria-label', '合上本子')
  const datePicker = createDiaryDatePicker(day, today, [...records.map(record => record.day), ...draftDays])
  const metadata = node('div', 'diary-metadata'), subline = node('div', 'diary-meta-subline')
  subline.append(node('span','diary-meta-weekday',parts.weekday))
  if (options.weatherControl) subline.append(options.weatherControl)
  metadata.append(subline,datePicker.root)
  topRow.append(close, metadata)
  const saveRow = node('div', 'diary-save-row'), save = action('保存', 'save-day')
  const status = node('span', 'diary-draft-status'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite')
  save.className = 'journal-save diary-header-save'; save.disabled = true; save.setAttribute('aria-label', '保存日记')
  saveRow.append(status,save); toolbar.append(topRow, saveRow)
  const spread=node('div','diary-spread diary-sheet'); spread.setAttribute('aria-label',parts.date+'的日记')
  spread.addEventListener('click', event => { if (!event.composedPath().includes(datePicker.root)) datePicker.close() })
  const page=node('section','diary-page')
  const stickers = node('div', 'diary-mood-stickers'); stickers.setAttribute('aria-label', '这一天的心情贴图')
  renderDiaryStickers(stickers, entries, options.stickerFor)
  const viewport = node('div','diary-flow-window'); viewport.setAttribute('aria-label','分页日记纸面')
  page.append(viewport)
  spread.append(page)
  const frame = node('div','diary-paper-frame'); frame.setAttribute('aria-hidden','true'); spread.append(frame)
  const turn=node('nav','diary-turn');turn.setAttribute('aria-label','日记翻页')
  const previous=action('← 上一页','diary-sheet'),next=action('下一页 →','diary-sheet')
  previous.dataset.direction='previous'; next.dataset.direction='next'
  previous.setAttribute('aria-label','上一页'); next.setAttribute('aria-label','下一页')
  const addControl = node('div', 'diary-add-control'), fab = document.createElement('button')
  fab.type='button'; fab.className='diary-fab'; fab.setAttribute('aria-label','添加日记内容'); fab.setAttribute('aria-expanded','false'); fab.append(icon('plus'))
  const menu = node('div', 'diary-add-menu'); menu.hidden = true; menu.id = 'diary-add-menu-'+day; menu.setAttribute('role','group'); menu.setAttribute('aria-label','选择添加内容'); fab.setAttribute('aria-controls',menu.id)
  const photo = action('', 'diary-photo'); photo.setAttribute('aria-label','上传照片'); photo.append(icon('camera'),node('span','','照片'))
  const write = action('', 'diary-write'); write.setAttribute('aria-label','继续写日记'); write.append(icon('pen'),node('span','','续写')); menu.append(photo,write)
  function closeMenu(focus = false) { menu.hidden = true; fab.setAttribute('aria-expanded','false'); if (focus) fab.focus() }
  fab.addEventListener('click', () => { menu.hidden = !menu.hidden; fab.setAttribute('aria-expanded',String(!menu.hidden)) })
  menu.addEventListener('click', event => { if ((event.target as Element).closest('button')) closeMenu() })
  spread.addEventListener('click', event => { if (!addControl.contains(event.target as Node)) closeMenu() })
  spread.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); event.stopPropagation(); closeMenu(true) } })
  const count = node('small','diary-page-count','1 / 1')
  addControl.append(menu,fab,count)
  turn.append(previous,addControl,next)
  spread.prepend(toolbar); spread.append(turn); parent.append(spread)
  return {viewport, stickers, previous, next, count, save, navigation}
}
