// Real-model verification on a separate origin and database; never reads browser chat.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = await fs.mkdtemp(path.join(root, 'tmp', 'scene-chat-preview-'))
const child = spawn(process.execPath, ['--experimental-sqlite', path.join(root, 'account-service/server.mjs')], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '5180', BIND_HOST: '127.0.0.1', STATIC_DIR: path.join(root, 'dist'),
    DB_PATH: path.join(directory, 'verification.db'), DATA_PATH: path.join(directory, 'accounts.json') }
})
let output = ''
child.stdout.setEncoding('utf8')
child.stdout.on('data', chunk => {
  output += chunk
  const lines = output.split('\n'); output = lines.pop()
  for (const line of lines) {
    try {
      const info = JSON.parse(line)
      if (info.event === 'account_service_started') console.log(JSON.stringify({ origin: `http://127.0.0.1:${info.port}/`, realModel: info.aiEnabled, isolatedDatabase: true }))
    } catch { /* Do not print raw server output. */ }
  }
})
child.stderr.on('data', () => { /* The normal service owns upstream diagnostics. */ })
child.on('error', () => { console.error('Scene chat preview failed to start'); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code || 0 })
process.on('SIGINT', () => child.kill())
process.on('SIGTERM', () => child.kill())
