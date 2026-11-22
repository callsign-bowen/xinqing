/**
 * 演绎系统（木偶默剧）的剧本生成：提示词与结果整理，纯函数，可独立测试。
 *
 * 每轮对话结束后，前端在后台把“这段对话”发来，这里让模型把用户讲到的人际场景
 * 整理成一出木偶默剧：出场人物、每一拍谁做什么动作、字幕卡上写什么话。
 *
 * 规则：
 * - 只演用户讲过的事。用户转述过的话用原话（certainty: said）；只说了大意的写成大意（gist）。
 * - 不替对方编心理活动，不补用户没提的情节；不知道对方说了什么，就让对方沉默或只做动作。
 * - 没有具体人际场景（只是聊心情、闲聊）时 hasScene=false，不出剧本。
 */

export const THEATER_ACTIONS = [
  'enter', 'exit', 'speak', 'shout', 'point', 'cross_arms', 'turn_away', 'step_forward',
  'step_back', 'stomp', 'slump', 'cry', 'shake_head', 'nod', 'sigh', 'freeze', 'wave_off', 'hold_head'
]
export const THEATER_MOODS = ['calm', 'angry', 'sad', 'hurt', 'anxious', 'cold', 'surprised']
export const THEATER_ROLES = [
  'self', 'mother', 'father', 'parent', 'sibling', 'grandparent', 'partner', 'friend',
  'classmate', 'teacher', 'boss', 'colleague', 'other'
]

const MAX_CAST = 5
const MAX_BEATS = 16
const MAX_LINE = 60
const MAX_HISTORY = 30
const MAX_TEXT = 1200

const ACTION_SET = new Set(THEATER_ACTIONS)
const MOOD_SET = new Set(THEATER_MOODS)
const ROLE_SET = new Set(THEATER_ROLES)

