import test from 'node:test'
import assert from 'node:assert/strict'
import { startIsolatedService } from './support/isolated-service.mjs'

test('V4情景完整上下文经过HTTP路由和模型请求，默认任务仍截近期窗口',async t=>{
  const service=await startIsolatedService({respond:()=> '这是对方的回复。'})
  t.after(service.close)
  const messages=[{role:'system',content:'你扮演对方。'},{role:'assistant',content:'对方开场。'}]
  for(let i=1;i<=20;i++) {
    messages.push({role:'user',content:'用户实发'+i})
    if(i<20) messages.push({role:'assistant',content:'对方回应'+i})
  }
  const post=data=>fetch(service.origin+'/api/ai/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
  const response=await post({messages,contextMode:'scenario-full'})
  assert.equal(response.status,200)
  assert.equal((await response.json()).contextMode,'scenario-full')
  assert.deepEqual(service.requests.at(-1).messages,messages)
  assert.equal((await post({messages})).status,200)
  assert.equal(service.requests.at(-1).messages.length,20)
})

test('真实通用路由到模型 HTTP：1/10/11/20 次发言保留 system、顺序与参数；日常路径兼容', async t => {
  const service = await startIsolatedService({ respond: () => '收到测试请求。' })
  t.after(service.close)
  const post = (route, data) => fetch(service.origin + route, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
  const system = '固定角色、背景、关系和行为限制。'.repeat(20)
  for (const opening of [false, true]) {
    for (const n of [1, 10, 11, 20]) {
      const dialogue = opening ? [{role:'assistant',content:'a0'}] : []
      for (let i = 1; i <= n; i++) {
        dialogue.push({role:'user',content:`u${i}`})
        if (i < n) dialogue.push({role:'assistant',content:`a${i}`})
      }
      const diagnosticIndex = service.diagnostics.length
      const response = await post('/api/ai/chat/completions', {messages:[{role:'system',content:system},...dialogue],temperature:0.85,maxTokens:320})
      assert.equal(response.status, 200)
      assert.equal((await response.json()).content, '收到测试请求。')
      const actual = service.requests.at(-1)
      assert.deepEqual(actual.messages, [{role:'system',content:system},...dialogue.slice(-19)])
      assert.equal(actual.messages.filter(x => x.role === 'system').length, 1)
      assert.equal(actual.messages.filter(x => x.content === `u${n}`).length, 1)
      assert.equal(actual.temperature, 0.85)
      assert.equal(actual.max_tokens, 320)
      assert.equal(actual.model, 'deepseek-chat')
      const diagnostic = await service.diagnosticAt(diagnosticIndex)
      assert.deepEqual(diagnostic, {
        route: '/api/ai/chat/completions', stage: 'success', fetchAttempted: true,
        upstreamStatus: 200, messageCount: actual.messages.length,
        systemCount: 1, systemFirst: true, systemChars: system.length
      })
      assert.equal(JSON.stringify(diagnostic).includes(system), false)
      assert.equal(JSON.stringify(diagnostic).includes('isolated-test-placeholder'), false)
      t.diagnostic(JSON.stringify({ evidence: 'isolated-runtime', opening, userTurn: n, ...diagnostic }))
    }
  }
  const outline = [{role:'system',content:'你只负责整理对话提纲。只输出一行 JSON，不要寒暄、不要解释。'}, {role:'user',content:'合成的提纲输入'}]
  assert.equal((await post('/api/ai/chat/completions', {messages:outline,temperature:0.3,maxTokens:400})).status, 200)
  assert.deepEqual(service.requests.at(-1).messages, outline)
  assert.equal(service.requests.at(-1).temperature, 0.3)
  assert.equal(service.requests.at(-1).max_tokens, 400)
  const before = service.requests.length
  for (const messages of [
    [{role:'system',content:'s'.repeat(6001)},{role:'user',content:'u'}],
    [{role:'system',content:'s'},{role:'user',content:'u'.repeat(6001)}],
    [{role:'user',content:'u'.repeat(6001)}],
    [{role:'system',content:'s'},{role:'system',content:'s2'}],
    [{role:'user',content:'u'},{role:'system',content:'s'}]
  ]) assert.equal((await post('/api/ai/chat/completions', {messages})).status, 400)
  assert.equal(service.requests.length, before)
  const riskResponse = await post('/api/ai/chat/completions', {messages:[{role:'system',content:'s'}, {role:'user',content:'我想自杀'}]})
  assert.equal(riskResponse.status, 200)
  assert.equal(service.requests.length, before, 'existing safety gate must bypass upstream')
  const daily = await post('/api/chat', {message:'这是合成日常测试',conversationId:'isolated-test',history:[{role:'assistant',text:'你好'}]})
  assert.equal(daily.status, 200)
  assert.equal((await daily.json()).reply, '收到测试请求。')
  assert.equal(service.requests.at(-1).messages.at(-1).content, '这是合成日常测试')
})

test('内容契约：保持内部换行；最小格式失败不被修饰为严格通过', async t => {
  const token = 'P0-READY-20261116'
  let upstreamContent = token
  const service = await startIsolatedService({ respond: () => upstreamContent })
  t.after(service.close)
  const messages = [
    { role: 'system', content: '只按要求输出一行。' },
    { role: 'user', content: `只输出 ${token}，不加其他内容。` }
  ]
  const post = () => fetch(service.origin + '/api/ai/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, temperature: 0.3, maxTokens: 100 })
  })
  for (const sample of [
    { name: 'exact-token', upstream: token, expected: token, strictMatch: true },
    { name: 'historical-internal-LF', upstream: 'P0-\nREADY-20261116', expected: 'P0-\nREADY-20261116', strictMatch: false },
    { name: 'outer-whitespace-only', upstream: ` \r\n${token}\t `, expected: token, strictMatch: true },
    { name: 'multiline-content-contract', upstream: 'CLOSEST: U1\nTAKEAWAY: NONE\nNEXT: 我想先说明自己的想法。', expected: 'CLOSEST: U1\nTAKEAWAY: NONE\nNEXT: 我想先说明自己的想法。' }
  ]) {
    upstreamContent = sample.upstream
    const response = await post()
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.deepEqual(Object.keys(data), ['content'])
    assert.equal(data.content, sample.expected)
    if (typeof sample.strictMatch === 'boolean') assert.equal(data.content === token, sample.strictMatch)
    assert.deepEqual(service.requests.at(-1).messages, messages)
    assert.equal(service.requests.at(-1).temperature, 0.3)
    assert.equal(service.requests.at(-1).max_tokens, 100)
    t.diagnostic(JSON.stringify({ evidence: 'controlled-upstream', sample: sample.name, httpStatus: response.status, hasInternalLF: data.content.includes('\n'), strictTokenMatch: data.content === token }))
  }
  upstreamContent = ' \n\t '
  assert.equal((await post()).status, 502, 'empty content must remain an error')
})
