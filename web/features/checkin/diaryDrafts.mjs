import { imagesFrom, partsFromDay, MAX_DIARY_TEXT } from './records.mjs'
import { DIARY_MASCOTS } from './mascotIds.mjs'

const PREFIX = 'nuo_diary_draft_v1:'
export const dayDraftKey = day => 'day:' + day
export const editDraftKey = id => 'edit:' + String(id)
export function normalizeDiaryDraft(value) {
  if (!value || typeof value !== 'object' || !partsFromDay(value.day) || typeof value.key !== 'string') return null
  if (value.key !== dayDraftKey(value.day) && !/^edit:[\w.-]{1,100}$/.test(value.key)) return null
  const row = { key: value.key, day: value.day, updatedAt: Number(value.updatedAt) || 0 }
  if (value.deleted) return { ...row, deleted: true }
  if (value.key.startsWith('edit:') && editDraftKey(value.id) !== value.key) return null
  return { ...row, text: typeof value.text === 'string' ? value.text.slice(0, MAX_DIARY_TEXT) : '', images: imagesFrom(value), emotion: typeof value.emotion === 'string' ? value.emotion : '未选择',
    ...(DIARY_MASCOTS.includes(value.mascotId) ? { mascotId: value.mascotId } : {}),
    ...(value.id !== undefined ? { id: value.id } : {}), moodChosen: value.moodChosen === true,
    photoRevision: Number(value.photoRevision) || 0,
    ...(Number.isFinite(value.moodPosition) ? { moodPosition: value.moodPosition } : {}) }
}

/** Small synchronous text backup + photo backup only when changed; IndexedDB stores full drafts. */
export function createDiaryDraftStore(options = {}) {
  let { storage, database } = options
  const { now = Date.now, debounceMs = 180 } = options
  if (!Object.hasOwn(options, 'storage')) { try { storage = globalThis.localStorage } catch { /* Optional synchronous backup. */ } }
  if (!Object.hasOwn(options, 'database')) { try { database = globalThis.indexedDB } catch { /* Optional persistent database. */ } }
  const memory = new Map(), pending = new Map()
  let lastTime = 0
  const dbReady = new Promise(resolve => {
    if (!database) { resolve(null); return }
    try {
      const request = database.open('nuo-diary-drafts-v1', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'key' })
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result) }
      request.onerror = request.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
  const parse = raw => { try { return JSON.parse(raw || 'null') } catch { return null } }
  function cache(row, photosChanged) {
    try {
      if (photosChanged && !row.deleted) storage?.setItem(PREFIX + 'photos:' + row.key, JSON.stringify({ revision: row.photoRevision, images: row.images }))
      const { images, ...metadata } = row
      storage?.setItem(PREFIX + row.key, JSON.stringify(metadata))
      if (row.deleted) storage?.removeItem(PREFIX + 'photos:' + row.key)
      if (!storage) return false
      if (!row.deleted && row.images.length) {
        const photos = parse(storage.getItem(PREFIX + 'photos:' + row.key))
        if (photos?.revision !== row.photoRevision) return false
      }
      return true
    } catch {
      // If a photo exceeds the localStorage quota, still protect the latest text synchronously.
      try { const { images, ...metadata } = row; storage?.setItem(PREFIX + row.key, JSON.stringify(metadata)) } catch { /* Report failure if IndexedDB also fails. */ }
      return false
    }
  }
  async function commit(row) {
    const db = await dbReady
    if (!db) return false
    return new Promise(resolve => {
      try {
        const tx = db.transaction('drafts', 'readwrite'), objectStore = tx.objectStore('drafts')
        const request = objectStore.get(row.key)
        request.onsuccess = () => { if (!request.result || request.result.updatedAt <= row.updatedAt) objectStore.put(row) }
        tx.oncomplete = () => resolve(true); tx.onerror = tx.onabort = () => resolve(false)
      } catch { resolve(false) }
    })
  }
  async function readRows() {
    const db = await dbReady
    const stored = db ? await new Promise(resolve => {
      try { const request = db.transaction('drafts').objectStore('drafts').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => resolve([]) } catch { resolve([]) }
    }) : []
    const merged = new Map()
    for (const value of stored) { const row = normalizeDiaryDraft(value); if (row) merged.set(row.key, row) }
    try {
      for (let index = 0; index < (storage?.length || 0); index++) {
        const key = storage.key(index)
        if (!key?.startsWith(PREFIX) || key.startsWith(PREFIX + 'photos:')) continue
        const metadata = normalizeDiaryDraft(parse(storage.getItem(key)))
        if (!metadata) continue
        const previous = merged.get(metadata.key)
        if (previous && previous.updatedAt > metadata.updatedAt) continue
        const photos = parse(storage.getItem(PREFIX + 'photos:' + metadata.key))
        metadata.images = photos?.revision === metadata.photoRevision ? imagesFrom(photos) : previous?.photoRevision === metadata.photoRevision ? previous.images : []
        merged.set(metadata.key, metadata)
      }
    } catch { /* IndexedDB remains usable when localStorage is unavailable. */ }
    for (const [key, row] of merged) { if (!memory.has(key) || memory.get(key).updatedAt < row.updatedAt) memory.set(key, row) }
    return [...memory.values()].filter(row => !row.deleted)
  }
  async function flushKey(key) {
    const item = pending.get(key)
    if (!item) return
    clearTimeout(item.timer); pending.delete(key)
    const ok = await commit(item.row)
    for (const resolve of item.waiters) resolve(item.cached || ok)
  }
  function write(key, day, draft) {
    const previous = memory.get(key), images = imagesFrom(draft)
    const changed = !previous || images.length !== previous.images?.length || images.some((image, index) => image !== previous.images[index])
    const updatedAt = lastTime = Math.max(now(), lastTime + 1, (previous?.updatedAt || 0) + 1)
    const row = normalizeDiaryDraft({ ...draft, key, day, images, updatedAt, photoRevision: changed ? updatedAt : previous.photoRevision })
    if (!row) return Promise.resolve(false)
    memory.set(key, row)
    const cached = cache(row, changed), old = pending.get(key)
    if (old) clearTimeout(old.timer)
    return new Promise(resolve => {
      const item = { row, cached, waiters: [...(old?.waiters || []), resolve], timer: null }
      pending.set(key, item)
      item.timer = setTimeout(() => { void flushKey(key) }, changed ? 0 : debounceMs)
    })
  }
  async function remove(key) {
    if (!memory.has(key) && !key.startsWith('day:')) return true
    const waiting = pending.get(key)
    if (waiting) { clearTimeout(waiting.timer); pending.delete(key); waiting.waiters.forEach(resolve => resolve(true)) }
    const row = { key, day: memory.get(key)?.day || key.slice(4), updatedAt: lastTime = Math.max(now(), lastTime + 1), deleted: true }
    memory.set(key, row); const cached = cache(row, false)
    return await commit(row) || cached
  }
  return { ready: readRows(), write, remove, flush: () => Promise.all([...pending.keys()].map(flushKey)), reload: readRows }
}
