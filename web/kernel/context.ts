import type { EventBus } from './events'
import type { NuoStorage } from './storage'
import type { NuoApi, FiveSheet, RiskLevel, PracticeGuide } from './api'
import { el } from './dom'

/**
 * 陪伴者对外能力。chat / onboarding / profile 通过 ctx.services.mascot 使用，
 * 不 import mascot 文件夹。mascot 未注册时走各构件自己的默认头像。
 */
export interface MascotService {
  getFace(state?: string): string
  getDeco(): string
  getGreeting(): string
  getId(): string
  apply(id: string, opts?: { applyTheme?: boolean }): void
  updateEmotions(ipId?: string): void
  getEmotionSVG(emotion: string, ipId?: string, icon?: boolean): string
  openSheet(): void
}

/** 账号门禁。其它构件只问“现在有没有人登录”，不读取密码。 */
export interface AuthService {
  isLoggedIn(): boolean
  username(): string | null
  openGate(): void
  logout(): void
  whenReady(): Promise<void>
}

/** 个人报告。第一次填写由账号进入应用时打开，其它构件不读取表单。 */
export interface ProfileService {
  openIntroIfNeeded(): void
}

/** 当前这段和 Nuo 的对话。场景把练习挂在这段对话下面。 */
export interface ChatService {
  activeSessionId(): string
  dismissPracticeInvitation?(cycle: number): void
  practiceContext(): {
    sessionId:string
    pending:boolean
    dismissedPracticeCycle?:number
    messages:Array<{role:'user'|'assistant';text:string;time:number;sheet?:FiveSheet|null;riskLevel?:RiskLevel;sendError?:string;practiceGuide?:PracticeGuide|null}>
  }
}

export interface ScenePracticeSummary {
  id: string
  sessionId: string
  title: string
  continuing: boolean
  versions: Array<{ id: string; title: string }>
}

/** 模拟场景的保存记录。对话列表只通过这里读取，不 import 场景文件夹。 */
export interface SceneService {
  list(): ScenePracticeSummary[]
  openLibrary(): void
  rename(id: string, title: string): void
  remove(id: string): void
  renameVersion(eventId: string, versionId: string, title: string): void
  removeVersion(eventId: string, versionId: string): void
  openVersion(eventId: string, versionId: string): void
  rehearseAgain(eventId: string, versionId?: string): void
  resume(eventId: string): void
  retarget(fromSessionId: string, toSessionId: string): void
  removeBySession(sessionId: string): void
}

export interface ServiceRegistry {
  ambient?: {
    openScene(kind: 'forest'|'ocean'|'window'|'lunar'|'bedroom'): Promise<boolean>
    openWindow(): Promise<boolean>
    openLunar(): Promise<boolean>
    closeWindow(): void
  }
  mascot?: MascotService
  auth?: AuthService
  profile?: ProfileService
  chat?: ChatService
  scene?: SceneService
}

export interface AppContext {
  events: EventBus
  storage: NuoStorage
  api: NuoApi
  el: typeof el
  services: ServiceRegistry
}

export function createContext(
  events: EventBus,
  storage: NuoStorage,
  api: NuoApi
): AppContext {
  return {
    events,
    storage,
    api,
    el,
    services: {}
  }
}
