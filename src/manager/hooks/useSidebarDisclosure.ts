import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'tabboard.sidebarCollapsed';
const NARROW_SIDEBAR_QUERY = '(max-width: 900px)';
const COARSE_SIDEBAR_QUERY = '(hover: none), (pointer: coarse)';
export const SIDEBAR_PEEK_DELAY_MS = 350;

export type SidebarDisclosureState =
  | 'collapsed'
  | 'peek'
  | 'pinned'
  | 'drawer';

function readPinnedPreference(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) !== 'true';
}

function initialState(): SidebarDisclosureState {
  if (typeof window === 'undefined') return 'pinned';
  if (window.matchMedia(NARROW_SIDEBAR_QUERY).matches) return 'collapsed';
  return readPinnedPreference() ? 'pinned' : 'collapsed';
}

export interface SidebarDisclosure {
  state: SidebarDisclosureState;
  collapsed: boolean;
  overlayOpen: boolean;
  pinned: boolean;
  expandedToggleRef: RefObject<HTMLButtonElement>;
  compactToggleRef: RefObject<HTMLButtonElement>;
  toggle: (expanded: boolean) => void;
  pin: () => void;
  promote: () => void;
  setPeekIntent: (
    source: 'pointer' | 'focus',
    active: boolean,
    options?: { cancelPending?: boolean },
  ) => void;
}

export function useSidebarDisclosure(): SidebarDisclosure {
  const [state, setState] = useState<SidebarDisclosureState>(initialState);
  const expandedToggleRef = useRef<HTMLButtonElement>(null);
  const compactToggleRef = useRef<HTMLButtonElement>(null);
  const peekTimerRef = useRef<number | null>(null);
  const pinnedPreferenceRef = useRef(readPinnedPreference());
  const peekIntentRef = useRef({ pointer: false, focus: false });

  const clearPeekTimer = useCallback(() => {
    if (peekTimerRef.current === null) return;
    window.clearTimeout(peekTimerRef.current);
    peekTimerRef.current = null;
  }, []);

  const focusToggle = useCallback((expanded: boolean) => {
    requestAnimationFrame(() => {
      (expanded ? expandedToggleRef : compactToggleRef).current?.focus();
    });
  }, []);

  const toggle = useCallback((expanded: boolean) => {
    clearPeekTimer();
    peekIntentRef.current = { pointer: false, focus: false };
    if (window.matchMedia(NARROW_SIDEBAR_QUERY).matches) {
      setState(expanded ? 'drawer' : 'collapsed');
    } else {
      pinnedPreferenceRef.current = expanded;
      window.localStorage?.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        String(!expanded),
      );
      setState(expanded ? 'pinned' : 'collapsed');
    }
    focusToggle(expanded);
  }, [clearPeekTimer, focusToggle]);

  const pin = useCallback(() => {
    clearPeekTimer();
    if (window.matchMedia(NARROW_SIDEBAR_QUERY).matches) return;
    peekIntentRef.current = { pointer: false, focus: false };
    pinnedPreferenceRef.current = true;
    window.localStorage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, 'false');
    setState('pinned');
  }, [clearPeekTimer]);

  const promote = useCallback(() => {
    clearPeekTimer();
    if (window.matchMedia(NARROW_SIDEBAR_QUERY).matches) return;
    peekIntentRef.current = { pointer: false, focus: false };
    setState((current) => current === 'peek' ? 'pinned' : current);
  }, [clearPeekTimer]);

  const setPeekIntent = useCallback((
    source: 'pointer' | 'focus',
    active: boolean,
    options?: { cancelPending?: boolean },
  ) => {
    peekIntentRef.current[source] = active;
    if (options?.cancelPending) {
      clearPeekTimer();
      return;
    }
    const hasIntent = peekIntentRef.current.pointer || peekIntentRef.current.focus;

    if (!hasIntent) {
      clearPeekTimer();
      setState((current) => current === 'peek' ? 'collapsed' : current);
      return;
    }
    if (
      state !== 'collapsed'
      || peekTimerRef.current !== null
      || window.matchMedia(NARROW_SIDEBAR_QUERY).matches
      || window.matchMedia(COARSE_SIDEBAR_QUERY).matches
    ) {
      return;
    }
    peekTimerRef.current = window.setTimeout(() => {
      peekTimerRef.current = null;
      if (!peekIntentRef.current.pointer && !peekIntentRef.current.focus) return;
      setState((current) => current === 'collapsed' ? 'peek' : current);
    }, SIDEBAR_PEEK_DELAY_MS);
  }, [clearPeekTimer, state]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(NARROW_SIDEBAR_QUERY);
    const updateForViewport = () => {
      clearPeekTimer();
      peekIntentRef.current = { pointer: false, focus: false };
      setState(mediaQuery.matches
        ? 'collapsed'
        : pinnedPreferenceRef.current
          ? 'pinned'
          : 'collapsed');
    };
    mediaQuery.addEventListener('change', updateForViewport);
    return () => mediaQuery.removeEventListener('change', updateForViewport);
  }, [clearPeekTimer]);

  useEffect(() => clearPeekTimer, [clearPeekTimer]);

  const collapsed = state !== 'pinned';

  return {
    state,
    collapsed,
    overlayOpen: state === 'drawer',
    pinned: state === 'pinned',
    expandedToggleRef,
    compactToggleRef,
    toggle,
    pin,
    promote,
    setPeekIntent,
  };
}
