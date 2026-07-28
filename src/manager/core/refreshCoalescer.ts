export interface RefreshCoalescer {
  request(options?: { immediate?: boolean }): Promise<void>;
  dispose(): void;
}

export function createRefreshCoalescer(
  run: () => Promise<void>,
  { delay }: { delay: number },
): RefreshCoalescer {
  let disposed = false;
  let dirty = false;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const start = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (inFlight) {
      dirty = true;
      return inFlight;
    }
    clearTimer();
    dirty = false;
    const current = run();
    inFlight = current.finally(() => {
      if (inFlight === current || inFlight === wrapped) {
        inFlight = null;
      }
      if (disposed || !dirty) return;
      dirty = false;
      timer = setTimeout(() => {
        timer = null;
        void start();
      }, delay);
    });
    const wrapped = inFlight;
    return wrapped;
  };

  return {
    request({ immediate = false } = {}) {
      if (disposed) return Promise.resolve();
      if (inFlight) {
        dirty = true;
        return inFlight;
      }
      if (immediate) return start();
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          void start();
        }, delay);
      }
      return Promise.resolve();
    },
    dispose() {
      disposed = true;
      dirty = false;
      clearTimer();
    },
  };
}
