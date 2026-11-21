import { partsFromDay } from './records.mjs'

/** Date order only; each day's physical paper faces are laid out by diaryFlow. */
export function diaryNavigation(records, selectedDay, today) {
  const days = [...new Set([today, selectedDay, ...records.map(row => row.day)]
    .filter(day => partsFromDay(day) && day <= today))].sort()
  const index = days.indexOf(selectedDay)
  return { days, previous: index > 0 ? days[index - 1] : null, next: index >= 0 && index < days.length - 1 ? days[index + 1] : null, page: index + 1, total: days.length }
}
