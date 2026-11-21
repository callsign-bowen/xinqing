import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRecord } from './records.mjs'
import { applyDiaryEdits, draftForEntry } from './diaryEdits.mjs'
import { normalizeDiaryDraft } from './diaryDrafts.mjs'

const day='2026-10-21',photo='data:image/png;base64,qa'
test('直接编辑正文只更新原日期原记录，保留原IP、心情、照片和其他日期',()=>{
  const original=normalizeRecord({id:1,day,text:'原来的话',mascotId:'cat',emotion:'开心',images:[photo]})
  const other=normalizeRecord({id:2,day:'2026-10-20',text:'另一天'})
  const draft=draftForEntry(original);draft.text='直接在纸上修改后的话'
  const next=applyDiaryEdits([original,other],day,[draft,{...draft,id:2,day:'2026-10-20',text:'不应跨日改写'}])
  assert.equal(next[0].text,draft.text);assert.equal(next[0].mascotId,'cat');assert.equal(next[0].emotion,'开心');assert.deepEqual(next[0].images,[photo])
  assert.equal(original.text,'原来的话');assert.equal(next[1],other)
})
test('删掉最后一张照片后旧image字段不会把照片复活，其他文字仍保留',()=>{
  const original=normalizeRecord({id:1,day,text:'保留文字',mascotId:'cat',images:[photo]})
  const draft=draftForEntry(original);draft.images.splice(0,1)
  const saved=applyDiaryEdits([original],day,[draft])[0]
  assert.deepEqual(saved.images,[]);assert.equal(saved.image,null);assert.equal(saved.text,'保留文字')
  assert.deepEqual(original.images,[photo]);assert.deepEqual(normalizeRecord(JSON.parse(JSON.stringify(saved))).images,[])
})
test('多页长文与原始换行在草稿和正式记录中完整保留，不再截成两千字',()=>{
  const text=('一行长文，让下一面接着写。\n').repeat(230)+'\n末尾\n'
  assert.ok(text.length>2000)
  const draft=normalizeDiaryDraft({key:'day:'+day,day,text,images:[]})
  assert.equal(draft.text,text);assert.equal(normalizeRecord({id:1,day,...draft}).text,text)
})
