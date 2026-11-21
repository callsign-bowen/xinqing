export const SCENARIO_HISTORY_V2 = 'nuo_scenario_history_v2'

export function loadScenarioHistory(storage) {
  try {
    const raw = JSON.parse(storage.getItem(SCENARIO_HISTORY_V2) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter(item => item && typeof item.id === 'string' && typeof item.scenarioId === 'string'
      && typeof item.title === 'string' && Number.isFinite(item.date) && item.debrief
      && ['closest','takeaway','nextTry'].every(key => typeof item.debrief[key] === 'string')
      && Array.isArray(item.messages) && item.messages.every(turn => turn && ['user','assistant'].includes(turn.role) && typeof turn.text === 'string')
    )
  } catch { return [] }
}

export function saveScenarioHistory(storage, list) {
  try { storage.setItem(SCENARIO_HISTORY_V2, JSON.stringify(list)); return true }
  catch { return false }
}
