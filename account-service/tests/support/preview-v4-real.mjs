// Separate real-model demo. Reuses server.mjs's .env loading without reading/logging credentials.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root=fileURLToPath(new URL('../../../',import.meta.url))
const directory=path.join(root,'tmp','scenario-v4-real-runtime')
await fs.mkdir(directory,{recursive:true})
const child=spawn(process.execPath,['--experimental-sqlite',path.join(root,'account-service/server.mjs')],{
  cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
  env:{...process.env,PORT:process.env.V4_DEMO_PORT||'5176',BIND_HOST:'127.0.0.1',STATIC_DIR:path.join(root,'dist'),
    DB_PATH:path.join(directory,'acceptance.db'),DATA_PATH:path.join(directory,'unused-accounts.json')}
})
let buffer=''
child.stdout.setEncoding('utf8')
child.stdout.on('data',chunk=>{
  buffer+=chunk
  const lines=buffer.split('\n');buffer=lines.pop()
  for(const line of lines) {
    try {
      const info=JSON.parse(line)
      if(info.port) {
        const runtime={origin:`http://127.0.0.1:${info.port}`,pid:child.pid,launcherPid:process.pid,realModel:true}
        fs.writeFile(path.join(root,'tmp/scenario-v4-runtime.json'),JSON.stringify(runtime,null,2))
        console.log(JSON.stringify(runtime))
      }
    } catch { /* no raw logs */ }
  }
})
child.stderr.setEncoding('utf8')
child.stderr.on('data',chunk=>{
  for(const line of chunk.split('\n')) {
    try {
      const info=JSON.parse(line)
      if(info.event==='deepseek_upstream_diagnostic') {
        fs.appendFile(path.join(directory,'upstream-diagnostics.jsonl'),JSON.stringify(info)+'\n')
        console.log(JSON.stringify(info))
      }
      else if(info.event==='deepseek_failed') console.log(JSON.stringify({event:info.event,reason:info.reason}))
    } catch { /* do not print raw errors or environment */ }
  }
})
child.on('exit',code=>{console.log(JSON.stringify({event:'v4_demo_exit',code}));process.exitCode=code||0})
