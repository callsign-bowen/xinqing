// @ts-nocheck
/** 功能构件：checkinPersist。首页记下今天，记录页按日历补记和修改。 */
import type { AppContext } from '../../kernel/context'
import { compressPhoto } from './image'
import { renderDiaryBook, renderDiaryCover, showDiaryWriter } from './diaryBook'
import { renderDiaryMoodPicker } from './diaryMoodPicker'
import { diaryMoodTarget, selectDiaryMood } from './diaryMood.mjs'
import { openDiary, closeDiary, turnDiary } from './diaryMotion'
import { attachPenCaret, followDiaryViewport } from './penCaret'
import { createDiaryWeather } from './diaryWeatherView'
import { createDiaryDraftStore, dayDraftKey, editDraftKey } from './diaryDrafts.mjs'
import { createDiaryFlow } from './diaryFlow'
import { applyDiaryEdits, draftForEntry } from './diaryEdits.mjs'
import { MAX_PHOTOS, imagesFrom, isFutureDay, monthCells, normalizeRecord, partsFromDay, todayKey } from './records.mjs'

const STORAGE_KEY = 'nuo_emotions'
const MOODS = ['平静', '焦虑', '开心', '疲惫']
const DEMO_TEXTS = [
  '今天和朋友一起去了公园散步，阳光很好。',
  '工作有点多，但总算完成了，需要好好休息。',
  '明天有个重要的会议要准备，有点紧张。',
  '一个人在家看书，很安静，享受这种时刻。',
  '收到了喜欢的礼物，好开心！',
  '周一总是很忙，但坚持下来了。',
  '去了趟书店，买了几本新书。',
  '和家人一起吃了顿大餐。'
]

