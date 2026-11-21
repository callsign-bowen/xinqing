/**
 * 本地存储契约。key 仍用现有 nuo_*，避免用户数据丢失。
 * 功能构件应走这里，不要自己拼 localStorage key。
 */
import { normalizeNickname } from './nickname.ts'
export interface EmotionRecord {
  id: number | string
  date: string
  weekday?: string
  emotion: string
  text: string
  image?: string | null
  images?: string[]
  day?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  time?: number
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

export interface ChatSessionStore {
  sessions: ChatSession[]
  activeId: string | null
}

export interface SafetyPlan {
  signals?: string
  strategies?: string
  contacts?: string
  hope?: string
  [key: string]: string | undefined
}

export interface EnergyLogItem {
  date: string
  score: number
}

export interface NightLogItem {
  date: string
  gratitude?: string
  happy?: string
  tomorrow?: string
  [key: string]: string | undefined
}

export interface AccountRecord {
  username: string
  salt: string
  passwordHash: string
  createdAt: number
}

export interface AuthSession {
  username: string
}

export interface ProfileAnswers {
  company: string
  focus: string[]
  pace: string
  freeTime: string[]
}

export interface PersonalReport {
  baseline: ProfileAnswers | null
  current: ProfileAnswers | null
  changeNote: string
  done: boolean
  personality: string
  hobbies: string
  companionship: string
  habits: string
}

const KEYS = {
  emotions: 'nuo_emotions',
  theme: 'nuo_theme',
  mascot: 'nuo_mascot',
  style: 'nuo_style',
  sessions: 'nuo_chat_sessions',
  safetyPlan: 'nuo_safety_plan',
  comfortLetter: 'nuo_comfort_letter',
  energyLog: 'nuo_energy_log',
  nightLog: 'nuo_night_log',
  encourageDate: 'nuo_encourage_date',
  onboardingDone: 'nuo_onboarding_done',
  ageGroup: 'nuo_user_age_group',
  personality: 'nuo_personality',
  personalReport: 'nuo_personal_report',
  region: 'nuo_region',
  nicknames: 'nuo_account_nicknames',
  accounts: 'nuo_accounts',
  session: 'nuo_session',
  vaults: 'nuo_user_vaults'
} as const

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 存储满或禁用时静默 */
  }
}

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function clipReport(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 500) : ''
}

const COMPANY_OPTIONS = ['先听我说', '陪我把事情理一理', '轻松聊聊天就好', '我还不确定']
const FOCUS_OPTIONS = ['学业', '和人相处', '家里的事', '睡觉和身体', '对自己的看法', '说不上来，只是有点沉']
const PACE_OPTIONS = ['你少问，让我多说', '你可以问我一句', '短一点，我看着累', '可以直接一点']
const FREE_OPTIONS = ['散步', '听歌', '看剧', '画画或写东西', '运动', '打游戏', '暂时没有']

function pickOne(value: unknown, allowed: string[]): string {
  return typeof value === 'string' && allowed.includes(value) ? value : ''
}

function pickMany(value: unknown, allowed: string[]): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const picked: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.includes(item) || seen.has(item)) continue
    seen.add(item)
    picked.push(item)
  }
  return picked
}

function readAnswers(raw: unknown): ProfileAnswers | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Partial<ProfileAnswers>
  return {
    company: pickOne(source.company, COMPANY_OPTIONS),
    focus: pickMany(source.focus, FOCUS_OPTIONS),
    pace: pickOne(source.pace, PACE_OPTIONS),
    freeTime: pickMany(source.freeTime, FREE_OPTIONS)
  }
}

function emptyReport(): PersonalReport {
  return {
    baseline: null,
    current: null,
    changeNote: '',
    done: false,
    personality: '',
    hobbies: '',
    companionship: '',
    habits: ''
  }
}

