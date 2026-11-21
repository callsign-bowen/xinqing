import type { AppContext } from '../../kernel/context';
import { createDictation, type RecognitionConstructor } from './dictation';
import './voice.css';

export function initVoiceInput(ctx: AppContext): void {
  const input = document.querySelector<HTMLTextAreaElement>('#ai-input');
  const row = document.querySelector<HTMLElement>('.ai-input-row');
  const page = document.querySelector<HTMLElement>('#page-ai');
  if (!input || !row || !page || document.getElementById('ai-voice')) return;
  const button = document.createElement('button');
  button.id = 'ai-voice'; button.type = 'button'; button.className = 'ai-voice';
  button.setAttribute('aria-label', '语音输入'); button.setAttribute('aria-pressed', 'false');
  button.title = '说话转成文字，确认后发送';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3M9 21h6"/></svg>';
  input.after(button);
  const status = document.createElement('p'); status.id = 'ai-voice-status';
  status.className = 'ai-voice-status'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite'); status.hidden = true;
  row.before(status); button.setAttribute('aria-describedby', status.id);
  const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  const dictation = createDictation(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition, {
    read: () => ({ text: input.value, start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length }),
    write(text) { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); },
    state(active, message) {
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? '结束语音输入' : '语音输入');
      status.hidden = !message; status.textContent = message;
    }
  });
  button.onclick = () => dictation.start();
  const finish = () => { if (dictation.active()) dictation.cancel(); };
  // Editing, sending, switching chats or opening a room must never receive a late transcript.
  input.addEventListener('beforeinput', finish);
  input.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === 'Escape') finish(); });
  document.addEventListener('pointerdown', event => { if (!row.contains(event.target as Node)) finish(); }, true);
  document.querySelector('#ai-send')?.addEventListener('click', finish, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
  window.addEventListener('pagehide', finish);
  new MutationObserver(() => { if (!page.classList.contains('ai-page-visible')) finish(); }).observe(page, { attributes: true, attributeFilter: ['class'] });
  ctx.events.on('auth.loggedOut', () => { finish(); status.hidden = true; status.textContent = ''; });
}
