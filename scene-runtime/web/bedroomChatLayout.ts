export function chatLayout(width: number, height: number, headX: number, headY: number, dockHeight: number, bubbleHeight: number) {
  const compact = height < 520;
  const margin = 16, top = compact ? 72 : 94;
  const dockWidth = Math.min(width - margin * 2, width < 600 ? 360 : 300);
  const dockTop = Math.max(top + 40, height - dockHeight - margin);
  const bubbleWidth = Math.min(width - 40, compact ? 250 : 280);
  const bubbleLeft = Math.max(20, Math.min(width - bubbleWidth - 20, headX - bubbleWidth * .55));
  const bubbleTop = Math.max(top, Math.min(dockTop - bubbleHeight - 12, headY - bubbleHeight - 28));
  return {
    dock: { width: dockWidth, left: Math.max(margin, Math.min(width - dockWidth - margin, headX + 46)), top: dockTop },
    bubble: { width: bubbleWidth, left: bubbleLeft, top: bubbleTop },
    tail: Math.max(24, Math.min(bubbleWidth - 30, headX - bubbleLeft))
  };
}
