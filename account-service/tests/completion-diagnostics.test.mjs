import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createCompletionDiagnostic } from '../completion-diagnostics.mjs'

const UUID = '123e4567-e89b-42d3-a456-426614174000'
const SECRET = 'SYNTHETIC_API_KEY_CANARY_DO_NOT_USE'
const PRIVATE = 'SYNTHETIC_PRIVATE_CHAT_CANARY'
const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
const functionText = source.match(/async function deepseekComplete\(messages, temperature, maxTokens, signal\) \{[\s\S]*?\n\}/)?.[0]
assert.ok(functionText, 'actual proposed deepseekComplete must be tested')

function trace(timeout = 20000, emit) {
  const lines = []
  const diagnostic = createCompletionDiagnostic(timeout, { emit: emit || (line => lines.push(line)) })
  return { diagnostic, lines, record: () => JSON.parse(lines.at(-1)) }
}
function jsonResponse(status, error, headers = {}) {
  return new Response(JSON.stringify({ error }), { status, headers })
}
function noLeaks(lines) {
  const text = lines.join('\n')
  for (const canary of [SECRET, PRIVATE, 'Authorization', 'Bearer ', 'person@example.test', '13800000000']) {
    assert.equal(text.includes(canary), false, 'sensitive canary must not reach diagnostic output')
  }
}
function completion(fetch, timeout = 20000) {
  const lines = []
  const context = {
    fetch, AbortSignal, AI_TIMEOUT_MS: timeout,
    AI_BASE_URL: 'https://api.deepseek.com/v1/', AI_MODEL: 'deepseek-chat',
    AI_API_KEY: SECRET,
    createCompletionDiagnostic: ms => createCompletionDiagnostic(ms, { emit: line => lines.push(line) })
  }
  return { run: vm.runInNewContext('(' + functionText + ')', context), lines }
}
const messages = [{ role: 'system', content: PRIVATE }, { role: 'user', content: PRIVATE }]

test('401: capture HTTP status/code/type/request ID; discard echoed credentials and chat', async () => {
  const t = trace()
  const response = jsonResponse(401, { type: 'authentication_error', code: 'invalid_api_key',
    message: SECRET + ' Authorization: Bearer ' + SECRET + PRIVATE }, {
    'x-request-id': UUID, 'set-cookie': PRIVATE, 'x-private': SECRET
  })
  t.diagnostic.fetchStarted(); t.diagnostic.response(response)
  await t.diagnostic.httpError(response); t.diagnostic.error(new Error(SECRET)); t.diagnostic.finish()
  const r = t.record()
  assert.equal(r.upstreamStatus, 401); assert.equal(r.upstreamErrorCode, 'invalid_api_key')
  assert.equal(r.upstreamErrorType, 'authentication_error'); assert.equal(r.upstreamRequestId, UUID)
  assert.equal(r.safeMessage, 'authentication_rejected'); assert.equal(r.errorBodyOutcome, 'parsed')
  assert.ok(Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0)
  noLeaks(t.lines)
})

test('unknown type/code/message/request ID are not copied', async () => {
  const t = trace()
  const response = jsonResponse(400, { type: PRIVATE, code: SECRET, message: 'person@example.test 13800000000', request_id: PRIVATE })
  t.diagnostic.response(response); await t.diagnostic.httpError(response); t.diagnostic.finish()
  assert.equal(t.record().upstreamErrorCode, 'other'); assert.equal(t.record().upstreamErrorType, 'other')
  assert.equal(t.record().upstreamRequestId, null); noLeaks(t.lines)
})

test('only approved numeric error codes survive', async () => {
  for (const [code, expected] of [[429, 429], [13800000000, 'other']]) {
    const t = trace(); const response = jsonResponse(429, { code, message: PRIVATE })
    t.diagnostic.response(response); await t.diagnostic.httpError(response); t.diagnostic.finish()
    assert.equal(t.record().upstreamErrorCode, expected); noLeaks(t.lines)
  }
})

