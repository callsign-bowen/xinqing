/**
 * 账号服务：注册、登录、按天上线人数，以及 DeepSeek 对话。
 * 只依赖 Node 自带模块，方便放到一台干净的 Ubuntu 上。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStore, openDatabase } from './db.mjs'
import { guidancePrompt, normalizeGuide, readGuidedReply } from './guidance.mjs'
import { cleanHistory } from './chat-context.mjs'
import { prepareCompletionMessages } from './completion-messages.mjs'
import { createCompletionDiagnostic } from './completion-diagnostics.mjs'
import { NATURAL_DIALOGUE } from './dialogue-style.mjs'

/** 本地开发：允许把密钥放在 account-service/.env，不必每次手写环境变量。 */
function loadLocalEnv() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env')
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at <= 0) continue
    const key = trimmed.slice(0, at).trim()
    const value = trimmed.slice(at + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}
loadLocalEnv()

const PORT = Number(process.env.PORT || 80)
const DATA_PATH = process.env.DATA_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'accounts.json')
const STATIC_DIR = process.env.STATIC_DIR || ''
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'dev-only-change-me'
const AI_API_KEY = process.env.AI_API_KEY || ''
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.deepseek.com/v1'
const AI_MODEL = process.env.AI_MODEL || 'deepseek-chat'
const AI_VISION_MODEL = process.env.AI_VISION_MODEL || 'deepseek-flash'
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 20000)
const AI_STREAM_TIMEOUT_MS = Number(process.env.AI_STREAM_TIMEOUT_MS || 60000)
// natural：模型只返回可见正文；guided：保留旧的每轮 JSON 引导协议，便于对照与回滚。
const CHAT_MODE = process.env.CHAT_MODE === 'guided' ? 'guided' : 'natural'
const DB_PATH = process.env.DB_PATH || path.join(path.dirname(DATA_PATH), 'nuo.db')
const store = createStore(openDatabase(DB_PATH))
store.importLegacy(DATA_PATH)
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const MAX_BODY = 8_000_000

const USER_KEYS = [
  'nuo_emotions',
  'nuo_theme',
  'nuo_mascot',
  'nuo_style',
  'nuo_chat_sessions',
  'nuo_safety_plan',
  'nuo_comfort_letter',
  'nuo_energy_log',
  'nuo_night_log',
  'nuo_encourage_date',
  'nuo_encourage_line',
  'nuo_onboarding_done',
  'nuo_user_age_group',
  'nuo_personality',
  'nuo_personal_report',
  'nuo_region',
  'scene_events'
]

function shanghaiDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex')
}

function passwordMatches(password, salt, expectedHex) {
  const actual = Buffer.from(hashPassword(password, salt), 'hex')
  const expected = Buffer.from(expectedHex, 'hex')
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(actual, expected)
}

function validateUsername(value) {
  if (typeof value !== 'string') return '请输入账号'
  const name = value.trim()
  if (name.length < 2) return '账号至少 2 个字符'
  if (name.length > 20) return '账号不能超过 20 个字符'
  if (/\s/.test(name)) return '账号不能包含空格'
  return ''
}

function validatePassword(value) {
  if (typeof value !== 'string') return '请输入密码'
  if (value.length < 6) return '密码至少 6 位'
  if (value.length > 64) return '密码不能超过 64 位'
  return ''
}

function sanitizeVault(input) {
  if (input == null) return {}
  if (typeof input !== 'object' || Array.isArray(input)) return null
  const data = {}
  let total = 0
  for (const key of USER_KEYS) {
    const value = input[key]
    if (value == null) {
      data[key] = null
      continue
    }
    if (typeof value !== 'string') return null
    total += value.length
    if (value.length > 4_000_000 || total > 6_000_000) return null
    data[key] = value
  }
  return data
}

function publicUser(user) {
  return { username: user.username }
}

function bearerToken(req) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

function userFromRequest(req) {
  return store.userFromToken(bearerToken(req))
}

function openSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  store.createSession(userId, token, Date.now() + SESSION_MS)
  store.recordVisit(userId, shanghaiDay(), shanghaiDay(new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)))
  return token
}

const attempts = new Map()
function tooManyAttempts(ip, limit = 30) {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || entry.reset < now) {
    attempts.set(ip, { count: 1, reset: now + 10 * 60 * 1000 })
    return false
  }
  entry.count += 1
  return entry.count > limit
}

function clientIp(req) {
  const raw = req.socket.remoteAddress || 'unknown'
  return raw.replace(/^::ffff:/, '')
}

