// 离线演示/浏览器验证入口：明确使用模拟上游，不会连接真实模型。
import { fileURLToPath } from 'node:url'
import { startIsolatedService } from './isolated-service.mjs'

let assists = 0
const service = await startIsolatedService({
  staticDir: fileURLToPath(new URL('../../../dist', import.meta.url)),
  respond: async body => {
    const system = body.messages[0]?.content || ''
    const last = body.messages.at(-1)?.content || ''
    const kind = system.includes('独立的辅助写作任务') ? 'assist' : system.includes('你是复盘者') ? 'debrief' : 'counterpart'
    console.log(JSON.stringify({kind, messages:body.messages.length, hasSystem:body.messages[0]?.role==='system',
      userMessages:body.messages.filter(x=>x.role==='user').length}))
    if (kind === 'assist') {
      await new Promise(resolve=>setTimeout(resolve,1800))
      return ++assists % 2 ? '我想先谈谈加薪，您什么时候方便给我十分钟？' : '我希望先把项目情况说清楚，再听听您的考虑。'
    }
    if (kind === 'debrief') return 'CLOSEST: U1\nTAKEAWAY: NONE\nNEXT: 我想把自己的想法说清楚，再听听你的看法。'
    await new Promise(resolve=>setTimeout(resolve,last.includes('延迟')?2500:250))
    if (last.includes('测试失败')) return {status:503,content:''}
    if (last.includes('测试越界')) return '你是废物，你不答应我就曝光你的隐私。'
    return last.includes('项目') ? '项目增加的情况我听到了。先把具体结果说一下，我再看预算。' : '我现在不能直接答应，得先看看情况。你先说最重要的那一点。'
  }
})
console.log(`P0 模拟 Demo（非真实模型）：${service.origin}`)
console.log('独立浏览器来源、临时数据库；退出后清理测试数据。真实模型质量尚需另行验收。')
async function close() { await service.close(); process.exit(0) }
process.on('SIGINT',close)
process.on('SIGTERM',close)
// Keep the isolated HTTP service alive until the operator stops it.
