import test from 'node:test';
import assert from 'node:assert/strict';
import { createHoldGesture } from './holdGesture.mjs';

function setup() {
  let callback, calls = 0;
  const gesture = createHoldGesture(() => calls++, {
    schedule(fn) { callback = fn; return 1; }, cancel() { callback = undefined; }
  });
  return { gesture, tick() { const fn = callback; callback = undefined; fn?.(); }, calls: () => calls };
}
test('短按不会展开菜单，长按只触发一次并抑制随后点击', () => {
  const t = setup(); t.gesture.start(1, 20, 30);
  assert.deepEqual(t.gesture.finish(1), { held: false, moved: false }); t.tick(); assert.equal(t.calls(), 0);
  t.gesture.start(2, 20, 30); t.tick(); t.tick(); assert.equal(t.calls(), 1);
  assert.deepEqual(t.gesture.finish(2), { held: true, moved: false });
});
test('移动超过阈值视为滚动，不误触长按或点击', () => {
  const t = setup(); t.gesture.start(1, 20, 30); t.gesture.move(1, 20, 45); t.tick();
  assert.equal(t.calls(), 0); assert.deepEqual(t.gesture.finish(1), { held: false, moved: true });
});
test('轻微手抖不取消，其他手指移动不影响当前手指', () => {
  const t = setup(); t.gesture.start(1, 20, 30); t.gesture.move(2, 50, 100); t.gesture.move(1, 23, 34); t.tick(); assert.equal(t.calls(), 1);
});
test('取消和销毁后不弹迟到菜单；新手势不会继承旧长按', () => {
  const t = setup(); t.gesture.start(1, 0, 0); t.gesture.cancel(); t.tick(); assert.equal(t.calls(), 0);
  t.gesture.start(1, 0, 0); t.tick(); t.gesture.finish(1); t.gesture.start(2, 0, 0);
  assert.deepEqual(t.gesture.finish(2), { held: false, moved: false });
});
