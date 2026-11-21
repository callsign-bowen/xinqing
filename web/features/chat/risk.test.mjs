import test from 'node:test'
import assert from 'node:assert/strict'
import { riskOfText } from './risk.ts'

test('日常疲惫和难过不被当成高风险', () => {
  for (const text of ['今天好累', '我有点难过', '最近很焦虑', '压力好大', '撑不下去了', '有点难受']) {
    assert.equal(riskOfText(text), 'medium', text)
  }
})

test('只有明确的自伤表达才是高风险', () => {
  for (const text of ['我不想活了', '我想消失', '想过自杀', '想死']) {
    assert.equal(riskOfText(text), 'high', text)
  }
})

test('告别、安排后事、被暴力也按高风险处理', () => {
  for (const text of ['我把东西都送人了，房间也收拾好了', '这是我最后一次找你了', '我已经想好了，你不用劝我', '我走了以后，你还会记得我吗', '我查过方法了，就是有点怕疼', '我今晚把药都攒够了', '我被人打了，不敢回家']) {
    assert.equal(riskOfText(text), 'high', text)
  }
})

test('普通分享保持低风险', () => {
  for (const text of ['今天天气不错', '刚吃了一碗面', '哈哈', '这个周末去爬山']) {
    assert.equal(riskOfText(text), 'low', text)
  }
})
