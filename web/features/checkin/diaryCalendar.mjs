import { monthCells, pad, partsFromDay } from './records.mjs'

export function calendarDays(year, month) {
  const cells = monthCells(year, month)
  return [...cells, ...Array(42 - cells.length).fill(null)]
}
export function moveCalendarDay(day, offset) {
  if (!partsFromDay(day)) return day
  const [year, month, date] = day.split('-').map(Number)
  const next = new Date(year, month - 1, date + offset)
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
}
export function moveCalendarMonth(day, offset) {
  if (!partsFromDay(day)) return day
  const [year, month, date] = day.split('-').map(Number)
  const first = new Date(year, month - 1 + offset, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(Math.min(date, last))}`
}
