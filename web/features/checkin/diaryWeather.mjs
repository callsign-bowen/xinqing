import { partsFromDay } from './records.mjs'

export const DIARY_WEATHER_KEY = 'nuo_diary_weather_v1'
export const DIARY_WEATHERS = ['', '晴', '多云', '阴', '雨', '雪', '雾']
export function parseDiaryWeather(raw) {
  const result = Object.create(null)
  try {
    const value = JSON.parse(raw || '{}')
    if (!value || Array.isArray(value) || typeof value !== 'object') return result
    for (const [day, weather] of Object.entries(value)) {
      if (partsFromDay(day) && typeof weather === 'string' && DIARY_WEATHERS.includes(weather) && weather) result[day] = weather
    }
  } catch { /* A damaged optional weather record must not hide a user's diary. */ }
  return result
}

// Keep the legacy manual key intact, but never label manual values as forecasts.
export const AUTO_WEATHER_KEY = 'nuo_diary_weather_auto_v1'
export const WEATHER_CONSENT_KEY = 'nuo_diary_weather_consent_v1'
export const WEATHER_REFRESH_MS = 10 * 60 * 1000

export function weatherFromCode(code) {
  if (!Number.isInteger(code)) return null
  if (code === 0 || code === 1) return { label: '晴', icon: '☀' }
  if (code === 2) return { label: '多云', icon: '☁' }
  if (code === 3) return { label: '阴', icon: '☁' }
  if ([45, 48].includes(code)) return { label: '雾', icon: '≋' }
  if ([51, 53, 55, 56, 57].includes(code)) return { label: '毛毛雨', icon: '☂' }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: '雨', icon: '☂' }
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: '雪', icon: '❄' }
  if ([95, 96, 97, 99].includes(code)) return { label: '雷雨', icon: 'ϟ' }
  return null
}

export function parseAutoWeather(raw) {
  const result = Object.create(null)
  try {
    const data = JSON.parse(raw || '{}')
    if (!data || typeof data !== 'object' || Array.isArray(data)) return result
    for (const [day, value] of Object.entries(data)) {
      if (!partsFromDay(day) || !value || value.day !== day || value.source !== 'open-meteo' || !weatherFromCode(value.code) || !Number.isFinite(Date.parse(value.retrievedAt))) continue
      // Whitelist fields: no coordinates, user text, or provider payload in storage.
      const row = { day, code: value.code, retrievedAt: value.retrievedAt, source: 'open-meteo' }
      if (value.kind === 'current') {
        if (!validCurrent(value, day)) continue
        Object.assign(row, { kind: 'current', observedAt: value.observedAt, temperature: value.temperature, isDay: value.isDay })
      }
      result[day] = row
    }
  } catch { /* Optional metadata must never prevent reading a diary. */ }
  return result
}

function validCurrent(value, day) {
  return typeof value.observedAt === 'string' && value.observedAt.slice(0, 10) === day && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value.observedAt)
    && Number.isFinite(value.temperature) && value.temperature >= -100 && value.temperature <= 80 && [0, 1].includes(value.isDay)
}

export function currentWeatherIsFresh(value, now = Date.now()) {
  const age = now - Date.parse(value?.retrievedAt)
  return value?.kind === 'current' && age >= 0 && age < WEATHER_REFRESH_MS
}

export class DiaryWeatherError extends Error {
  constructor(code) { super(code); this.code = code }
}

export async function fetchLocalForecast({ day, geolocation, fetcher = globalThis.fetch, secureContext = true, timeoutMs = 10000, now = () => new Date() }) {
  if (!partsFromDay(day)) throw new DiaryWeatherError('no-data')
  if (!secureContext || !geolocation?.getCurrentPosition) throw new DiaryWeatherError('unsupported')
  const position = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DiaryWeatherError('timeout')), timeoutMs)
    const settle = (callback, value) => { clearTimeout(timer); callback(value) }
    try {
      geolocation.getCurrentPosition(
        value => settle(resolve, value),
        error => settle(reject, new DiaryWeatherError(error.code === 1 ? 'permission' : error.code === 3 ? 'timeout' : 'location')),
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300000 }
      )
    } catch { settle(reject, new DiaryWeatherError('location')) }
  })
  const { latitude, longitude } = position.coords || {}
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new DiaryWeatherError('location')
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  // Roughly 1 km precision; the original GPS coordinates never leave this function.
  url.search = new URLSearchParams({ latitude: latitude.toFixed(2), longitude: longitude.toFixed(2), current: 'weather_code,temperature_2m,is_day', temperature_unit: 'celsius', timezone: 'auto', forecast_days: '1' }).toString()
  const abort = new AbortController()
  let timer
  try {
    const data = await Promise.race([
      (async () => {
        const response = await fetcher(url.href, { signal: abort.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
        if (!response.ok) throw new DiaryWeatherError('network')
        return response.json()
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new DiaryWeatherError('timeout')) }, timeoutMs) })
    ])
    const current = data?.current
    const result = { day, code: current?.weather_code, observedAt: current?.time, temperature: current?.temperature_2m, isDay: current?.is_day,
      kind: 'current', retrievedAt: now().toISOString(), source: 'open-meteo' }
    if (!weatherFromCode(result.code) || !validCurrent(result, day)) throw new DiaryWeatherError('no-data')
    return result
  } catch (error) {
    if (error instanceof DiaryWeatherError) throw error
    throw new DiaryWeatherError('network')
  } finally { clearTimeout(timer) }
}
