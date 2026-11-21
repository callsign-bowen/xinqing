import test from 'node:test';
import assert from 'node:assert/strict';
import { withoutChatSession } from './sessionRemoval.mjs';
const seed = () => ({ activeId: 'a', sessions: [
  { id: 'a', updatedAt: 1, messages: [{ text: '保留原话' }] },
  { id: 'b', updatedAt: 2, messages: [{ text: '其他对话' }] }
] });
test('删最近对话不切换主对话，也不修改输入快照', () => {
  const store = seed(), before = JSON.stringify(store);
  const next = withoutChatSession(store, 'b', () => assert.fail('不应创建替代会话'));
  assert.equal(next.activeId, 'a'); assert.deepEqual(next.sessions.map(s => s.id), ['a']); assert.equal(JSON.stringify(store), before);
});
test('删除当前对话后选用剩余会话，绝不误删另一段记录', () => {
  const next = withoutChatSession(seed(), 'a', () => assert.fail());
  assert.equal(next.activeId, 'b'); assert.equal(next.sessions[0].messages[0].text, '其他对话');
});
test('删除最后一段使用新后端 ID，迟到回复不能匹配已删除的消息', () => {
  const next = withoutChatSession({ activeId: 'nuo-main', sessions: [{ id: 'nuo-main', messages: [{ text: '旧消息' }] }] }, 'nuo-main', () => ({ id: 'fresh-id', messages: [], updatedAt: 3 }));
  assert.equal(next.activeId, 'fresh-id'); assert.deepEqual(next.sessions[0].messages, []);
});
test('记录已经不存在时不再写入或创建空记录', () => {
  assert.equal(withoutChatSession(seed(), 'missing', () => assert.fail()), null);
});
test('保留会话的模型上下文标识不会因删除另一段而改变', () => {
  const store = seed(); store.sessions[0].backendId = 'stable-backend';
  const next = withoutChatSession(store, 'b', () => assert.fail());
  assert.equal(next.sessions[0].backendId, 'stable-backend');
});
