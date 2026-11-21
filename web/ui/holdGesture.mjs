/** A hold is cancelled by scrolling, another pointer, release, or disposal. */
export function createHoldGesture(onHold, { delay = 550, distance = 10, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let pointer = null, timer, held = false, moved = false;
  function stop() { if (timer !== undefined) cancel(timer); timer = undefined; }
  function reset() { stop(); pointer = null; held = false; moved = false; }
  return {
    start(id, x, y) {
      reset(); pointer = { id, x, y };
      timer = schedule(() => { timer = undefined; held = true; onHold(); }, delay);
    },
    move(id, x, y) {
      if (!pointer || pointer.id !== id) return;
      if (Math.hypot(x - pointer.x, y - pointer.y) > distance) { moved = true; stop(); }
    },
    finish(id) {
      if (!pointer || pointer.id !== id) return { held: false, moved: false };
      const result = { held, moved }; reset(); return result;
    },
    cancel: reset
  };
}
