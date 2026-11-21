import type { ChatReply } from './api';

export interface AvatarChatMessage { role: 'user' | 'assistant'; text: string; time?: number }
export interface AvatarChatBridge {
  context(): { id: string; messages: AvatarChatMessage[] };
  send(text: string, options: { signal: AbortSignal; retry: boolean }): Promise<ChatReply>;
}
const CONNECT = 'nuo:connect-avatar-chat';

/** Same-origin scenes share the app's real sender, session and message storage. */
export function registerAvatarChatBridge(bridge: AvatarChatBridge, host: Window = window): () => void {
  const connect = (event: Event) => {
    const accept = (event as CustomEvent<{ accept?: (value: AvatarChatBridge) => void }>).detail?.accept;
    if (typeof accept === 'function') accept(bridge);
  };
  host.addEventListener(CONNECT, connect);
  return () => host.removeEventListener(CONNECT, connect);
}

/** A standalone asset preview has no app bridge and uses its own conversation. */
export function findAvatarChatBridge(host: Window = window): AvatarChatBridge | undefined {
  let result: AvatarChatBridge | undefined;
  for (const target of host.parent === host ? [host] : [host, host.parent]) {
    try {
      if (target.location.origin !== host.location.origin) continue;
      target.dispatchEvent(new CustomEvent(CONNECT, { detail: { accept: (value: AvatarChatBridge) => { result = value; } } }));
    } catch { /* A cross-origin parent cannot participate. */ }
    if (result) break;
  }
  return result;
}
