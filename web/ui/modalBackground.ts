/** Keep the actual page behind a modal in place, without replacing its DOM or drafts. */
export function retainModalBackground(modal: HTMLElement): () => void {
  const body = document.body;
  const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const x = window.scrollX, y = window.scrollY;
  const properties = ['position', 'top', 'left', 'width', 'overflow', 'paddingRight', 'boxSizing'] as const;
  const saved = properties.map(name => [name, body.style[name]] as const);
  const background = [...body.children]
    .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== modal && !element.contains(modal)
      && element.matches('.app,.bottom-nav,.page,#root'))
    .map(element => ({ element, inert: element.inert }));
  const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
  Object.assign(body.style, { position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%', overflow: 'hidden', boxSizing: 'border-box' });
  if (gap) body.style.paddingRight = `${padding + gap}px`;
  background.forEach(({ element }) => { element.inert = true; });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    saved.forEach(([name, value]) => { body.style[name] = value; });
    background.forEach(({ element, inert }) => { element.inert = inert; });
    window.scrollTo({ left: x, top: y, behavior: 'instant' });
    if (focus?.isConnected) focus.focus({ preventScroll: true });
  };
}