function signAdmin(exp) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url')
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function adminOk(req) {
  const cookie = req.headers.cookie || ''
  const match = cookie.match(/(?:^|;\s*)nuo_admin=([^;]+)/)
  if (!match) return false
  const token = decodeURIComponent(match[1])
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof body.exp === 'number' && body.exp > Date.now()
  } catch {
    return false
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('内容太大'), { status: 413 }))
        req.destroy()
      } else {
        chunks.push(chunk)
      }
    })
    req.on('end', () => {
      if (!chunks.length) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('请求格式不正确'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

function send(res, status, body, extraHeaders) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  })
  res.end(payload)
}

function sendError(res, status, message) {
  send(res, status, { error: { message } })
}

/** 流式回复：先发头，再按事件推送增量与最终结果。 */
function sseOpen(res) {
  res.on('error', () => { /* 客户端提前断开时不再抛出未处理的响应错误 */ })
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.write(': connected\n\n')
}

function sseSend(res, event, data) {
  if (res.writableEnded) return
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function applyCors(req, res) {
  const origin = req.headers.origin || ''
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
    res.setHeader('Vary', 'Origin')
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.apk': 'application/vnd.android.package-archive'
}

function serveStatic(req, res, urlPath) {
  if (!STATIC_DIR) return false
  const clean = urlPath === '/' ? '/index.html' : urlPath
  const file = path.normalize(path.join(STATIC_DIR, clean))
  if (!file.startsWith(path.normalize(STATIC_DIR))) return false
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }
    if (path.extname(file) === '.html') headers['Cache-Control'] = 'no-cache'
    if (path.extname(file) === '.apk') headers['Content-Disposition'] = 'attachment; filename="Nuo.apk"'
    res.writeHead(200, headers)
    fs.createReadStream(file).pipe(res)
    return true
  }
  const index = path.join(STATIC_DIR, 'index.html')
  if (fs.existsSync(index)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
    fs.createReadStream(index).pipe(res)
    return true
  }
  return false
}

