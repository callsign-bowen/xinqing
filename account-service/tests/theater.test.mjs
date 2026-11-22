import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanTheaterHistory, extractJson, normalizeTheaterScript, theaterMessages } from '../theater.mjs'

const sample = {
  hasScene: true,
  title: '成绩单那晚',
  setting: '家里客厅·晚上',
  cast: [{ id: 'me', name: '我', role: 'self' }, { id: 'c1', name: '妈妈', role: 'mother' }, { id: 'c2', name: '爸爸', role: 'father' }],
  beats: [
    { actor: 'c1', action: 'point', mood: 'angry', target: 'me', line: '你看看你这次考的！', certainty: 'said' },
    { actor: 'me', action: 'turn_away', mood: 'hurt', line: '', certainty: 'said' },
    { actor: 'c2', action: 'sigh', mood: 'sad', line: '', certainty: 'gist' }
  ],
  unknown: '爸爸当时说了什么还不清楚'
}

test('extractJson tolerates code fences and surrounding text', () => {
  const raw = '好的：\n```json\n' + JSON.stringify(sample) + '\n```\n以上'
  assert.deepEqual(extractJson(raw).title, '成绩单那晚')
  assert.equal(extractJson('没有 JSON'), null)
  assert.equal(extractJson('{"a": "含有}括号的字符串", "b": 1}').b, 1)
})

test('normalizeTheaterScript keeps valid beats and forces me first', () => {
  const script = normalizeTheaterScript(sample)
  assert.equal(script.cast[0].id, 'me')
  assert.equal(script.cast.length, 3)
  assert.equal(script.beats.length, 3)
  assert.equal(script.beats[0].target, 'me')
  assert.equal(script.beats[2].certainty, 'gist')
})

test('normalizeTheaterScript repairs unknown actions, moods and roles, drops bad actors', () => {
  const script = normalizeTheaterScript({
    ...sample,
    cast: [{ id: 'me', name: '我', role: 'self' }, { id: 'c1', name: '妈妈', role: 'alien' }],
    beats: [
      { actor: 'c1', action: 'fly', mood: 'ecstatic', line: 'x'.repeat(200) },
      { actor: 'ghost', action: 'speak', line: '不该出现' },
      { actor: 'me', action: 'nod', mood: 'calm', line: '' }
    ]
  })
  assert.equal(script.cast[1].role, 'other')
  assert.equal(script.beats.length, 2)
  assert.equal(script.beats[0].action, 'speak')
  assert.equal(script.beats[0].mood, 'calm')
  assert.equal(script.beats[0].line.length, 60)
})

test('normalizeTheaterScript returns null when there is no scene', () => {
  assert.equal(normalizeTheaterScript({ hasScene: false }), null)
  assert.equal(normalizeTheaterScript(null), null)
  assert.equal(normalizeTheaterScript({ ...sample, cast: [{ id: 'me', name: '我', role: 'self' }] }), null)
  assert.equal(normalizeTheaterScript({ ...sample, beats: [sample.beats[0]] }), null)
})

test('theaterMessages includes transcript and previous script', () => {
  const history = cleanTheaterHistory([{ role: 'user', text: '我跟我妈吵架了' }, { role: 'assistant', text: '发生了什么？' }, { role: 'system', text: 'x' }])
  assert.equal(history.length, 2)
  const messages = theaterMessages(history, sample)
  assert.equal(messages[0].role, 'system')
  assert.match(messages[1].content, /用户：我跟我妈吵架了/)
  assert.match(messages[1].content, /上一版剧本/)
  assert.doesNotMatch(theaterMessages(history, null)[1].content, /上一版剧本/)
})

test('POST /api/theater/script goes through the model and returns a cleaned script', async t => {
  const { startIsolatedService } = await import('./support/isolated-service.mjs')
  const service = await startIsolatedService({ respond: () => '```json\n' + JSON.stringify(sample) + '\n```' })
  t.after(service.close)
  const post = data => fetch(service.origin + '/api/theater/script', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  const response = await post({ history: [{ role: 'user', text: '我妈指着我说你看看你这次考的' }, { role: 'assistant', text: '那一刻你什么感觉？' }] })
  assert.equal(response.status, 200)
  const { script } = await response.json()
  assert.equal(script.title, '成绩单那晚')
  assert.equal(service.requests.at(-1).messages[0].role, 'system')
  assert.equal((await post({ history: [] })).status, 400)
})

test('normalizeTheaterScript maps Chinese ids, names and out-of-order ids to me/c1/c2', () => {
  const script = normalizeTheaterScript({
    title: 't',
    cast: [{ id: '我', name: '我', role: 'self' }, { id: '妈妈', name: '妈妈', role: 'mother' }, { id: 'c1', name: '爸爸', role: 'father' }],
    beats: [
      { actor: '妈妈', action: 'point', target: '我', line: '你看看你考的什么' },
      { actor: 'me', action: 'speak', target: '妈妈', line: '我已经很努力了' },
      { actor: '爸爸', action: 'sigh', line: '' },
      { actor: 'c1', action: 'nod', line: '' }
    ]
  })
  assert.deepEqual(script.cast.map(c => `${c.id}:${c.name}`), ['me:我', 'c1:妈妈', 'c2:爸爸'])
  assert.deepEqual(script.beats.map(b => b.actor), ['c1', 'me', 'c2', 'c2'])
  assert.equal(script.beats[0].target, 'me')
  assert.equal(script.beats[1].target, 'c1')
})
