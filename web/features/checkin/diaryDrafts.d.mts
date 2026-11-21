export function dayDraftKey(day: string): string
export function editDraftKey(id: string | number): string
export function normalizeDiaryDraft(value: unknown): any
export function createDiaryDraftStore(options?: {storage?: Storage; database?: IDBFactory; now?: () => number; debounceMs?: number}): {ready: Promise<any[]>; write(key: string, day: string, draft: any): Promise<boolean>; remove(key: string): Promise<boolean>; flush(): Promise<any[]>; reload(): Promise<any[]>}
