/**
 * 前端 API 客户端：对外用语义方法，对内仍打现有后端路径。
 * 本次不改 crisis-service 的 URL。
 */
export type RiskLevel = 'low' | 'medium' | 'high'

export interface FiveSheet {
  problem: string
  feeling: string
  belief: string
  origin: string
  step: string
}

export interface PracticeGuide {
  version: 1
  cycle?: number
  status: 'daily' | 'guided' | 'paused' | 'complete'
  asked: Array<'problem' | 'feeling' | 'belief' | 'origin' | 'step'>
}

export interface ChatReply {
  reply: string
  replySource?: 'model' | 'safety'
  conversationId?: string
  riskLevel: RiskLevel
  riskSignal?: string
  resources?: unknown[]
  exercises?: unknown[]
  sheet?: FiveSheet | null
  sawImage?: boolean
  practiceGuide?: PracticeGuide | null
}

export interface CrisisCheckResult {
  level: string
  action: string
  hitCategories: string[]
  detector: string
  careMessage?: string
  resources?: Array<{ name: string; phone: string; hours?: string; note?: string }>
  exercises?: unknown[]
  followUpMessage?: string
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AuthSessionResult {
  token: string
  username: string
  vault?: Record<string, string | null>
}

export interface NuoApi {
  auth: {
    register(username: string, password: string, vault: Record<string, string | null>): Promise<AuthSessionResult>
    login(username: string, password: string): Promise<AuthSessionResult>
    logout(): Promise<{ ok: boolean }>
    me(): Promise<{ username: string }>
    saveVault(data: Record<string, string | null>): Promise<{ ok: boolean }>
    ping(): Promise<{ ok: boolean }>
  }
  chat: {
    send(message: string, conversationId?: string, extra?: { reviseSheet?: boolean; sheet?: FiveSheet; image?: string; nickname?: string; signal?: AbortSignal }): Promise<ChatReply>
    /** 优先流式；旧后端忽略 stream 字段时自动按普通 JSON 处理。 */
    stream(message: string, conversationId?: string, options?: { nickname?: string; image?: string; signal?: AbortSignal; onDelta?: (text: string) => void }): Promise<ChatReply>
  }
  crisis: {
    check(message: string, sessionId?: string): Promise<CrisisCheckResult>
    resources(): Promise<{ resources: CrisisCheckResult['resources'] }>
  }
  ai: {
    complete(messages: AiMessage[], opts?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }): Promise<string>
  }
}

const AUTH_TOKEN_KEY = 'nuo_auth_token'

export class ApiRequestError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (init.signal?.aborted) abort()
  else init.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  try {
    const response = await fetch(url, { ...init, headers, signal: controller.signal })
    const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    if (!response.ok) {
      throw new ApiRequestError(data?.error?.message || '请求失败，请稍后再试', response.status)
    }
    if (controller.signal.aborted) throw new ApiRequestError(init.signal?.aborted ? '已停下，这句话还留着，可以重试' : '请求超时，请稍后重试')
    if (data == null) throw new ApiRequestError('服务器返回的内容无法读取，请稍后重试', response.status)
    return data as T
  } catch (error) {
    if (error instanceof ApiRequestError) throw error
    if (controller.signal.aborted) throw new ApiRequestError(init.signal?.aborted ? '已停下，这句话还留着，可以重试' : '请求超时，请稍后重试')
    throw new ApiRequestError('暂时连不上服务器，请稍后再试')
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', abort)
  }
}

/** 让服务端知道“现在几点”用的是用户所在时区；拿不到就交给后端默认值。 */
function resolvedTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined } catch { return undefined }
}

