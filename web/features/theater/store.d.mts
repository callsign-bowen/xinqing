export type TheaterStore = { version: 1; sessions: Record<string, { updatedAt: number; episodes: Array<{ id: string; round: number; createdAt: number; script: any }> }> }
export const THEATER_KEY: string
export const MAX_EPISODES: number
export const MAX_SESSIONS: number
export function emptyTheater(): TheaterStore
export function isPlayableScript(script: unknown): boolean
export function readTheater(raw: unknown): TheaterStore
export function episodesOf(store: TheaterStore, sessionId: string): TheaterStore['sessions'][string]['episodes']
export function latestScript(store: TheaterStore, sessionId: string): any | null
export function addEpisode(store: TheaterStore, sessionId: string, script: unknown, opts?: { now?: number; round?: number }): { store: TheaterStore; added: boolean }
export function removeTheaterSession(store: TheaterStore, sessionId: string): TheaterStore
export function theaterHistory(messages: unknown): Array<{ role: 'user' | 'assistant'; text: string }>
export function userRound(messages: unknown): number