function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export interface NuoStorage {
  emotions: {
    list(): EmotionRecord[]
    saveAll(records: EmotionRecord[]): void
    append(record: EmotionRecord): EmotionRecord[]
  }
  theme: { get(): string | null; set(theme: string): void }
  mascot: { get(): string | null; set(id: string): void }
  style: { get(): string | null; set(id: string): void }
  sessions: { load(): ChatSessionStore; save(store: ChatSessionStore): void }
  safetyPlan: { load(): SafetyPlan; save(plan: SafetyPlan): void }
  comfortLetter: { get(): string | null; set(text: string): void }
  energyLog: { list(): EnergyLogItem[]; append(item: EnergyLogItem): void }
  nightLog: { list(): NightLogItem[]; append(item: NightLogItem): void }
  encourageDate: { get(): string | null; set(date: string): void }
  onboarding: {
    done(): boolean
    markDone(): void
    ageGroup(): string | null
    setAgeGroup(age: string): void
  }
  region: { get(): string | null; set(region: string): void }
  nickname: { get(): string | null; set(nickname: string): boolean }
  personalReport: {
    get(): PersonalReport
    saveAnswers(input: ProfileAnswers, mode: 'first' | 'edit', changeNote?: string): void
    saveCurrent(input: ProfileAnswers, changeNote: string): void
    isDone(): boolean
  }
  accounts: {
    list(): AccountRecord[]
    saveAll(accounts: AccountRecord[]): void
  }
  session: {
    get(): AuthSession | null
    set(session: AuthSession): void
    clear(): void
  }
  vaults: {
    get(username: string): Record<string, string | null> | null
    set(username: string, data: Record<string, string | null>): void
  }
}