test('safe code classifies model error without logging raw message', async () => {
  const t = trace(); const response = jsonResponse(400, { code: 'model_not_found', message: PRIVATE })
  t.diagnostic.response(response); await t.diagnostic.httpError(response); t.diagnostic.finish()
  assert.equal(t.record().safeMessage, 'model_unavailable'); noLeaks(t.lines)
})

test('non-JSON error preserves status; HTML is never logged', async () => {
  const t = trace(); const response = new Response('<html>' + PRIVATE + SECRET + '</html>', { status: 502 })
  t.diagnostic.response(response); await t.diagnostic.httpError(response); t.diagnostic.finish()
  assert.equal(t.record().upstreamStatus, 502); assert.equal(t.record().errorBodyOutcome, 'invalid_json')
  assert.equal(t.record().safeMessage, 'upstream_server_error'); noLeaks(t.lines)
})

test('oversized error is omitted, not truncated into logs', async () => {
  const t = trace(); const response = jsonResponse(500, { code: 'internal_error', message: PRIVATE.repeat(300) })
  t.diagnostic.response(response); await t.diagnostic.httpError(response); t.diagnostic.finish()
  assert.equal(t.record().errorBodyOutcome, 'too_large'); assert.equal(t.record().upstreamStatus, 500)
  assert.equal(t.record().upstreamErrorCode, null); noLeaks(t.lines)
})

test('slow error body is cancelled within bounded observation budget', async () => {
  let cancelled = false
  const t = trace()
  const response = new Response(new ReadableStream({ cancel() { cancelled = true } }), { status: 503 })
  const start = performance.now()
  t.diagnostic.response(response); await t.diagnostic.httpError(response); t.diagnostic.finish()
  assert.equal(t.record().errorBodyOutcome, 'timed_out'); assert.equal(cancelled, true)
  assert.ok(performance.now() - start < 1500, '200 ms budget must not hang on body')
  assert.equal(t.record().upstreamStatus, 503)
})

test('exhausted original deadline adds no error-body wait', async () => {
  const t = trace(0); const response = jsonResponse(401, { code: 'invalid_api_key' })
  t.diagnostic.response(response); await t.diagnostic.httpError(response); t.diagnostic.finish()
  assert.equal(t.record().errorBodyOutcome, 'budget_exhausted'); assert.equal(t.record().upstreamStatus, 401)
})

test('bounded reader supports chunked JSON and body request_id fallback', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ request_id: UUID, error: { code: 'rate_limit_exceeded', message: PRIVATE } }))
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 12)); c.enqueue(bytes.slice(12)); c.close() } }), { status: 429 })
  const t = trace(); t.diagnostic.response(response); await t.diagnostic.httpError(response); t.diagnostic.finish()
  assert.equal(t.record().upstreamRequestId, UUID); assert.equal(t.record().upstreamErrorCode, 'rate_limit_exceeded')
  noLeaks(t.lines)
})

test('request_id accepts a bounded req ID and rejects non-ID/oversized values', () => {
  for (const [id, expected] of [['req_' + 'a'.repeat(32), 'req_' + 'a'.repeat(32)], ['person@example.test', null], [SECRET, null], ['a'.repeat(300), null]]) {
    const t = trace(); t.diagnostic.response(new Response('{}', { headers: { 'request-id': id } })); t.diagnostic.finish()
    assert.equal(t.record().upstreamRequestId, expected); noLeaks(t.lines)
  }
})

test('network error exposes only bounded cause enum, not error message/stack', () => {
  const t = trace(); const error = new TypeError(PRIVATE, { cause: { code: 'ENOTFOUND', message: SECRET } })
  t.diagnostic.fetchStarted(); t.diagnostic.error(error); t.diagnostic.finish()
  assert.equal(t.record().safeCauseCode, 'ENOTFOUND'); assert.equal(t.record().errorName, 'TypeError')
  assert.equal(t.record().upstreamStatus, null); noLeaks(t.lines)
})

