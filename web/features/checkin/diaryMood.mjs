import { DIARY_MASCOTS as MASCOTS } from './mascotIds.mjs'
export const DIARY_MOODS = ['平静', '焦虑', '开心', '疲惫']

/** An explicit mood edit changes only the selected entry's mood, never its content or IP. */
export function selectDiaryMood(entry, emotion, fallbackMascotId) {
  const mascotId = MASCOTS.includes(entry.mascotId) ? entry.mascotId : fallbackMascotId
  if (!DIARY_MOODS.includes(emotion) || !MASCOTS.includes(mascotId)) return null
  const next = { ...entry, mascotId, emotion }
  delete next.moodPosition
  return next
}

/** The page's sticker follows the new draft, or the last saved moment on this date. */
export function diaryMoodTarget(records, day, draft) {
  if (draft.moodChosen || draft.text.trim() || draft.images.length) return { entry: draft, isDraft: true }
  const saved = records.filter(record => record.day === day).sort((a, b) => Number(b.id) - Number(a.id))[0]
  return saved ? { entry: saved, isDraft: false } : { entry: draft, isDraft: true }
}
