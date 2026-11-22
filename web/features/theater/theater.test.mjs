import test from 'node:test'
import assert from 'node:assert/strict'
import { addEpisode, emptyTheater, episodesOf, isPlayableScript, latestScript, MAX_EPISODES, readTheater, removeTheaterSession, theaterHistory, userRound } from './store.mjs'
import { buildTimeline, homePositions, openingPositions } from './timeline.mjs'

const script = {
  title: '吵架', setting: '客厅',
  cast: [{ id: 'me', name: '我', role: 'self' }, { id: 'c1', name: '妈妈', role: 'mother' }],
  beats: [
    { actor: 'c1', action: 'enter', mood: 'angry', line: '', certainty: 'said' },
    { actor: 'c1', action: 'step_forward', mood: 'angry', target: 'me', line: '你又考砸了', certainty: 'said' },
    { actor: 'me', action: 'step_back', mood: 'hurt', line: '我已经很努力了', certainty: 'said' },
    { actor: 'me', action: 'turn_away', mood: 'hurt', line: '', certainty: 'said' },
    { actor: 'c1', action: 'exit', mood: 'cold', line: '', certainty: 'gist' }
  ]
}

test('store adds episodes, skips duplicates and caps history', () => {
  let store = emptyTheater()
  let result = addEpisode(store, 's1', script, { now: 1, round: 1 })
  assert.equal(result.added, true)
  store = result.store
  assert.equal(addEpisode(store, 's1', script, { now: 2, round: 2 }).added, false)
  for (let i = 0; i < MAX_EPISODES + 3; i++) {
    store = addEpisode(store, 's1', { ...script, title: `第${i}` }, { now: 10 + i, round: i }).store
  }
  assert.equal(episodesOf(store, 's1').length, MAX_EPISODES)
  assert.equal(latestScript(store, 's1').title, `第${MAX_EPISODES + 2}`)
  assert.deepEqual(episodesOf(removeTheaterSession(store, 's1'), 's1'), [])
})

test('store rejects unplayable scripts and survives broken storage', () => {
  assert.equal(isPlayableScript({ cast: [], beats: [] }), false)
  assert.equal(addEpisode(emptyTheater(), 's1', { title: 'x' }).added, false)
  assert.deepEqual(readTheater('{not json'), emptyTheater())
  const stored = JSON.stringify({ version: 1, sessions: { s1: { updatedAt: 1, episodes: [{ id: 'a', script }, { id: 'b', script: { bad: true } }] } } })
  assert.equal(episodesOf(readTheater(stored), 's1').length, 1)
})

test('history drops failed sends and images; round counts user lines', () => {
  const messages = [
    { role: 'assistant', text: '你好' },
    { role: 'user', text: '我跟我爸吵架了' },
    { role: 'assistant', text: '怎么了？' },
    { role: 'user', text: '没发出去', sendError: '网络' },
    { role: 'user', text: '[图片]' }
  ]
  assert.equal(theaterHistory(messages).length, 3)
  assert.equal(userRound(messages), 1)
})

test('timeline: entering actors start offstage and walk to their mark', () => {
  const home = homePositions(script.cast)
  const opening = openingPositions(script)
  assert.ok(opening.positions.c1 > 100)
  assert.equal(opening.positions.me, home.me)
  const steps = buildTimeline(script)
  assert.equal(steps.length, 5)
  assert.equal(steps[0].positions.c1, home.c1)
})

test('timeline: step forward approaches but never overlaps; step back retreats', () => {
  const steps = buildTimeline(script)
  const afterForward = steps[1].positions
  assert.ok(afterForward.c1 < steps[0].positions.c1)
  assert.ok(afterForward.c1 - afterForward.me >= 13)
  assert.ok(steps[2].positions.me < afterForward.me)
  assert.equal(steps[1].facing.c1, -1)
  assert.equal(steps[1].facing.me, 1)
})

test('timeline: turn away flips only that beat; exit leaves the stage', () => {
  const steps = buildTimeline(script)
  assert.equal(steps[3].facing.me, -1)
  assert.equal(steps[4].facing.me, 1)
  assert.ok(steps[4].positions.c1 > 100)
  assert.ok(steps.every(step => step.duration >= 1900 && step.duration <= 7500))
})

test('timeline: three-person cast spreads others to the right', () => {
  const home = homePositions([{ id: 'me' }, { id: 'c1' }, { id: 'c2' }])
  assert.ok(home.me < home.c1 && home.c1 < home.c2 && home.c2 <= 88)
})
