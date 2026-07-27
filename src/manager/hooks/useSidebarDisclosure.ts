import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'tabboard.sidebarCollapsed';
const NARROW_SIDEBAR_QUERY = '(max-width: 900px)';

function initialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(NARROW_SIDEBAR_QUERY).matches
    || window.localStorage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
}

export interface SidebarDisclosure {
  collapsed: boolean;
  overlayOpen: boolean;
  hoverSuppressed: boolean;
  expandedToggleRef: RefObject<HTMLButtonElement>;
  compactToggleRef: RefObject<HTMLButtonElement>;
  toggle: (expanded: boolean) => void;
  setOverlayOpen: (open: boolean) => void;
  setHoverSuppressed: (suppressed: boolean) => void;
}

export function useSidebarDisclosure(): SidebarDisclosure {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [hoverSuppressed, setHoverSuppressed] = useState(collapsed);
  const expandedToggleRef = useRef<HTMLButtonElement>(null);
  const compactToggleRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback((expanded: boolean) => {
    setHoverSuppressed(!expanded);
    if (window.matchMedia(NARROW_SIDEBAR_QUERY).matches) {
      setCollapsed(true);
      setOverlayOpen(expanded);
    } else {
      setOverlayOpen(false);
      setCollapsed(!expanded);
    }
    requestAnimationFrame(() => {
      (expanded ? expandedToggleRef : compactToggleRef).current?.focus();
    });
  }, []);

  useEffect(() => {
    window.localStorage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(NARROW_SIDEBAR_QUERY);
    const collapseForNarrowViewport = () => {
      if (mediaQuery.matches) setCollapsed(true);
    };
    mediaQuery.addEventListener('change', collapseForNarrowViewport);
    return () => mediaQuery.removeEventListener('change', collapseForNarrowViewport);
  }, []);

  return {
    collapsed,
    overlayOpen,
    hoverSuppressed,
    expandedToggleRef,
    compactToggleRef,
    toggle,
    setOverlayOpen,
    setHoverSuppressed,
  };
}
