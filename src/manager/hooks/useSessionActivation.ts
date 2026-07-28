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
}: {
  contextKey: string;
  forcedIds: readonly string[];
  groupIds: readonly string[];
  initialCount?: number;
  overscanPx?: number;
}) {
  const groupKey = groupIds.join('|');
  const forcedKey = forcedIds.join('|');
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [activation, setActivation] = useState(() => ({
    contextKey,
    ids: getInitialSessionActivation(groupIds, forcedIds, initialCount),
  }));
  const slotElements = useRef(new Map<string, Element>());
  const slotIds = useRef(new WeakMap<Element, string>());
  const slotRefCallbacks = useRef(new Map<string, (element: Element | null) => void>());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const activeIds = activation.contextKey === contextKey
    ? activation.ids
    : getInitialSessionActivation(groupIds, forcedIds, initialCount);

  const activate = useCallback((id: string) => {
    setActivation((current) => {
      const base = current.contextKey === contextKey
        ? current.ids
        : getInitialSessionActivation(groupIds, forcedIds, initialCount);
      if (base.has(id) || !groupIds.includes(id)) {
        return current.contextKey === contextKey
          ? current
          : { contextKey, ids: base };
      }
      return { contextKey, ids: new Set([...base, id]) };
    });
  }, [contextKey, forcedKey, groupKey, initialCount]);

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
    const next = getInitialSessionActivation(groupIds, forcedIds, initialCount);
    setActivation((current) => {
      if (current.contextKey !== contextKey) {
        return { contextKey, ids: next };
      }
      const missing = [...next].filter((id) => !current.ids.has(id));
      return missing.length
        ? { contextKey, ids: new Set([...current.ids, ...missing]) }
        : current;
    });
  }, [contextKey, forcedKey, groupKey, initialCount]);

  useEffect(() => {
    if (!root) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setActivation({ contextKey, ids: new Set(groupIds) });
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      const intersecting = entries.flatMap((entry) => {
        const id = slotIds.current.get(entry.target);
        return entry.isIntersecting && id ? [id] : [];
      });
      if (!intersecting.length) return;
      setActivation((current) => {
        const base = current.contextKey === contextKey
          ? current.ids
          : getInitialSessionActivation(groupIds, forcedIds, initialCount);
        const missing = intersecting.filter((id) => !base.has(id));
        return missing.length
          ? { contextKey, ids: new Set([...base, ...missing]) }
          : current;
      });
    }, {
      root,
      rootMargin: `0px ${overscanPx}px`,
    });
    observerRef.current = observer;
    for (const element of slotElements.current.values()) {
      observer.observe(element);
    }
    return () => {
      observerRef.current = null;
      observer.disconnect();
    };
  }, [contextKey, forcedKey, groupKey, initialCount, overscanPx, root]);

  return useMemo(() => ({
    activeIds,
    activate,
    registerSlot,
    rootRef: setRoot,
  }), [activeIds, activate, registerSlot]);
}
