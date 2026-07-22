// @vitest-environment happy-dom
import {
  act,
  createElement,
  Fragment,
  type ReactNode,
  useRef,
  useState,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGER_HOVER_SUPPRESSED_ATTRIBUTE,
  ManagerOverlayPortal,
  ManagerOverlaysProvider,
  useManagerInfoTrigger,
  useManagerOverlayController,
  type ManagerOverlaysController,
} from './useManagerOverlays';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface RafController {
  cancel: ReturnType<typeof vi.fn>;
  flush: () => Promise<void>;
  pending: () => number;
}

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
  };
}

function setGeometry(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
    if (this.matches('[data-info-popover]')) {
      return {
        x: 20,
        y: 30,
        top: 30,
        right: 120,
        bottom: 60,
        left: 20,
        width: 100,
        height: 30,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return {
      x: 0,
      y: 0,
      top: 0,
      right: 240,
      bottom: 100,
      left: 0,
      width: 240,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

interface MountedOverlay {
  container: HTMLDivElement;
  root: Root;
  trigger: HTMLButtonElement;
  controller: ManagerOverlaysController;
  removeTrigger: () => void;
}

let activeMount: MountedOverlay | null = null;

function OverlayHarness({ onReady }: { onReady: (value: { trigger: HTMLButtonElement; controller: ManagerOverlaysController; removeTrigger: () => void }) => void }): ReactNode {
  const [isTriggerVisible, setTriggerVisible] = useState(true);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const controller = useManagerOverlayController();
  const registerInfoTrigger = useManagerInfoTrigger('preview-key', {
    kind: 'open',
    model: {
      title: 'Preview',
      url: 'https://example.test/page',
      actions: createElement('button', { type: 'button' }, 'Preview action'),
    },
  });

  const setTrigger = (element: HTMLButtonElement | null): void => {
    triggerRef.current = element;
    registerInfoTrigger(element);
    if (element) onReady({ trigger: element, controller, removeTrigger: () => setTriggerVisible(false) });
  };

  return createElement(
    Fragment,
    null,
    isTriggerVisible
      ? createElement('button', {
          ref: setTrigger,
          type: 'button',
          'data-info-key': 'preview-key',
          'data-info-popover': 'open',
        }, 'Preview')
      : null,
    createElement(ManagerOverlayPortal),
  );
}

async function mountOverlay(): Promise<MountedOverlay> {
  const container = document.createElement('div');
  document.body.append(container);
  let ready: { trigger: HTMLButtonElement; controller: ManagerOverlaysController; removeTrigger: () => void } | null = null;
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(
      ManagerOverlaysProvider,
      null,
      createElement(OverlayHarness, { onReady: (value) => { ready = value; } }),
    ));
  });
  const readyValue = ready as { trigger: HTMLButtonElement; controller: ManagerOverlaysController; removeTrigger: () => void } | null;
  if (!readyValue) throw new Error('Overlay harness did not mount.');
  const mounted: MountedOverlay = {
    container,
    root,
    trigger: readyValue.trigger,
    controller: readyValue.controller,
    removeTrigger: readyValue.removeTrigger,
  };
  activeMount = mounted;
  return mounted;
}

async function unmountOverlay(mounted: MountedOverlay): Promise<void> {
  await act(async () => mounted.root.unmount());
  mounted.container.remove();
  if (activeMount === mounted) activeMount = null;
}

function dispatchEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
}

beforeEach(() => {
  vi.useFakeTimers();
  setGeometry();
  document.body.innerHTML = '';
});