export const checkinPersistFeature = {
  id: 'checkinPersist',
  init(ctx: AppContext) {
    const emotionNote = document.getElementById('emotionNote')
    const photoButton = document.getElementById('recordButton')
    const mainRecordButton = document.getElementById('recordMainButton')
    const historyEntry = document.getElementById('history-entry')
    const historyModal = document.getElementById('history-modal')
    const historyList = historyModal?.querySelector('.history-list')
    const historyTitle = document.getElementById('history-title')
    if (!emotionNote || !photoButton || !mainRecordButton || !historyModal || !historyList || !historyTitle) return

          const emotionIcons = {
            平静: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13" rx="9" ry="8"/><path d="M5 8 L3 3 L9 6"/><path d="M19 8 L21 3 L15 6"/><path d="M8 11Q9.5 9.5 10 11"/><path d="M14 11Q15.5 9.5 16 11"/><path d="M11 15 L13 15 L12 16.5 Z" fill="currentColor" stroke="none"/><path d="M9 17Q12 19 15 17"/></svg>',
            焦虑: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13" rx="9" ry="8"/><path d="M5 8 L3 3 L9 6"/><path d="M19 8 L21 3 L15 6"/><circle cx="9" cy="11" r="3" fill="currentColor" stroke="none" opacity=".15"/><circle cx="15" cy="11" r="3" fill="currentColor" stroke="none" opacity=".15"/><circle cx="9" cy="11" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1.5" fill="currentColor" stroke="none"/><path d="M11 15 L13 15 L12 16.5 Z" fill="currentColor" stroke="none"/><path d="M8 17Q10 15.5 12 17Q14 18.5 16 17"/></svg>',
            开心: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13" rx="9" ry="8"/><path d="M5 8 L3 3 L9 6"/><path d="M19 8 L21 3 L15 6"/><path d="M7 11Q9 9 10 11"/><path d="M14 11Q16 9 17 11"/><path d="M11 15 L13 15 L12 16.5 Z" fill="currentColor" stroke="none"/><path d="M8 15Q12 20 16 15"/></svg>',
            疲惫: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13" rx="9" ry="8"/><path d="M5 8 L3 3 L9 6"/><path d="M19 8 L21 3 L15 6"/><path d="M7 11Q9 11.5 10 11"/><path d="M14 11Q16 11.5 17 11"/><path d="M11 15 L13 15 L12 16.5 Z" fill="currentColor" stroke="none"/><ellipse cx="12" cy="18" rx="2.5" ry="1.5"/></svg>'
    }

    for (const mood of ['失落', '伤心']) emotionIcons[mood] = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 9L3 3L9 6M20 9L21 3L15 6"/><ellipse cx="12" cy="14" rx="9" ry="8"/><path d="M7 11L10 10M14 10L17 11M9 18Q12 15 15 18"/>' + (mood === '伤心' ? '<path d="M6 14Q3 18 6 19Q9 18 6 14Z"/>' : '') + '</svg>'

    let homePreview = document.getElementById('home-photo-preview')
    if (!homePreview) {
      homePreview = document.createElement('div')
      homePreview.id = 'home-photo-preview'
      homePreview.className = 'image-preview'
      emotionNote.parentNode.insertBefore(homePreview, emotionNote)
    }

    const fileInput = document.createElement('input')
    fileInput.id = 'journal-photo-input'
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    fileInput.setAttribute('aria-label', '选择照片')
    fileInput.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;border:0;padding:0;'
    document.body.appendChild(fileInput)

    historyModal.classList.add('diary-modal')
    followDiaryViewport(historyModal)
    const journalExit = historyModal.querySelector('.history-close')
    if (journalExit) { journalExit.textContent = '×'; journalExit.setAttribute('aria-label', '关闭日记本，返回首页'); journalExit.title = '关闭日记本' }
    let records = loadRecords()
    let homeImages = []
    let photoRequest = null
    let writerShown = false
    const diaryWeather = createDiaryWeather()
    let screen = freshMonth()
    let addDraft = blankDraft()
    let editDraft = null
    const dayDrafts = new Map()
    const editDrafts = new Map()
    const draftStore = createDiaryDraftStore()
    const draftsReady = draftStore.ready.then(rows => {
      for (const row of rows) {
        if (row.key.startsWith('day:')) dayDrafts.set(row.day, row)
        else if (row.id !== undefined) editDrafts.set(String(row.id), row)
      }
    })
    const draftNotices = new Map(), draftVersions = new Map()
    let draftTicket = 0
    let bookBusy = false
    let dayFlow = null

    async function reloadDrafts() {
      await draftsReady
      const rows = await draftStore.reload()
      dayDrafts.clear(); editDrafts.clear()
      for (const row of rows) {
        if (row.key.startsWith('day:')) dayDrafts.set(row.day, row)
        else if (row.id !== undefined) editDrafts.set(String(row.id), row)
      }
    }

    function showDraftNotice(message) {
      historyList.querySelectorAll('.diary-draft-status').forEach(el => el.textContent = message)
    }
    function updateDayStatus() {
      if (screen.mode !== 'day') return
      const keys = [...editDrafts.values()].filter(draft => draft.day === screen.day).map(draft => editDraftKey(draft.id))
      if (addDraft.text.trim() || addDraft.images.length || addDraft.moodChosen) keys.push(dayDraftKey(screen.day))
      const messages = keys.map(key => draftNotices.get(key) || '草稿已保留')
      showDraftNotice(messages.find(message => message.startsWith('暂未保留')) || (messages.includes('正在保留…') ? '正在保留…' : keys.length ? '草稿已保留' : ''))
      const save = historyList.querySelector('.diary-header-save')
      if (save) save.disabled = !keys.length
    }
    function currentDraftKey() { return screen.mode === 'edit' ? editDraftKey(editDraft?.id) : dayDraftKey(screen.day) }
    function rememberDraft(draft, day, scope = 'add') {
      if (!draft) return
      if (scope === 'edit') editDrafts.set(String(draft.id), draft)
      else dayDrafts.set(day, draft)
      const key = scope === 'edit' ? editDraftKey(draft.id) : dayDraftKey(day), ticket = ++draftTicket
      draftVersions.set(key, ticket); draftNotices.set(key, '正在保留…')
      if (currentDraftKey() === key) showDraftNotice('正在保留…')
      if (screen.day === day) updateDayStatus()
      void draftStore.write(key, day, draft).then(ok => {
        if (draftVersions.get(key) !== ticket) return
        const message = ok ? '草稿已保留' : '暂未保留，请勿关闭页面'
        draftNotices.set(key, message)
        if (currentDraftKey() === key) showDraftNotice(message)
        if (screen.day === day) updateDayStatus()
      })
    }
    function keepCurrentDraft() {
      const draft = screen.mode === 'edit' ? editDraft : screen.mode === 'day' ? addDraft : null
      if (draft) {
        const before = draft.text, emotion = draft.emotion
        syncDraftFromDom(draft)
        if (draft.text !== before || draft.emotion !== emotion) rememberDraft(draft, screen.day, screen.mode === 'edit' ? 'edit' : 'add')
      }
      void draftStore.flush()
    }
    function visibleRecords() {
      return records.map(record => {
        const draft = editDrafts.get(String(record.id))
        return draft ? { ...record, ...draft, id: record.id, day: record.day, image: draft.images[0] || null } : record
      })
    }
    window.addEventListener('pagehide', keepCurrentDraft)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') keepCurrentDraft() })

    async function bookTransition(run, focusSelector) {
      if (bookBusy) return
      bookBusy = true
      historyList.inert = true
      try { await run() }
      finally {
        bookBusy = false
        historyList.inert = false
        if (historyModal.classList.contains('history-modal-visible')) historyList.querySelector(focusSelector)?.focus({ preventScroll: true })
      }
    }
    new MutationObserver(() => {
      if (historyModal.classList.contains('history-modal-visible')) return
      keepCurrentDraft()
      document.querySelectorAll('.diary-motion-layer').forEach(layer => {
        layer.getAnimations({ subtree: true }).forEach(animation => animation.cancel())
        layer.remove()
      })
    }).observe(historyModal, { attributes: true, attributeFilter: ['class'] })

    function toast(message) {
      const target = document.getElementById('toast')
      if (!target) return
      target.textContent = message
      target.classList.add('show')
      window.clearTimeout(toast.timer)
      toast.timer = window.setTimeout(() => target.classList.remove('show'), 2400)
    }

    function currentEmotion() {
      return document.querySelector('.emotion-tab.active')?.dataset.emotion || '平静'
    }

    function blankDraft() {
      return { text: '', images: [], emotion: currentEmotion() }
    }

    function moodSnapshot() {
      return { mascotId: ctx.services.mascot?.getId(), emotion: currentEmotion() }
    }

    function stickerFor(record) {
      const state = { 平静: 'calm', 焦虑: 'anxious', 开心: 'happy', 疲惫: 'tired' }[record.emotion]
      if (!record.mascotId || !state) return ''
      return ctx.services.mascot?.getEmotionSVG(state, record.mascotId) || ''
    }

    function refreshStickers() {
      const stickers = historyList.querySelector('.diary-mood-stickers')
      if (!stickers) return
      const target = diaryMoodTarget(visibleRecords(), screen.day, addDraft)
      renderDiaryMoodPicker(stickers, target.entry, {
        fallbackMascotId: ctx.services.mascot?.getId() || 'cat', stickerFor,
        onSelect(emotion) {
          syncDraftFromDom(addDraft)
          const next = selectDiaryMood(target.entry, emotion, ctx.services.mascot?.getId() || 'cat')
          if (!next) return false
          if (target.isDraft) {
            Object.assign(addDraft, next, { moodChosen: true })
            rememberDraft(addDraft, screen.day)
            const save = historyList.querySelector('.diary-header-save')
            if (save) save.disabled = false
          } else {
            rememberDraft(next, screen.day, 'edit')
          }
          refreshStickers()
          return true
        }
      })
      dayFlow?.refresh()
    }

    function loadRecords() {
      let saved = []
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
        if (Array.isArray(parsed)) saved = parsed
      } catch { /* 没有记录时保持空白 */ }
      const demo = new Set(DEMO_TEXTS)
      if (saved.length === demo.size && saved.every((row) => demo.has(row && row.text))) saved = []
      const next = saved.map((row) => normalizeRecord(row)).filter(Boolean)
      const raw = JSON.stringify(next)
      if (raw !== JSON.stringify(saved)) {
        try { localStorage.setItem(STORAGE_KEY, raw) } catch { /* 空间不够时先用内存里的记录 */ }
      }
      return next
    }

    function writeRecords(next) {
      const raw = JSON.stringify(next)
      if (raw.length > 3_500_000) {
        toast('照片太大，这条没能保存。可以少留一张。')
        return false
      }
      try {
        localStorage.setItem(STORAGE_KEY, raw)
      } catch {
        toast('手机空间不够，这条没能保存')
        return false
      }
      records = next
      ctx.events.emit('emotion.saved', { id: Date.now() })
      return true
    }

    function recordsOn(day) {
      return records.filter((record) => record.day === day).sort((a, b) => Number(b.id) - Number(a.id))
    }

    function markedDays() {
      return new Set(records.map((record) => record.day))
    }

    function renderThumbs(container, images, scope) {
      container.innerHTML = ''
      images.forEach((src, index) => {
        const item = document.createElement('div')
        item.className = scope === 'home' ? 'image-preview-item' : 'image-preview-item diary-photo diary-draft-photo'
        const image = document.createElement('img')
        image.className = 'image-preview-thumb'
        image.src = src
        image.alt = '记录照片'
        image.dataset.act = 'zoom'
        image.dataset.scope = scope
        image.dataset.index = String(index)
        item.appendChild(image)
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'image-remove'
        remove.dataset.act = 'remove-photo'
        remove.dataset.scope = scope
        remove.dataset.index = String(index)
        remove.setAttribute('aria-label', '删除这张照片')
        remove.textContent = '×'
        item.appendChild(remove)
        container.appendChild(item)
      })
    }

    function renderHomePreview() {
      homePreview.innerHTML = ''
      if (!homeImages.length) return
      renderThumbs(homePreview, homeImages, 'home')
    }

    homePreview.addEventListener('click', (event) => {
      const target = event.target.closest('[data-act]')
      if (!target || !homePreview.contains(target)) return
      if (target.dataset.act === 'zoom') {
        const src = homeImages[Number(target.dataset.index)]
        if (src) openLightbox(src)
        return
      }
      if (target.dataset.act === 'remove-photo') {
        homeImages.splice(Number(target.dataset.index), 1)
        renderHomePreview()
      }
    })

    function openLightbox(src) {
      let lightbox = document.getElementById('image-lightbox')
      if (!lightbox) {
        lightbox = document.createElement('div')
        lightbox.id = 'image-lightbox'
        lightbox.className = 'image-lightbox'
        lightbox.tabIndex = 0
        lightbox.setAttribute('role', 'dialog')
        lightbox.setAttribute('aria-modal', 'true')
        lightbox.setAttribute('aria-label', '照片大图，点击或按 Escape 关闭')
        const image = document.createElement('img')
        image.alt = '放大查看照片'
        lightbox.appendChild(image)
        const close = () => { lightbox.classList.remove('image-lightbox-visible'); lightbox.previousPhotoFocus?.focus() }
        lightbox.addEventListener('click', close)
        lightbox.addEventListener('keydown', event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
          if (event.key === 'Tab') event.preventDefault()
        })
        document.body.appendChild(lightbox)
      }
      lightbox.querySelector('img').src = src
      lightbox.previousPhotoFocus = document.activeElement
      lightbox.classList.add('image-lightbox-visible')
      lightbox.focus()
    }

    function photosOf(scope) {
      if (scope === 'home') return homeImages
      if (scope === 'edit') return editDraft ? editDraft.images : []
      return addDraft.images
    }

    function syncDraftFromDom(draft) {
      const text = historyList.querySelector('.journal-text')
      const mood = historyList.querySelector('.journal-mood.journal-mood-active')
      if (!draft) return
      if (text) draft.text = text.value
      if (screen.mode === 'edit' && mood && mood.dataset.mood !== draft.emotion) { draft.emotion = mood.dataset.mood || draft.emotion; delete draft.moodPosition }
    }

    function appendMoods(parent, draft) {
      const row = document.createElement('div')
      row.className = 'journal-moods'
      MOODS.forEach((mood) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `journal-mood${draft.emotion === mood ? ' journal-mood-active' : ''}`
        button.dataset.act = 'mood'
        button.dataset.mood = mood
        button.textContent = mood
        row.appendChild(button)
      })
      parent.appendChild(row)
    }

    function dayPhotoCount(day, exceptId) {
      return visibleRecords().filter((record) => record.day === day && String(record.id) !== String(exceptId || '')).reduce((sum, record) => sum + record.images.length, 0)
    }

    function photoRoom(day, exceptId) {
      return Math.max(0, MAX_PHOTOS - dayPhotoCount(day, exceptId))
    }

    function roomFor(target) {
      if (target === 'home') return photoRoom(todayKey())
      if (target === 'edit') return photoRoom(screen.day, editDraft && editDraft.id)
      return photoRoom(screen.day)
    }

    function choosePhoto(scope) {
      const draft = scope === 'edit' ? editDraft : scope === 'add' ? addDraft : null
      if (draft) syncDraftFromDom(draft)
      const day = scope === 'home' ? todayKey() : screen.day
      const bucket = scope === 'home' ? homeImages : draft?.images
      if (!bucket || bucket.length >= photoRoom(day, scope === 'edit' ? draft.id : '')) { toast('一天最多五张照片'); return }
      if (scope === 'add') dayDrafts.set(day, draft)
      photoRequest = { scope, day, draft, bucket }
      if (scope === 'add' && !draft.mascotId) photoRequest.snapshot = moodSnapshot()
      fileInput.click()
    }

    function appendComposer(parent, draft, scope, saveLabel, photoTarget = null) {
      const exceptId = scope === 'edit' && editDraft ? editDraft.id : ''
      const room = photoRoom(screen.day, exceptId)
      const box = document.createElement('div')
      box.className = 'journal-compose'
      const photos = document.createElement('div')
      photos.className = 'image-preview diary-draft-photos diary-photos' + (draft.images.length === 1 ? ' diary-photos-single' : '')
      renderThumbs(photos, draft.images, scope)
      const text = document.createElement('textarea')
      text.className = 'journal-text'
      text.rows = 4
      text.maxLength = 2000
      text.placeholder = ''
      text.value = draft.text
      text.setAttribute('aria-label', scope === 'edit' ? '修改日记正文' : '日记正文')
      text.addEventListener('input', () => {
        draft.text = text.value
        if (scope === 'add' && draft.text.trim() && !draft.mascotId) Object.assign(draft, moodSnapshot())
        updateSave()
        if (scope === 'add') refreshStickers()
        rememberDraft(draft, screen.day, scope)
      })
      const add = document.createElement('button')
      add.type = 'button'
      add.className = 'journal-photo-button'
      add.dataset.act = 'add-photo'
      add.dataset.scope = scope
      add.textContent = draft.images.length >= room ? '这一天已有五张照片' : '添加图片'
      add.disabled = draft.images.length >= room
      const headerSave = scope === 'add' ? historyList.querySelector('.diary-header-save') : null
      const save = headerSave || document.createElement('button')
      save.type = 'button'
      save.classList.add('journal-save')
      save.dataset.act = scope === 'edit' ? 'save-edit' : 'save-day'
      save.textContent = headerSave ? '保存' : saveLabel
      function updateSave() {
        const empty = !draft.text.trim() && !draft.images.length && !draft.moodChosen
        if (headerSave) { save.hidden = false; save.disabled = empty }
        else save.hidden = empty
      }
      updateSave()
      box.append(text, add)
      appendMoods(box, draft)
      if (!headerSave) box.appendChild(save)
      parent.appendChild(box)
      ;(photoTarget || box).append(photos)
      attachPenCaret(text)
    }

    function renderRecordItem(record) {
      const item = document.createElement('article')
      item.className = 'history-item'
      item.dataset.act = 'open'
      item.dataset.id = String(record.id)
      const icon = document.createElement('span')
      icon.className = 'history-emotion-icon'
      icon.innerHTML = emotionIcons[record.emotion] || emotionIcons.平静
      const body = document.createElement('div')
      body.className = 'history-item-body'
      const date = document.createElement('p')
      date.className = 'history-date'
      date.textContent = `${record.date} · ${record.weekday} · ${record.emotion}`
      const text = document.createElement('p')
      text.className = 'history-text'
      const clean = record.text.replace(/\s+/g, ' ').trim()
      text.textContent = clean ? clean : '这一条只有照片'
      if (record.images.length) {
        const row = document.createElement('div')
        row.className = 'journal-photo-row'
        record.images.forEach((src, index) => {
          const image = document.createElement('img')
          image.className = 'image-history-thumb'
          image.src = src
          image.alt = '记录照片'
          image.dataset.act = 'zoom-saved'
          image.dataset.id = String(record.id)
          image.dataset.index = String(index)
          row.appendChild(image)
        })
        body.appendChild(row)
      }
      body.append(date, text)
      const del = document.createElement('button')
      del.className = 'history-delete'
      del.type = 'button'
      del.dataset.act = 'delete'
      del.dataset.id = String(record.id)
      del.setAttribute('aria-label', '删除这条记录')
      del.textContent = '✕'
      item.append(icon, body, del)
      return item
    }

    function renderMonth() {
      historyTitle.textContent = '我的记录'
      const year = screen.year
      const month = screen.month
      const nav = document.createElement('div')
      nav.className = 'journal-cal-nav'
      const prev = document.createElement('button')
      prev.type = 'button'
      prev.dataset.act = 'prev-month'
      prev.setAttribute('aria-label', '上个月')
      prev.textContent = '‹'
      const label = document.createElement('p')
      label.className = 'journal-cal-label'
      label.textContent = `${year}年${month + 1}月`
      const next = document.createElement('button')
      next.type = 'button'
      next.dataset.act = 'next-month'
      next.setAttribute('aria-label', '下个月')
      next.textContent = '›'
      nav.append(prev, label, next)

      const week = document.createElement('div')
      week.className = 'journal-cal-week'
      ;['一', '二', '三', '四', '五', '六', '日'].forEach((name) => {
        const cell = document.createElement('span')
        cell.textContent = name
        week.appendChild(cell)
      })

      const grid = document.createElement('div')
      grid.className = 'journal-cal-grid'
      const marks = markedDays()
      const today = todayKey()
      monthCells(year, month).forEach((day) => {
        if (!day) {
          const empty = document.createElement('span')
          grid.appendChild(empty)
          return
        }
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'journal-day'
        button.dataset.act = 'open-day'
        button.dataset.day = day
        button.textContent = String(Number(day.slice(-2)))
        if (day === today) button.classList.add('journal-today')
        if (marks.has(day)) button.classList.add('journal-has')
        if (isFutureDay(day)) button.classList.add('journal-future')
        grid.appendChild(button)
      })
      historyList.append(nav, week, grid)
    }

    function renderDay() {
      historyTitle.textContent = '日记本'
      historyTitle.setAttribute('aria-label', (partsFromDay(screen.day)?.date || '') + '的日记本')
      const draftDays = [...dayDrafts].filter(([, draft]) => draft.text.trim() || draft.images.length || draft.moodChosen).map(([day]) => day)
      const view = renderDiaryBook(historyList, screen.day, visibleRecords(), todayKey(), draftDays, {
        weatherControl: diaryWeather.mount(screen.day), stickerFor
      })
      const entries = visibleRecords().filter(record => record.day === screen.day).sort((a,b)=>Number(a.id)-Number(b.id))
      dayFlow = createDiaryFlow(view.viewport, [...entries.map(record => ({key:String(record.id),text:record.text,images:record.images})), {key:'draft',text:addDraft.text,images:addDraft.images}], {
        day:screen.day, leading:view.stickers, initialPage:screen.sheet || 0,
        onText(key, text) {
          if (key === 'draft') {
            addDraft.text = text
            if (text.trim() && !addDraft.mascotId) { Object.assign(addDraft,moodSnapshot()); refreshStickers() }
            rememberDraft(addDraft,screen.day)
          } else {
            const draft = draftForRecord(key)
            if (!draft) return
            draft.text = text; rememberDraft(draft,screen.day,'edit')
          }
        },
        onPhotoRemove(key,index) {
          const draft = key === 'draft' ? addDraft : draftForRecord(key)
          if (!draft || index < 0 || index >= draft.images.length) return
          draft.images.splice(index,1)
          rememberDraft(draft,screen.day,key === 'draft' ? 'add' : 'edit')
          renderScreen()
        },
        onPhotoOpen:openLightbox,
        onPage(page,total) {
          screen.sheet = page
          view.previous.disabled = page === 0 && !view.navigation.previous
          view.next.disabled = page === total - 1 && !view.navigation.next
          view.count.textContent = `${page+1} / ${total}`
          view.count.setAttribute('aria-label',`当天第 ${page+1} 页，共 ${total} 页`)
        },
        onLimit() { toast('这一段最多五万字，可以先保存后再接着写') }
      })
      refreshStickers()
      updateDayStatus()
    }

    function draftForRecord(id) {
      const previous = editDrafts.get(String(id))
      if (previous) return previous
      const record = records.find(item=>String(item.id)===String(id))
      if (!record) return null
      return draftForEntry(record)
    }

    function savePaperDay() {
      const changes = [...editDrafts.values()].filter(draft=>draft.day===screen.day)
      const hasNew = addDraft.text.trim() || addDraft.images.length || addDraft.moodChosen
      if (!changes.length && !hasNew) return
      let next = applyDiaryEdits(records,screen.day,changes)
      if (hasNew) next = [makeRecord(screen.day,addDraft,Date.now()),...next]
      if (next.filter(record=>record.day===screen.day).reduce((count,record)=>count+record.images.length,0)>MAX_PHOTOS) { toast('一天最多五张照片'); return }
      if (!writeRecords(next)) return
      const cleared = changes.map(draft=>editDraftKey(draft.id))
      changes.forEach(draft=>editDrafts.delete(String(draft.id)))
      if (hasNew) { cleared.push(dayDraftKey(screen.day)); addDraft=blankDraft(); dayDrafts.set(screen.day,addDraft) }
      cleared.forEach(key=>{draftVersions.delete(key);draftNotices.delete(key);void draftStore.remove(key)})
      renderScreen(); toast('已保存')
    }

    function switchDiaryDay(day, animate = false, sheet = 0) {
      if (!partsFromDay(day) || isFutureDay(day)) return
      if (bookBusy) return
      keepCurrentDraft()
      const previousDay = screen.day
      if (screen.day && screen.mode === 'day') { syncDraftFromDom(addDraft); dayDrafts.set(screen.day, addDraft) }
      const [year, month] = day.split('-').map(Number)
      screen = { mode: 'day', year, month: month - 1, day, sheet }
      addDraft = dayDrafts.get(day) || blankDraft()
      dayDrafts.set(day, addDraft)
      editDraft = null
      writerShown = false
      const render = () => { renderScreen(); historyList.scrollTop = 0 }
      if (animate && previousDay !== day && historyList.querySelector('.diary-spread')) {
        void bookTransition(() => turnDiary(historyList, render, day < previousDay ? 'previous' : 'next'), '.diary-date-picker')
      } else render()
    }

    function renderEdit() {
      historyTitle.textContent = '修改日记 · ' + (partsFromDay(screen.day)?.date || '')
      const back = document.createElement('button')
      back.type = 'button'
      back.className = 'journal-back'
      back.dataset.act = 'back-day'
      back.textContent = '返回这一天'
      historyList.appendChild(back)
      const status = document.createElement('p'); status.className = 'diary-draft-status'; status.setAttribute('role','status'); status.textContent = draftNotices.get(currentDraftKey()) || (editDrafts.has(String(editDraft?.id)) ? '草稿已保留' : ''); historyList.append(status)
      if (editDraft) appendComposer(historyList, editDraft, 'edit', '保存')
    }

    function renderScreen() {
      dayFlow?.dispose(); dayFlow = null
      historyModal.dataset.bookState = screen.mode === 'cover' ? 'closed' : 'open'
      historyModal.dataset.bookView = screen.mode
      historyList.innerHTML = ''
      if (screen.mode === 'edit') renderEdit()
      else if (screen.mode === 'day') renderDay()
      else if (screen.mode === 'cover') { historyTitle.textContent = '日记本'; historyTitle.removeAttribute('aria-label'); renderDiaryCover(historyList) }
      else renderMonth()
    }

    async function openJournal(event) {
      event.preventDefault()
      event.stopImmediatePropagation()
      keepCurrentDraft()
      await reloadDrafts()
      records = loadRecords()
      switchDiaryDay(todayKey())
      screen.mode = 'cover'
      renderScreen()
      historyModal.classList.add('history-modal-visible')
      historyModal.setAttribute('aria-hidden', 'false')
    }

    function freshMonth() {
      const now = new Date()
      return { mode: 'cover', year: now.getFullYear(), month: now.getMonth(), day: todayKey(now) }
    }

    function makeRecord(day, draft, id) {
      const parts = partsFromDay(day)
      if (!parts) return null
      const text = draft.text.trim()
      const images = imagesFrom({ images: draft.images })
      if (!text && !images.length && !draft.moodChosen) return { error: '写几句话，或加一张照片' }
      return normalizeRecord({
        id: id || Date.now(),
        day,
        date: parts.date,
        weekday: parts.weekday,
        emotion: draft.emotion || '未选择',
        mascotId: draft.mascotId,
        moodPosition: draft.moodPosition,
        text,
        images
      })
    }

    function saveHome() {
      if (homeImages.length > photoRoom(todayKey())) {
        toast('一天最多五张照片')
        return false
      }
      const record = makeRecord(todayKey(), { text: emotionNote.value, images: homeImages, ...moodSnapshot() }, Date.now())
      if (!record || record.error) {
        toast(record?.error || '写几句话，或加一张照片')
        return false
      }
      if (!writeRecords([record, ...records])) return false
      emotionNote.value = ''
      homeImages = []
      renderHomePreview()
      toast('已记下这一刻')
      return true
    }

    photoButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (homeImages.length >= roomFor('home')) {
        toast('一天最多五张照片')
        return
      }
      choosePhoto('home')
    }, { capture: true })

    mainRecordButton.addEventListener('click', async (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      // A blank home note can still open the cover; filled notes keep the existing save behavior.
      if ((emotionNote.value.trim() || homeImages.length) && !saveHome()) return
      await openJournal(event)
    }, { capture: true })

    if (historyEntry) historyEntry.addEventListener('click', openJournal, { capture: true })

    ctx.events.on('journal.openDay', async ({ day }) => {
      if (!partsFromDay(day)) return
      keepCurrentDraft()
      await reloadDrafts()
      records = loadRecords()
      switchDiaryDay(day)
      historyModal.classList.add('history-modal-visible')
      historyModal.setAttribute('aria-hidden', 'false')
    })

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0]
      const request = photoRequest
      fileInput.value = ''
      photoRequest = null
      if (!file || !request) return
      const { scope: target, day, draft, bucket } = request
      const room = () => photoRoom(day, target === 'edit' ? draft.id : '')
      if (bucket.length >= room()) {
        toast('一天最多五张照片')
        return
      }
      try {
        const data = await compressPhoto(file)
        if (bucket.length >= room()) {
          toast('一天最多五张照片')
          return
        }
        if (target === 'edit' && editDraft !== draft) return
        if (target === 'add' && !draft.mascotId) Object.assign(draft, request.snapshot)
        bucket.push(data)
        if (target !== 'home') rememberDraft(draft, day, target)
        if (target === 'home') renderHomePreview()
        else if (screen.day === day && (target !== 'edit' || screen.mode === 'edit')) {
          syncDraftFromDom(target === 'edit' ? editDraft : addDraft)
          writerShown = true
          if (target === 'add') screen.sheet = -1
          renderScreen()
        }
      } catch {
        toast('这张照片没能加上，请换一张')
      }
    })

    historyList.addEventListener('click', (event) => {
      const target = event.target.closest('[data-act]')
      if (!target || !historyList.contains(target)) return
      const act = target.dataset.act
      if (bookBusy) return
      if (act === 'diary-write') { writerShown = true; if(dayFlow)dayFlow.focusEnd();else showDiaryWriter(historyList); return }
      if (act === 'diary-photo') { choosePhoto('add'); return }
      if (act === 'save-day' && dayFlow) { savePaperDay(); return }
      if (act === 'diary-sheet' && dayFlow) {
        const previous = target.dataset.direction === 'previous', destination = dayFlow.page + (previous ? -1 : 1)
        if (destination >= 0 && destination < dayFlow.total) {
          void bookTransition(()=>turnDiary(historyList,()=>dayFlow?.setPage(destination),previous?'previous':'next'),`[data-direction="${previous?'previous':'next'}"]`)
        } else {
          const days = [...new Set([todayKey(),screen.day,...records.map(record=>record.day),...[...dayDrafts].filter(([,draft])=>draft.text.trim()||draft.images.length||draft.moodChosen).map(([day])=>day)])].sort()
          const index = days.indexOf(screen.day), day = days[index+(previous?-1:1)]
          if (day) switchDiaryDay(day,true,previous?-1:0)
        }
        return
      }
      if (act === 'diary-open-book') {
        void bookTransition(() => openDiary(historyList, () => { screen.mode = 'day'; renderScreen() }), '[data-act="diary-close-book"]')
        return
      }
      if (act === 'diary-close-book') {
        keepCurrentDraft()
        syncDraftFromDom(addDraft); dayDrafts.set(screen.day, addDraft)
        void bookTransition(() => closeDiary(historyList, () => { screen.mode = 'cover'; renderScreen() }), '[data-act="diary-open-book"]')
        return
      }
      if (act === 'diary-day') { switchDiaryDay(target.dataset.day, true); return }
      if (act === 'zoom-saved') {
        event.stopPropagation()
        const saved = visibleRecords().find((item) => String(item.id) === target.dataset.id)
        const src = saved && saved.images[Number(target.dataset.index)]
        if (src) openLightbox(src)
        return
      }
      if (act === 'zoom') {
        event.stopPropagation()
        const bucket = photosOf(target.dataset.scope)
        const src = bucket[Number(target.dataset.index)]
        if (src) openLightbox(src)
        return
      }
      if (act === 'remove-photo') {
        event.stopPropagation()
        const bucket = photosOf(target.dataset.scope)
        bucket.splice(Number(target.dataset.index), 1)
        if (target.dataset.scope === 'home') renderHomePreview()
        else {
          syncDraftFromDom(target.dataset.scope === 'edit' ? editDraft : addDraft)
          rememberDraft(target.dataset.scope === 'edit' ? editDraft : addDraft, screen.day, target.dataset.scope)
          renderScreen()
        }
        return
      }
      if (act === 'add-photo') {
        choosePhoto(target.dataset.scope)
        return
      }
      if (act === 'mood') {
        const draft = screen.mode === 'edit' ? editDraft : addDraft
        if (!draft) return
        const text = historyList.querySelector('.journal-text')
        if (text) draft.text = text.value
        if (draft.emotion !== target.dataset.mood) delete draft.moodPosition
        draft.emotion = target.dataset.mood
        rememberDraft(draft, screen.day, screen.mode === 'edit' ? 'edit' : 'add')
        historyList.querySelectorAll('.journal-mood').forEach((button) => {
          button.classList.toggle('journal-mood-active', button === target)
        })
        return
      }
      if (act === 'prev-month' || act === 'next-month') {
        const cursor = new Date(screen.year, screen.month + (act === 'next-month' ? 1 : -1), 1)
        screen.year = cursor.getFullYear()
        screen.month = cursor.getMonth()
        renderScreen()
        return
      }
      if (act === 'open-day') {
        switchDiaryDay(target.dataset.day)
        return
      }
      if (act === 'back-month') {
        keepCurrentDraft()
        screen.mode = 'month'
        editDraft = null
        renderScreen()
        return
      }
      if (act === 'back-day') {
        keepCurrentDraft()
        screen.mode = 'day'
        editDraft = null
        renderScreen()
        return
      }
      if (act === 'open') {
        keepCurrentDraft()
        const record = visibleRecords().find((item) => String(item.id) === target.dataset.id)
        if (!record) return
        editDraft = { text: record.text, images: record.images.slice(), emotion: record.emotion || '未选择', mascotId: record.mascotId, moodChosen: !!record.mascotId, moodPosition: record.moodPosition, id: record.id }
        screen.mode = 'edit'
        screen.day = record.day
        renderScreen()
        return
      }
      if (act === 'delete') {
        event.stopPropagation()
        if (!confirm('删除这条记录？')) return
        if (!writeRecords(records.filter((item) => String(item.id) !== target.dataset.id))) return
        editDrafts.delete(target.dataset.id); void draftStore.remove(editDraftKey(target.dataset.id))
        if (editDraft && String(editDraft.id) === target.dataset.id) {
          editDraft = null
          screen.mode = 'day'
        }
        renderScreen()
        toast('已删除这条记录')
        return
      }
      if (act === 'save-day' || act === 'save-edit') {
        const draft = act === 'save-edit' ? editDraft : addDraft
        syncDraftFromDom(draft)
        const exceptId = act === 'save-edit' && editDraft ? editDraft.id : ''
        if (draft.images.length > photoRoom(screen.day, exceptId)) {
          toast('一天最多五张照片')
          return
        }
        const record = makeRecord(screen.day, draft, act === 'save-edit' ? editDraft.id : Date.now())
        if (!record || record.error) {
          toast(record?.error || '写几句话，或加一张照片')
          return
        }
        const rest = records.filter((item) => String(item.id) !== String(record.id))
        if (!writeRecords([record, ...rest])) return
        if (act === 'save-day') {
          void draftStore.remove(dayDraftKey(screen.day))
          addDraft = blankDraft()
          dayDrafts.set(screen.day, addDraft)
        } else {
          editDrafts.delete(String(record.id)); void draftStore.remove(editDraftKey(record.id))
        }
        const savedDraftKey = act === 'save-edit' ? editDraftKey(record.id) : dayDraftKey(screen.day)
        draftVersions.delete(savedDraftKey); draftNotices.delete(savedDraftKey)
        writerShown = false
        editDraft = null
        screen.mode = 'day'
        renderScreen()
        historyList.scrollTop = 0
        toast('已保存')
      }
    })

    historyModal.addEventListener('keydown', event => {
      if (screen.mode !== 'day' || event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const controls = historyList.querySelectorAll('.diary-turn > button')
      const button = controls[event.key === 'ArrowLeft' ? 0 : 1]
      if (button && !button.disabled) { event.preventDefault(); button.click() }
    })
    renderHomePreview()
    renderScreen()
    // Previous study links now open the real diary rather than seeded sample entries.
    if (new URLSearchParams(location.search).get('diary') === '1') {
      queueMicrotask(async () => {
        await ctx.services.auth?.whenReady()
        if (ctx.services.auth && !ctx.services.auth.isLoggedIn()) { ctx.services.auth.openGate(); return }
        openJournal(new Event('click'))
        const url = new URL(location.href); url.searchParams.delete('diary')
        window.history.replaceState(window.history.state, '', url)
      })
    }
  }
}
