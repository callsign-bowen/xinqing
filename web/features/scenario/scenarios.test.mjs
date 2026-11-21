import test from 'node:test'
import assert from 'node:assert/strict'
import { SCENARIOS, CATEGORY_LABELS, SUBCATEGORY_LABELS, DIFFICULTY_LABELS, scenarioById } from './scenarios.ts'

test('原六卡保留并补齐八大类，十张卡 ID 唯一', () => {
  assert.equal(SCENARIOS.length, 10)
  assert.equal(new Set(SCENARIOS.map((item) => item.id)).size, 10)
  for(const id of ['work-raise','work-blame','family-marriage','intimacy-cold','friend-loan','intimacy-breakup']) assert.ok(scenarioById(id))
  for(const category of Object.keys(CATEGORY_LABELS)) assert.ok(SCENARIOS.some(s=>s.category===category),category)
})

test('8 个大类都有标签和子类', () => {
  assert.equal(Object.keys(CATEGORY_LABELS).length, 8)
  for (const key of Object.keys(CATEGORY_LABELS)) {
    assert.ok(CATEGORY_LABELS[key], key)
    assert.ok(Array.isArray(SUBCATEGORY_LABELS[key]) && SUBCATEGORY_LABELS[key].length > 0, key)
  }
})

test('每个情境都有子类和三档难度', () => {
  for (const scenario of SCENARIOS) {
    assert.ok(scenario.subcategory, scenario.id)
    for (const difficulty of ['gentle', 'realistic', 'tough']) {
      assert.ok(DIFFICULTY_LABELS[difficulty], difficulty)
      assert.ok(scenario.openings[difficulty], `${scenario.id} ${difficulty} opening`)
      assert.ok(scenario.styles[difficulty], `${scenario.id} ${difficulty} style`)
    }
    assert.ok(scenario.title && scenario.oneLine && scenario.context && scenario.goal, scenario.id)
    assert.ok(scenario.avoid.length > 0, scenario.id)
    assert.ok(scenario.debriefFocus.length > 0, scenario.id)
  }
})

test('按 id 能找到情境，未知 id 返回 undefined', () => {
  assert.equal(scenarioById('work-raise')?.title, '跟领导提加薪')
  assert.equal(scenarioById('nope'), undefined)
})
