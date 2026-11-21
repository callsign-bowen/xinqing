/** Follow the area above the software keyboard, including Safari's viewport panning. */
export function watchRoomViewport(root: HTMLElement): () => void {
  const viewport = window.visualViewport;
  let baseline = window.innerHeight, lastWidth = window.innerWidth;
  function update() {
    if (Math.abs(window.innerWidth - lastWidth) > 60) { baseline = window.innerHeight; lastWidth = window.innerWidth; }
    const height = viewport?.height || window.innerHeight;
    const editing = root.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (!editing) baseline = Math.max(baseline, height);
    root.style.height = `${Math.round(height)}px`;
    root.style.top = `${Math.round(viewport?.offsetTop || 0)}px`;
    root.style.bottom = 'auto';
    root.dataset.keyboard = String(editing && baseline - height > 120);
  }
  update();
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  root.addEventListener('focusin', update); root.addEventListener('focusout', update);
  return () => {
    viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    root.removeEventListener('focusin', update); root.removeEventListener('focusout', update);
  };
}
