import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export function getInitialSessionActivation(
  groupIds: readonly string[],
  forcedIds: readonly string[],
  initialCount: number,
): Set<string> {
  return new Set([
    ...groupIds.slice(0, Math.max(0, initialCount)),
    ...forcedIds.filter((id) => groupIds.includes(id)),
  ]);
}

export function useSessionActivation({
  contextKey,
  forcedIds,
  groupIds,
  initialCount = 6,
  overscanPx = 720,
  axis = 'horizontal',
}: {
  contextKey: string;
  forcedIds: readonly string[];
  groupIds: readonly string[];
  initialCount?: number;
  overscanPx?: number;
  axis?: 'horizontal' | 'vertical';
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [activation, setActivation] = useState(() => ({
    contextKey,
    ids: getInitialSessionActivation(groupIds, [], initialCount),
  }));
  const slotElements = useRef(new Map<string, Element>());
  const slotIds = useRef(new WeakMap<Element, string>());
  const slotRefCallbacks = useRef(new Map<string, (element: Element | null) => void>());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const activeIds = useMemo(() => new Set([
    ...(activation.contextKey === contextKey
      ? activation.ids
      : getInitialSessionActivation(groupIds, [], initialCount)),
    ...forcedIds.filter((id) => groupIds.includes(id)),
  ]), [activation, contextKey, forcedIds, groupIds, initialCount]);

  const activate = useCallback((id: string) => {
    setActivation((current) => {
      const base = current.contextKey === contextKey
        ? current.ids
        : getInitialSessionActivation(groupIds, [], initialCount);
      if (base.has(id) || !groupIds.includes(id)) {
        return current.contextKey === contextKey
          ? current
          : { contextKey, ids: base };
      }
      return { contextKey, ids: new Set([...base, id]) };
    });
  }, [contextKey, groupIds, initialCount]);

  const registerSlot = useCallback((id: string) => {
    let callback = slotRefCallbacks.current.get(id);
    if (!callback) {
      callback = (element: Element | null) => {
        const previous = slotElements.current.get(id);
        if (previous && previous !== element) {
          observerRef.current?.unobserve(previous);
        }
        if (element) {
          slotElements.current.set(id, element);
          slotIds.current.set(element, id);
          observerRef.current?.observe(element);
        } else {
          slotElements.current.delete(id);
        }
      };
      slotRefCallbacks.current.set(id, callback);
    }
    return callback;
  }, []);

  useEffect(() => {
    const next = getInitialSessionActivation(groupIds, [], initialCount);
    setActivation((current) => {
      if (current.contextKey !== contextKey) {
        return { contextKey, ids: next };
      }
      const remaining = new Set([...current.ids].filter((id) => groupIds.includes(id)));
      return remaining.size === current.ids.size ? current : { contextKey, ids: remaining };
    });
  }, [contextKey, groupIds, initialCount]);

  useEffect(() => {
    if (!root) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setActivation({ contextKey, ids: new Set(groupIds) });
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      setActivation((current) => {
        const base = current.contextKey === contextKey
          ? current.ids
          : getInitialSessionActivation(groupIds, [], initialCount);
        const next = new Set(base);
        for (const entry of entries) {
          const id = slotIds.current.get(entry.target);
          if (!id || !groupIds.includes(id)) continue;
          if (entry.isIntersecting) next.add(id);
          else next.delete(id);
        }
        return next.size === base.size && [...next].every((id) => base.has(id))
          ? current
          : { contextKey, ids: next };
      });
    }, {
      root,
      rootMargin: axis === 'horizontal' ? `0px ${overscanPx}px` : `${overscanPx}px 0px`,
    });
    observerRef.current = observer;
    for (const element of slotElements.current.values()) {
      observer.observe(element);
    }
    return () => {
      observerRef.current = null;
      observer.disconnect();
    };
  }, [axis, contextKey, groupIds, initialCount, overscanPx, root]);

  return useMemo(() => ({
    activeIds,
    activate,
    registerSlot,
    rootRef: setRoot,
  }), [activeIds, activate, registerSlot]);
}
