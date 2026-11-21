export const DEFAULT_NICKNAME = '小Nuo的朋友'
export const NICKNAME_MAX_LENGTH = 20

export function normalizeNickname(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  if (!name || Array.from(name).length > NICKNAME_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) return null
  return name
}
