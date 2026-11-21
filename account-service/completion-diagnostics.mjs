import crypto from 'node:crypto'

const STAGES = new Set(['prepare', 'fetch', 'response_status', 'response_json', 'content', 'success'])
const TYPES = new Set(['authentication_error', 'invalid_request_error', 'permission_error', 'rate_limit_error', 'server_error'])
const CODES = new Set(['invalid_api_key', 'authentication_error', 'insufficient_balance', 'model_not_found', 'model_not_exist', 'invalid_model', 'invalid_request_error', 'invalid_request', 'rate_limit_exceeded', 'rate_limit_error', 'context_length_exceeded', 'invalid_parameter', 'server_error', 'internal_error', 'permission_denied', 'timeout'])
const NUMERIC_CODES = new Set([400, 401, 402, 403, 404, 408, 422, 429, 500, 502, 503, 504])
const NAMES = new Set(['Error', 'TypeError', 'SyntaxError', 'AbortError', 'TimeoutError'])
const CAUSES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REQUEST_ID = /^req[-_][0-9a-f]{32}$/i

function safeRequestId(value) {
  return typeof value === 'string' && value.length <= 64 && (UUID.test(value) || REQUEST_ID.test(value)) ? value : null
}

function safeCode(value) {
  if (typeof value === 'string') return CODES.has(value) ? value : 'other'
  return NUMERIC_CODES.has(value) ? value : 'other'
}

function messageCategory(status, code) {
  if (['model_not_found', 'model_not_exist', 'invalid_model'].includes(code)) return 'model_unavailable'
  if (status === 401 || code === 'invalid_api_key' || code === 'authentication_error') return 'authentication_rejected'
  if (status === 402 || code === 'insufficient_balance') return 'insufficient_balance'
  if (status === 403 || code === 'permission_denied') return 'permission_rejected'
  if (status === 429 || code === 'rate_limit_exceeded' || code === 'rate_limit_error') return 'rate_limited'
  if (status >= 500) return 'upstream_server_error'
  if (status === 404) return 'resource_unavailable'
  if (status === 400 || status === 422) return 'invalid_request'
  return '[omitted]'
}

function causeCode(error) {
  const queue = [{ value: error, depth: 0 }]
  for (let seen = 0; queue.length && seen < 12; seen++) {
    const { value, depth } = queue.shift()
    if (!value || typeof value !== 'object') continue
    if (CAUSES.has(value.code)) return value.code
    if (depth < 3) {
      queue.push({ value: value.cause, depth: depth + 1 })
      if (Array.isArray(value.errors)) {
        for (const nested of value.errors.slice(0, 3)) queue.push({ value: nested, depth: depth + 1 })
      }
    }
  }
  return 'other'
}

async function boundedErrorBody(response, budgetMs) {
  if (budgetMs <= 0) return { outcome: 'budget_exhausted' }
  let reader, timer
  try {
    reader = response.body?.getReader()
    if (!reader) return { outcome: 'unavailable' }
    const reading = (async () => {
      const parts = []
      let bytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > 4096) return { outcome: 'too_large' }
        parts.push(value)
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts))
      try { return { outcome: 'parsed', data: JSON.parse(text) } }
      catch { return { outcome: 'invalid_json' } }
    })()
    const deadline = new Promise(resolve => {
      timer = setTimeout(() => resolve({ outcome: 'timed_out' }), budgetMs)
    })
    return await Promise.race([reading, deadline])
  } catch { return { outcome: 'unavailable' } }
  finally {
    clearTimeout(timer)
    try { Promise.resolve(reader?.cancel()).catch(() => {}) } catch {}
    try { reader?.releaseLock() } catch {}
  }
}

// Never accept an arbitrary metadata object: only fixed fields reach the sink.
export function createCompletionDiagnostic(timeoutMs, { emit = line => console.error(line) } = {}) {
  const started = performance.now()
  const record = {
    event: 'deepseek_upstream_diagnostic',
    localRequestId: crypto.randomUUID(),
    route: '/api/ai/chat/completions',
    attemptedAt: new Date().toISOString(),
    fetchAttempted: false,
    stage: 'prepare',
    upstreamStatus: null,
    elapsedMs: 0,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : null,
    messageCount: null,
    systemCount: null,
    systemFirst: null,
    systemChars: null,
    errorName: null,
    upstreamErrorType: null,
    upstreamErrorCode: null,
    safeMessage: null,
    safeCauseCode: null,
    upstreamRequestId: null,
    errorBodyOutcome: null
  }
  let finished = false
  return {
    messages(messages) {
      try {
        if (!Array.isArray(messages)) return
        const systems = messages.filter(item => item?.role === 'system')
        record.messageCount = messages.length
        record.systemCount = systems.length
        record.systemFirst = messages[0]?.role === 'system'
        record.systemChars = systems.length === 1 && typeof systems[0].content === 'string' ? systems[0].content.length : null
      } catch {
        record.messageCount = null; record.systemCount = null
        record.systemFirst = null; record.systemChars = null
      }
    },
    fetchStarted() { record.fetchAttempted = true; record.stage = 'fetch' },
    stage(value) { if (STAGES.has(value)) record.stage = value },
    response(response) {
      record.stage = 'response_status'
      try {
        if (Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) record.upstreamStatus = response.status
        record.upstreamRequestId = safeRequestId(response.headers.get('x-request-id'))
          || safeRequestId(response.headers.get('request-id'))
      } catch {}
    },
    async httpError(response) {
      try {
        record.safeMessage = messageCategory(record.upstreamStatus, null)
        const remaining = Math.max(0, (record.timeoutMs ?? 0) - Math.ceil(performance.now() - started))
        const result = await boundedErrorBody(response, Math.min(200, remaining))
        record.errorBodyOutcome = result.outcome
        const data = result.data
        const error = data && typeof data === 'object' && data.error && typeof data.error === 'object' ? data.error : null
        if (error) {
          record.upstreamErrorType = TYPES.has(error.type) ? error.type : 'other'
          record.upstreamErrorCode = safeCode(error.code)
          record.safeMessage = messageCategory(record.upstreamStatus, record.upstreamErrorCode)
        }
        record.upstreamRequestId ||= safeRequestId(data?.request_id) || safeRequestId(error?.request_id)
        // error.message and all other response fields are deliberately ignored.
      } catch {}
    },
    error(error) {
      try {
        record.errorName = NAMES.has(error?.name) ? error.name : 'other'
        record.safeCauseCode = causeCode(error)
        if (record.safeMessage === null) {
          record.safeMessage = ['AbortError', 'TimeoutError'].includes(record.errorName) ? 'timeout'
            : record.errorName === 'SyntaxError' ? 'invalid_response' : '[omitted]'
        }
      } catch { record.errorName = 'other'; record.safeCauseCode = 'other' }
    },
    finish() {
      if (finished) return
      finished = true
      record.elapsedMs = Math.max(0, Math.round(performance.now() - started))
      try { emit(JSON.stringify(record)) } catch {}
    }
  }
}
