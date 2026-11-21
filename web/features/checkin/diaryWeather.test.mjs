import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchLocalForecast, parseAutoWeather, weatherFromCode, currentWeatherIsFresh, WEATHER_REFRESH_MS } from './diaryWeather.mjs'
import { normalizeRecord } from './records.mjs'

const day = '2026-10-21'
// Synthetic public coordinates for tests; never use the device's real location.
const geo = { getCurrentPosition(success) { success({ coords: { latitude: 31.234567, longitude: 121.478912 } }) } }
const response = code => async () => ({ ok: true, json: async () => ({ current: { time: day+'T17:00', weather_code: code, temperature_2m: 22.3, is_day: 1 } }) })

test('真实记录保留当时 IP 和心情；旧记录不猜测 IP，空记录不生成文字或照片', () => {
  const original = normalizeRecord({ id: 1, day, emotion: '开心', mascotId: 'cat', text: '我写的话', images: [] })
  const loaded = normalizeRecord(JSON.parse(JSON.stringify(original)))
  assert.equal(loaded.mascotId, 'cat'); assert.equal(loaded.emotion, '开心'); assert.equal(loaded.text, '我写的话')
  assert.equal(normalizeRecord({ day, emotion: '平静' }).mascotId, undefined)
  const empty = normalizeRecord({ day, mascotId: '<script>', text: '', images: [] })
  assert.equal(empty.mascotId, undefined); assert.equal(empty.text, ''); assert.deepEqual(empty.images, [])
})

test('天气代码覆盖晴、多云、阴、雾、雨、雪和雷雨；未知值留空', () => {
  for (const [code, label] of [[0,'晴'],[2,'多云'],[3,'阴'],[48,'雾'],[55,'毛毛雨'],[82,'雨'],[86,'雪'],[95,'雷雨']]) assert.equal(weatherFromCode(code)?.label, label)
  for (const code of [null, undefined, '0', 4, 100]) assert.equal(weatherFromCode(code), null)
})

test('查询当前天气与气温，坐标先降低精度；存储不带坐标或原始响应', async () => {
  let request
  const result = await fetchLocalForecast({ day, geolocation: geo, now: () => new Date('2026-10-21T09:00:00Z'), fetcher: async (url, options) => {
    request = { url: new URL(url), options }; return response(61)()
  } })
  assert.equal(request.url.origin, 'https://api.open-meteo.com')
  assert.equal(request.url.searchParams.get('latitude'), '31.23'); assert.equal(request.url.searchParams.get('longitude'), '121.48')
  assert.equal(request.url.searchParams.get('current'), 'weather_code,temperature_2m,is_day'); assert.equal(request.options.credentials, 'omit')
  assert.equal(request.url.searchParams.has('daily'), false)
  const cache = parseAutoWeather(JSON.stringify({ [day]: { ...result, latitude: 31.234567, longitude: 121.478912, text: '不保存' } }))
  assert.deepEqual(cache[day], { day, code: 61, retrievedAt: '2026-10-21T09:00:00.000Z', source: 'open-meteo', kind:'current', observedAt:day+'T17:00',temperature:22.3,isDay:1 })
  assert.equal(Object.getPrototypeOf(cache), null)
})

test('当前天气十分钟后重新查询，旧的当天预报不会冒充实时状态',()=>{
  const value={kind:'current',retrievedAt:'2026-10-21T09:00:00Z'}
  const time=Date.parse(value.retrievedAt)
  assert.equal(currentWeatherIsFresh(value,time+WEATHER_REFRESH_MS-1),true)
  assert.equal(currentWeatherIsFresh(value,time+WEATHER_REFRESH_MS),false)
  assert.equal(currentWeatherIsFresh({retrievedAt:value.retrievedAt},time),false)
})

test('拒绝定位不查询第三方；无定位能力、请求失败或超时均可结束等待', async () => {
  let calls = 0
  await assert.rejects(fetchLocalForecast({ day, geolocation: { getCurrentPosition(_, reject) { reject({ code: 1 }) } }, fetcher: async () => { calls++ } }), { code: 'permission' })
  assert.equal(calls, 0)
  await assert.rejects(fetchLocalForecast({ day, geolocation: geo, secureContext: false }), { code: 'unsupported' })
  await assert.rejects(fetchLocalForecast({ day, geolocation: { getCurrentPosition() {} }, timeoutMs: 5 }), { code: 'timeout' })
  await assert.rejects(fetchLocalForecast({ day, geolocation: geo, fetcher: async () => { throw new Error('offline') } }), { code: 'network' })
  await assert.rejects(fetchLocalForecast({ day, geolocation: geo, fetcher: () => new Promise(() => {}), timeoutMs: 5 }), { code: 'timeout' })
})

test('不会把其他日期、空响应、损坏缓存或手填天气当成当天预报', async () => {
  for (const fetcher of [response(null), response(999), async () => ({ ok: true, json: async () => ({ daily: { time: ['2026-10-20'], weather_code: [0] } }) })]) {
    await assert.rejects(fetchLocalForecast({ day, geolocation: geo, fetcher }), { code: 'no-data' })
  }
  for (const raw of ['{broken', '[]', 'null', '{"2026-10-21":"晴"}', '{"2026-02-30":{"day":"2026-02-30","code":0,"source":"open-meteo","retrievedAt":"2026-10-21T09:00:00Z"}}']) assert.deepEqual(Object.keys(parseAutoWeather(raw)), [])
})