test('TLS cause and nested AggregateError are classified', () => {
  const t = trace()
  t.diagnostic.error(new TypeError(PRIVATE, { cause: new AggregateError([{ code: 'CERT_HAS_EXPIRED', message: SECRET }]) }))
  t.diagnostic.finish(); assert.equal(t.record().safeCauseCode, 'CERT_HAS_EXPIRED'); noLeaks(t.lines)
})

test('timeout name is preserved with safe category and no raw text', () => {
  const t = trace(); t.diagnostic.error(new DOMException(PRIVATE + SECRET, 'TimeoutError')); t.diagnostic.finish()
  assert.equal(t.record().errorName, 'TimeoutError'); assert.equal(t.record().safeMessage, 'timeout'); noLeaks(t.lines)
})

test('unknown error names/codes and hostile getters fail closed', () => {
  const t = trace(); t.diagnostic.error({ name: PRIVATE, cause: { code: SECRET } }); t.diagnostic.stage(PRIVATE); t.diagnostic.finish()
  assert.equal(t.record().errorName, 'other'); assert.equal(t.record().safeCauseCode, 'other'); noLeaks(t.lines)
  const bad = trace(); bad.diagnostic.error({ get name() { throw new Error(SECRET) } }); bad.diagnostic.finish()
  noLeaks(bad.lines)
})

test('logging failure cannot replace business result; finish is idempotent', () => {
  const t = trace(); t.diagnostic.finish(); t.diagnostic.finish(); assert.equal(t.lines.length, 1)
  const throwing = trace(20000, () => { throw new Error(PRIVATE) })
  assert.doesNotThrow(() => throwing.diagnostic.finish())
})

test('log has fixed metadata keys only', () => {
  const t = trace(); t.diagnostic.finish()
  assert.deepEqual(Object.keys(t.record()).sort(), ['event','localRequestId','route','attemptedAt','fetchAttempted','stage','upstreamStatus','elapsedMs','timeoutMs','messageCount','systemCount','systemFirst','systemChars','errorName','upstreamErrorType','upstreamErrorCode','safeMessage','safeCauseCode','upstreamRequestId','errorBodyOutcome'].sort())
  assert.equal(t.record().route, '/api/ai/chat/completions')
})

test('actual proposed completion: successful result and original request contract unchanged', async () => {
  let captured
  const c = completion(async (url, options) => {
    captured = { url, options }
    return new Response(JSON.stringify({ choices: [{ message: { content: '  ' + PRIVATE + '  ' } }] }), { headers: { 'x-request-id': UUID } })
  })
  assert.equal(await c.run(messages, 0.85, 320), PRIVATE)
  assert.equal(captured.url, 'https://api.deepseek.com/v1/chat/completions')
  assert.equal(captured.options.method, 'POST'); assert.equal(captured.options.headers.Authorization, 'Bearer ' + SECRET)
  assert.deepEqual(JSON.parse(captured.options.body), { model: 'deepseek-chat', temperature: 0.85, max_tokens: 320, messages })
  const r = JSON.parse(c.lines[0]); assert.equal(r.upstreamStatus, 200); assert.equal(r.stage, 'success'); assert.equal(r.upstreamRequestId, UUID)
  assert.equal(r.fetchAttempted, true); assert.equal(r.messageCount, 2); assert.equal(r.systemCount, 1)
  assert.equal(r.systemFirst, true); assert.equal(r.systemChars, PRIVATE.length)
  assert.equal(c.lines.length, 1); noLeaks(c.lines)
})

