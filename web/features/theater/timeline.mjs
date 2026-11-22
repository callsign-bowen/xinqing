/**
 * 把剧本排成可播放的时间轴（纯函数）。
 *
 * 舞台横向坐标用百分比：0 是左幕边，100 是右幕边。“我”站左边，其他人站右边。
 * 每一拍算好这一刻所有人站在哪、朝哪边、这拍放多久，播放器只管照着摆。
 * 往回翻页时直接取那一拍的快照，不需要倒放。
 */

const MIN_GAP = 13
const STAGE_MIN = 12
const STAGE_MAX = 88

const BASE_DURATION = {
  enter: 1700, exit: 1700, stomp: 1900, shout: 2000, cry: 2400, sigh: 2100,
  freeze: 1900, hold_head: 2200, slump: 2000
}

export function homePositions(cast) {
  const home = {}
  const others = cast.filter(member => member.id !== 'me')
  home.me = 24
  if (others.length === 1) home[others[0].id] = 70
  else others.forEach((member, i) => { home[member.id] = 56 + (30 * i) / (others.length - 1) })
  return home
}

function offstage(x) {
  return x < 50 ? -18 : 118
}

function clamp(x) {
  return Math.min(STAGE_MAX, Math.max(STAGE_MIN, x))
}

export function beatDuration(beat) {
  const base = BASE_DURATION[beat.action] || 1700
  const reading = (beat.line || '').length * 125
  return Math.round(Math.min(7500, Math.max(1900, base + reading)))
}

function onStage(x) {
  return x > -5 && x < 105
}

/** 离 actor 最近、还在台上的其他人。 */
function nearestOther(positions, actor) {
  let best = null
  for (const [id, x] of Object.entries(positions)) {
    if (id === actor || !onStage(x)) continue
    if (best === null || Math.abs(x - positions[actor]) < Math.abs(positions[best] - positions[actor])) best = id
  }
  return best
}

function faceToward(positions, actor, other, fallback) {
  if (!other || positions[other] === positions[actor]) return fallback
  return positions[other] > positions[actor] ? 1 : -1
}

export function buildTimeline(script) {
  const home = homePositions(script.cast)
  const { positions, facing } = openingPositions(script)

  return script.beats.map((beat, index) => {
    const actor = beat.actor
    const other = beat.target && beat.target in positions ? beat.target : nearestOther(positions, actor)
    switch (beat.action) {
      case 'enter':
        positions[actor] = home[actor]
        break
      case 'exit':
        positions[actor] = offstage(home[actor])
        break
      case 'step_forward': {
        if (!other) break
        const dir = positions[other] > positions[actor] ? 1 : -1
        const limit = positions[other] - dir * MIN_GAP
        const next = positions[actor] + dir * 11
        const here = positions[actor]
        positions[actor] = clamp(dir > 0 ? Math.max(here, Math.min(next, limit)) : Math.min(here, Math.max(next, limit)))
        break
      }
      case 'step_back': {
        const dir = other && positions[other] > positions[actor] ? 1 : -1
        positions[actor] = clamp(positions[actor] - dir * 9)
        break
      }
      default:
        break
    }
    if (onStage(positions[actor])) facing[actor] = faceToward(positions, actor, other, facing[actor])
    // 被指着、被吼的人转过来面对说话的人。
    if (beat.target && beat.target in positions && onStage(positions[beat.target])) {
      facing[beat.target] = faceToward(positions, beat.target, actor, facing[beat.target])
    }
    const stepFacing = { ...facing }
    if (beat.action === 'turn_away') stepFacing[actor] = -facing[actor]
    if (beat.action === 'exit') stepFacing[actor] = positions[actor] > 50 ? 1 : -1
    return {
      ...beat,
      index,
      positions: { ...positions },
      facing: stepFacing,
      duration: beatDuration(beat)
    }
  })
}

/** 开场时（标题卡）每个人的位置：先上场的人已在台上，等着 enter 的人在幕后。 */
export function openingPositions(script) {
  const home = homePositions(script.cast)
  const firstAction = {}
  for (const beat of script.beats) if (!(beat.actor in firstAction)) firstAction[beat.actor] = beat.action
  const positions = {}
  const facing = {}
  for (const member of script.cast) {
    positions[member.id] = firstAction[member.id] === 'enter' ? offstage(home[member.id]) : home[member.id]
    facing[member.id] = member.id === 'me' ? 1 : -1
  }
  return { positions, facing }
}