function clip(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/** 前端发来的本段对话：只留文字，按时间顺序，最多 30 条。 */
export function cleanTheaterHistory(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string')
    .map(item => ({ role: item.role, text: clip(item.text, MAX_TEXT) }))
    .filter(item => item.text)
    .slice(-MAX_HISTORY)
}

export const THEATER_SYSTEM = `你是一位木偶默剧编剧。用户在和陪伴 AI 聊天时，可能讲到了和别人之间发生的事（比如和爸妈吵架）。
你的任务：把用户讲到的那件事，整理成一出简短的木偶默剧剧本，供用户日后回看。

只输出一个 JSON 对象，不要任何解释、不要代码块标记。格式：
{
  "hasScene": true,
  "title": "不超过14个字的剧名",
  "setting": "地点和时间，如“公司会议室·下午”，不知道就写“某个时候”",
  "cast": [
    {"id": "me", "name": "我", "role": "self"},
    {"id": "c1", "name": "组长", "role": "boss"}
  ],
  "beats": [
    {"actor": "c1", "action": "wave_off", "mood": "cold", "target": "me", "line": "这个方案不用再说了", "certainty": "said"},
    {"actor": "me", "action": "freeze", "mood": "hurt", "line": "", "certainty": "said"}
  ],
  "unknown": "一句话说明还不清楚的部分，没有就写空字符串"
}

字段约束：
- cast 最多 ${MAX_CAST} 人，第一位固定是 {"id":"me","name":"我","role":"self"}；其他人 id 用 c1、c2…
- role 只能是：${THEATER_ROLES.join(', ')}
- beats 3 到 ${MAX_BEATS} 拍，按事情发生的先后顺序；每拍一个 actor（cast 里的 id）
- action 只能是：${THEATER_ACTIONS.join(', ')}
  （enter 上场，exit 离场，speak 说话，shout 大声喊，point 指着对方，cross_arms 抱臂，turn_away 转身背对，step_forward 逼近一步，step_back 后退一步，stomp 跺脚/摔门，slump 垂头丧气，cry 哭，shake_head 摇头，nod 点头，sigh 叹气，freeze 僵住不动，wave_off 摆手不想听，hold_head 抱头）
- mood 只能是：${THEATER_MOODS.join(', ')}
- target 可省略，要写就写 cast 里的 id
- line 是字幕卡上的台词，不超过 ${MAX_LINE} 字，可以为空（只做动作）
- certainty：用户转述过的原话用 "said"；用户只说了大概意思、你概括成台词的用 "gist"

必须遵守：
1. 只演用户讲过的事，不补用户没提到的情节、人物、原因和结局。
2. 用户没说对方讲了什么，就不要替对方编台词：让对方沉默（line 为空）或只做动作，并在 unknown 里说明。
   用户自己的台词也一样，只用用户说过的话。“回房间”“关上门”这类动作用 action 表达，line 留空，不要写成台词。
3. 用户提到在场的每一个人都要放进 cast，各自用自己的 id；谁说的话就记在谁名下，不要张冠李戴。
4. 不替任何人读心，不写内心独白，不评判谁对谁错。
5. 用户原话尽量保留原样；粗口可以弱化，但意思不变。
6. 如果这段对话里没有具体的人际场景（只是聊心情、闲聊、问问题），输出 {"hasScene": false}。
7. 如果给了“上一版剧本”，在它的基础上按新信息补充或修正，保持人物 id 和称呼不变。`

/** 组装发给模型的消息。previous 是这段对话上一版剧本（可为空）。 */
export function theaterMessages(history, previous) {
  const transcript = history
    .map(item => `${item.role === 'user' ? '用户' : 'AI'}：${item.text}`)
    .join('\n')
  const parts = [`下面是用户和陪伴 AI 的这段对话：\n${transcript}`]
  const prior = previous ? normalizeTheaterScript(previous) : null
  if (prior) parts.push(`上一版剧本：\n${JSON.stringify(prior)}`)
  parts.push('请输出剧本 JSON。')
  return [
    { role: 'system', content: THEATER_SYSTEM },
    { role: 'user', content: parts.join('\n\n') }
  ]
}

/** 从模型回复里取出第一个完整的 JSON 对象。 */
export function extractJson(text) {
  if (typeof text !== 'string') return null
  const body = text.replace(/```(?:json)?/gi, '')
  const start = body.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < body.length; i++) {
    const ch = body[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(body.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

/**
 * 把模型给的剧本整理成播放器能放心使用的结构。
 * 不合格的拍子丢掉；不足 2 拍或没有对手角色时视为没有场景，返回 null。
 */
export function normalizeTheaterScript(raw) {
  if (!raw || typeof raw !== 'object' || raw.hasScene === false) return null
  // 模型有时用“妈妈”“mom”这类写法当 id，或在 beats 里直接写名字：
  // 人物的原 id 和称呼都记成别名，统一换成 me / c1 / c2…，不因写法不同丢掉人物。
  const cast = [{ id: 'me', name: '我', role: 'self' }]
  const alias = new Map(['me', '我', 'self', 'user', '用户', '自己'].map(key => [key, 'me']))
  const key = value => clip(String(value ?? ''), 16).toLowerCase()
  for (const member of Array.isArray(raw.cast) ? raw.cast : []) {
    if (!member || typeof member !== 'object') continue
    const rawId = key(member.id)
    const name = clip(member.name, 8)
    if (member.role === 'self' || alias.get(rawId) === 'me' || alias.get(key(name)) === 'me') continue
    if ((rawId && alias.has(rawId)) || (name && alias.has(key(name)))) continue
    if (cast.length >= MAX_CAST) break
    const id = `c${cast.length}`
    const role = ROLE_SET.has(member.role) ? member.role : 'other'
    cast.push({ id, name: name || '对方', role })
    if (rawId) alias.set(rawId, id)
    if (name) alias.set(key(name), id)
  }
  if (cast.length < 2) return null

  const beats = []
  for (const beat of Array.isArray(raw.beats) ? raw.beats : []) {
    if (!beat || typeof beat !== 'object') continue
    const actor = alias.get(key(beat.actor))
    if (!actor) continue
    const action = ACTION_SET.has(beat.action) ? beat.action : 'speak'
    const mood = MOOD_SET.has(beat.mood) ? beat.mood : 'calm'
    const line = clip(beat.line, MAX_LINE)
    const item = { actor, action, mood, line, certainty: beat.certainty === 'gist' ? 'gist' : 'said' }
    const target = beat.target == null ? undefined : alias.get(key(beat.target))
    if (target && target !== actor) item.target = target
    beats.push(item)
    if (beats.length >= MAX_BEATS) break
  }
  if (beats.length < 2) return null

  return {
    title: clip(raw.title, 14) || '那一次',
    setting: clip(raw.setting, 24) || '某个时候',
    cast,
    beats,
    unknown: clip(raw.unknown, 80)
  }
}
