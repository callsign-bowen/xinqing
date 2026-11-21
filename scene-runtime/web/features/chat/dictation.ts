export interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
export type RecognitionConstructor = new () => Recognition;
interface Hooks {
  read(): { text: string; start: number; end: number };
  write(text: string): void;
  state(active: boolean, message: string): void;
}

/** Rebuild from the whole recognition result list: interim replacements must not duplicate words. */
export function createDictation(RecognitionClass: RecognitionConstructor | undefined, hooks: Hooks) {
  let current: Recognition | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  function clearTimers() { clearTimeout(timer); clearTimeout(startTimer); }
  function cancel(message = '语音输入已结束，文字可修改后发送。') {
    const previous = current;
    current = undefined;
    clearTimers();
    previous?.abort();
    hooks.state(false, message);
  }
  function start() {
    if (current) { stop(); return; }
    if (!RecognitionClass) {
      hooks.state(false, '当前浏览器不支持语音听写，可以使用手机键盘上的麦克风输入。');
      return;
    }
    const draft = hooks.read();
    let recognition: Recognition;
    try { recognition = new RecognitionClass(); }
    catch { hooks.state(false, '语音输入暂时不可用，请使用键盘听写或打字。'); return; }
    current = recognition;
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    let heard = false;
    hooks.state(true, '正在打开麦克风，请允许使用麦克风。');
    recognition.onstart = () => {
      if (current !== recognition) return;
      clearTimeout(startTimer);
      hooks.state(true, '正在听，请说话…再次点击麦克风结束。');
    };
    recognition.onresult = event => {
      if (current !== recognition) return;
      const text = Array.from(event.results, result => result[0]?.transcript || '').join('');
      if (!text) return;
      heard = true;
      hooks.write(draft.text.slice(0, draft.start) + text + draft.text.slice(draft.end));
    };
    recognition.onerror = event => {
      if (current !== recognition) return;
      const messages: Record<string, string> = {
        'not-allowed': '麦克风未获授权。请在浏览器的网站设置中允许麦克风，再试一次。',
        'service-not-allowed': '浏览器未允许语音识别服务，可以使用键盘听写。',
        'audio-capture': '没有找到可用的麦克风，请检查设备连接。',
        'no-speech': '没有听清声音，点击麦克风可以再说一次。',
        network: '语音识别连接失败，请检查网络，或使用键盘听写。',
        'language-not-supported': '当前语音服务不支持中文，请使用键盘听写。'
      };
      cancel(messages[event.error] || '语音输入中断，已识别的文字仍保留在输入框中。');
    };
    recognition.onend = () => {
      if (current !== recognition) return;
      current = undefined; clearTimers();
      hooks.state(false, heard ? '已转成文字，检查后点击发送。' : '没有听到内容，点击麦克风重试。');
    };
    startTimer = setTimeout(() => cancel('麦克风未能启动，请检查授权，或使用键盘听写。'), 15000);
    timer = setTimeout(() => { if (current === recognition) stop(); }, 60000);
    try { recognition.start(); }
    catch { cancel('麦克风未能启动，请稍后重试或使用键盘听写。'); }
  }
  function stop() {
    const recognition = current;
    if (!recognition) return;
    clearTimers();
    timer = setTimeout(() => cancel(), 2500);
    try { recognition.stop(); }
    catch { cancel(); }
  }
  return { start, cancel, active: () => Boolean(current) };
}