export function createStorage(): NuoStorage {
  return {
    emotions: {
      list() {
        const saved = readJson<EmotionRecord[] | null>(KEYS.emotions, null)
        return Array.isArray(saved) ? saved : []
      },
      saveAll(records) {
        writeJson(KEYS.emotions, records)
      },
      append(record) {
        const next = [record, ...this.list()]
        writeJson(KEYS.emotions, next)
        return next
      }
    },
    theme: {
      get: () => readString(KEYS.theme),
      set: (theme) => writeString(KEYS.theme, theme)
    },
    mascot: {
      get: () => readString(KEYS.mascot),
      set: (id) => writeString(KEYS.mascot, id)
    },
    style: {
      get: () => readString(KEYS.style),
      set: (id) => writeString(KEYS.style, id)
    },
    sessions: {
      load() {
        const raw = readJson<ChatSessionStore | null>(KEYS.sessions, null)
        if (raw && Array.isArray(raw.sessions)) return raw
        return { sessions: [], activeId: null }
      },
      save(store) {
        writeJson(KEYS.sessions, store)
      }
    },
    safetyPlan: {
      load: () => readJson<SafetyPlan>(KEYS.safetyPlan, {}),
      save: (plan) => writeJson(KEYS.safetyPlan, plan)
    },
    comfortLetter: {
      get: () => readString(KEYS.comfortLetter),
      set: (text) => writeString(KEYS.comfortLetter, text)
    },
    energyLog: {
      list: () => readJson<EnergyLogItem[]>(KEYS.energyLog, []),
      append(item) {
        const log = this.list()
        log.push(item)
        writeJson(KEYS.energyLog, log)
      }
    },
    nightLog: {
      list: () => readJson<NightLogItem[]>(KEYS.nightLog, []),
      append(item) {
        const log = this.list()
        log.push(item)
        writeJson(KEYS.nightLog, log)
      }
    },
    encourageDate: {
      get: () => readString(KEYS.encourageDate),
      set: (date) => writeString(KEYS.encourageDate, date)
    },
    onboarding: {
      done: () => readString(KEYS.onboardingDone) === 'true',
      markDone: () => writeString(KEYS.onboardingDone, 'true'),
      ageGroup: () => readString(KEYS.ageGroup),
      setAgeGroup: (age) => writeString(KEYS.ageGroup, age)
    },
    region: {
      get: () => readString(KEYS.region),
      set: (region) => writeString(KEYS.region, region)
    },
    nickname: {
      get() {
        const session = readJson<AuthSession | null>(KEYS.session, null)
        const owner = typeof session?.username === 'string' && session.username ? `account:${session.username}` : 'guest'
        const names = readJson<Record<string, unknown> | null>(KEYS.nicknames, null)
        return names && typeof names === 'object' && !Array.isArray(names) ? normalizeNickname(names[owner]) : null
      },
      set(input) {
        const name = normalizeNickname(input)
        if (!name) return false
        const session = readJson<AuthSession | null>(KEYS.session, null)
        const owner = typeof session?.username === 'string' && session.username ? `account:${session.username}` : 'guest'
        const saved = readJson<Record<string, unknown> | null>(KEYS.nicknames, null)
        const names = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...saved } : {}
        names[owner] = name
        try {
          localStorage.setItem(KEYS.nicknames, JSON.stringify(names))
          return this.get() === name
        } catch { return false }
      }
    },
    personalReport: {
      get() {
        const report = emptyReport()
        const saved = readJson<Partial<PersonalReport> | null>(KEYS.personalReport, null)
        if (saved && typeof saved === 'object') {
          report.baseline = readAnswers(saved.baseline)
          report.current = readAnswers(saved.current)
          report.changeNote = clipReport(saved.changeNote).slice(0, 200)
          report.done = saved.done === true
          report.personality = clipReport(saved.personality)
          report.hobbies = clipReport(saved.hobbies)
          report.companionship = clipReport(saved.companionship)
          report.habits = clipReport(saved.habits)
        }
        if (!report.personality) report.personality = clipReport(readString(KEYS.personality))
        return report
      },
      saveAnswers(input, mode, changeNote = '') {
        const current = this.get()
        const answers = readAnswers(input) || { company: '', focus: [], pace: '', freeTime: [] }
        const baseline = mode === 'first' || !current.baseline ? answers : current.baseline
        const report: PersonalReport = {
          baseline,
          current: answers,
          changeNote: mode === 'edit' ? clipReport(changeNote).slice(0, 200) : '',
          done: true,
          personality: '',
          hobbies: '',
          companionship: '',
          habits: ''
        }
        writeJson(KEYS.personalReport, report)
        try { localStorage.removeItem(KEYS.personality) } catch { /* ignore */ }
      },
      saveCurrent(input, changeNote) {
        const current = this.get()
        if (!current.baseline) return
        const report: PersonalReport = {
          ...current,
          current: readAnswers(input) || { company: '', focus: [], pace: '', freeTime: [] },
          changeNote: clipReport(changeNote).slice(0, 200)
        }
        writeJson(KEYS.personalReport, report)
      },
      isDone() {
        const report = this.get()
        return report.done && report.baseline != null
      }
    },
    accounts: {
      list() {
        const saved = readJson<AccountRecord[] | null>(KEYS.accounts, null)
        return Array.isArray(saved) ? saved : []
      },
      saveAll(accounts) {
        writeJson(KEYS.accounts, accounts)
      }
    },
    session: {
      get() {
        const saved = readJson<AuthSession | null>(KEYS.session, null)
        if (!saved || typeof saved.username !== 'string' || !saved.username) return null
        return saved
      },
      set(session) {
        writeJson(KEYS.session, session)
      },
      clear() {
        try { localStorage.removeItem(KEYS.session) } catch { /* ignore */ }
      }
    },
    vaults: {
      get(username) {
        const all = readJson<Record<string, Record<string, string | null>>>(KEYS.vaults, {})
        return all[username] ?? null
      },
      set(username, data) {
        const all = readJson<Record<string, Record<string, string | null>>>(KEYS.vaults, {})
        all[username] = data
        writeJson(KEYS.vaults, all)
      }
    }
  }
}
