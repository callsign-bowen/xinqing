type Cast = Array<{ id: string; name: string; role: string }>
type Beat = { actor: string; action: string; mood: string; line: string; certainty: 'said' | 'gist'; target?: string }
type Script = { cast: Cast; beats: Beat[] }
export function homePositions(cast: Cast): Record<string, number>
export function beatDuration(beat: Beat): number
export function buildTimeline(script: Script): Array<Beat & { index: number; positions: Record<string, number>; facing: Record<string, number>; duration: number }>
export function openingPositions(script: Script): { positions: Record<string, number>; facing: Record<string, number> }
