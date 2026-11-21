// Isolated browser acceptance only: fixed synthetic responses, loopback upstream, temporary DB.
// No .env, real model, production history or PID 43788 is used.
import { fileURLToPath } from 'node:url'
import { startIsolatedService } from './isolated-service.mjs'

const fixtures = Object.freeze({
  normal: '材料齐了，我才能替你说话。',
  refusal: '我现在没法答应，需要先看预算。',
  insult: '你是废物。',
  threat: '你不答应我就曝光你的隐私。'
})
let multiAttempt = 0
let dateAttempt = 0
const service = await startIsolatedService({
  staticDir: fileURLToPath(new URL('../../../dist', import.meta.url)),
  respond: async body => {
    const system = body.messages[0]?.content || ''
    const last = body.messages.at(-1)?.content || ''
    if (system.includes('你只审查辅助改写是否忠实')) {
      const data = JSON.parse(last)
      const allowed = [
        '我想先听听你的看法。', '我想先了解你的看法。', '我想确认材料清单。',
        '我不方便借钱，希望您理解。', '我下周一把材料发给您。'
      ]
      return allowed.includes(data.candidate) ? 'OK' : 'REJECT: meaning_changed'
    }
    if (system.includes('独立的辅助写作任务')) {
      const data = JSON.parse(last)
      const intent = data.userIntent.text
      console.log(JSON.stringify({event:'isolated_assist_fixture',attemptIsRetry:system.includes('上一次未通过检查')}))
      await new Promise(resolve => setTimeout(resolve, 350))
      if (intent === '我想先听听你的看法。') return ++multiAttempt === 1 ? '我想先听听。你说吧。' : '我想先听听你的看法。'
      if (intent === '我想确认材料清单。') return ++dateAttempt === 1 ? '我下周一整理好材料发您。' : '我想确认材料清单。'
      if (intent === '我还没决定要不要参加。') return '我一定会参加。'
      if (intent === '我下周一把材料发给您。') return intent
      if (intent === '我不想借钱。') return '我不方便借钱，希望您理解。'
      return data.lastSuggestion === '我想先听听你的看法。' ? '我想先了解你的看法。' : '我想先听听你的看法。'
    }
    if (system.includes('你是复盘者')) return 'CLOSEST: U1\nTAKEAWAY: NONE\nNEXT: 我想先听听你的看法。'
    if (last.includes('检查正常表达')) return fixtures.normal
    if (last.includes('检查正常拒绝')) return fixtures.refusal
    if (last.includes('检查辱骂拦截')) return fixtures.insult
    if (last.includes('检查威胁拦截')) return fixtures.threat
    if (last.includes('检查请求失败')) return {status:503,content:''}
    return fixtures.refusal
  }
})
console.log(JSON.stringify({event:'p021_isolated_browser_ready',origin:service.origin,realModel:false}))
let closing = false
async function close() { if (closing) return; closing = true; await service.close(); process.exit(0) }
process.on('SIGINT', close)
process.on('SIGTERM', close)

