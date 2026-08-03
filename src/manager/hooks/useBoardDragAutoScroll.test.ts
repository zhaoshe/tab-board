// @vitest-environment happy-dom
import {
  act,
  createElement,
  StrictMode,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useBoardDragAutoScroll,
  type BoardDragPointer,
} from './useBoardDragAutoScroll';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface HookProps {
  active: boolean;
  boardRef: RefObject<HTMLElement | null>;
  onScrolled?: () => void;
  pause: boolean;
  pointer: BoardDragPointer | null;
  pointerRef?: MutableRefObject<BoardDragPointer | null>;
}

interface RafController {
  cancel: ReturnType<typeof vi.fn>;
  flush: () => Promise<void>;
  pending: () => number;
  request: ReturnType<typeof vi.fn>;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let props: HookProps;
let latestWake: (() => void) | undefined;

function installRafController(): RafController {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback): number => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number): void => {
    callbacks.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);

  return {
    cancel,
    flush: async () => {
      const queued = [...callbacks.values()];
      callbacks.clear();
      await act(async () => {
        queued.forEach((callback) => callback(0));
      });
    },
    pending: () => callbacks.size,
    request,
  };
}

function createBoard(input: {
  clientWidth?: number;
  dispatchScrollOnWrite?: boolean;
  left?: number;
  scrollLeft?: number;
  scrollWidth?: number;
  width?: number;
} = {}): HTMLElement {
  const board = document.createElement('section');
  let scrollLeft = input.scrollLeft ?? 0;
  const clientWidth = input.clientWidth ?? 400;
  const width = input.width ?? clientWidth;
  Object.defineProperties(board, {
    clientWidth: { configurable: true, get: () => clientWidth },
    scrollLeft: {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = value;
        if (input.dispatchScrollOnWrite) {
          board.dispatchEvent(new Event('scroll'));
        }
      },
    },
    scrollWidth: { configurable: true, get: () => input.scrollWidth ?? 1_000 },
  });
  vi.spyOn(board, 'getBoundingClientRect').mockImplementation(() => ({
    bottom: 500,
    height: 400,
    left: input.left ?? 100,
    right: (input.left ?? 100) + width,
    top: 100,
    width,
    x: input.left ?? 100,
    y: 100,
    toJSON: () => ({}),
  }));
  return board;
}

function Probe(nextProps: HookProps) {
  const pointerRef = nextProps.pointerRef ?? { current: nextProps.pointer };
  latestWake = useBoardDragAutoScroll({
    active: nextProps.active,
    boardRef: nextProps.boardRef,
    onScrolled: nextProps.onScrolled,
    pause: nextProps.pause,
    pointerRef,
  } as never) as unknown as (() => void) | undefined;
  return null;
}

async function render(nextProps: HookProps, strict = false): Promise<void> {
  props = nextProps;
  await act(async () => {
    root?.render(
      strict
        ? createElement(StrictMode, null, createElement(Probe, props))
        : createElement(Probe, props),
    );
  });
}

