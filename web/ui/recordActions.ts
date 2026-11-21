import { createHoldGesture } from './holdGesture.mjs';
import './recordActions.css';

let dismissActive: (() => void) | undefined;
let sequence = 0;

/** Conversation rows keep their menu; practice records can opt into direct opening. */
export function bindRecordActions(target: HTMLButtonElement, actions: {
  name: string; openLabel: string; open(): void; remove(): void;
  clickToOpen?: boolean;
}) {
  const binding = new AbortController();
  let menu: HTMLDivElement | undefined, listeners: AbortController | undefined;
  let pointerType = '', suppressClick = false, activePointer: number | undefined;
  const hold = createHoldGesture(() => { suppressClick = true; show(); });

  function close(restoreFocus = false) {
    listeners?.abort(); listeners = undefined;
    menu?.remove(); menu = undefined;
    target.setAttribute('aria-expanded', 'false'); target.removeAttribute('aria-controls');
    if (dismissActive === close) dismissActive = undefined;
    if (restoreFocus && target.isConnected) target.focus();
  }
  function show() {
    if (!target.isConnected || menu) return;
    dismissActive?.();
    menu = document.createElement('div'); menu.className = 'record-action-menu';
    menu.id = `record-actions-${++sequence}`; menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', actions.name);
    const open = document.createElement('button'); open.type = 'button'; open.setAttribute('role', 'menuitem'); open.textContent = actions.openLabel;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'record-action-delete'; remove.setAttribute('role', 'menuitem'); remove.textContent = '删除';
    open.addEventListener('click', () => { close(); actions.open(); });
    remove.addEventListener('click', () => { close(true); actions.remove(); });
    const items = actions.clickToOpen ? [remove] : [open, remove];
    menu.append(...items); document.body.append(menu);
    const box = target.getBoundingClientRect(), size = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(10, Math.min(box.right - size.width, window.innerWidth - size.width - 10))}px`;
    menu.style.top = `${Math.max(10, box.bottom + size.height + 8 <= window.innerHeight ? box.bottom + 4 : box.top - size.height - 4)}px`;
    target.setAttribute('aria-expanded', 'true'); target.setAttribute('aria-controls', menu.id);
    listeners = new AbortController(); const options = { signal: listeners.signal };
    document.addEventListener('pointerdown', event => {
      if (!menu?.contains(event.target as Node) && !target.contains(event.target as Node)) close();
    }, { ...options, capture: true });
    document.addEventListener('keydown', event => {
      if (!menu) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(true); }
      else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length].focus();
      } else if (event.key === 'Tab') close();
    }, { ...options, capture: true });
    window.addEventListener('resize', () => close(), options);
    document.addEventListener('scroll', () => close(), { ...options, capture: true });
    dismissActive = close; items[0].focus();
  }
  target.classList.add('record-action-target'); target.setAttribute('aria-haspopup', actions.clickToOpen ? 'dialog' : 'menu'); target.setAttribute('aria-expanded', 'false');
  const options = { signal: binding.signal };
  target.addEventListener('pointerdown', event => {
    hold.cancel(); pointerType = event.pointerType; suppressClick = false; activePointer = event.pointerId;
    if (event.isPrimary && event.button === 0 && (actions.clickToOpen || ['touch', 'pen'].includes(pointerType))) hold.start(event.pointerId, event.clientX, event.clientY);
  }, options);
  document.addEventListener('pointermove', event => hold.move(event.pointerId, event.clientX, event.clientY), options);
  document.addEventListener('pointerup', event => {
    const result = hold.finish(event.pointerId); suppressClick ||= result.held || result.moved;
    if (event.pointerId === activePointer) activePointer = undefined;
  }, options);
  document.addEventListener('pointercancel', event => {
    if (event.pointerId === activePointer) { hold.cancel(); suppressClick = true; activePointer = undefined; }
  }, options);
  target.addEventListener('contextmenu', event => {
    if (actions.clickToOpen || ['touch', 'pen'].includes(pointerType)) { event.preventDefault(); hold.cancel(); suppressClick = true; show(); }
  }, options);
  target.addEventListener('click', event => {
    event.preventDefault();
    if (suppressClick) { suppressClick = false; return; }
    if (actions.clickToOpen || event.detail === 0 || ['touch', 'pen'].includes(pointerType)) { close(); actions.open(); }
    else if (menu) close(true); else show();
  }, options);
  target.addEventListener('keydown', event => {
    if (event.key === 'Delete' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); show(); }
  }, options);
  window.addEventListener('blur', () => { hold.cancel(); close(); }, options);
  return () => { binding.abort(); hold.cancel(); close(); };
}
