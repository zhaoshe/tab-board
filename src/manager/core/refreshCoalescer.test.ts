import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRefreshCoalescer } from './refreshCoalescer';

afterEach(() => {
  vi.useRealTimers();
});

describe('createRefreshCoalescer', () => {
  it('collapses an idle event burst into one delayed run', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const coalescer = createRefreshCoalescer(run, { delay: 75 });

    coalescer.request();
    coalescer.request();
    coalescer.request();
    await vi.advanceTimersByTimeAsync(74);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs at most one trailing refresh for any in-flight burst', async () => {
    vi.useFakeTimers();
    let resolveFirst!: () => void;
    const run = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValue(undefined);
    const coalescer = createRefreshCoalescer(run, { delay: 75 });

    coalescer.request({ immediate: true });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    coalescer.request();
    coalescer.request();
    await vi.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(1);

    resolveFirst();
    await vi.runAllTimersAsync();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('disposes pending and trailing work', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const coalescer = createRefreshCoalescer(run, { delay: 75 });

    coalescer.request();
    coalescer.dispose();
    await vi.runAllTimersAsync();
    expect(run).not.toHaveBeenCalled();

    coalescer.request({ immediate: true });
    expect(run).not.toHaveBeenCalled();
  });
});
