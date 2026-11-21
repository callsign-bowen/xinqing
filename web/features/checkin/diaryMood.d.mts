export const DIARY_MOODS: string[]
interface MoodEntry { mascotId?: string; emotion: string; moodPosition?: number }
export function selectDiaryMood<T extends MoodEntry>(entry: T, emotion: string, fallbackMascotId: string): (T & {mascotId: string}) | null
export function diaryMoodTarget<T extends {id?: string | number; day?: string; text: string; images: string[]; moodChosen?: boolean}>(records: T[], day: string, draft: T): {entry: T; isDraft: boolean}
