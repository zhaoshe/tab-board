// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { getOverflowCueState, useOverflowCues } from './useOverflowCues';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('getOverflowCueState', () => {
  it('reports horizontal start and end availability', () => {
    expect(getOverflowCueState({
      clientHeight: 100,
      clientWidth: 300,
      scrollHeight: 100,
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 600,
    })).toEqual({
      blockEnd: false,
      blockStart: false,
      inlineEnd: true,
      inlineStart: false,
    });

    expect(getOverflowCueState({
      clientHeight: 100,
      clientWidth: 300,
      scrollHeight: 100,
      scrollLeft: 150,
      scrollTop: 0,
      scrollWidth: 600,
    })).toMatchObject({
      inlineEnd: true,
      inlineStart: true,
    });
  });

  it('reports vertical start and end availability with a one-pixel tolerance', () => {
    expect(getOverflowCueState({
      clientHeight: 200,
      clientWidth: 100,
      scrollHeight: 500,
      scrollLeft: 0,
      scrollTop: 299,
      scrollWidth: 100,
    })).toEqual({
      blockEnd: false,
      blockStart: true,
      inlineEnd: false,
      inlineStart: false,
    });
  });
});

describe('useOverflowCues', () => {
  it('keeps the scroll listener attached under React StrictMode', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    function Probe() {
      const overflow = useOverflowCues<HTMLDivElement>();
      return createElement('div', {
        ref: overflow.ref,
        'data-inline-start': overflow.cues.inlineStart || undefined,
        'data-inline-end': overflow.cues.inlineEnd || undefined,
      });
    }

    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(Probe)));
    });

    const element = container.firstElementChild as HTMLDivElement;
    Object.defineProperties(element, {
      clientHeight: { configurable: true, value: 100 },
      clientWidth: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, value: 150 },
      scrollTop: { configurable: true, value: 0 },
      scrollWidth: { configurable: true, value: 600 },
    });

    await act(async () => {
      element.dispatchEvent(new Event('scroll'));
    });

    expect(element.dataset.inlineStart).toBe('true');
    expect(element.dataset.inlineEnd).toBe('true');

    await act(async () => root.unmount());
    container.remove();
  });
});