afterEach(async () => {
  if (activeMount) await unmountOverlay(activeMount);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mounted manager overlay behavior', () => {
  it('restores trigger focus after focusin, keyboard click, and Escape only after preview unmounts', async () => {
    const raf = installRafController();
    const mounted = await mountOverlay();

    await act(async () => mounted.trigger.focus());
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();

    await act(async () => {
      mounted.trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    });
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.manager-info-popover button')?.focus();
    });
    expect(document.activeElement).not.toBe(mounted.trigger);

    await act(async () => dispatchEscape());
    expect(document.querySelector('.manager-info-popover')).toBeNull();
    expect(document.activeElement).not.toBe(mounted.trigger);
    expect(raf.pending()).toBe(1);

    await raf.flush();
    expect(document.activeElement).toBe(mounted.trigger);

    await unmountOverlay(mounted);
  });

  it('does not restore focus after pointer click or hover preview close', async () => {
    const raf = installRafController();
    const mounted = await mountOverlay();

    await act(async () => {
      mounted.trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    expect(document.querySelector('.manager-info-popover')).toBeNull();
    expect(raf.pending()).toBe(0);
    expect(document.activeElement).not.toBe(mounted.trigger);

    await act(async () => {
      mounted.trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
    });
    await act(async () => vi.advanceTimersByTime(180));
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();
    await act(async () => {
      mounted.trigger.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    });
    await act(async () => vi.advanceTimersByTime(120));
    expect(document.querySelector('.manager-info-popover')).toBeNull();
    expect(raf.pending()).toBe(0);
    expect(document.activeElement).not.toBe(mounted.trigger);

    await unmountOverlay(mounted);
  });

  it('restores keyboard menu focus and cancels stale restoration after pointer interaction', async () => {
    const raf = installRafController();
    const mounted = await mountOverlay();

    await act(async () => {
      mounted.controller.openMenu({
        id: 'menu-key',
        kind: 'open-tab',
        anchor: { x: 10, y: 10 },
        content: createElement('button', { role: 'menuitem', type: 'button' }, 'Action'),
        trigger: mounted.trigger,
        openedByKeyboard: true,
      });
    });
    expect(document.querySelector('.manager-overlay-menu')).not.toBeNull();

    await act(async () => dispatchEscape());
    expect(document.querySelector('.manager-overlay-menu')).toBeNull();
    expect(raf.pending()).toBe(1);
    expect(document.activeElement).not.toBe(mounted.trigger);

    await act(async () => {
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(raf.cancel).toHaveBeenCalled();
    await raf.flush();
    expect(document.activeElement).not.toBe(mounted.trigger);

    await unmountOverlay(mounted);
  });

  it('closes a menu when its trigger is disconnected during measurement', async () => {
    const mounted = await mountOverlay();

    await act(async () => {
      mounted.controller.openMenu({
        id: 'menu-disconnected-trigger',
        kind: 'open-tab',
        anchor: { x: 10, y: 10 },
        content: createElement('button', { role: 'menuitem', type: 'button' }, 'Action'),
        trigger: mounted.trigger,
      });
    });
    expect(document.querySelector('.manager-overlay-menu')).not.toBeNull();

    await act(async () => mounted.removeTrigger());

    expect(document.querySelector('.manager-overlay-menu')).toBeNull();
    await unmountOverlay(mounted);
  });

  it('suppresses stale hover previews across window blur until real pointer movement', async () => {
    const mounted = await mountOverlay();

    await act(async () => {
      mounted.trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
    });
    await act(async () => vi.advanceTimersByTime(180));
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new FocusEvent('blur'));
    });
    expect(document.documentElement.hasAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE)).toBe(true);
    expect(document.querySelector('.manager-info-popover')).toBeNull();

    await act(async () => {
      window.dispatchEvent(new FocusEvent('focus'));
      mounted.trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
      mounted.trigger.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        movementX: 0,
        movementY: 0,
      }));
      vi.advanceTimersByTime(180);
    });
    expect(document.documentElement.hasAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE)).toBe(true);
    expect(document.querySelector('.manager-info-popover')).toBeNull();

    await act(async () => {
      mounted.trigger.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        movementX: 1,
        movementY: 0,
      }));
      vi.advanceTimersByTime(180);
    });
    expect(document.documentElement.hasAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE)).toBe(false);
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();

    await unmountOverlay(mounted);
  });
});
