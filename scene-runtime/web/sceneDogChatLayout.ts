const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Coordinates are relative to the scene, with the visible keyboard area removed. */
export function dogChatLayout(width: number, height: number, headX: number, headY: number, bubbleHeight: number, dockHeight: number, top = 12) {
  const margin = Math.min(16, width * .04), dockWidth = Math.min(440, width - margin * 2);
  const dockTop = Math.max(top + 70, height - dockHeight - margin);
  const bubbleWidth = Math.min(300, width - margin * 2);
  const bubbleLeft = clamp(headX - bubbleWidth * .52, margin, width - margin - bubbleWidth);
  const bubbleTop = clamp(headY - bubbleHeight - 25, top, Math.max(top, dockTop - bubbleHeight - 18));
  return {
    dock: { left: (width - dockWidth) / 2, top: dockTop, width: dockWidth },
    bubble: { left: bubbleLeft, top: bubbleTop, width: bubbleWidth },
    tail: clamp(headX - bubbleLeft, 25, bubbleWidth - 30),
    tailVisible: headY >= bubbleTop + bubbleHeight - 8 && headY <= bubbleTop + bubbleHeight + 100,
    history: { left: margin, top, width: width - margin * 2, height: Math.max(90, dockTop - top - 12) }
  };
}
