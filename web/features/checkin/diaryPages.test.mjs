import test from 'node:test'
import assert from 'node:assert/strict'
import {diaryNavigation} from './diaryPages.mjs'
import {parseDiaryWeather} from './diaryWeather.mjs'
import {diaryMoodTarget,selectDiaryMood} from './diaryMood.mjs'
import {normalizeRecord} from './records.mjs'
import {calendarDays,moveCalendarDay,moveCalendarMonth} from './diaryCalendar.mjs'

test('按日期组织日记，同日多段记录归于同一天，不修改原记录',()=>{
  const records=[{day:'2026-10-16',text:'第二段'},{day:'2026-10-15',text:'旧日记'},{day:'2026-10-16',text:'第一段'}]
  const before=JSON.stringify(records)
  const page=diaryNavigation(records,'2026-10-16','2026-10-18')
  assert.deepEqual(page.days,['2026-10-15','2026-10-16','2026-10-18'])
  assert.equal(page.previous,'2026-10-15');assert.equal(page.next,'2026-10-18')
  assert.equal(JSON.stringify(records),before)
})
test('跨月闰日与边界正常；空日记本显示今天且不能翻出范围',()=>{
  assert.equal(diaryNavigation([{day:'2024-02-29'}],'2024-03-01','2024-03-01').previous,'2024-02-29')
  assert.deepEqual(diaryNavigation([],'2026-10-18','2026-10-18'),{days:['2026-10-18'],previous:null,next:null,page:1,total:1})
})
test('手动选中的过去空白日期可写入，未来和无效日期不加入日记页',()=>{
  const page=diaryNavigation([{day:'2026-10-19'},{day:'2026-02-30'},{day:'2026-10-14'}],'2026-10-16','2026-10-18')
  assert.deepEqual(page.days,['2026-10-14','2026-10-16','2026-10-18'])
})

test('天气按有效日期保留，不接受损坏数据、无效天气或对象原型键',()=>{
  const raw='{"2026-10-17":"晴","2026-10-20":"雨","2026-02-30":"晴","2026-10-18":"雷暴未知","__proto__":{"polluted":true}}'
  const parsed=parseDiaryWeather(raw)
  assert.deepEqual(Object.entries(parsed),[['2026-10-17','晴'],['2026-10-20','雨']])
  assert.equal(Object.getPrototypeOf(parsed),null)
  for(const value of ['{broken','[]','null','"text"'])assert.deepEqual(Object.keys(parseDiaryWeather(value)),[])
})

test('切换心情保留原 IP、日期、文字和照片；重载后仍保留选择',()=>{
  const record={id:123,day:'2026-10-21',mascotId:'cat',emotion:'平静',text:'真实记录',images:['data:image/png;base64,test'],moodPosition:45}
  const before=JSON.stringify(record)
  const changed=selectDiaryMood(record,'开心','dog')
  assert.equal(changed.mascotId,'cat')
  assert.equal(changed.moodPosition,undefined)
  const reloaded=normalizeRecord(JSON.parse(JSON.stringify(changed)))
  assert.equal(reloaded.emotion,'开心');assert.equal(reloaded.text,record.text)
  assert.deepEqual(reloaded.images,record.images);assert.equal(reloaded.day,record.day)
  assert.equal(JSON.stringify(record),before)
  assert.equal(selectDiaryMood(record,'未知心情','dog'),null)
})

test('有草稿时只改草稿；没有草稿时选中当天最新记录，不串到其他日期',()=>{
  const records=[{id:1,day:'2026-10-21',text:'早些时候',images:[]},{id:3,day:'2026-10-20',text:'昨天',images:[]},{id:2,day:'2026-10-21',text:'晚些时候',images:[]}]
  const empty={text:'',images:[],emotion:'平静'}
  assert.equal(diaryMoodTarget(records,'2026-10-21',empty).entry.id,2)
  assert.equal(diaryMoodTarget(records,'2026-10-21',{...empty,text:'尚未保存'}).isDraft,true)
  assert.equal(diaryMoodTarget(records,'2026-10-21',{...empty,moodChosen:true}).isDraft,true)
  assert.equal(diaryMoodTarget(records,'2026-10-19',empty).entry,empty)
})

test('纸质日历按周一排布，闰月和跨年日期移动正确',()=>{
  const february=calendarDays(2024,1)
  assert.equal(february.length,42);assert.equal(february[0],null);assert.equal(february[3],'2024-02-01')
  assert.equal(february.filter(Boolean).length,29)
  assert.equal(moveCalendarDay('2024-02-28',1),'2024-02-29')
  assert.equal(moveCalendarDay('2024-12-31',1),'2025-01-01')
  assert.equal(moveCalendarMonth('2024-01-31',1),'2024-02-29')
  assert.equal(moveCalendarMonth('2024-02-29',12),'2025-02-28')
})
