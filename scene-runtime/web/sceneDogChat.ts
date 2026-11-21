import { createApi } from './kernel/api';
import { findAvatarChatBridge } from './kernel/avatarChat';
import { createDogConversation } from './sceneDogConversation';
import { dogChatLayout } from './sceneDogChatLayout';
import { createDictation, type RecognitionConstructor } from './features/chat/dictation';
import './sceneDogChat.css';

interface Options {
  host: HTMLElement;
  anchor(): { x: number; y: number; visible: boolean };
  onOpen?(): void;
  onClose?(): void;
  onWake?(): void;
}
const icon = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export function createDogChat(options: Options) {
  const layer = document.createElement('section'); layer.className = 'dog-chat-layer'; layer.hidden = true;
  layer.setAttribute('aria-label', '和小狗聊天');
  layer.innerHTML = `<aside class="dog-chat-bubble" aria-label="小狗的气泡回复"><header><span>小狗</span><button type="button" class="dog-chat-close" aria-label="收起小狗聊天">${icon('<path d="m6 6 12 12M18 6 6 18"/>')}</button></header><div class="dog-chat-reply" role="status" aria-live="polite"></div><div class="dog-chat-resources"></div></aside>
    <section class="dog-chat-history" aria-label="小狗聊天记录" hidden><header><span>我们刚才聊过</span><button type="button" aria-label="收起聊天记录">${icon('<path d="m6 6 12 12M18 6 6 18"/>')}</button></header><div role="log"></div></section>
    <section class="dog-chat-dock"><p class="dog-chat-last-user" hidden></p><form><textarea rows="1" maxlength="2000" placeholder="想说什么，慢慢说…" aria-label="对小狗说的话"></textarea><button type="button" class="dog-chat-mic" aria-label="语音输入" aria-pressed="false" title="说话转文字，确认后发送">${icon('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3M9 21h6"/>')}</button><button type="submit" class="dog-chat-send" aria-label="发送给小狗">${icon('<path d="M12 19V5m-6 6 6-6 6 6"/>')}</button></form><footer><button type="button" class="dog-chat-history-toggle" aria-label="查看聊天记录" aria-expanded="false">${icon('<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>')}</button><span class="dog-chat-status" role="status" aria-live="polite"></span><button type="button" class="dog-chat-cancel" hidden>停止等待</button><button type="button" class="dog-chat-retry" hidden>重试</button></footer></section>`;
  options.host.append(layer);
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => layer.querySelector<T>(selector)!;
  const bubble = q('.dog-chat-bubble'), reply = q('.dog-chat-reply'), dock = q('.dog-chat-dock');
  const history = q('.dog-chat-history'), log = q('[role="log"]'), toggle = q<HTMLButtonElement>('.dog-chat-history-toggle');
  const input = q<HTMLTextAreaElement>('textarea'), send = q<HTMLButtonElement>('.dog-chat-send'), mic = q<HTMLButtonElement>('.dog-chat-mic');
  const status = q('.dog-chat-status'), retry = q<HTMLButtonElement>('.dog-chat-retry'), cancel = q<HTMLButtonElement>('.dog-chat-cancel');
  const resources = q('.dog-chat-resources'), user = q('.dog-chat-last-user');
  const lifetime = new AbortController();
  const api = createApi();
  let alive = true, speechStatus = '', lastFocus: HTMLElement | null = null, historySignature = '';
  const conversation = createDogConversation({
    storage: localStorage,
    owner: () => { try { return JSON.parse(localStorage.getItem('nuo_session') || 'null')?.username || ''; } catch { return ''; } },
    bridge: () => findAvatarChatBridge(),
    send: (text, id, signal) => api.chat.send(text, id, { signal }),
    changed: render
  });
  const speech = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  const dictation = createDictation(speech.SpeechRecognition || speech.webkitSpeechRecognition, {
    read: () => ({ text: input.value, start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length }),
    write: text => conversation.setDraft(text),
    state(active, message) { mic.setAttribute('aria-pressed', String(active)); mic.setAttribute('aria-label', active ? '结束语音输入' : '语音输入'); speechStatus = message; render(); }
  });
  function stopDictation() { if (dictation.active()) dictation.cancel(''); }
  function setHistory(show: boolean) {
    history.hidden = !show; toggle.setAttribute('aria-expanded', String(show));
    if (show) log.scrollTop = log.scrollHeight;
    layout();
  }
  function render() {
    if (!alive) return;
    const state = conversation.snapshot();
    if (input.value !== state.draft) input.value = state.draft;
    send.disabled = state.pending || !state.draft.trim(); send.setAttribute('aria-busy', String(state.pending));
    reply.classList.toggle('dog-chat-thinking', state.pending);
    reply.textContent = state.pending ? '···' : state.messages.filter(m => m.role === 'assistant').at(-1)?.text || '嗨，我在这儿。想说什么都可以，我陪你聊。';
    reply.setAttribute('aria-label', state.pending ? '小狗正在想一想' : '小狗的回复');
    const lastUser = state.messages.filter(m => m.role === 'user').at(-1);
    user.hidden = !lastUser; user.textContent = lastUser ? `我：${lastUser.text}` : '';
    status.textContent = state.error || speechStatus || (state.storageError ? '暂时无法保存到本机，请先保留这一页。' : state.pending ? '我在认真听，等我一下…' : '');
    status.dataset.error = String(Boolean(state.error || state.storageError));
    cancel.hidden = !state.pending; retry.hidden = state.pending || !state.retryText || !state.error;
    const signature = JSON.stringify(state.messages);
    if (signature !== historySignature) {
      historySignature = signature; log.replaceChildren();
      if (!state.messages.length) { const p = document.createElement('p'); p.textContent = '我们可以从一句你好开始。'; log.append(p); }
      for (const message of state.messages) {
        const p = document.createElement('p'); p.className = message.role;
        const speaker = document.createElement('small'); speaker.textContent = message.role === 'user' ? '我' : '小狗';
        const text = document.createElement('span'); text.textContent = message.text; p.append(speaker, text); log.append(p);
      }
      log.scrollTop = log.scrollHeight;
    }
    resources.replaceChildren();
    for (const resource of state.resources) {
      const phone = resource.phone.replace(/[^\d+]/g, ''); if (!phone) continue;
      const link = document.createElement('a'); link.textContent = `${resource.name} · ${resource.phone}`; link.href = `tel:${phone}`; resources.append(link);
    }
    input.style.height = '42px'; input.style.height = `${Math.max(42, Math.min(88, input.scrollHeight))}px`;
    layout(); options.onWake?.();
  }
  function layout() {
    if (!alive || layer.hidden) return;
    const rect = layer.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const visible = window.visualViewport;
    const top = Math.max(12, (visible?.offsetTop || 0) - rect.top + 12);
    const safeBottom = parseFloat(getComputedStyle(layer).getPropertyValue('--dog-safe-bottom')) || 0;
    const height = Math.max(140, Math.min(rect.height, (visible ? visible.offsetTop + visible.height : window.innerHeight) - rect.top) - safeBottom);
    layer.dataset.compact = String(height < 320);
    const point = options.anchor();
    const bubbleWidth = Math.min(300, rect.width - Math.min(16, rect.width * .04) * 2);
    bubble.style.width = `${bubbleWidth}px`;
    // Width must settle before measuring wrapped reply text.
    dock.style.width = `${Math.min(440, rect.width - Math.min(16, rect.width * .04) * 2)}px`;
    reply.style.maxHeight = `${height < 320 ? 30 : Math.max(44, Math.min(170, height * .25))}px`;
    const bounds = dogChatLayout(rect.width, height, point.x - rect.left, point.y - rect.top, bubble.offsetHeight, dock.offsetHeight, top);
    for (const [element, box] of [[bubble, bounds.bubble], [dock, bounds.dock], [history, bounds.history]] as const) {
      element.style.left = `${Math.round(box.left)}px`; element.style.top = `${Math.round(box.top)}px`; element.style.width = `${Math.round(box.width)}px`;
    }
    history.style.height = `${bounds.history.height}px`;
    bubble.style.setProperty('--dog-tail-left', `${bounds.tail}px`);
    bubble.dataset.tail = String(bounds.tailVisible && point.visible);
    layer.dataset.keyboard = String(rect.height - height > 120);
  }
  function close(restoreFocus = true) {
    if (layer.hidden) return;
    stopDictation(); input.blur(); layer.hidden = true; history.hidden = true; toggle.setAttribute('aria-expanded', 'false');
    options.host.classList.remove('dog-chat-open'); options.onClose?.();
    if (restoreFocus && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  }
  q('.dog-chat-close').onclick = () => close();
  q('.dog-chat-history header button').onclick = () => setHistory(false);
  toggle.onclick = () => setHistory(history.hidden);
  mic.onclick = () => dictation.start();
  input.addEventListener('beforeinput', stopDictation);
  input.addEventListener('input', () => { speechStatus = ''; conversation.setDraft(input.value); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); q<HTMLFormElement>('form').requestSubmit(); }
  });
  q<HTMLFormElement>('form').onsubmit = event => { event.preventDefault(); stopDictation(); speechStatus = ''; void conversation.send(); };
  retry.onclick = () => { speechStatus = ''; void conversation.retry(); };
  cancel.onclick = () => conversation.cancel();
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || layer.hidden) return;
    event.preventDefault(); event.stopImmediatePropagation(); if (!history.hidden) setHistory(false); else close();
  }, { capture: true, signal: lifetime.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopDictation(); }, { signal: lifetime.signal });
  window.addEventListener('storage', event => {
    if (event.key === 'nuo_session') { close(false); conversation.refresh(); }
  }, { signal: lifetime.signal });
  window.addEventListener('nuo:avatar-chat-reset', () => { close(false); queueMicrotask(() => conversation.refresh()); }, { signal: lifetime.signal });
  window.visualViewport?.addEventListener('resize', layout, { signal: lifetime.signal });
  window.visualViewport?.addEventListener('scroll', layout, { signal: lifetime.signal });
  window.addEventListener('resize', layout, { signal: lifetime.signal });
  const observer = new ResizeObserver(layout); observer.observe(options.host); observer.observe(dock); observer.observe(bubble);
  conversation.refresh();
  return {
    open() {
      if (!alive) return;
      if (!layer.hidden) { conversation.refresh(); layout(); return; }
      conversation.refresh(); lastFocus = document.activeElement as HTMLElement | null;
      options.onOpen?.(); layer.hidden = false; options.host.classList.add('dog-chat-open'); render();
      if (window.innerWidth >= 650 && matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
    },
    close,
    layout,
    isOpen: () => !layer.hidden,
    dispose() { if (!alive) return; close(false); alive = false; observer.disconnect(); lifetime.abort(); dictation.cancel(''); conversation.dispose(); layer.remove(); }
  };
}
