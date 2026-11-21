import { calendarDays, moveCalendarDay, moveCalendarMonth } from './diaryCalendar.mjs'
import { pad, partsFromDay } from './records.mjs'

function element(tag: string, cls: string, text = '') {
  const el = document.createElement(tag); el.className = cls; el.textContent = text; return el
}
function button(cls: string, text: string, label: string) {
  const el = element('button', cls, text) as HTMLButtonElement; el.type = 'button'; el.setAttribute('aria-label', label); return el
}

/** A paper calendar belongs to the diary itself, so it never opens an OS date popup. */
export function createDiaryDatePicker(selected: string, today: string, markedDays: string[]) {
  const root = element('div', 'diary-date-control')
  const trigger = button('diary-date-picker', '', '选择日记日期')
  trigger.title = partsFromDay(selected)!.date
  trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'diary-paper-calendar')
  const dateText = element('span', 'diary-date-value'); dateText.setAttribute('aria-hidden', 'true')
  dateText.append(element('span', 'diary-date-year', selected.slice(0, 4) + '/'), element('span', '', selected.slice(5).replace('-', '/')))
  const icon = element('span', 'diary-date-icon'); icon.setAttribute('aria-hidden', 'true')
  icon.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="14" height="13" rx="1"/><path d="M6 2v4m8-4v4M3 8h14"/></svg>'
  trigger.append(dateText, icon)
  const panel = element('section', 'diary-calendar'); panel.id = 'diary-paper-calendar'; panel.hidden = true
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '手工纸日历')
  root.append(trigger, panel)
  let cursor = selected, year = Number(selected.slice(0, 4)), month = Number(selected.slice(5, 7)) - 1, choosingMonth = false
  const marked = new Set(markedDays), maxYear = Number(today.slice(0, 4)), maxMonth = Number(today.slice(5, 7)) - 1
  function close(focus = false) { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); if (focus) trigger.focus({ preventScroll: true }) }
  function focusCursor() { panel.querySelector<HTMLButtonElement>(choosingMonth ? '[aria-pressed=true]' : '[data-calendar-day="' + cursor + '"]')?.focus({ preventScroll: true }) }
  function changeMonth(offset: number) {
    const next = moveCalendarMonth(`${year}-${pad(month + 1)}-01`, offset)
    year = Number(next.slice(0, 4)); month = Number(next.slice(5, 7)) - 1
  }
  function render() {
    panel.replaceChildren()
    const header = element('div', 'diary-calendar-heading')
    const previous = button('diary-calendar-nav', '‹', choosingMonth ? '上一年' : '上个月')
    const title = button('diary-calendar-title', choosingMonth ? `${year}年` : `${year}年 ${month + 1}月`, choosingMonth ? '返回日期选择' : '选择年月')
    const next = button('diary-calendar-nav', '›', choosingMonth ? '下一年' : '下个月')
    const dismiss = button('diary-calendar-dismiss', '×', '关闭日历')
    previous.disabled = year <= 1900 && (choosingMonth || month === 0)
    next.disabled = year >= maxYear && (choosingMonth || month >= maxMonth)
    previous.addEventListener('click', () => { if (choosingMonth) year--; else changeMonth(-1); render(); panel.querySelector<HTMLButtonElement>('.diary-calendar-nav')?.focus() })
    next.addEventListener('click', () => { if (choosingMonth) year++; else changeMonth(1); render(); panel.querySelector<HTMLButtonElement>('.diary-calendar-title')?.focus() })
    title.addEventListener('click', () => { choosingMonth = !choosingMonth; if (!choosingMonth && year === maxYear) month = Math.min(month, maxMonth); render(); panel.querySelector<HTMLButtonElement>('.diary-calendar-title')?.focus() })
    dismiss.addEventListener('click', () => close(true)); header.append(previous, title, next, dismiss); panel.append(header)
    if (choosingMonth) {
      const months = element('div', 'diary-calendar-months'); months.setAttribute('role', 'group'); months.setAttribute('aria-label', '月份')
      for (let value = 0; value < 12; value++) {
        const choice = button('diary-calendar-month', `${value + 1}月`, `${year}年${value + 1}月`)
        choice.disabled = year === maxYear && value > maxMonth
        choice.setAttribute('aria-pressed', String(value === month))
        choice.addEventListener('click', () => { month = value; choosingMonth = false; cursor = `${year}-${pad(month + 1)}-01`; render(); focusCursor() })
        months.append(choice)
      }
      panel.append(months); return
    }
    const week = element('div', 'diary-calendar-week'); week.setAttribute('aria-hidden', 'true')
    for (const text of ['一', '二', '三', '四', '五', '六', '日']) week.append(element('span', '', text))
    const days = element('div', 'diary-calendar-days'); days.setAttribute('role', 'group'); days.setAttribute('aria-label', `${year}年${month + 1}月日期`)
    const cells = calendarDays(year, month)
    if (!cells.includes(cursor)) cursor = cells.find(value => value && value <= today) || selected
    for (const day of cells) {
      if (!day) { const blank = element('span', 'diary-calendar-blank'); blank.setAttribute('aria-hidden', 'true'); days.append(blank); continue }
      const choice = button('diary-calendar-day', String(Number(day.slice(8))), partsFromDay(day)!.date + (marked.has(day) ? '，有日记' : ''))
      choice.dataset.calendarDay = day; choice.disabled = day > today
      choice.dataset.act = 'diary-day'; choice.dataset.day = day
      choice.tabIndex = day === cursor ? 0 : -1
      choice.setAttribute('aria-pressed', String(day === selected))
      if (day === today) choice.setAttribute('aria-current', 'date')
      if (marked.has(day)) choice.classList.add('has-entry')
      choice.addEventListener('click', event => { close(true); if (day === selected) { event.preventDefault(); event.stopPropagation() } })
      choice.addEventListener('focus', () => { cursor = day; days.querySelectorAll<HTMLButtonElement>('button').forEach(el => el.tabIndex = el === choice ? 0 : -1) })
      days.append(choice)
    }
    panel.append(week, days)
  }
  function open() {
    year = Number(selected.slice(0, 4)); month = Number(selected.slice(5, 7)) - 1; cursor = selected; choosingMonth = false
    panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); render(); focusCursor()
  }
  trigger.addEventListener('click', () => panel.hidden ? open() : close())
  root.addEventListener('focusout', event => { if (event.relatedTarget && !root.contains(event.relatedTarget as Node)) close() })
  root.addEventListener('keydown', event => {
    if (panel.hidden) { if (event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); open() }; return }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return
    event.stopPropagation()
    if (!(event.target as HTMLElement).dataset.calendarDay || choosingMonth) return
    event.preventDefault()
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    let next = offsets[event.key] ? moveCalendarDay(cursor, offsets[event.key]) : cursor
    if (event.key === 'PageUp' || event.key === 'PageDown') next = moveCalendarMonth(cursor, event.key === 'PageUp' ? -1 : 1)
    const weekday = (new Date(cursor + 'T12:00:00').getDay() + 6) % 7
    if (event.key === 'Home') next = moveCalendarDay(cursor, -weekday)
    if (event.key === 'End') next = moveCalendarDay(cursor, 6 - weekday)
    if (next < '1900-01-01' || next > today) return
    cursor = next; year = Number(next.slice(0, 4)); month = Number(next.slice(5, 7)) - 1; render(); focusCursor()
  })
  return { root, close }
}