test('actual proposed completion: legacy outline parameters unchanged', async () => {
  let body
  const c = completion(async (_url, options) => { body = JSON.parse(options.body); return new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"测试","sections":[]}' } }] })) })
  await c.run(messages, 0.3, 400)
  assert.equal(body.temperature, 0.3); assert.equal(body.max_tokens, 400); assert.equal(body.model, 'deepseek-chat')
  noLeaks(c.lines)
})

test('actual proposed completion: non-2xx keeps original deepseek_NNN error and records metadata', async () => {
  const c = completion(async () => jsonResponse(401, { type: 'authentication_error', code: 'invalid_api_key', message: PRIVATE + SECRET }))
  await assert.rejects(c.run(messages, 0.3, 100), { message: 'deepseek_401' })
  assert.equal(JSON.parse(c.lines[0]).upstreamStatus, 401); noLeaks(c.lines)
})

test('actual proposed completion: broken error body must not mask original HTTP error', async () => {
  const c = completion(async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(PRIVATE + SECRET)) } }), { status: 502 }))
  await assert.rejects(c.run(messages, 0.3, 100), { message: 'deepseek_502' })
  const r = JSON.parse(c.lines[0]); assert.equal(r.upstreamStatus, 502); assert.equal(r.errorBodyOutcome, 'unavailable'); noLeaks(c.lines)
})

test('actual proposed completion: original network Error object is rethrown', async () => {
  const original = new TypeError(PRIVATE, { cause: { code: 'ECONNRESET', message: SECRET } })
  const c = completion(async () => { throw original })
  await assert.rejects(c.run(messages, 0.3, 100), e => e === original)
  const r = JSON.parse(c.lines[0]); assert.equal(r.stage, 'fetch'); assert.equal(r.upstreamStatus, null); assert.equal(r.safeCauseCode, 'ECONNRESET'); noLeaks(c.lines)
})

test('actual proposed completion: JSON parse failure retains stage and status', async () => {
  const c = completion(async () => new Response(PRIVATE, { status: 200 }))
  await assert.rejects(c.run(messages, 0.3, 100), e => e.name === 'SyntaxError')
  const r = JSON.parse(c.lines[0]); assert.equal(r.upstreamStatus, 200); assert.equal(r.stage, 'response_json'); noLeaks(c.lines)
})

test('actual proposed completion: empty content retains existing error', async () => {
  const c = completion(async () => new Response('{"choices":[]}', { status: 200 }))
  await assert.rejects(c.run(messages, 0.3, 100), { message: 'deepseek_empty' })
  assert.equal(JSON.parse(c.lines[0]).stage, 'content'); noLeaks(c.lines)
})

test('completion cancellation reaches upstream fetch and keeps safe diagnostics',async()=>{
  const controller=new AbortController()
  const c=completion(async(_url,options)=>new Promise((_resolve,reject)=>{
    options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})
  }))
  const pending=c.run(messages,0.3,100,controller.signal)
  const rejected=assert.rejects(pending,e=>e.name==='AbortError')
  controller.abort()
  await rejected
  assert.equal(JSON.parse(c.lines[0]).errorName,'AbortError')
  noLeaks(c.lines)
})

test('actual proposed completion: preparation failure does not claim fetch occurred', async () => {
  let calls = 0
  const c = completion(async () => { calls++; throw new Error('unexpected') }, NaN)
  await assert.rejects(c.run(messages, 0.3, 100))
  const r = JSON.parse(c.lines[0]); assert.equal(calls, 0); assert.equal(r.fetchAttempted, false); assert.equal(r.stage, 'prepare'); assert.equal(r.upstreamStatus, null)
  noLeaks(c.lines)
})

test('message structure metadata never includes prompt/chat; malformed getters fail closed', () => {
  const t = trace()
  t.diagnostic.messages(messages); t.diagnostic.finish()
  const r = t.record()
  assert.equal(r.messageCount, 2); assert.equal(r.systemCount, 1)
  assert.equal(r.systemFirst, true); assert.equal(r.systemChars, PRIVATE.length)
  noLeaks(t.lines)
  const bad = trace()
  bad.diagnostic.messages([{ get role() { throw new Error(SECRET) } }]); bad.diagnostic.finish()
  assert.equal(bad.record().messageCount, null); noLeaks(bad.lines)
})
