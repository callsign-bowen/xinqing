import type { ChatReply } from './kernel/api';
import type { AvatarChatBridge, AvatarChatMessage } from './kernel/avatarChat';

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface DogConversationState {
  messages: AvatarChatMessage[];
  draft: string;
  pending: boolean;
  error: string;
  retryText: string;
  storageError: boolean;
  resources: Array<{ name: string; phone: string }>;
}
interface Options {
  storage: StorageLike;
  owner(): string;
  bridge?(): AvatarChatBridge | undefined;
  send(text: string, conversationId: string, signal: AbortSignal): Promise<ChatReply>;
  changed(): void;
  id?: () => string;
}
const PREFIX = 'nuo_dog_chat_v1:';
const clean = (messages: unknown): AvatarChatMessage[] => Array.isArray(messages)
  ? messages.filter((m): m is AvatarChatMessage => (m?.role === 'user' || m?.role === 'assistant') && typeof m.text === 'string').slice(-40).map(m => ({ role: m.role, text: m.text.slice(0, 12000), time: m.time })) : [];

/** UI errors never become invented assistant replies; drafts survive close/reload. */
export function createDogConversation(options: Options) {
  let scope = '', owner = '', id = '', alive = true, generation = 0;
  let savedRaw: string | null = null;
  let controller: AbortController | undefined, bridge: AvatarChatBridge | undefined;
  let state: DogConversationState = { messages: [], draft: '', pending: false, error: '', retryText: '', storageError: false, resources: [] };
  const notify = () => { if (alive) options.changed(); };
  function save() {
    try {
      const raw = JSON.stringify({ id, messages: state.messages.slice(-40), draft: state.draft, retryText: state.retryText });
      options.storage.setItem(scope, raw); savedRaw = raw;
      state.storageError = false;
    } catch { state.storageError = true; }
  }
  function refresh() {
    if (!alive) return;
    const nextOwner = options.owner();
    const nextBridge = options.bridge?.();
    const context = nextBridge?.context();
    const nextScope = PREFIX + encodeURIComponent(nextOwner || 'guest') + ':' + encodeURIComponent(context?.id || 'preview');
    if (nextScope === scope) {
      if (!state.pending) {
        try {
          const raw = options.storage.getItem(scope);
          if (raw && raw !== savedRaw) {
            const latest = JSON.parse(raw);
            if (latest && typeof latest === 'object') {
              if (!context) { state.messages = clean(latest.messages); if (typeof latest.id === 'string' && latest.id.startsWith('dog-')) id = latest.id; }
              state.draft = typeof latest.draft === 'string' ? latest.draft.slice(0, 2000) : '';
              state.retryText = typeof latest.retryText === 'string' ? latest.retryText.slice(0, 2000) : '';
              state.error = state.retryText ? '上一条回复还没有收到，可以重试。' : '';
              savedRaw = raw;
            }
          }
        } catch { /* Keep the current in-memory draft if shared cache is unavailable. */ }
      }
      if (context && !state.pending) state.messages = clean(context.messages);
      bridge = nextBridge; notify(); return;
    }
    generation++; controller?.abort(); controller = undefined;
    owner = nextOwner; scope = nextScope; bridge = nextBridge;
    let stored: { id?: unknown; messages?: unknown; draft?: unknown; retryText?: unknown } = {};
    try { stored = JSON.parse(options.storage.getItem(scope) || '{}') || {}; } catch { /* Empty notebook for corrupt cache. */ }
    id = context?.id || (typeof stored.id === 'string' && stored.id.startsWith('dog-') ? stored.id : `dog-${options.id?.() || crypto.randomUUID()}`);
    state = { messages: clean(context?.messages || stored.messages), draft: typeof stored.draft === 'string' ? stored.draft.slice(0, 2000) : '', pending: false, error: '', retryText: typeof stored.retryText === 'string' ? stored.retryText.slice(0, 2000) : '', storageError: false, resources: [] };
    if (state.retryText) state.error = '上一条回复还没有收到，可以重试。';
    save(); notify();
  }
  async function send(text?: string, retry = false): Promise<void> {
    if (!alive) return;
    refresh();
    text = (retry ? state.retryText : text ?? state.draft).trim().slice(0, 2000);
    if (!text || state.pending) return;
    const ticket = ++generation, requestOwner = owner, requestScope = scope;
    controller = new AbortController(); const signal = controller.signal;
    if (!retry) {
      state.messages.push({ role: 'user', text, time: Date.now() });
      if (state.draft.trim() === text) state.draft = '';
    }
    state.pending = true; state.error = ''; state.retryText = text; state.resources = []; save(); notify();
    try {
      const result = bridge ? await bridge.send(text, { signal, retry }) : await options.send(text, id, signal);
      if (!alive || ticket !== generation || requestOwner !== options.owner() || requestScope !== scope) return;
      if (signal.aborted) throw new Error('已停止等待，你的话还在，可以重试。');
      if (typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('还没有收到回复，可以重试这句话。');
      state.messages.push({ role: 'assistant', text: result.reply.trim(), time: Date.now() });
      state.messages = state.messages.slice(-40); state.retryText = '';
      state.resources = Array.isArray(result.resources) ? result.resources.filter((r): r is { name: string; phone: string } => typeof r === 'object' && r !== null && 'name' in r && typeof r.name === 'string' && 'phone' in r && typeof r.phone === 'string').map(r => ({ name: r.name, phone: r.phone })) : [];
    } catch (error) {
      if (!alive || ticket !== generation || requestOwner !== options.owner()) return;
      state.error = signal.aborted ? '已停止等待，你的话还在，可以重试。' : error instanceof Error ? error.message : '暂时没有连上，可以重试。';
    } finally {
      if (alive && ticket === generation && requestOwner === options.owner()) { state.pending = false; controller = undefined; save(); notify(); }
    }
  }
  return {
    refresh,
    snapshot: (): DogConversationState => ({ ...state, messages: state.messages.map(m => ({ ...m })), resources: state.resources.map(r => ({ ...r })) }),
    setDraft(text: string) { if (!alive) return; state.draft = text.slice(0, 2000); save(); notify(); },
    send,
    retry: () => send('', true),
    cancel() { controller?.abort(); },
    dispose() { if (!alive) return; alive = false; generation++; controller?.abort(); }
  };
}