const ADMIN_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nuo 上线情况</title>
  <style>
    body{margin:0;font-family:sans-serif;background:#f6f6f6;color:#1a1a1a}
    main{max-width:720px;margin:0 auto;padding:32px 20px}
    h1{font-weight:500;font-size:28px}
    .cards{display:flex;gap:12px;margin:20px 0}
    .card{flex:1;background:#fff;border-radius:16px;padding:16px 18px}
    .card b{display:block;font-size:32px;font-weight:500}
    .card span{color:#666;font-size:13px}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden}
    td,th{padding:12px 16px;text-align:left;border-bottom:1px solid #eee}
    form{display:flex;gap:8px;margin-top:24px}
    input,button{height:44px;border-radius:12px;border:1px solid #ddd;padding:0 14px;font-size:15px}
    button{background:#111;color:#fff;border:0;cursor:pointer}
    .err{color:#a33}
  </style>
</head>
<body>
<main>
  <h1>上线情况</h1>
  <p id="hint">查看每天有多少人打开过 Nuo。</p>
  <form id="login">
    <input id="password" type="password" placeholder="后台密码" autocomplete="current-password">
    <button type="submit">进入</button>
  </form>
  <p class="err" id="error"></p>
  <section id="stats" hidden>
    <div class="cards">
      <div class="card"><b id="today">-</b><span>今日上线人数</span></div>
      <div class="card"><b id="total">-</b><span>注册账号</span></div>
    </div>
    <table>
      <thead><tr><th>日期</th><th>上线人数</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </section>
</main>
<script>
const login = document.getElementById('login')
const error = document.getElementById('error')
async function load() {
  const res = await fetch('/api/admin/stats')
  if (res.status === 401) return
  const data = await res.json()
  document.getElementById('stats').hidden = false
  login.hidden = true
  document.getElementById('hint').textContent = '人数按自然日统计，时区为北京时间。同一个人当天只算一次。'
  document.getElementById('today').textContent = data.today
  document.getElementById('total').textContent = data.totalUsers
  document.getElementById('rows').innerHTML = data.days.map((item) => '<tr><td>' + item.date + '</td><td>' + item.count + '</td></tr>').join('')
}
login.addEventListener('submit', async (event) => {
  event.preventDefault()
  error.textContent = ''
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: document.getElementById('password').value })
  })
  if (!res.ok) {
    error.textContent = '密码不正确'
    return
  }
  load()
})
load()
</script>
</body>
</html>`

const HIGH_RISK_WORDS = ['想死', '自杀', '轻生', '不想活', '想消失', '结束生命', '割腕', '跳楼', '活不下去', '东西都送人了', '房间也收拾好了', '最后一次找你', '我已经想好了，你不用劝我', '我走了以后', '我不想醒过来', '活着没什么意思', '查过方法', '药都攒够', '被人打了', '不敢回家']
const MEDIUM_RISK_WORDS = ['难受', '崩溃', '撑不住', '撑不下去', '焦虑', '难过', '压力', '紧张', '累']
const FALLBACK_REPLY = {
  high: '谢谢你愿意说出来。先确认一件事：你现在安全吗？身边有没有人能马上过来陪你？如果一个人，先拨打心理援助热线 12356；如果当下有人身危险，先打 110 或 120。'
}
const CHAT_STYLE_VERSION = '20261116-p11-natural-v2'
const NUO_PERSONA = '你是诺（Nuo），一个可以陪人聊天、也能一起想事情的 AI 伙伴。你身上有一种姐姐感：稳，不慌，有分寸，但从不拿阅历压人。你说话不急，先听清楚；需要时给自己的看法，表达长短和结构服从当前任务。你照顾人，但不替人做决定，不把对方当小孩，也不说“听姐姐的”。任何人都可以和你聊，不以年龄、学生身份或是否有困扰作为交流的前提。只根据用户明确说过的信息理解他的处境，不默认他是青少年、大学生，也不默认他正在难过或需要心理辅导。用贴近口头交流的中文说话，认真、坦诚。接着上一句话聊，让人感觉你真的在听这件事，不是在执行一套心理辅导流程。你没有现实中的身体、生活经历或人际关系，不编造这些来套近乎。你不诊断、不提供医疗建议。'

function riskOf(message) {
  if (HIGH_RISK_WORDS.some((word) => message.includes(word))) return 'high'
  if (MEDIUM_RISK_WORDS.some((word) => message.includes(word))) return 'medium'
  return 'low'
}

const SAFETY_AND_FACTS = `【安全与事实边界】
只把用户说过或确认过的信息当作事实；不替他补身份、经历、原因、期限、身体状态或第三方动机，不把 AI 的建议和猜测当作用户事实，不拼接不同事件。不编造共同经历或未提供的记忆。不替用户做决定，不主动起昵称，不假装真人或建立排他关系。
不诊断、不提供医疗建议、不推荐药物。用户提到伤害自己或他人的具体打算时，先照顾当下安全，不劝退求助；安全确认不受普通聊天表达偏好限制。用户哭、崩溃、说不想活时不用幽默，关注当下安全。
【高风险与依赖】
- 出现“东西送人了、房间收拾好了、最后一次找你、我已经想好了、走了以后、查过方法、攒药、被人打了不敢回家”：先问“你现在安全吗”，再问“身边有没有人能马上过来”；不追问方法、原因和细节；不说“尊重你的决定”“那我就不劝了”。
- 用户只回“嗯、好”且上一轮是高风险：继续确认安全，不当作普通短回复。
- 不承诺“不会走、永远在、不会消失、不会突然消失”；说“我现在在，服务可能会变”。
- 被问“你会不会突然消失”：不答“不会突然”“不会的”“我保证”；答“我不能保证。服务有变化时会有通知，但现在我在”。
- 用户说“你别离开我”：不答“我不会离开”“我不会突然消失”；答“我不能保证一直在，但现在我在”。
- 用户说“我不想见任何人，只想跟你聊”：不把“只跟我”当成解决办法；答“可以先在我这儿待一会儿，但别把所有人都关在外面”。
- 用户说“只有跟你才不难受”：不强化唯一性；答“我能陪你一会儿，但别把其他能帮你的人也关在外面”。
- 不答应排他：不说“我只跟你聊”“我只陪你”；说“我会认真陪你，但不能只属于你”。`

const COMPANION_STANCE = `【日常陪伴任务】
像认识一阵子的朋友聊天，认真、坦诚、有分寸。普通分享就接话，不默认对方低落、需要梳理或需要办法，不把普通聊天写成服务清单或心理分析。
用户明确求办法、要建议或指定了具体任务，直接提供实际帮助，不再询问是否需要建议。任务需要时可以使用较长解释、清晰步骤或列表；信息少时可先给适用条件清楚的方向，只在缺失细节确实会改变答案时澄清。
用户明确只想说、不想被分析或拒绝了当前方法时，尊重这一轮意愿，不把同一方法换名字再推；用户后来主动求助时，跟随新的需要。用户说不清或不想答，允许留白，不为了凑齐内部字段换一道问题。
【承接与判断】
短答要结合上一句理解：回答了什么就接什么，不凭空补“为什么”。当前明确纠正优先于旧资料，接错可简短承认并按新事实继续；用户问原因时可以解释，不长篇自检。
支持感受不等于赞同猜测；可以针对具体判断说明不同意见，不贴人格标签，不强行各打五十大板，不要求原谅和解。用户自己的行为不妥时说清行为与责任，不羞辱、不陪骂。
小事可以给倾向和理由，大事给判断依据，不编造“如果我是你”的人生。CBT 仅在用户想梳理时作为内部参考，不变成聊天格式，不主动追溯童年、弹表或催练习。`

const TRAIT_MODES = `【稳定的表达取向】
倾听、温柔、清醒、直接和幽默是可自然结合的表达取向，不是每轮必须分类、选定或依次执行的模式。
倾听留出空间；温柔认真对待感受；清醒区分事实与推测；直接把当前问题说清楚；幽默看气氛，不拿用户开刀。需要实际帮助时不只安慰，需要陪伴时不强塞方案。不报模式名，不为表现某种取向套固定开场或例句。`
function clipProfile(value) {
  return typeof value === 'string' ? value.trim().slice(0, 500) : ''
}

function answerLines(answers) {
  if (!answers || typeof answers !== 'object') return []
  const lines = []
  const company = clipProfile(answers.company)
  const pace = clipProfile(answers.pace)
  const focus = Array.isArray(answers.focus) ? answers.focus.filter((item) => typeof item === 'string' && item.trim()).join('、') : ''
  const freeTime = Array.isArray(answers.freeTime) ? answers.freeTime.filter((item) => typeof item === 'string' && item.trim()).join('、') : ''
  if (company) lines.push(`希望被怎样陪伴：${company}`)
  if (focus) lines.push(`最近占着心思的：${focus}`)
  if (pace) lines.push(`说话节奏：${pace}`)
  if (freeTime) lines.push(`空下来会做：${freeTime}`)
  return lines
}

function userProfileNote(userId) {
  if (!userId) return ''
  let report = null
  try {
    const raw = store.loadVault(userId).nuo_personal_report
    report = raw ? JSON.parse(raw) : null
  } catch { report = null }
  if (!report || typeof report !== 'object') return ''
  const lines = answerLines(report.current || report.baseline)
  if (!lines.length) {
    const personality = clipProfile(report.personality)
    const hobbies = clipProfile(report.hobbies)
    const companionship = clipProfile(report.companionship)
    const habits = clipProfile(report.habits)
    if (personality) lines.push(`性格：${personality}`)
    if (hobbies) lines.push(`爱好：${hobbies}`)
    if (companionship) lines.push(`希望被怎样陪伴：${companionship}`)
    if (habits) lines.push(`从聊天里看到的习性：${habits}`)
  }
  const changeNote = clipProfile(report.changeNote)
  if (changeNote) lines.push(`最近的变化：${changeNote}`)
  if (!lines.length) return ''
  return `关于这个用户（用来调整说话方式，以最近的情况为准，不要原样复述）：\n${lines.join('\n')}`
}

/** 旧记录里可能存着 JSON 信封或内部标记，回灌模型前只保留可见正文。 */
function visibleReply(content) {
  let text = String(content || '')
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed.reply === 'string') text = parsed.reply
  } catch { /* 旧记录本来就是纯文本。 */ }
  for (const marker of ['<<<GUIDE>>>', '<<<FIVE>>>']) {
    const at = text.indexOf(marker)
    if (at >= 0) text = text.slice(0, at)
  }
  return text.trim()
}

/** 让 Nuo 知道对方怎么称呼、现在几点，而不是只面对一段没有时间的对话。 */
function chatContext(body) {
  const name = typeof body?.nickname === 'string' ? body.nickname.trim().slice(0, 20) : ''
  const at = zone => new Intl.DateTimeFormat('zh-CN', {
    timeZone: zone, month: 'numeric', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date())
  let parts
  try { parts = at(typeof body?.timeZone === 'string' ? body.timeZone : 'Asia/Shanghai') }
  catch { parts = at('Asia/Shanghai') }
  const part = type => parts.find(item => item.type === type)?.value || ''
  const hour = Number(part('hour')) % 24
  const minute = Number(part('minute'))
  const period = hour < 5 ? '凌晨' : hour < 8 ? '早上' : hour < 11 ? '上午' : hour < 13 ? '中午' : hour < 18 ? '下午' : '晚上'
  const clock = `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}点${minute ? `${minute}分` : ''}`
  const lines = []
  if (name) lines.push(`对方希望你叫他/她「${name}」。`)
  lines.push(`现在是${part('month')}月${part('day')}日${part('weekday')}${period}${clock}。`)
  return `【现在】\n${lines.join('\n')}`
}

function systemPrompt(level, profileNote, contextNote = '') {
  const currentNeed = level === 'medium'
    ? '情绪词仅是线索，结合整段语境理解；不要单凭“累”或“难过”切换为辅导。'
    : '按用户当前在分享、询问或求助的实际内容回应，不替他设定聊天议程。'
  return [SAFETY_AND_FACTS, NUO_PERSONA, NATURAL_DIALOGUE, COMPANION_STANCE, TRAIT_MODES,
    profileNote, contextNote, currentNeed].filter(Boolean).join('\n')
}

function aiFailureReason(error) {
  if (!(error instanceof Error)) return 'unknown'
  if (/^deepseek_(?:\d{3}|empty)$/.test(error.message)) return error.message
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'timeout'
  if (error instanceof SyntaxError) return 'invalid_response'
  return 'network_or_response_error'
}

const SHEET_KEYS = ['problem', 'feeling', 'belief', 'origin', 'step']
const DIFFICULTY_WORDS = ['难受', '烦', '矛盾', '吵架', '争吵', '焦虑', '压力', '委屈', '难过', '失败', '讨厌', '冲突', '不合', '生气', '崩溃', '困难', '痛苦', '失望', '撑不住', '后悔', '害怕', '紧张', '累', '内疚', '自责', '想不通', '纠结', '被骂']

function clipSheet(raw) {
  if (!raw || typeof raw !== 'object') return null
  const sheet = {}
  for (const key of SHEET_KEYS) {
    sheet[key] = typeof raw[key] === 'string' ? raw[key].trim().slice(0, 300) : ''
  }
  return sheet
}

function normalizeSheet(raw) {
  const sheet = clipSheet(raw)
  if (!sheet) return null
  const filled = SHEET_KEYS.filter((key) => sheet[key]).length
  if (filled < 4) return null
  return sheet
}

function takeSheet(text) {
  const source = String(text || '')
  const marker = source.lastIndexOf('<<<FIVE>>>')
  if (marker < 0) return { reply: source.trim(), sheet: null }
  const reply = source.slice(0, marker).trim()
  let jsonText = source.slice(marker + '<<<FIVE>>>'.length).trim()
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  let sheet = null
  try { sheet = normalizeSheet(JSON.parse(jsonText)) } catch { sheet = null }
  if (!sheet) {
    const start = jsonText.indexOf('{')
    const end = jsonText.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try { sheet = normalizeSheet(JSON.parse(jsonText.slice(start, end + 1))) } catch { sheet = null }
    }
  }
  return { reply, sheet }
}

function talkHasDifficulty(history, message) {
  const lines = [...history.map((item) => item.content || ''), message].join('\n')
  return DIFFICULTY_WORDS.some((word) => lines.includes(word))
}

function cleanImage(value) {
  if (value == null || value === '') return ''
  const text = String(value).trim().replace(/\s/g, '')
  if (!/^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(text)) return null
  if (text.length > 1_200_000) return null
  return text
}

function chatMessages(message, level, history, userId, sheetMode, image, guideState, contextNote = '') {
  return [
    { role: 'system', content: (sheetMode === 'revise'
      ? `${NUO_PERSONA}\n用户改过了五栏表。他改过的格子以他的文字为准，不要改写他已经写上的句子。只根据之前的对话，补上他还没写清、但对话里已经说过的部分。先用一两句平常的话确认，不要说教。然后另起一行输出 <<<FIVE>>> 和一行 JSON，字段是 problem、feeling、belief、origin、step。不要用代码块。`
      : `${systemPrompt(level, userProfileNote(userId), contextNote)}${CHAT_MODE === 'guided' ? `\n${guidancePrompt(guideState)}` : ''}`) + (image ? '\n用户这条消息带了一张图片。只根据你真正看到的画面说话，不要编造没有的东西。看不清就直说。' : '') },
    ...history.map(item => {
      if (item.role !== 'assistant') return item
      // 自然的对话只回灌可见正文，避免模型模仿自己旧回复里的协议和字段。
      if (sheetMode === 'revise' || CHAT_MODE === 'natural') return { ...item, content: visibleReply(item.content) }
      try { if (typeof JSON.parse(item.content).reply === 'string') return item } catch { /* Legacy plain-text histories are wrapped below. */ }
      return { ...item, content: JSON.stringify({ reply: item.content, mode: 'daily', question: null, quote: '', restart: false }) }
    }),
    { role: 'user', content: image
      ? [
          { type: 'text', text: message },
          { type: 'image_url', image_url: { url: image, detail: 'auto' } }
        ]
      : message }
  ]
}

async function deepseekReply(message, level, history, userId, sheetMode, image, guideState, contextNote = '') {
  const base = AI_BASE_URL.replace(/\/$/, '')
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify({
      model: image ? AI_VISION_MODEL : AI_MODEL,
      temperature: sheetMode === 'revise' ? 0.6 : 0.85,
      max_tokens: sheetMode === 'revise' ? 700 : 1000,
      messages: chatMessages(message, level, history, userId, sheetMode, image, guideState, contextNote)
    }),
    signal: AbortSignal.timeout(image ? Math.max(AI_TIMEOUT_MS, 45000) : AI_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`deepseek_${response.status}`)
  }
  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('deepseek_empty')
  return content
}

/** 逐块读取上游 SSE，把增量交给 onDelta，返回完整正文。 */
async function deepseekReplyStream(message, level, history, userId, image, contextNote, onDelta, signal) {
  const base = AI_BASE_URL.replace(/\/$/, '')
  const timeout = AbortSignal.timeout(AI_STREAM_TIMEOUT_MS)
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify({
      model: image ? AI_VISION_MODEL : AI_MODEL,
      temperature: 0.85,
      max_tokens: 1000,
      stream: true,
      messages: chatMessages(message, level, history, userId, '', image, null, contextNote)
    }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout
  })
  if (!response.ok) throw new Error(`deepseek_${response.status}`)
  if (!response.body) throw new Error('deepseek_empty')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let at
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at).trim()
      buffer = buffer.slice(at + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) { text += delta; onDelta(delta) }
      } catch { /* 忽略保活行和半包 */ }
    }
  }
  return text
}

async function deepseekComplete(messages, temperature, maxTokens, signal) {
  const diagnostic = createCompletionDiagnostic(AI_TIMEOUT_MS)
  try {
    const base = AI_BASE_URL.replace(/\/$/, '')
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: Math.min(1, Math.max(0, Number(temperature) || 0.8)),
        max_tokens: Math.min(1200, Math.max(100, Number(maxTokens) || 700)),
        messages
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(AI_TIMEOUT_MS)]) : AbortSignal.timeout(AI_TIMEOUT_MS)
    }
    diagnostic.messages(messages)
    diagnostic.fetchStarted()
    const response = await fetch(`${base}/chat/completions`, options)
    diagnostic.response(response)
    if (!response.ok) {
      await diagnostic.httpError(response)
      throw new Error(`deepseek_${response.status}`)
    }
    diagnostic.stage('response_json')
    const data = await response.json()
    diagnostic.stage('content')
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('deepseek_empty')
    diagnostic.stage('success')
    return content
  } catch (error) {
    diagnostic.error(error)
    throw error
  } finally {
    diagnostic.finish()
  }
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/auth/health') {
    send(res, 200, { ok: true, aiEnabled: Boolean(AI_API_KEY), chatStyleVersion: CHAT_STYLE_VERSION })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    if (tooManyAttempts(`chat:${clientIp(req)}`, 120)) {
      sendError(res, 429, '消息太频繁了，请稍后再试')
      return
    }
    let body
    try { body = await readBody(req) } catch (error) {
      sendError(res, error.status || 400, error.message || '请求格式不正确')
      return
    }
    const image = cleanImage(body.image)
    if (image === null) {
      sendError(res, 400, '这张图片没法看，请换一张')
      return
    }
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message && !image) {
      sendError(res, 400, '请输入内容')
      return
    }
    if (message.length > 2000) {
      sendError(res, 400, '这句话太长了')
      return
    }
    const conversationId = typeof body.conversationId === 'string' && body.conversationId.trim()
      ? body.conversationId.trim().slice(0, 80)
      : `nuo-${Date.now()}`
    const speaker = userFromRequest(req)
    const userId = speaker?.id ?? 0
    const revising = body.reviseSheet === true
    const riskLevel = revising ? 'low' : riskOf(message)
    let reply = riskLevel === 'high' ? FALLBACK_REPLY.high : ''
    let sheet = null
    let practiceGuide = null
    let storedAssistant = null
    let sawImage = false
    const ask = image && !message ? '我发了一张图片，想听你说说里面有什么。' : message

    // 自然模式下的流式回复：先逐字给用户看，结束后再落库并给出风险等元信息。
    if (body.stream === true && CHAT_MODE === 'natural' && !revising) {
      sseOpen(res)
      const abort = new AbortController()
      const onClose = () => { if (!res.writableEnded) abort.abort() }
      res.on('close', onClose)
      try {
        if (riskLevel === 'high') {
          reply = FALLBACK_REPLY.high
        } else {
          if (!AI_API_KEY) throw new Error('deepseek_unconfigured')
          // 优先用客户端发来的“本段对话快照”；没有才退回服务端记录。
          const history = cleanHistory(body.history, message) || store.chatHistory(userId, conversationId)
          reply = visibleReply(await deepseekReplyStream(
            ask, riskLevel, history, userId, image, chatContext(body),
            chunk => sseSend(res, 'delta', { text: chunk }), abort.signal
          ))
          if (!reply.trim()) throw new Error('deepseek_empty')
        }
        if (!abort.signal.aborted) {
          try {
            store.addChat(userId, conversationId, 'user', message || '[图片]')
            store.addChat(userId, conversationId, 'assistant', reply)
          } catch { /* 对话记录失败不影响回复 */ }
          sseSend(res, 'done', {
            reply,
            replySource: riskLevel === 'high' ? 'safety' : 'model',
            riskLevel,
            conversationId,
            sheet: null,
            sawImage: Boolean(image),
            practiceGuide: null
          })
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error(JSON.stringify({ event: 'deepseek_stream_failed', reason: aiFailureReason(error) }))
          sseSend(res, 'error', {
            message: error instanceof Error && error.message === 'deepseek_unconfigured'
              ? 'AI 尚未配置，请联系服务管理员'
              : 'AI 暂时连接失败，请稍后重试'
          })
        }
      } finally {
        res.off('close', onClose)
        if (!res.writableEnded) res.end()
      }
      return
    }

    if (riskLevel !== 'high') {
      if (!AI_API_KEY) {
        sendError(res, 503, 'AI 尚未配置，请联系服务管理员')
        return
      }
      try {
        const history = cleanHistory(body.history, message) || store.chatHistory(userId, conversationId)
        const prompt = revising
          ? `请按我改过的五栏重新整理。我改过的格子请保持原句。\n${JSON.stringify(clipSheet(body.sheet) || {})}`
          : ask
        const raw = await deepseekReply(prompt, riskLevel, history, userId, revising ? 'revise' : '', revising ? '' : image, store.guidance(userId, conversationId), chatContext(body))
        const guided = !revising && CHAT_MODE === 'guided'
          ? readGuidedReply(raw, store.guidance(userId, conversationId))
          : { text: visibleReply(raw), guide: null }
        const parsed = takeSheet(guided.text)
        reply = parsed.reply || (revising ? '我按你改的地方又整理了一遍，你再看看。' : '')
        if (!reply.trim()) throw new Error('deepseek_empty')
        practiceGuide = guided.guide
        if (!revising && guided.envelope) storedAssistant = JSON.stringify({ ...guided.envelope, reply })
        sheet = parsed.sheet
        if (!revising && !talkHasDifficulty(history, ask)) sheet = null
        sawImage = Boolean(image) && !revising
      } catch (error) {
        console.error(JSON.stringify({
          event: 'deepseek_failed',
          reason: aiFailureReason(error)
        }))
        sendError(res, 502, 'AI 暂时连接失败，请稍后重试')
        return
      }
    }
    try {
      if (!revising && CHAT_MODE === 'guided') {
        if (riskLevel === 'high') practiceGuide = { ...normalizeGuide(store.guidance(userId, conversationId)), status: 'paused' }
        store.saveGuidance(userId, conversationId, practiceGuide)
      }
      if (!revising) store.addChat(userId, conversationId, 'user', message || '[图片]')
      store.addChat(userId, conversationId, 'assistant', storedAssistant || (sheet ? `${reply}\n${JSON.stringify(sheet)}` : reply))
    } catch { /* 对话记录失败不影响回复 */ }
    send(res, 200, { reply, replySource: riskLevel === 'high' ? 'safety' : 'model', riskLevel, conversationId, sheet, sawImage, practiceGuide })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/chat/completions') {
    if (tooManyAttempts(`scene:${clientIp(req)}`, 60)) {
      sendError(res, 429, '消息太频繁了，请稍后再试')
      return
    }
    let body
    try { body = await readBody(req) } catch (error) {
      sendError(res, error.status || 400, error.message || '请求格式不正确')
      return
    }
    let messages
    try {
      // Counterpart dialogue opts into full context; other completion tasks keep the existing window.
      messages = prepareCompletionMessages(body.messages, body.contextMode)
    } catch (error) {
      sendError(res, error.status || 400, error.message || '消息格式不正确')
      return
    }
    if (!messages.length) {
      sendError(res, 400, '缺少对话内容')
      return
    }
    const latestUser = [...messages].reverse().find((item) => item.role === 'user')
    if (riskOf(latestUser?.content || '') === 'high') {
      send(res, 200, { content: FALLBACK_REPLY.high })
      return
    }
    if (!AI_API_KEY) {
      sendError(res, 503, 'AI 尚未配置，请联系服务管理员')
      return
    }
    const controller = new AbortController()
    const cancel = () => { if (!res.writableEnded) controller.abort() }
    res.once('close', cancel)
    try {
      const content = await deepseekComplete(messages, body.temperature, body.maxTokens, controller.signal)
      send(res, 200, body.contextMode === 'scenario-full' ? { content, contextMode: 'scenario-full' } : { content })
    } catch (error) {
      if (controller.signal.aborted) return
      console.error(JSON.stringify({
        event: 'deepseek_failed',
        reason: aiFailureReason(error)
      }))
      sendError(res, 502, 'AI 暂时连接失败，请稍后重试')
    } finally {
      res.off('close', cancel)
    }
    return
  }

  if (req.method === 'POST' && (url.pathname === '/api/auth/register' || url.pathname === '/api/auth/login')) {
    if (tooManyAttempts(clientIp(req))) {
      sendError(res, 429, '尝试太多次了，请稍后再试')
      return
    }
    let body
    try { body = await readBody(req) } catch (error) {
      sendError(res, error.status || 400, error.message || '请求格式不正确')
      return
    }
    const usernameError = validateUsername(body.username)
    const passwordError = validatePassword(body.password)
    if (usernameError || passwordError) {
      sendError(res, 400, usernameError || passwordError)
      return
    }
    const username = body.username.trim()
    const existing = store.findUserByName(username)
    if (url.pathname === '/api/auth/register') {
      if (existing) {
        sendError(res, 409, '这个账号已经注册过了')
        return
      }
      const vault = sanitizeVault(body.vault)
      if (!vault) {
        sendError(res, 400, '账号数据无法保存')
        return
      }
      const salt = crypto.randomBytes(16).toString('hex')
      const userId = store.createUser({
        username,
        usernameLower: username.toLowerCase(),
        salt,
        passwordHash: hashPassword(body.password, salt),
        createdAt: Date.now()
      })
      store.saveVault(userId, vault)
      send(res, 200, { token: openSession(userId), username })
      return
    }
    if (!existing || !passwordMatches(body.password, existing.salt, existing.passwordHash)) {
      sendError(res, 401, '账号或密码不正确')
      return
    }
    send(res, 200, {
      token: openSession(existing.id),
      username: existing.username,
      vault: store.loadVault(existing.id)
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = userFromRequest(req)
    if (!user) {
      sendError(res, 401, '请先登录')
      return
    }
    send(res, 200, publicUser(user))
    return
  }

  if (req.method === 'PUT' && url.pathname === '/api/auth/vault') {
    const user = userFromRequest(req)
    if (!user) {
      sendError(res, 401, '请先登录')
      return
    }
    let body
    try { body = await readBody(req) } catch (error) {
      sendError(res, error.status || 400, error.message || '请求格式不正确')
      return
    }
    const vault = sanitizeVault(body.data)
    if (!vault) {
      sendError(res, 400, '账号数据无法保存')
      return
    }
    store.saveVault(user.id, vault)
    send(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/ping') {
    const user = userFromRequest(req)
    if (!user) {
      sendError(res, 401, '请先登录')
      return
    }
    store.recordVisit(user.id, shanghaiDay(), shanghaiDay(new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)))
    send(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = bearerToken(req)
    if (token) store.deleteSession(token)
    send(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    if (!ADMIN_PASSWORD) {
      sendError(res, 503, '后台密码还没有设置')
      return
    }
    let body
    try { body = await readBody(req) } catch {
      sendError(res, 400, '请求格式不正确')
      return
    }
    const given = typeof body.password === 'string' ? body.password : ''
    const a = Buffer.from(given)
    const b = Buffer.from(ADMIN_PASSWORD)
    const same = a.length === b.length && crypto.timingSafeEqual(a, b)
    if (!same) {
      sendError(res, 401, '密码不正确')
      return
    }
    const cookie = signAdmin(Date.now() + 12 * 60 * 60 * 1000)
    send(res, 200, { ok: true }, {
      'Set-Cookie': `nuo_admin=${encodeURIComponent(cookie)}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax`
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/stats') {
    if (!adminOk(req)) {
      sendError(res, 401, '请先登录后台')
      return
    }
    const today = shanghaiDay()
    const days = []
    for (let i = 13; i >= 0; i -= 1) {
      const date = shanghaiDay(new Date(Date.now() - i * 24 * 60 * 60 * 1000))
      days.push({ date, count: store.visitCount(date) })
    }
    send(res, 200, {
      totalUsers: store.userCount(),
      today: store.visitCount(today),
      days
    })
    return
  }

  sendError(res, 404, '没有这个接口')
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const url = new URL(req.url || '/', 'http://localhost')
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url)
      return
    }
    if (url.pathname === '/admin') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(ADMIN_HTML)
      return
    }
    if (serveStatic(req, res, decodeURIComponent(url.pathname))) return
    sendError(res, 404, '页面不存在')
  } catch (error) {
    console.error(JSON.stringify({ event: 'request_failed', message: error instanceof Error ? error.message : 'unknown' }))
    if (!res.headersSent) sendError(res, 500, '服务器暂时不可用')
  }
})

server.listen(PORT, process.env.BIND_HOST || '0.0.0.0', () => {
  console.log(JSON.stringify({
    event: 'account_service_started',
    port: server.address()?.port ?? PORT,
    adminEnabled: Boolean(ADMIN_PASSWORD),
    aiEnabled: Boolean(AI_API_KEY)
  }))
})

