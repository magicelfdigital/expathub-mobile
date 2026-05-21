type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeLogout(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitLogout(): void {
  for (const fn of Array.from(listeners)) {
    try {
      fn();
    } catch {}
  }
}
