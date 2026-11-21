import test from 'node:test'
import assert from 'node:assert/strict'
import { loadScenarioHistory, saveScenarioHistory, SCENARIO_HISTORY_V2 } from './history.mjs'

test('v2 历史只读写独立 key；旧 v1 保持原字节，不会被作为新上下文加载', () => {
  const legacy = '[{"role":"user","text":"旧模式的对方台词"}]'
  const map = new Map([['nuo_scenario_history_v1',legacy]])
  const readKeys = []
  const storage = {getItem(key){readKeys.push(key);return map.get(key)},setItem(key,value){map.set(key,value)}}
  assert.deepEqual(loadScenarioHistory(storage),[])
  const record = {id:'test',scenarioId:'work-raise',title:'合成测试',date:1,messages:[{role:'user',text:'我最终发送的回应。'}],debrief:{closest:'我最终发送的回应。',takeaway:'',nextTry:'我想再确认一下。'}}
  assert.equal(saveScenarioHistory(storage,[record]),true)
  assert.deepEqual(loadScenarioHistory(storage),[record])
  assert.deepEqual(readKeys,[SCENARIO_HISTORY_V2,SCENARIO_HISTORY_V2])
  assert.equal(map.get('nuo_scenario_history_v1'),legacy)
})

test('存储失败不谎报成功；坏历史容错，超过30条不静默删除旧记录', () => {
  assert.equal(saveScenarioHistory({setItem(){throw Error('quota')}},[]),false)
  for(const raw of ['bad json','{}','[null,{"scenarioId":"bad"}]']) assert.deepEqual(loadScenarioHistory({getItem(){return raw}}),[])
  let saved
  assert.equal(saveScenarioHistory({setItem(_,value){saved=JSON.parse(value)}},Array.from({length:35},(_,i)=>i)),true)
  assert.equal(saved.length,35)
})
