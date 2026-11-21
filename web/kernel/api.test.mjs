import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiRequestError, createApi } from './api.ts'

const messages = [
  { role: 'system', content: '暂停角色对话，帮助用户从旁观者角度梳理。' },
  { role: 'user', content: '我希望把边界说清楚。' }
]

function useToken(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => 'test-session-token' }
  })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  })
}

test('场景请求保留角色消息和登录令牌', async (t) => {
  useToken(t)
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/ai/chat/completions')
    assert.equal(init.headers.get('Authorization'), 'Bearer test-session-token')
    assert.deepEqual(JSON.parse(init.body).messages, messages)
    return Response.json({ content: '  先把画面暂停。  ' })
  })
  assert.equal(await createApi().ai.complete(messages), '先把画面暂停。')
})

test('完整情景模式必须经服务确认，旧后端不能静默截历史后冒充成功',async t=>{
  useToken(t)
  let supported=false
  t.mock.method(globalThis,'fetch',async (_url,init)=>{
    assert.equal(JSON.parse(init.body).contextMode,'scenario-full')
    return Response.json({content:'对方下一句。',...(supported?{contextMode:'scenario-full'}:{})})
  })
  await assert.rejects(createApi().ai.complete(messages,{contextMode:'scenario-full'}),/V4/)
  supported=true
  assert.equal(await createApi().ai.complete(messages,{contextMode:'scenario-full'}),'对方下一句。')
})

test('场景接口错误保留状态码，只请求一次且不降级为日常聊天', async (t) => {
  useToken(t)
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'AI 暂时连接失败' } }, { status: 502 }))
  await assert.rejects(createApi().ai.complete(messages), (error) => error instanceof ApiRequestError && error.status === 502 && /连接失败/.test(error.message))
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('空模型回答作为错误返回', async (t) => {
  useToken(t)
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ content: '  ' }))
  await assert.rejects(createApi().ai.complete(messages), /没有返回内容/)
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('请求超时中止请求且明确报错', async (t) => {
  useToken(t)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fetchMock = t.mock.method(globalThis, 'fetch', (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  const request = createApi().ai.complete(messages)
  const rejected = assert.rejects(request, /请求超时/)
  t.mock.timers.tick(30_000)
  await rejected
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('暂停场景时可中止进行中的模型请求', async (t) => {
  useToken(t)
  const controller = new AbortController()
  t.mock.method(globalThis, 'fetch', (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  const request = createApi().ai.complete(messages, {signal:controller.signal})
  const rejected = assert.rejects(request)
  controller.abort()
  await rejected
})

test('普通聊天可以主动停止等待，保留原请求内容并明确区别于超时', async (t) => {
  useToken(t)
  const controller = new AbortController()
  t.mock.method(globalThis,'fetch',(_url,init)=>new Promise((_resolve,reject)=>{
    assert.equal(_url,'/api/chat')
    assert.equal(JSON.parse(init.body).message,'一条测试消息')
    assert.equal(JSON.parse(init.body).signal,undefined)
    init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})
  }))
  const pending=createApi().chat.send('一条测试消息','test-chat',{signal:controller.signal})
  const rejected=assert.rejects(pending,/已停下，这句话还留着/)
  controller.abort()
  await rejected
})

test('流式回复逐块回调，并在结束后返回完整结果', async (t) => {
  useToken(t)
  const frames = [
    'event: delta\ndata: {"text":"先"}\n\n',
    'event: delta\ndata: {"text":"别急"}\n\n',
    'event: done\ndata: {"reply":"先别急","riskLevel":"low","conversationId":"c1"}\n\n'
  ]
  const history = [{ role: 'assistant', text: '下午好。忙到现在了吗？' }]
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/chat')
    const body = JSON.parse(init.body)
    assert.equal(body.stream, true)
    assert.deepEqual(body.history, history)
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        for (const frame of frames) controller.enqueue(encoder.encode(frame))
        controller.close()
      }
    })
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  })
  const seen = []
  const result = await createApi().chat.stream('你好', 'c1', { history, onDelta: text => seen.push(text) })
  assert.deepEqual(seen, ['先', '别急'])
  assert.equal(result.reply, '先别急')
})

test('普通聊天也带上本段对话快照', async (t) => {
  useToken(t)
  const history = [{ role: 'assistant', text: '下午好。忙到现在了吗？' }]
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/chat')
    assert.deepEqual(JSON.parse(init.body).history, history)
    return Response.json({ reply: '嗯。', riskLevel: 'low' })
  })
  const result = await createApi().chat.send('对呀', 'c1', { history })
  assert.equal(result.reply, '嗯。')
})

test('旧后端忽略 stream 字段时按普通回复处理', async (t) => {
  useToken(t)
  t.mock.method(globalThis, 'fetch', async () => Response.json({ reply: '在的。', riskLevel: 'low' }))
  const result = await createApi().chat.stream('在吗', 'c2')
  assert.equal(result.reply, '在的。')
})

for (const sample of [
  {name:'成功',response:()=>Response.json({content:'我想聊聊。'}),expected:{httpStatus:200,errorType:null,stage:'success'}},
  {name:'HTTP',response:()=>Response.json({error:{message:'PRIVATE_ERROR'}},{status:502}),expected:{httpStatus:502,errorType:'http',stage:'response'}},
  {name:'JSON',response:()=>new Response('PRIVATE_NOT_JSON',{status:200}),expected:{httpStatus:200,errorType:'response_json',stage:'response_json'}},
  {name:'空内容',response:()=>Response.json({content:''}),expected:{httpStatus:200,errorType:'empty_content',stage:'content'}},
  {name:'网络',response:()=>{throw new Error('PRIVATE_NETWORK_MESSAGE')},expected:{httpStatus:null,errorType:'network',stage:'fetch'}}
]) test('场景诊断元数据：'+sample.name,async t=>{
  useToken(t)
  const records=[]
  t.mock.method(globalThis,'fetch',async()=>sample.response())
  const pending=createApi().ai.complete(messages,{onDiagnostic:data=>records.push(data)})
  if(sample.expected.errorType) await assert.rejects(pending)
  else assert.equal(await pending,'我想聊聊。')
  assert.deepEqual(records,[sample.expected])
  assert.ok(!JSON.stringify(records).includes('PRIVATE'))
  assert.ok(!JSON.stringify(records).includes('test-session-token'))
})

test('场景诊断观察器失败不改变成功正文或重试行为',async t=>{
  useToken(t)
  const mocked=t.mock.method(globalThis,'fetch',async()=>Response.json({content:'我想聊聊。'}))
  assert.equal(await createApi().ai.complete(messages,{onDiagnostic:()=>{throw new Error('PRIVATE')}}),'我想聊聊。')
  assert.equal(mocked.mock.callCount(),1)
})

