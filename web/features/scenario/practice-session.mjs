// Separate unfinished practice storage. Never migrates or rewrites v1/v2 history.
export const ACTIVE_PRACTICE_KEY = 'nuo_scenario_active_v4'
export function savePractice(storage, value) {
  try {
    const raw=JSON.parse(storage.getItem(ACTIVE_PRACTICE_KEY)||'[]')
    if (!Array.isArray(raw)) return false
    const items=raw
    storage.setItem(ACTIVE_PRACTICE_KEY,JSON.stringify([value,...items.filter(item=>item?.id!==value.id)]))
    return true
  } catch { return false }
}
export function listPractices(storage, allowedIds) {
  try {
    const raw=storage.getItem(ACTIVE_PRACTICE_KEY)
    if(!raw) return []
    const values=JSON.parse(raw)
    if(!Array.isArray(values)) return []
    return values.filter(value=>value && typeof value.id==='string' && allowedIds.includes(value.scenarioId)
      && ['gentle','realistic','tough'].includes(value.difficulty)
      && typeof value.goal==='string' && value.goal.length<=500
      && typeof value.draft==='string' && value.draft.length<=2000
      && typeof value.authoredDraft==='string' && value.authoredDraft.length<=2000
      && Number.isFinite(value.remaining) && value.remaining>=0
      && Array.isArray(value.messages) && value.messages.every(turn=>turn && ['user','assistant'].includes(turn.role)
        && typeof turn.text==='string' && turn.text.length<=2000))
      .map(value=>({...value,lastSuggestion:typeof value.lastSuggestion==='string'?value.lastSuggestion:value.draft!==value.authoredDraft?value.draft:'',messages:value.messages.map(turn=>({role:turn.role,text:turn.text}))}))
  } catch { return [] }
}
export function loadPractice(storage, allowedIds, id) { return listPractices(storage,allowedIds).find(item=>!id||item.id===id)||null }
export function finishPractice(storage, id) {
  try {
    const raw=JSON.parse(storage.getItem(ACTIVE_PRACTICE_KEY)||'[]')
    if(!Array.isArray(raw)) return false
    storage.setItem(ACTIVE_PRACTICE_KEY,JSON.stringify(raw.filter(item=>item?.id!==id)))
    return true
  } catch { return false }
}
