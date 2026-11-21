import test from 'node:test'
import assert from 'node:assert/strict'
import { createDiaryDraftStore, dayDraftKey, editDraftKey, normalizeDiaryDraft } from './diaryDrafts.mjs'
import { normalizeRecord } from './records.mjs'
import { selectDiaryMood } from './diaryMood.mjs'
function memoryStorage() {
  const data = new Map()
  return { get length() { return data.size }, key: index => [...data.keys()][index], getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}
const draft = { text: '还没有按保存的文字', images: ['data:image/png;base64,photo'], emotion: '开心', mascotId: 'cat', moodChosen: true }

test('新增陪伴者在正式记录、未保存草稿和心情修改后保留原来的 IP', async () => {
  const storage = memoryStorage(), store = createDiaryDraftStore({ storage, database: null, debounceMs: 0 })
  await store.ready
  const ids = ['sun', 'circle', 'sprout']
  for (let index = 0; index < ids.length; index++) {
    const mascotId = ids[index], day = '2026-10-' + (19 + index)
    const record = normalizeRecord({ ...draft, id: index, day, mascotId })
    assert.equal(record.mascotId, mascotId)
    assert.equal(selectDiaryMood(record, '疲惫', 'cat').mascotId, mascotId)
    await store.write(dayDraftKey(day), day, { ...draft, mascotId })
  }
  const reloaded = await createDiaryDraftStore({ storage, database: null }).ready
  assert.deepEqual(new Set(reloaded.map(row => row.mascotId)), new Set(ids))
  assert.equal(normalizeRecord({day:'2026-10-21',mascotId:'unregistered'}).mascotId, undefined)
})
test('未按保存的文字、照片和心情在刷新后按原日期恢复，其他日期互不覆盖', async () => {
  const storage = memoryStorage(), first = createDiaryDraftStore({ storage, database: null, debounceMs: 0 })
  await first.ready
  await first.write(dayDraftKey('2026-10-20'), '2026-10-20', draft)
  await first.write(dayDraftKey('2026-10-21'), '2026-10-21', { ...draft, text: '另一天', images: [] })
  const reloaded = await createDiaryDraftStore({ storage, database: null }).ready
  assert.equal(reloaded.length, 2)
  const original = reloaded.find(row => row.day === '2026-10-20')
  assert.equal(original.text, draft.text); assert.deepEqual(original.images, draft.images)
  assert.equal(original.emotion, '开心'); assert.equal(original.mascotId, 'cat')
})
test('快速连续输入保留最后的文字；正式保存移除草稿后不会在重启时重复出现', async () => {
  const storage = memoryStorage(), store = createDiaryDraftStore({ storage, database: null, debounceMs: 500 })
  await store.ready
  const key = dayDraftKey('2026-10-21')
  await store.write(key, '2026-10-21', { ...draft, text: '第一句' })
  const a = store.write(key, '2026-10-21', { ...draft, text: '第一句，第二句' })
  const b = store.write(key, '2026-10-21', { ...draft, text: '最后的文字' })
  await store.flush(); await Promise.all([a,b])
  assert.equal((await createDiaryDraftStore({ storage, database: null }).ready)[0].text, '最后的文字')
  await store.remove(key)
  assert.deepEqual(await createDiaryDraftStore({ storage, database: null }).ready, [])
})
test('修改旧日记的草稿与同一天的新文字分开保留，不接受错配记录或无效日期', async () => {
  const storage = memoryStorage(), store = createDiaryDraftStore({ storage, database: null, debounceMs: 0 })
  await store.ready
  await store.write(editDraftKey(12), '2026-10-20', { ...draft, id: 12 })
  await store.write(dayDraftKey('2026-10-20'), '2026-10-20', { ...draft, text: '新追加的文字' })
  const rows = await createDiaryDraftStore({ storage, database: null }).ready
  assert.equal(rows.length, 2); assert.equal(rows.find(row => row.id === 12).text, draft.text)
  assert.equal(normalizeDiaryDraft({ key: 'edit:12', id: 13, day: '2026-10-20' }), null)
  assert.equal(normalizeDiaryDraft({ key: 'day:2026-02-30', day: '2026-02-30' }), null)
})
test('存储不可用时返回失败，仍保留当前会话内容，不谎报已经保留', async () => {
  const storage = { get length(){return 0}, getItem(){return null}, setItem(){throw Error('full')} }
  const store = createDiaryDraftStore({ storage, database: null, debounceMs: 0 })
  await store.ready
  assert.equal(await store.write(dayDraftKey('2026-10-21'), '2026-10-21', draft), false)
  assert.equal((await store.reload())[0].text, draft.text)
})
