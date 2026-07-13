type EventCallback = (data?: unknown) => void;

const listeners = new Map<string, Set<EventCallback>>();

export function emitEvent(eventName: string, data?: unknown) {
  if (typeof window === 'undefined') return;
  const event = new CustomEvent(eventName, { detail: data });
  window.dispatchEvent(event);
  const callbacks = listeners.get(eventName);
  if (callbacks) {
    callbacks.forEach((cb) => cb(data));
  }
}

export function onEvent(eventName: string, callback: EventCallback): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent;
    callback(customEvent.detail);
  };
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}

export const AppEvents = {
  SAVE_SUCCESS: 'tabboard:save-success',
  IMPORT_SUCCESS: 'tabboard:import-success',
  RESTORE_SUCCESS: 'tabboard:restore-success',
  TOAST: 'tabboard:toast',
  ERROR: 'tabboard:error',
} as const;
