import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { getHorizontalAutoScroll } from '../core/dndAutoScroll';

export interface BoardDragPointer {
  x: number;
  y: number;
}

interface UseBoardDragAutoScrollInput {
  boardRef: RefObject<HTMLElement | null>;
  active: boolean;
  pointerRef: MutableRefObject<BoardDragPointer | null>;
  pause: boolean;
  onScrolled?: () => void;
}

export function useBoardDragAutoScroll({
  boardRef,
  active,
  pointerRef,
  pause,
  onScrolled,
}: UseBoardDragAutoScrollInput): () => void {
  const board = boardRef.current;
  const activeRef = useRef(active);
  const pauseRef = useRef(pause);
  const onScrolledRef = useRef(onScrolled);
  const frameIdRef = useRef<number | null>(null);
  const tickRef = useRef<FrameRequestCallback>(() => undefined);

  activeRef.current = active;
  pauseRef.current = pause;
  onScrolledRef.current = onScrolled;

  const canMove = useCallback((element: HTMLElement): boolean => {
    const pointer = pointerRef.current;
    if (!activeRef.current || pauseRef.current || !pointer) return false;
    const rect = element.getBoundingClientRect();
    const policy = getHorizontalAutoScroll({
      pointerX: pointer.x,
      viewportLeft: rect.left,
      viewportRight: rect.right,
    });
    const maxScrollLeft = Math.max(
      0,
      element.scrollWidth - element.clientWidth,
    );
    return policy.direction < 0
      ? element.scrollLeft > 0
      : policy.direction > 0 && element.scrollLeft < maxScrollLeft;
  }, [pointerRef]);

  const wake = useCallback(() => {
    const element = boardRef.current;
    if (frameIdRef.current !== null || !element || !canMove(element)) return;
    frameIdRef.current = requestAnimationFrame((time) => tickRef.current(time));
  }, [boardRef, canMove]);

  tickRef.current = () => {
    frameIdRef.current = null;
    const element = boardRef.current;
    const pointer = pointerRef.current;
    if (
      !element
      || !pointer
      || !activeRef.current
      || pauseRef.current
    ) {
      return;
    }
    const rect = element.getBoundingClientRect();
    const policy = getHorizontalAutoScroll({
      pointerX: pointer.x,
      viewportLeft: rect.left,
      viewportRight: rect.right,
    });
    const current = element.scrollLeft;
    const maximum = Math.max(0, element.scrollWidth - element.clientWidth);
    const next = Math.min(
      maximum,
      Math.max(0, current + policy.direction * policy.speed),
    );
    if (next === current) return;

    element.scrollLeft = next;
    onScrolledRef.current?.();
    wake();
  };

  useEffect(() => {
    if (!active || !board) return undefined;
    const handleScroll = () => wake();
    board.addEventListener('scroll', handleScroll, { passive: true });
    wake();
    return () => {
      board.removeEventListener('scroll', handleScroll);
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
    };
  }, [active, board, pause, wake]);

  return wake;
}
