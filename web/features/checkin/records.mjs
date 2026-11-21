/** 记录的日期和照片。纯数据，方便首页和服务器用同一套规则。 */
import { DIARY_MASCOTS } from './mascotIds.mjs'
export const MAX_PHOTOS = 5
export const MAX_DIARY_TEXT = 50000

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function pad(value) {
  return String(value).padStart(2, '0')
}

export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function partsFromDay(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '')
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const date = Number(match[3])
  const value = new Date(year, month - 1, date)
  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== date) return null
  return {
    day,
    date: `${year}年${month}月${date}日`,
    weekday: WEEKDAYS[value.getDay()]
  }
}

export function dayFromDateText(text, now = new Date()) {
  if (typeof text !== 'string') return ''
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const day = `${iso[1]}-${iso[2]}-${iso[3]}`
    return partsFromDay(day) ? day : ''
  }
  const full = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (full) {
    const day = `${full[1]}-${pad(full[2])}-${pad(full[3])}`
    return partsFromDay(day) ? day : ''
  }
  const short = text.match(/(\d{1,2})月(\d{1,2})日/)
  if (short) {
    const day = `${now.getFullYear()}-${pad(short[1])}-${pad(short[2])}`
    return partsFromDay(day) ? day : ''
  }
  return ''
}

function cleanImages(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item.startsWith('data:image/')).slice(0, MAX_PHOTOS)
}

export function imagesFrom(row) {
  const listed = cleanImages(row && row.images)
  if (listed.length) return listed
  const image = row && row.image
  if (typeof image === 'string' && image.startsWith('[')) {
    try { return cleanImages(JSON.parse(image)) } catch { return [] }
  }
  if (typeof image === 'string' && image.startsWith('data:image/')) return [image]
  return []
}

export function normalizeRecord(row, now = new Date()) {
  if (!row || typeof row !== 'object') return null
  const images = imagesFrom(row)
  const day = (typeof row.day === 'string' && partsFromDay(row.day) ? row.day : '') || dayFromDateText(row.date, now) || todayKey(now)
  const parts = partsFromDay(day)
  if (!parts) return null
  return {
    id: row.id ?? Date.now(),
    day: parts.day,
    date: parts.date,
    weekday: parts.weekday,
    emotion: typeof row.emotion === 'string' && row.emotion ? row.emotion : '未选择',
    // Older entries did not capture an IP. Never infer their IP from today's selection.
    ...(DIARY_MASCOTS.includes(row.mascotId) ? { mascotId: row.mascotId } : {}),
    ...(typeof row.moodPosition === 'number' && Number.isFinite(row.moodPosition) ? { moodPosition: Math.max(0, Math.min(100, row.moodPosition)) } : {}),
    text: typeof row.text === 'string' ? row.text.slice(0, MAX_DIARY_TEXT) : '',
    images,
    image: images[0] || null
  }
}

export function monthCells(year, monthIndex) {
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const total = new Date(year, monthIndex + 1, 0).getDate()
  const cells = Array(offset).fill(null)
  for (let day = 1; day <= total; day += 1) cells.push(`${year}-${pad(monthIndex + 1)}-${pad(day)}`)
  return cells
}

export function isFutureDay(day, now = new Date()) {
  return day > todayKey(now)
}
