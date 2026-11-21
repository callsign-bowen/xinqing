export function createHoldGesture(onHold: () => void, options?: {
  delay?: number; distance?: number;
  schedule?: (callback: () => void, delay: number) => unknown;
  cancel?: (handle: unknown) => void;
}): {
  start(id: number, x: number, y: number): void;
  move(id: number, x: number, y: number): void;
  finish(id: number): { held: boolean; moved: boolean };
  cancel(): void;
};
