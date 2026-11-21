import test from 'node:test';
import assert from 'node:assert/strict';
import { createDictation } from './dictation.ts';

function fixture(Class) {
  let instance, text = '今天心情：，想聊聊', active = false, message = '';
  class FakeRecognition {
    constructor() { instance = this; }
    start() { this.onstart?.(); }
    stop() { this.onend?.(); }
    abort() { this.onend?.(); }
    result(...words) { this.onresult?.({ results: words.map(transcript => [{ transcript }]) }); }
  }
  const controller = createDictation(Class === null ? undefined : Class || FakeRecognition, {
    read: () => ({ text, start: 5, end: 5 }),
    write: next => { text = next; },
    state: (value, next) => { active = value; message = next; }
  });
  return { controller, get recognition() { return instance; }, get text() { return text; }, get active() { return active; }, get message() { return message; } };
}

test('听写替换临时识别结果，不重复追加，保留光标前后的草稿', () => {
  const f = fixture(); f.controller.start();
  f.recognition.result('有点'); f.recognition.result('有点累'); f.recognition.result('有点累', '，但是还好');
  assert.equal(f.text, '今天心情：有点累，但是还好，想聊聊');
  f.controller.cancel();
});
test('再次点击结束，文字保留且恢复按钮状态', () => {
  const f = fixture(); f.controller.start(); f.recognition.result('还不错'); f.controller.start();
  assert.equal(f.active, false); assert.match(f.text, /还不错/); assert.match(f.message, /检查后点击发送/);
});
test('退出或发送后，旧识别回调不会覆盖草稿', () => {
  const f = fixture(); f.controller.start(); const old = f.recognition;
  old.result('平静'); f.controller.cancel(); const saved = f.text;
  old.result('迟到的结果'); assert.equal(f.text, saved);
  f.controller.start(); old.result('上一轮结果'); assert.equal(f.text, saved); f.controller.cancel();
});
test('麦克风拒绝授权有明确说明并结束听写', () => {
  const f = fixture(); f.controller.start(); f.recognition.onerror({ error: 'not-allowed' });
  assert.equal(f.active, false); assert.match(f.message, /未获授权/); assert.equal(f.text, '今天心情：，想聊聊');
});
test('不支持识别时提示键盘听写，仍保留文字', () => {
  const f = fixture(null); f.controller.start();
  assert.equal(f.active, false); assert.match(f.message, /不支持/); assert.match(f.message, /键盘/);
});
test('网络失败保留已识别的内容', () => {
  const f = fixture(); f.controller.start(); f.recognition.result('有点累'); f.recognition.onerror({ error: 'network' });
  assert.equal(f.active, false); assert.match(f.text, /有点累/); assert.match(f.message, /连接失败/);
});
test('服务启动异常不会留下正在听状态', () => {
  const f = fixture(class { start() { throw new Error('unavailable'); } abort() {} });
  f.controller.start(); assert.equal(f.active, false); assert.match(f.message, /未能启动/);
});
