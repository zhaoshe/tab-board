import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useDroppable } from '@dnd-kit/core';
import { claimTip, releaseTip } from '../../../shared/components/tipLifecycle';
import type { DndData } from '../../core/dnd';
import type { CategoryFilter } from '../../core/selectors';

const COARSE_POINTER_QUERY = '(hover: none), (pointer: coarse)';
const RELEASE_TIP_DWELL_MS = 300;
const RELEASE_TIP_VIEWPORT_PADDING = 12;
const RELEASE_TIP_GAP = 8;

interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

export function getReleaseTipPosition(
  targetRect: RectLike,
  tipSize: Size,
  viewport: Size,
  {
    padding,
    gap,
  }: {
    padding: number;
    gap: number;
  },
): { left: number; top: number } {
  const clamp = (value: number, minimum: number, maximum: number) => (
    Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
  );
  const left = clamp(
    targetRect.left + targetRect.width / 2 - tipSize.width / 2,
    padding,
    viewport.width - padding - tipSize.width,
  );
  const aboveTop = targetRect.top - gap - tipSize.height;
  const preferredTop = aboveTop >= padding
    ? aboveTop
    : targetRect.bottom + gap;
  return {
    left,
    top: clamp(
      preferredTop,
      padding,
      viewport.height - padding - tipSize.height,
    ),
  };
}

function getCoarsePointerSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
}

function subscribeToCoarsePointer(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => undefined;
  }
  const mediaQuery = window.matchMedia(COARSE_POINTER_QUERY);
  mediaQuery.addEventListener('change', listener);
  return () => mediaQuery.removeEventListener('change', listener);
}

function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeToCoarsePointer,
    getCoarsePointerSnapshot,
    () => true,
  );
}

function ReleaseTip({
  targetRef,
}: {
  targetRef: RefObject<HTMLDivElement>;
}) {
  const tipRef = useRef<HTMLDivElement | null>(null);
  const ownerRef = useRef({});
  const [measuring, setMeasuring] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    claimTip(
      ownerRef.current,
      RELEASE_TIP_DWELL_MS,
      () => setMeasuring(true),
      () => {
        setMeasuring(false);
        setPosition(null);
      },
    );
    return () => releaseTip(ownerRef.current);
  }, []);

  useLayoutEffect(() => {
    if (!measuring) return;
    const targetRect = targetRef.current?.getBoundingClientRect();
    const tipRect = tipRef.current?.getBoundingClientRect();
    if (!targetRect || !tipRect) return;
    setPosition(getReleaseTipPosition(
      targetRect,
      tipRect,
      { width: window.innerWidth, height: window.innerHeight },
      {
        padding: RELEASE_TIP_VIEWPORT_PADDING,
        gap: RELEASE_TIP_GAP,
      },
    ));
  }, [measuring, targetRef]);

  if (!measuring || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={tipRef}
      className={position
        ? 'new-session-gap-target__release-tip'
        : 'new-session-gap-target__release-tip-measure'}
      style={position ?? {
        left: 0,
        top: 0,
      }}
      aria-hidden="true"
    >
      Release to create session
    </div>,
    document.body,
  );
}

interface NewSessionGapTargetProps {
  category: CategoryFilter;
  index: number;
  workspaceId: string;
  enabled: boolean;
  active: boolean;
}

export function NewSessionGapTarget({
  category,
  index,
  workspaceId,
  enabled,
  active,
}: NewSessionGapTargetProps) {
  const coarsePointer = useCoarsePointer();
  const targetEnabled = enabled && !coarsePointer;
  const { setNodeRef } = useDroppable({
    id: `new-session-insert-${workspaceId}-${category}-${index}`,
    disabled: !targetEnabled,
    data: {
      type: 'new-session-insert',
      dnd: {
        targets: [{
          kind: 'new-session-insert',
          category,
          index,
          workspaceId,
        }],
      } satisfies DndData,
    },
  });
  const targetRef = useRef<HTMLDivElement | null>(null);
  const setTargetRef = useCallback((element: HTMLDivElement | null) => {
    targetRef.current = element;
    setNodeRef(element);
  }, [setNodeRef]);

  if (!targetEnabled) return null;

  return (
    <>
      <div
        ref={setTargetRef}
        className="new-session-gap-target"
        data-active={active || undefined}
        aria-hidden="true"
      />
      {active && <ReleaseTip targetRef={targetRef} />}
    </>
  );
}
