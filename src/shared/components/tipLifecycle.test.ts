import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  claimTip,
  releaseTip,
  resetTipLifecycleForTests,
} from './tipLifecycle';

afterEach(() => {
  resetTipLifecycleForTests();
  vi.useRealTimers();
});

describe('tip lifecycle', () => {
  it('cancels the stale timer when a new owner claims the page tip', () => {
    vi.useFakeTimers();
    const first = {};
    const second = {};
    const firstOpen = vi.fn();
    const firstClose = vi.fn();
    const secondOpen = vi.fn();

    claimTip(first, 1000, firstOpen, firstClose);
    claimTip(second, 550, secondOpen, vi.fn());
    vi.advanceTimersByTime(1000);

    expect(firstOpen).not.toHaveBeenCalled();
    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(secondOpen).toHaveBeenCalledTimes(1);
  });

  it('closes a visible owner before opening the replacement', () => {
    const calls: string[] = [];
    const first = {};
    const second = {};

    claimTip(first, 0, () => calls.push('open:first'), () => calls.push('close:first'));
    claimTip(second, 0, () => calls.push('open:second'), () => calls.push('close:second'));

    expect(calls).toEqual(['open:first', 'close:first', 'open:second']);
  });

  it('release prevents a pending owner from opening later', () => {
    vi.useFakeTimers();
    const owner = {};
    const open = vi.fn();
    const close = vi.fn();

    claimTip(owner, 300, open, close);
    releaseTip(owner);
    vi.advanceTimersByTime(300);

    expect(open).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
