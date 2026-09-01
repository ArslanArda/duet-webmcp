/**
 * Tiny publish/subscribe channel for the playback position.
 * It deliberately lives outside the Zustand store: the position changes
 * every animation frame and only the canvases and the transport clock care.
 */
type Listener = (tick: number | null) => void;

let currentTick: number | null = null;
const listeners = new Set<Listener>();

export const getPlayheadTick = () => currentTick;

export function setPlayheadTick(tick: number | null) {
  if (tick === currentTick) return;
  currentTick = tick;
  listeners.forEach((listener) => listener(tick));
}

export function subscribePlayhead(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
