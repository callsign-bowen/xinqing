import { AUTO_WEATHER_KEY, WEATHER_CONSENT_KEY, currentWeatherIsFresh, fetchLocalForecast, parseAutoWeather, weatherFromCode } from './diaryWeather.mjs'
import { todayKey } from './records.mjs'
import { weatherIcon } from './weatherIcon'

const MESSAGES: Record<string, string> = {
  permission: '定位未开启。请在浏览器设置里允许定位，再重新获取。',
  unsupported: '当前页面无法读取位置。请使用支持定位的浏览器，通过 HTTPS 或本机地址打开。',
  location: '暂时没能取得位置，稍后可以再试。', timeout: '天气查询有些慢，稍后可以再试。',
  network: '暂时连不上天气服务，稍后可以再试。', 'no-data': '暂时没有取得当前天气。'
}
const read = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }

/** Weather refreshes independently of the writer and never moves its insertion point. */
export function createDiaryWeather() {
  const forecasts = parseAutoWeather(read(AUTO_WEATHER_KEY))
  let consent = read(WEATHER_CONSENT_KEY) === 'yes', offered = read(WEATHER_CONSENT_KEY) === 'no'
  let pending = false, attemptedAt = 0, error = '', sequence = 0
  let current: { day: string; root: HTMLElement; button: HTMLButtonElement; panel: HTMLElement } | null = null
  function element(tag: string, text = '') { const el = document.createElement(tag); el.textContent = text; return el }
  function active() {
    const modal = current?.root.closest('.history-modal')
    return document.visibilityState === 'visible' && !!current?.root.isConnected && (!modal || modal.classList.contains('history-modal-visible'))
  }
  function hidePanel() {
    if (!current) return
    current.panel.hidden = true; current.button.setAttribute('aria-expanded', 'false')
  }
  function refresh() {
    if (!current) return
    const { day, button, panel } = current, isToday = day === todayKey()
    const saved = forecasts[day], forecast = isToday && saved?.kind !== 'current' ? undefined : saved
    const weather = forecast && weatherFromCode(forecast.code)
    const stale = isToday && !!forecast && !currentWeatherIsFresh(forecast)
    const label = weather ? (stale ? '上次' : '') + weather.label : pending && isToday ? '获取中' : !isToday ? '未记录' : error ? '未获取' : '待定位'
    button.replaceChildren()
    const icon = element('span'); icon.className = 'diary-weather-icon'; icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = weatherIcon(weather ? forecast!.code : undefined, forecast?.isDay)
    const text = element('span', label); text.className = 'diary-weather-label'
    button.append(icon, text)
    if (weather && !stale && Number.isFinite(forecast?.temperature)) {
      const temperature = element('span', Math.round(forecast!.temperature!) + '°'); temperature.className = 'diary-weather-temperature'; button.append(temperature)
    }
    button.dataset.stale = String(stale)
    button.setAttribute('aria-label', weather ? (isToday && !stale ? '当地当前天气：' : '记录的天气：') + weather.label + (Number.isFinite(forecast?.temperature) ? '，' + forecast!.temperature + '摄氏度' : '') : isToday ? '当地天气：' + label : '这一天未记录天气')
    button.setAttribute('aria-busy', String(pending && isToday))
    panel.replaceChildren()
    if (weather) {
      const stamp = forecast!.observedAt?.replace('T', ' ') || forecast!.retrievedAt.slice(0, 10)
      panel.append(element('p', (isToday ? '当前天气 · ' : '当时天气 · ') + stamp))
      if (Number.isFinite(forecast?.temperature)) panel.append(element('p', weather.label + ' · ' + forecast!.temperature + '℃'))
      if (stale) panel.append(element('p', '这是上次获取的天气，正在等待更新。'))
    } else if (!isToday) panel.append(element('p', '这一天没有保存天气，不会用今天的天气补写。'))
    if (isToday && pending) panel.append(element('p', '正在读取位置和当前天气…'))
    else if (isToday && error) panel.append(element('p', MESSAGES[error] || MESSAGES.network))
    if (isToday && !consent) panel.append(element('p', '允许定位后，这里会自动显示天气图标、天气状态与气温。约 1 公里精度的坐标会发送给 Open-Meteo，本应用不保存坐标。'))
    if (isToday && consent) panel.append(element('p', '页面打开时每 10 分钟更新；天气服务的当前状态来自约 15 分钟一档的模型数据。'))
    const source = element('a', '天气数据：Open-Meteo') as HTMLAnchorElement
    source.href = 'https://open-meteo.com/'; source.target = '_blank'; source.rel = 'noopener noreferrer'; panel.append(source)
    if (isToday && !pending) {
      const start = element('button', consent ? '重新获取天气' : '开启当地天气') as HTMLButtonElement; start.type = 'button'
      start.addEventListener('click', () => {
        consent = true; offered = true
        try { localStorage.setItem(WEATHER_CONSENT_KEY, 'yes') } catch { /* Session preference still works. */ }
        hidePanel(); void request(true)
      }); panel.append(start)
      if (consent) {
        const stop = element('button', '停用自动天气') as HTMLButtonElement; stop.type = 'button'
        stop.addEventListener('click', () => {
          consent = false; offered = true; sequence++; pending = false; error = ''; attemptedAt = 0
          try { localStorage.setItem(WEATHER_CONSENT_KEY, 'no') } catch { /* Session preference still works. */ }
          hidePanel(); refresh()
        }); panel.append(stop)
      }
    }
  }
  async function request(force = false) {
    if (!consent || pending || (!force && error === 'permission')) return
    const day = todayKey(), ticket = ++sequence
    pending = true; error = ''; attemptedAt = Date.now(); refresh()
    try {
      const forecast = await fetchLocalForecast({ day, geolocation: navigator.geolocation, secureContext: window.isSecureContext })
      if (ticket !== sequence || !consent) return
      forecasts[day] = forecast
      try { localStorage.setItem(AUTO_WEATHER_KEY, JSON.stringify(forecasts)) } catch { /* Keep a session copy. */ }
    } catch (failure) { if (ticket === sequence) error = (failure as {code?: string}).code || 'network' }
    finally { if (ticket === sequence) { pending = false; refresh() } }
  }
  function maybeRefresh() {
    if (!active() || !consent || current?.day !== todayKey() || pending || Date.now() - attemptedAt < 60000) return
    if (!currentWeatherIsFresh(forecasts[current.day])) void request()
  }
  function mount(day: string) {
    const root = element('div'); root.className = 'diary-weather-control'
    const button = element('button') as HTMLButtonElement; button.type = 'button'; button.className = 'diary-weather'
    const panel = element('div'); panel.className = 'diary-weather-panel'; panel.hidden = true; panel.id = 'diary-weather-details'
    button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', panel.id)
    root.append(button, panel); current = {day, root, button, panel}; refresh()
    button.addEventListener('click', () => { panel.hidden = !panel.hidden; button.setAttribute('aria-expanded', String(!panel.hidden)) })
    root.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { event.stopPropagation(); hidePanel(); button.focus() } })
    queueMicrotask(() => {
      if (current?.root !== root || !active() || day !== todayKey()) return
      if (!consent && !offered) { offered = true; panel.hidden = false; button.setAttribute('aria-expanded','true') }
      else maybeRefresh()
    })
    return root
  }
  document.addEventListener('click', event => { if (current && !event.composedPath().includes(current.root)) hidePanel() })
  document.addEventListener('visibilitychange', maybeRefresh)
  window.addEventListener('focus', maybeRefresh); window.addEventListener('online', () => { attemptedAt = 0; maybeRefresh() })
  window.setInterval(maybeRefresh, 60000)
  return { mount }
}
