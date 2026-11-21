// Explicit real-model acceptance; NOT imported by npm test. Uses synthetic intents only.
// The original running service supplies its own config. No .env/key/model configuration is read.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createApi } from '../../../web/kernel/api.ts'
import { generateAssist, validateAssistReply } from '../../../web/features/scenario/assist.ts'
import { SCENARIOS } from '../../../web/features/scenario/scenarios.ts'

const origin = 'http://127.0.0.1:3001'
const directFetch = globalThis.fetch
globalThis.localStorage = { getItem: () => null }
globalThis.fetch = (url, options) => {
  if (url !== '/api/ai/chat/completions') throw new Error('Unexpected acceptance route')
  return directFetch(origin + url, options)
}
const cases = [
  ['neutral-no-intent',''],
  ['no-date','我想确认材料清单。'],
  ['no-action','我想听听您的考虑。'],
  ['explicit-date','我下周一把材料发给您。'],
  ['refusal','我不想借钱。'],
  ['hesitation','我还没决定要不要参加。'],
  ['polite-refusal','我不想借钱，请委婉一点。'],
  ['explicit-promise','我保证下周一把材料发给您。'],
  ['tentative-action','我想整理材料。'],
  ['neutral-no-intent-again','']
]
const scenario = SCENARIOS.find(item => item.id === 'work-raise')
const api = createApi()
const results = []
for (const [index, [caseId, intent]] of cases.entries()) {
  const records = []
  const start = Date.now()
  let accepted = false
  let reason = null
  try {
    const result = await generateAssist({
      complete: api.ai.complete, scenario, difficulty:'realistic', goal:scenario.goal,
      dialogue:[{role:'assistant',text:scenario.openings.realistic}], draft:intent, previous:'',
      onDiagnostic: record => records.push(record)
    })
    accepted = validateAssistReply(result, intent).reason === null
  } catch (error) { reason = error.reason || 'unexpected' }
  const summary = {
    case:index+1, caseId, accepted, reason, elapsedMs:Date.now()-start,
    retryCount:records.at(-1)?.retryCount ?? 0,
    httpStatuses:records.filter(record=>record.phase!=='complete').map(record=>record.httpStatus),
    rejectionReasons:records.filter(record=>record.outcome==='rejected').map(record=>record.validationReason),
    modelCalls:records.filter(record=>record.phase!=='complete').length,
    diagnostics:records
  }
  results.push(summary)
  console.log(JSON.stringify({...summary,diagnostics:undefined}))
}
const outputPath=path.join(os.tmpdir(),'xinqing-p021-real-acceptance-'+Date.now()+'.json')
await fs.writeFile(outputPath,JSON.stringify({evidence:'real-service-synthetic-intents',origin,results},null,2),'utf8')
console.log(JSON.stringify({event:'p021_real_acceptance_finished',outputPath,passed:results.filter(r=>r.accepted).length,total:results.length}))
if(results.some(result=>!result.accepted)) process.exitCode=1

