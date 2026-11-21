export const MAX_PHOTOS: number
export const MAX_DIARY_TEXT: number
export function pad(value: number): string
export function todayKey(now?: Date): string
export function partsFromDay(day: string): {day: string; date: string; weekday: string} | null
export function dayFromDateText(text: string, now?: Date): string
export function imagesFrom(row: unknown): string[]
export function normalizeRecord(row: unknown, now?: Date): {id: string | number; day: string; date: string; weekday: string; emotion: string; mascotId?: string; text: string; images: string[]; image: string | null; moodPosition?: number} | null
export function monthCells(year: number, monthIndex: number): (string | null)[]
export function isFutureDay(day: string, now?: Date): boolean