export function createApi(): NuoApi {
  return {
    auth: {
      register(username, password, vault) {
        return requestJson<AuthSessionResult>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ username, password, vault })
        })
      },
      login(username, password) {
        return requestJson<AuthSessionResult>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password })
        })
      },
      logout() {
        return requestJson('/api/auth/logout', { method: 'POST', body: '{}' })
      },
      me() {
        return requestJson('/api/auth/me')
      },
      saveVault(data) {
        return requestJson('/api/auth/vault', {
          method: 'PUT',
          body: JSON.stringify({ data })
        })
      },
      ping() {
        return requestJson('/api/auth/ping', { method: 'POST', body: '{}' })
      }
    },
    chat: {
      send(message, conversationId, extra) {
        return requestJson<ChatReply>('/api/chat', {
          method: 'POST',
          signal: extra?.signal,
          body: JSON.stringify({
            message,
            conversationId,
            reviseSheet: extra?.reviseSheet === true,
            sheet: extra?.sheet || null,
            image: extra?.image || undefined,
            nickname: extra?.nickname || undefined,
            timeZone: resolvedTimeZone()
          })
        }, extra?.image ? 60_000 : 30_000)
      },
      async stream(message, conversationId, options = {}) {
        const controller = new AbortController()
        const abort = () => controller.abort()
        if (options.signal?.aborted) abort()
        else options.signal?.addEventListener('abort', abort, { once: true })
        const timer = setTimeout(abort, 120_000)
        try {
          const headers = new Headers({ 'Content-Type': 'application/json' })
          const token = localStorage.getItem(AUTH_TOKEN_KEY)
          if (token) headers.set('Authorization', `Bearer ${token}`)
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers,
            signal: controller.signal,
            body: JSON.stringify({
              message,
              conversationId,
              stream: true,
              image: options.image || undefined,
              nickname: options.nickname || undefined,
              timeZone: resolvedTimeZone()
            })
          })
          if (!response.ok) {
            const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
            throw new ApiRequestError(data?.error?.message || '请求失败，请稍后再试', response.status)
          }
          // 旧后端会忽略 stream 字段，直接返回 JSON；这里按普通回复处理。
          if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
            const data = (await response.json()) as ChatReply
            if (typeof data?.reply !== 'string') throw new ApiRequestError('服务器返回的内容无法读取')
            return data
          }
          if (!response.body) throw new ApiRequestError('暂时连不上服务器，请稍后再试')
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let finished: ChatReply | null = null
          let failure = ''
          while (true) {
            const part = await reader.read()
            if (part.done) break
            buffer += decoder.decode(part.value, { stream: true })
            let at = buffer.indexOf('\n\n')
            while (at >= 0) {
              const frame = buffer.slice(0, at)
              buffer = buffer.slice(at + 2)
              at = buffer.indexOf('\n\n')
              let event = 'message'
              const dataLines: string[] = []
              for (const line of frame.split('\n')) {
                if (line.startsWith('event:')) event = line.slice(6).trim()
                else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
              }
              if (!dataLines.length) continue
              let payload: { text?: string; message?: string } & Partial<ChatReply>
              try { payload = JSON.parse(dataLines.join('\n')) } catch { continue }
              if (event === 'delta' && typeof payload.text === 'string') options.onDelta?.(payload.text)
              else if (event === 'done') finished = payload as ChatReply
              else if (event === 'error') failure = payload.message || 'AI 暂时连接失败，请稍后重试'
            }
          }
          if (finished) return finished
          throw new ApiRequestError(failure || '这次没收到回复，再试一次？')
        } catch (error) {
          if (error instanceof ApiRequestError) throw error
          if (controller.signal.aborted) {
            throw new ApiRequestError(options.signal?.aborted ? '已停下，这句话还留着，可以重试' : '请求超时，请稍后重试')
          }
          throw new ApiRequestError('暂时连不上服务器，请稍后再试')
        } finally {
          clearTimeout(timer)
          options.signal?.removeEventListener('abort', abort)
        }
      }
    },
    crisis: {
      check(message, sessionId) {
        return requestJson<CrisisCheckResult>('/api/v1/crisis/check', {
          method: 'POST', body: JSON.stringify({ message, sessionId })
        }, 5000)
      },
      resources() {
        return requestJson('/api/v1/crisis/resources', {}, 5000)
      }
    },
    ai: {
      async complete(messages, opts) {
        const data = await requestJson<{ content?: string }>('/api/ai/chat/completions', {
          method: 'POST',
          signal: opts?.signal,
          body: JSON.stringify({
            messages,
            temperature: opts?.temperature ?? 0.8,
            maxTokens: opts?.maxTokens ?? 400
          })
        })
        const content = typeof data.content === 'string' ? data.content.trim() : ''
        if (!content) throw new ApiRequestError('AI 没有返回内容，请重试')
        return content
      }
    }
  }
}
