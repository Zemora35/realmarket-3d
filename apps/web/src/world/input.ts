/** Klavye, fare ve dokunmatik girdilerin birleşik durumu. */
export const input = {
  keys: new Set<string>(),
  /** Sanal joystick (-1..1); x sağ, y ileri. */
  joy: { x: 0, y: 0 },
  /** Biriken bakış hareketi (piksel). */
  look: { dx: 0, dy: 0 },
  pointerLocked: false,
};

export function movementAxes() {
  const k = input.keys;
  let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  let r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  f += input.joy.y;
  r += input.joy.x;
  const len = Math.hypot(f, r);
  if (len > 1) {
    f /= len;
    r /= len;
  }
  return { forward: f, right: r, sprint: k.has('ShiftLeft') || k.has('ShiftRight') };
}

export function isTypingTarget(t: EventTarget | null) {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}

export const isTouchDevice = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
