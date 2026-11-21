/** Remove one conversation without mutating it or touching independent practice data. */
export function withoutChatSession(store, id, replacement) {
  if (!store.sessions.some(session => session.id === id)) return null;
  const sessions = store.sessions.filter(session => session.id !== id);
  if (!sessions.length) sessions.push(replacement());
  const activeId = sessions.some(session => session.id === store.activeId)
    ? store.activeId : [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
  return { ...store, sessions, activeId };
}
