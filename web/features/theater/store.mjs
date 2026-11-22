/**
 * 演绎记录（纯函数）。保存在本机 localStorage 的 nuo_theater 里，不上传、不同步。
 *
 * 结构：{ version: 1, sessions: { [chatSessionId]: { updatedAt, episodes: Episode[] } } }
 * Episode：{ id, round, createdAt, script }，round 是生成时这段对话里用户说到第几句。
 */

export const THEATER_KEY = 'nuo_theater'
export const MAX_EPISODES = 12
export const MAX_SESSIONS = 30

export function emptyTheater() {
  return { version: 1, sessions: {} }
}

/** 播放器只接受结构完整的剧本：至少两位人物、两拍，每拍的 actor 都在人物表里。 */
export function isPlayableScript(script) {
  if (!script || typeof script !== 'object') return false
  if (!Array.isArray(script.cast) || script.cast.length < 2) return false
  if (!Array.isArray(script.beats) || script.beats.length < 2) return false
  const ids = new Set(script.cast.map(member => member && member.id))
  if (!ids.has('me')) return false
  return script.beats.every(beat => beat && ids.has(beat.actor) && typeof beat.action === 'string')
}

export function readTheater(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!data || typeof data !== 'object' || !data.sessions || typeof data.sessions !== 'object') return emptyTheater()
    const sessions = {}
    for (const [id, entry] of Object.entries(data.sessions)) {
      const episodes = Array.isArray(entry?.episodes)
        ? entry.episodes.filter(item => item && typeof item.id === 'string' && isPlayableScript(item.script))
        : []
      if (episodes.length) sessions[id] = { updatedAt: Number(entry.updatedAt) || 0, episodes }
    }
    return { version: 1, sessions }
  } catch {
    return emptyTheater()
  }
}

export function episodesOf(store, sessionId) {
  return store.sessions[sessionId]?.episodes || []
}

export function latestScript(store, sessionId) {
  const list = episodesOf(store, sessionId)
  return list.length ? list[list.length - 1].script : null
}

function sameScript(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 新增一轮演绎。和上一轮完全相同（这轮对话没带来新情节）时不新增。
 * 返回新的 store 和是否真的加上了；原 store 不被修改。
 */
export function addEpisode(store, sessionId, script, { now = Date.now(), round = 0 } = {}) {
  if (!sessionId || !isPlayableScript(script)) return { store, added: false }
  const previous = latestScript(store, sessionId)
  if (previous && sameScript(previous, script)) return { store, added: false }
  const episodes = [...episodesOf(store, sessionId), { id: `ep-${now}-${round}`, round, createdAt: now, script }].slice(-MAX_EPISODES)
  const sessions = { ...store.sessions, [sessionId]: { updatedAt: now, episodes } }
  const ids = Object.keys(sessions)
  if (ids.length > MAX_SESSIONS) {
    ids.sort((a, b) => sessions[a].updatedAt - sessions[b].updatedAt)
    for (const id of ids.slice(0, ids.length - MAX_SESSIONS)) delete sessions[id]
  }
  return { store: { version: 1, sessions }, added: true }
}

export function removeTheaterSession(store, sessionId) {
  if (!store.sessions[sessionId]) return store
  const sessions = { ...store.sessions }
  delete sessions[sessionId]
  return { version: 1, sessions }
}

/** 发给后端的对话：去掉没发出去的、空的，只留角色和文字。 */
export function theaterHistory(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(item => item && (item.role === 'user' || item.role === 'assistant') && !item.sendError)
    .map(item => ({ role: item.role, text: String(item.text || '').trim() }))
    .filter(item => item.text && item.text !== '[图片]')
}

export function userRound(messages) {
  return theaterHistory(messages).filter(item => item.role === 'user').length
}
