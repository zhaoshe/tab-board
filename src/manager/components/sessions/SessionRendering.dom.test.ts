// @vitest-environment happy-dom
import { act, createElement, useState, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { DndContext, useDndContext } from '@dnd-kit/core';
import type { ManagerRuntime } from '../../hooks/useManagerRuntime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGroupFromTabRecords, createTabRecord, type TabItem } from '../../../shared/model';
import { DestructiveConfirmationProvider } from '../../../shared/components/DestructiveConfirmation';
import { ToastProvider } from '../../hooks/useToast';
import { ManagerOverlaysProvider, ManagerOverlayPortal } from '../../hooks/useManagerOverlays';
import { SessionSlot } from './SessionSlot';
import { SessionTabList } from './SessionTabList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
const observers: Array<{ callback: IntersectionObserverCallback; elements: Set<Element> }> = [];
const links = Array.from({ length: 3000 }, (_, index) => createTabRecord({
  title: `Link ${index}`, url: `https://example.com/${index}`,
}, { id: `link-${index}` }));
const runtimeCalls = { restoreTab: vi.fn(), openSavedTab: vi.fn() };
const runtime = runtimeCalls as unknown as ManagerRuntime;
let dnd: ReturnType<typeof useDndContext>;
function DndProbe() { dnd = useDndContext(); return null; }
const commands = { confirmBeforeDestructive: false, deleteTab: vi.fn(), updateTab: vi.fn() };

beforeEach(() => {
  observers.length = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('IntersectionObserver', class {
    state: typeof observers[number];
    constructor(callback: IntersectionObserverCallback) {
      this.state = { callback, elements: new Set() };
      observers.push(this.state);
    }
    observe(element: Element) { this.state.elements.add(element); }
    unobserve(element: Element) { this.state.elements.delete(element); }
    disconnect() { this.state.elements.clear(); }
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(content: React.ReactNode) {
  await act(async () => root.render(createElement(MantineProvider, null,
    createElement(ToastProvider, null, createElement(DestructiveConfirmationProvider, null,
      createElement(ManagerOverlaysProvider, null, createElement(DndContext, null, createElement(DndProbe), content), createElement(ManagerOverlayPortal)))))));

}
async function outside(element: Element) {
  await act(async () => {
    for (const observer of observers) {
      if (observer.elements.has(element)) observer.callback([
        { target: element, isIntersecting: false } as IntersectionObserverEntry,
      ], {} as IntersectionObserver);
    }
  });
}
function list(tabs: TabItem[] = links, extra: Partial<ComponentProps<typeof SessionTabList>> = {}) {
  return createElement(SessionTabList, {
    canonicalIndexByTabId: new Map(links.map((tab, index) => [tab.id, index])), commands,
    dragMarker: null, groupId: 'large', isDragOverlay: false, locked: false,
    overflowCues: { blockStart: false, blockEnd: false, inlineStart: false, inlineEnd: false },
    overflowRef: () => {}, runtime, searchActive: false, selectedRefs: [], selectedTabIds: new Set<string>(),
    savedLinkRestoreTooltip: 'Open and remove saved link',
    selectionMode: false, sourceRect: null, tabs, workspaceId: 'workspace',
    onStartSelection: () => {}, onToggleSelection: () => {}, ...extra,
  });
}
function rowSlot(id: string) {
  const slot = container.querySelector(`[data-session-row-id="${id}"]`);
  expect(slot).not.toBeNull();
  return slot!;
}

describe('bounded session links', () => {
  it('mounts a bounded first screen for 3000 links while preserving every responsive height slot', async () => {
    await render(list());
    expect(container.querySelectorAll('.tab-item-row').length).toBeLessThanOrEqual(24);
    expect(container.querySelectorAll('[data-session-row-id]')).toHaveLength(3000);
    expect((rowSlot('link-2999') as HTMLElement).style.minHeight).toBe('var(--session-link-row-height)');
    expect((rowSlot('link-0') as HTMLElement).style.minHeight)
      .toBe((rowSlot('link-2999') as HTMLElement).style.minHeight);
  });
  it('keeps the focused row outside overscan and releases it after focus leaves', async () => {
    await render(list());
    const title = container.querySelector<HTMLButtonElement>('.tab-item-row__title')!;
    await act(async () => title.focus());
    await outside(rowSlot('link-0'));
    expect(document.activeElement).toBe(title);
    expect(container.querySelector('[data-tab-id="link-0"]')).not.toBeNull();
    await act(async () => title.blur());
    expect(container.querySelector('[data-tab-id="link-0"]')).toBeNull();
  });
  it('activates a skipped link on keyboard focus and transfers focus to its real title', async () => {
    await render(list());
    const skipped = rowSlot('link-2999').querySelector<HTMLButtonElement>('button')!;
    await act(async () => skipped.focus());
    const title = rowSlot('link-2999').querySelector<HTMLButtonElement>('.tab-item-row__title');
    expect(title).not.toBeNull();
    expect(document.activeElement).toBe(title);
    await act(async () => title!.click());
    expect(runtimeCalls.restoreTab).toHaveBeenCalledWith('large', 'link-2999');
    await act(async () => title!.blur());
    expect(rowSlot('link-2999').querySelector('.tab-item-row')).toBeNull();
  });
  it('retains selected offscreen links and returns to the window after selection release', async () => {
    await render(list(links, { selectedTabIds: new Set(['link-2999']) }));
    expect(container.querySelector('[data-tab-id="link-2999"]')).not.toBeNull();
    await outside(rowSlot('link-2999'));
    await render(list());
    expect(container.querySelector('[data-tab-id="link-2999"]')).toBeNull();
  });
  it('uses the annotated link geometry for full and skipped rows without keeping notes active', async () => {
    const noteText = 'Keep this saved context visible across multiple wrapped lines. '.repeat(4);
    const annotated = links.map((tab, index) => index === 0 || index === 2999 ? { ...tab, note: noteText } : tab);
    await render(list(annotated));
    const first = rowSlot('link-0') as HTMLElement;
    const skipped = rowSlot('link-2999') as HTMLElement;
    expect(first.dataset.linkNote).toBe('true');
    expect(skipped.dataset.linkNote).toBe('true');
    expect(first.style.minHeight).toBe(skipped.style.minHeight);
    expect(first.querySelector('.tab-item-row__note')?.textContent).toBe(noteText);
    await outside(first);
    expect(first.querySelector('.tab-item-row')).toBeNull();
    expect(first.dataset.linkNote).toBe('true');
    await act(async () => skipped.querySelector<HTMLButtonElement>('button')!.focus());
    expect(skipped.querySelector('.tab-item-row__note')?.textContent).toBe(noteText);
    await act(async () => skipped.querySelector<HTMLButtonElement>('.tab-item-row__title')!.blur());
    expect(skipped.querySelector('.tab-item-row')).toBeNull();
  });
  it('keeps variable height notes mounted outside the link window', async () => {
    const note = { ...links[2999], id: 'note', itemType: 'note' as const, note: 'Long note\n'.repeat(30) };
    await render(list([...links, note]));
    await outside(rowSlot('note'));
    expect(rowSlot('note').querySelector('.tab-item-row')).not.toBeNull();
    expect((rowSlot('note') as HTMLElement).style.minHeight).toBe('');
  });
  it('shows matching links from the canonical tail immediately after search filtering', async () => {
    await render(list());
    await render(list([links[2999]], { searchActive: true }));
    expect(container.querySelector('[data-tab-id="link-2999"]')?.textContent).toContain('Link 2999');
    expect(dnd.droppableContainers.get('tab-large-link-2999')?.data.current?.dnd?.targets[0]?.index).toBe(2999);
  });
});

const group = { ...createGroupFromTabRecords([links[0]], { workspaceId: 'workspace', title: 'Owner' }), id: 'owner' };
function CardProbe({ interactive }: { interactive: boolean }) {
  const [selected, setSelected] = useState(false);
  return createElement(SessionSlot, {
    group, groupCategory: 'inbox', groupIndex: 0, highlighted: false, interactive,
    activate: () => {}, registerSlot: () => {}, runtime, searchQuery: '', dragMarker: null,
    sourceRect: null, onOpenSessionTargetPicker: () => {},
    selectionScope: { scope: selected ? { kind: 'saved-tabs', groupId: group.id } : null,
      commands: { enterSavedTabs: () => setSelected(true), enterOpenTabs: () => {}, exit: () => setSelected(false) },
      registerSavedTabsClear: () => () => {}, registerOpenTabsClear: () => () => {} },
  });
}
describe('session interaction owners', () => {
  it('transfers shell keyboard focus to the full card and releases the owner on blur', async () => {
    await render(createElement(CardProbe, { interactive: false }));
    const shellTitle = container.querySelector<HTMLButtonElement>('.session-card__title')!;
    await act(async () => shellTitle.focus());
    const title = container.querySelector<HTMLButtonElement>('.session-card__title')!;
    expect(document.activeElement).toBe(title);
    expect(container.querySelector('[data-session-shell]')).toBeNull();
    await act(async () => title.blur());
    expect(container.querySelector('[data-session-shell]')).not.toBeNull();
  });
  it('keeps a focused card outside overscan and releases it on blur', async () => {
    await render(createElement(CardProbe, { interactive: true }));
    const card = container.querySelector<HTMLElement>('.session-card')!;
    await act(async () => card.focus());
    await render(createElement(CardProbe, { interactive: false }));
    expect(document.activeElement).toBe(card);
    expect(container.querySelector('[data-session-shell]')).toBeNull();
    await act(async () => card.blur());
    expect(container.querySelector('[data-session-shell]')).not.toBeNull();
  });
  it('retains a row note draft after focus leaves, then releases its card after Cancel', async () => {
    await render(createElement(CardProbe, { interactive: true }));
    const title = container.querySelector('.tab-item-row__title')!;
    await act(async () => title.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    const addNote = document.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Add Note"]')
      ?? [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent?.includes('Add Note'))!;
    await act(async () => addNote.click());
    const input = container.querySelector<HTMLTextAreaElement>('textarea[name="saved-tab-note"]')!;
    expect(input).not.toBeNull();
    await act(async () => input.blur());
    await render(createElement(CardProbe, { interactive: false }));
    expect(container.querySelector('textarea[name="saved-tab-note"]')).toBe(input);
    const cancel = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Cancel')!;
    await act(async () => cancel.click());
    expect(container.querySelector('[data-session-shell]')).not.toBeNull();
  });
  it('retains a mouse opened saved menu and releases its card after the overlay closes', async () => {
    await render(createElement(CardProbe, { interactive: true }));
    const title = container.querySelector('.tab-item-row__title')!;
    await act(async () => title.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    await render(createElement(CardProbe, { interactive: false }));
    expect(container.querySelector('[data-session-shell]')).toBeNull();
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('[data-session-shell]')).not.toBeNull();
  });
  it('keeps a title draft when focus moves away and the viewport deactivates its card', async () => {
    await render(createElement(CardProbe, { interactive: true }));
    const title = container.querySelector('.session-card__title')!;
    await act(async () => title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    const input = container.querySelector<HTMLInputElement>('input')!;
    expect(input).not.toBeNull();
    // Blurring title intentionally submits; a focused editor itself must survive viewport changes.
    await render(createElement(CardProbe, { interactive: false }));
    expect(container.querySelector('input')).toBe(input);
    expect(document.activeElement).toBe(input);
  });
});