beforeEach(() => {
  latestWake = undefined;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useBoardDragAutoScroll', () => {
  it('moves right and left at progressive speeds and clamps to board bounds', async () => {
    const raf = installRafController();
    const board = createBoard({ scrollLeft: 100 });
    const boardRef = { current: board };

    await render({
      active: true,
      boardRef,
      pause: false,
      pointer: { x: 468, y: 200 },
    });
    expect(raf.pending()).toBe(1);
    await raf.flush();
    expect(board.scrollLeft).toBe(106);

    await render({
      active: true,
      boardRef,
      pause: false,
      pointer: { x: 108, y: 200 },
    });
    await raf.flush();
    expect(board.scrollLeft).toBe(95.5);

    board.scrollLeft = 598;
    await render({
      active: true,
      boardRef,
      pause: false,
      pointer: { x: 500, y: 200 },
    });
    await raf.flush();
    expect(board.scrollLeft).toBe(600);
    expect(raf.pending()).toBe(0);
  });

  it.each([
    {
      name: 'center',
      active: true,
      pause: false,
      pointer: { x: 300, y: 200 },
      scrollLeft: 100,
    },
    {
      name: 'right boundary',
      active: true,
      pause: false,
      pointer: { x: 500, y: 200 },
      scrollLeft: 600,
    },
    {
      name: 'left boundary',
      active: true,
      pause: false,
      pointer: { x: 100, y: 200 },
      scrollLeft: 0,
    },
    {
      name: 'paused',
      active: true,
      pause: true,
      pointer: { x: 500, y: 200 },
      scrollLeft: 100,
    },
    {
      name: 'inactive',
      active: false,
      pause: false,
      pointer: { x: 500, y: 200 },
      scrollLeft: 100,
    },
    {
      name: 'null pointer',
      active: true,
      pause: false,
      pointer: null,
      scrollLeft: 100,
    },
  ])('does not schedule movement when $name', async ({
    active,
    pause,
    pointer,
    scrollLeft,
  }) => {
    const raf = installRafController();
    const board = createBoard({ scrollLeft });
    const boardRef = { current: board };

    await render({ active, boardRef, pause, pointer });

    expect(raf.pending()).toBe(0);
    expect(board.scrollLeft).toBe(scrollLeft);
  });

  it('calls onScrolled only after an actual board scroll', async () => {
    const raf = installRafController();
    const onScrolled = vi.fn();
    const board = createBoard({ scrollLeft: 598 });
    const boardRef = { current: board };

    await render({
      active: true,
      boardRef,
      onScrolled,
      pause: false,
      pointer: { x: 500, y: 200 },
    });
    await raf.flush();
    expect(board.scrollLeft).toBe(600);
    expect(onScrolled).toHaveBeenCalledTimes(1);

    await raf.flush();
    expect(onScrolled).toHaveBeenCalledTimes(1);
  });

  it('cancels on pause, inactivity, element change, and unmount', async () => {
    const raf = installRafController();
    const first = createBoard({ scrollLeft: 100 });
    const second = createBoard({ scrollLeft: 200 });
    const firstRef = { current: first };
    const secondRef = { current: second };
    const base = {
      active: true,
      boardRef: firstRef,
      pause: false,
      pointer: { x: 500, y: 200 },
    };

    await render(base);
    expect(raf.pending()).toBe(1);
    await render({ ...base, pause: true });
    expect(raf.pending()).toBe(0);
    expect(raf.cancel).toHaveBeenCalledTimes(1);

    await render(base);
    await render({ ...base, active: false });
    expect(raf.pending()).toBe(0);

    await render(base);
    await render({ ...base, boardRef: secondRef });
    expect(raf.pending()).toBe(1);
    await raf.flush();
    expect(first.scrollLeft).toBe(100);
    expect(second.scrollLeft).toBe(212);

    await act(async () => root?.unmount());
    root = null;
    expect(raf.pending()).toBe(0);
  });

  it('restarts from the latest pointer after center, boundary, and pause', async () => {
    const raf = installRafController();
    const board = createBoard({ scrollLeft: 600 });
    const boardRef = { current: board };
    const base = { active: true, boardRef, pause: false };

    await render({ ...base, pointer: { x: 300, y: 200 } });
    expect(raf.pending()).toBe(0);

    board.scrollLeft = 100;
    await render({ ...base, pointer: { x: 492, y: 200 } });
    expect(raf.pending()).toBe(1);
    await raf.flush();
    expect(board.scrollLeft).toBe(110.5);

    await render({ ...base, pause: true, pointer: { x: 492, y: 200 } });
    expect(raf.pending()).toBe(0);
    await render({ ...base, pointer: { x: 492, y: 200 } });
    expect(raf.pending()).toBe(1);
  });

  it('wakes from a stopped boundary when the Board is externally scrolled without rerender', async () => {
    const raf = installRafController();
    const board = createBoard({ scrollLeft: 600 });
    const boardRef = { current: board };

    await render({
      active: true,
      boardRef,
      pause: false,
      pointer: { x: 500, y: 200 },
    });
    expect(raf.pending()).toBe(0);

    board.scrollLeft = 500;
    board.dispatchEvent(new Event('scroll'));

    expect(raf.pending()).toBe(1);
    await raf.flush();
    expect(board.scrollLeft).toBe(512);
  });

  it('wakes from a mutated pointer ref without rerender and deduplicates pending frames', async () => {
    const raf = installRafController();
    const board = createBoard({ scrollLeft: 100 });
    const boardRef = { current: board };
    const pointerRef = {
      current: { x: 300, y: 200 },
    };

    await render({
      active: true,
      boardRef,
      pause: false,
      pointer: pointerRef.current,
      pointerRef,
    });
    expect(raf.pending()).toBe(0);

    pointerRef.current = { x: 500, y: 200 };
    latestWake?.();
    latestWake?.();
    latestWake?.();

    expect(latestWake).toEqual(expect.any(Function));
    expect(raf.pending()).toBe(1);
    await raf.flush();
    expect(board.scrollLeft).toBe(112);
    expect(raf.pending()).toBe(1);
  });

  it('keeps one pending frame when its own scroll write emits a Board scroll event', async () => {
    const raf = installRafController();
    const board = createBoard({
      dispatchScrollOnWrite: true,
      scrollLeft: 100,
    });

    await render({
      active: true,
      boardRef: { current: board },
      pause: false,
      pointer: { x: 500, y: 200 },
    });
    expect(raf.pending()).toBe(1);

    await raf.flush();

    expect(board.scrollLeft).toBe(112);
    expect(raf.pending()).toBe(1);
  });

  it('keeps exactly one pending frame under StrictMode', async () => {
    const raf = installRafController();
    const boardRef = { current: createBoard({ scrollLeft: 100 }) };

    await render({
      active: true,
      boardRef,
      pause: false,
      pointer: { x: 500, y: 200 },
    }, true);

    expect(raf.pending()).toBe(1);
    await raf.flush();
    expect(raf.pending()).toBe(1);
    expect(boardRef.current.scrollLeft).toBe(112);
  });
});
