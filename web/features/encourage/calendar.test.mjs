import test from 'node:test';
import assert from 'node:assert/strict';
import { encourageMessages } from './messages.ts';
import { dailyEncouragement, shanghaiDay } from './calendar.ts';

test('365 条完整文案没有重复或仅标点不同的重复', () => {
  assert.equal(encourageMessages.length, 365);
  const normalize = text => text.replace(/[\s\p{P}\p{S}]/gu, '');
  assert.equal(new Set(encourageMessages.map(normalize)).size, 365);
  assert.ok(encourageMessages.every(text => text.length >= 12 && text.length <= 60));
});
test('任意起点连续 365 天不重复，包括跨年与闰日', () => {
  for (const start of ['2026-10-18', '2027-12-20', '2028-02-01', '2028-12-31', '1969-12-01']) {
    const origin = Date.parse(`${start}T12:00:00+08:00`);
    const lines = Array.from({length:365}, (_, index) => dailyEncouragement(new Date(origin + index * 86400000)).text);
    assert.equal(new Set(lines).size, 365, start);
  }
});
test('上海午夜切换，而不是跟随 UTC 日期切换', () => {
  const before = dailyEncouragement(new Date('2026-10-18T15:59:59Z'));
  const after = dailyEncouragement(new Date('2026-10-18T16:00:00Z'));
  assert.equal(before.day,'2026-10-18'); assert.equal(after.day,'2026-10-19');
  assert.notEqual(before.text,after.text);
});
test('同一天早晚、反复读取都返回同一条', () => {
  const morning = dailyEncouragement(new Date('2026-10-18T00:00:00+08:00'));
  const evening = dailyEncouragement(new Date('2026-10-18T23:59:59+08:00'));
  assert.deepEqual(morning,evening);
  for(let i=0;i<10;i++) assert.deepEqual(dailyEncouragement(new Date('2026-10-18T12:00:00+08:00')),morning);
});
test('闰年二月二十九日有独立内容', () => {
  const days = ['2028-02-28','2028-02-29','2028-03-01'].map(day=>dailyEncouragement(new Date(`${day}T12:00:00+08:00`)));
  assert.deepEqual(days.map(item=>item.day),['2028-02-28','2028-02-29','2028-03-01']);
  assert.equal(new Set(days.map(item=>item.text)).size,3);
});
test('文案按 365 天循环，不依赖随机数或上次缓存', () => {
  const start = new Date('2026-10-18T12:00:00+08:00');
  assert.equal(dailyEncouragement(start).text,dailyEncouragement(new Date(start.getTime()+365*86400000)).text);
  assert.equal(shanghaiDay(start),'2026-10-18');
});
