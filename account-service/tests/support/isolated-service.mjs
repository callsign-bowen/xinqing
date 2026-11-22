// Only explicit source modules are copied. No project .env, accounts or database are read.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { EventEmitter, once } from 'node:events'

const serviceRoot = fileURLToPath(new URL('../../', import.meta.url))

export async function startIsolatedService({ respond, staticDir = '', sourceRoot = serviceRoot, chatMode = 'natural' } = {}) {
  const tempRoot = await fs.realpath(os.tmpdir())
  const directory = await fs.mkdtemp(path.join(tempRoot, 'xinqing-p0-'))
  const requests = []
  const diagnostics = []
  const diagnosticEvents = new EventEmitter()
  let diagnosticLine = ''
  let discardDiagnosticLine = false
  function collectDiagnostic(line) {
    try {
      const data = JSON.parse(line)
      const bounded = (value, max) => value === null || (Number.isInteger(value) && value >= 0 && value <= max)
      if (data?.event !== 'deepseek_upstream_diagnostic' || data.route !== '/api/ai/chat/completions'
        || !['prepare', 'fetch', 'response_status', 'response_json', 'content', 'success'].includes(data.stage)
        || typeof data.fetchAttempted !== 'boolean'
        || !(data.upstreamStatus === null || (Number.isInteger(data.upstreamStatus) && data.upstreamStatus >= 100 && data.upstreamStatus <= 599))
        || !bounded(data.messageCount, 20) || !bounded(data.systemCount, 20) || !bounded(data.systemChars, 6000)
        || !(data.systemFirst === null || typeof data.systemFirst === 'boolean')) return
      // Test-only projection: never retain raw stderr, headers, content or errors.
      diagnostics.push({
        route: data.route, stage: data.stage, fetchAttempted: data.fetchAttempted,
        upstreamStatus: data.upstreamStatus, messageCount: data.messageCount,
        systemCount: data.systemCount, systemFirst: data.systemFirst, systemChars: data.systemChars
      })
      diagnosticEvents.emit('record')
    } catch { /* Ignore warnings and any non-diagnostic output. */ }
  }
  async function diagnosticAt(index) {
    if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Invalid diagnostic index')
    const signal = AbortSignal.timeout(2000)
    while (!diagnostics[index]) await once(diagnosticEvents, 'record', { signal })
    return diagnostics[index]
  }
  const upstream = http.createServer(async (req, res) => {
    try {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const body = JSON.parse(raw)
      requests.push(body)
      const result = await (respond?.(body, requests.length) ?? '这是隔离测试的模拟回复。')
      const content = typeof result === 'string' ? result : result.content
      if (body.stream && (!result?.status || result.status === 200)) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.end('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\ndata: [DONE]\n\n')
      } else {
        res.writeHead(result?.status || 200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ choices: [{ message: { content } }] }))
      }
    } catch {
      res.writeHead(500)
      res.end('{}')
    }
  })
  let child
  let exited
  async function close() {
    if (child && child.exitCode === null && child.signalCode === null) child.kill()
    if (exited) await exited
    upstream.closeAllConnections()
    await new Promise(resolve => upstream.close(resolve))
    const resolved = path.resolve(directory)
    if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('xinqing-p0-')) {
      throw new Error('Refusing cleanup outside the isolated test directory')
    }
    await fs.rm(resolved, { recursive: true, force: true })
  }
  try {
    for (const file of ['server.mjs', 'db.mjs', 'guidance.mjs', 'chat-context.mjs', 'completion-messages.mjs', 'completion-diagnostics.mjs', 'theater.mjs']) {
      await fs.copyFile(path.join(sourceRoot, file), path.join(directory, file))
    }
    try { await fs.copyFile(path.join(sourceRoot, 'dialogue-style.mjs'), path.join(directory, 'dialogue-style.mjs')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    upstream.listen(0, '127.0.0.1')
    await once(upstream, 'listening')
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
    child = spawn(process.execPath, ['--experimental-sqlite', path.join(directory, 'server.mjs')], {
      cwd: directory, windowsHide: true,
      env: { ...env, PORT: '0', AI_API_KEY: 'isolated-test-placeholder', AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
        CHAT_MODE: chatMode, STATIC_DIR: staticDir, DB_PATH: path.join(directory, 'test.db'), DATA_PATH: path.join(directory, 'accounts.json') },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    exited = once(child, 'exit')
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      const pieces = chunk.split('\n')
      for (let i = 0; i < pieces.length; i++) {
        if (!discardDiagnosticLine) {
          diagnosticLine += pieces[i]
          if (diagnosticLine.length > 8192) { diagnosticLine = ''; discardDiagnosticLine = true }
        }
        if (i < pieces.length - 1) {
          if (!discardDiagnosticLine) collectDiagnostic(diagnosticLine)
          diagnosticLine = ''
          discardDiagnosticLine = false
        }
      }
    })
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Isolated service startup timed out')), 8000)
      let output = ''
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`Isolated service exited: ${code}`)) })
      child.stdout.on('data', chunk => {
        output += chunk.toString()
        const match = output.match(/"event":"account_service_started","port":(\d+)/)
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`) }
      })
    })
    return { origin, requests, diagnostics, diagnosticAt, close, directory }
  } catch (error) { await close(); throw error }
}
