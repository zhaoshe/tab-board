import { useCallback, useEffect, useState } from 'react';

export interface OverflowMetrics {
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
}

export interface OverflowCueState {
  blockEnd: boolean;
  blockStart: boolean;
  inlineEnd: boolean;
  inlineStart: boolean;
}

const EDGE_TOLERANCE = 1;

export function getOverflowCueState(
  metrics: OverflowMetrics,
): OverflowCueState {
  return {
    blockEnd:
      metrics.scrollTop + metrics.clientHeight
      < metrics.scrollHeight - EDGE_TOLERANCE,
    blockStart: metrics.scrollTop > EDGE_TOLERANCE,
    inlineEnd:
      metrics.scrollLeft + metrics.clientWidth
      < metrics.scrollWidth - EDGE_TOLERANCE,
    inlineStart: metrics.scrollLeft > EDGE_TOLERANCE,
  };
}

const EMPTY_CUES: OverflowCueState = {
  blockEnd: false,
  blockStart: false,
  inlineEnd: false,
  inlineStart: false,
};

export function useOverflowCues<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [cues, setCues] = useState<OverflowCueState>(EMPTY_CUES);

  const ref = useCallback((nextElement: T | null) => {
    setElement(nextElement);
  }, []);

  useEffect(() => {
    if (!element) return undefined;
    const update = () => setCues(getOverflowCueState(element));
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(update);
    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(update);
    element.addEventListener('scroll', update, { passive: true });
    resizeObserver?.observe(element);
    mutationObserver?.observe(element, {
      childList: true,
      subtree: true,
    });
    update();

    return () => {
      element.removeEventListener('scroll', update);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [element]);

  return { cues, ref };
}
