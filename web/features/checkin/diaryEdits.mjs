import { normalizeRecord } from './records.mjs'

/** A photo alias from an old saved row must not resurrect a removed photo. */
export function draftForEntry(record) {
  return { id:record.id, day:record.day, text:record.text, images:record.images.slice(), emotion:record.emotion,
    mascotId:record.mascotId, moodPosition:record.moodPosition, moodChosen:!!record.mascotId }
}

export function applyDiaryEdits(records, day, drafts) {
  const changes = new Map(drafts.filter(draft=>draft.day===day).map(draft=>[String(draft.id),draft]))
  return records.map(record=> {
    const draft = record.day === day && changes.get(String(record.id))
    return draft ? normalizeRecord({...record,...draft,id:record.id,day:record.day,image:draft.images[0]||null}) : record
  })
}
