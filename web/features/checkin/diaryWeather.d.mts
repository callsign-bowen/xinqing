export const DIARY_WEATHER_KEY: string
export const DIARY_WEATHERS: string[]
export function parseDiaryWeather(raw: string | null): Record<string, string>
export const AUTO_WEATHER_KEY: string
export const WEATHER_CONSENT_KEY: string
export const WEATHER_REFRESH_MS: number
export interface DiaryForecast { day: string; code: number; retrievedAt: string; source: 'open-meteo'; kind?: 'current'; observedAt?: string; temperature?: number; isDay?: number }
export function currentWeatherIsFresh(value: DiaryForecast | undefined, now?: number): boolean
export function weatherFromCode(code: number): { label: string; icon: string } | null
export function parseAutoWeather(raw: string | null): Record<string, DiaryForecast>
export class DiaryWeatherError extends Error { code: string; constructor(code: string) }
export function fetchLocalForecast(options: { day: string; geolocation?: Pick<Geolocation, 'getCurrentPosition'>; fetcher?: typeof fetch; secureContext?: boolean; timeoutMs?: number; now?: () => Date }): Promise<DiaryForecast>
