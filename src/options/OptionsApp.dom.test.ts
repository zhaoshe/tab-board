// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../shared/model';
import { OptionsApp } from './OptionsApp';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  hydrated: true,
  updateSettings: vi.fn(),
  settings: {} as typeof DEFAULT_SETTINGS,
}));

vi.mock('../shared/store/useTabBoardStore', () => ({
  useTabBoardStore: (selector: (state: unknown) => unknown) => selector({
    settings: harness.settings,
    groups: [],
    updateSettings: harness.updateSettings,
  }),
}));
vi.mock('../shared/hooks/useStoreHydration', () => ({
  useStoreHydration: () => ({ hydrated: harness.hydrated }),
}));
vi.mock('../shared/hooks/useColorScheme', () => ({
  useColorScheme: () => 'dark',
}));
vi.mock('./components/DataStorageCard', () => ({
  DataStorageCard: () => createElement('section', { 'aria-label': 'Data Storage' }, 'Data Storage'),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mountOptions(): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(OptionsApp));
  });
}

beforeEach(() => {
  history.replaceState(null, '', '/options.html');
  harness.hydrated = true;
  harness.updateSettings.mockReset();
  harness.settings = { ...DEFAULT_SETTINGS };
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn(async () => ({ ok: true })) },
    tabs: { create: vi.fn(async () => undefined) },
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('OptionsApp information architecture', () => {
  it('follows dark theme and renders settings inside one main landmark', async () => {
    await mountOptions();

    expect(document.documentElement.dataset.mantineColorScheme).toBe('dark');
    expect(document.querySelector('main h1')?.textContent).toBe('TabBoard Settings');
    expect(document.querySelectorAll('main')).toHaveLength(1);
  });

  it('removes dashboard stats and labels grouped controls', async () => {
    await mountOptions();

    expect(document.body.textContent).not.toContain('Saved groups');
    expect(document.body.textContent).not.toContain('Saved tabs');
    const toolbarGroup = document.querySelector<HTMLElement>('[role="radiogroup"]');
    const toolbarLabelId = toolbarGroup?.getAttribute('aria-labelledby');
    expect(toolbarLabelId).toBeTruthy();
    expect(document.getElementById(toolbarLabelId!)?.textContent).toBe('Extension button behavior');
    expect(document.querySelector('.mantine-RadioGroup-root')?.hasAttribute('aria-label')).toBe(false);
    expect(document.querySelector(
      '[role="radiogroup"][aria-label="Theme preference"].options-theme-control',
    )).not.toBeNull();
  });

  it('renders a visible hydration status instead of a blank page', async () => {
    harness.hydrated = false;
    await mountOptions();

    expect(document.querySelector('main')).not.toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Loading settings…');
  });

  it('names settings controls and uses an example placeholder with an ellipsis', async () => {
    await mountOptions();

    const filter = document.querySelector<HTMLTextAreaElement>('textarea[name="custom-url-filter"]');
    expect(filter?.placeholder).toBe('example.com, chrome://newtab…');
    expect(document.querySelector<HTMLInputElement>('input[name="close-tabs-after-save"]')).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[name="confirm-before-destructive"]')).not.toBeNull();
  });

  it('mounts save feedback only while a live message is visible', async () => {
    await mountOptions();
    expect(document.querySelector('[role="status"]')).toBeNull();

    const toggle = document.querySelector<HTMLInputElement>(
      'input[name="close-tabs-after-save"]',
    );
    await act(async () => toggle?.click());

    expect(document.querySelector('[role="status"]')?.textContent)
      .toContain('Settings saved');
  });

  it('keeps storage, safety, shortcuts, and reset inside Advanced Settings', async () => {
    await mountOptions();

    const advanced = document.querySelector<HTMLDetailsElement>('details');
    expect(advanced?.querySelector('summary')?.textContent).toBe('Advanced Settings');
    expect(advanced?.textContent).toContain('Data Storage');
    expect(advanced?.textContent).toContain('Confirm before deleting saved items');
    expect(advanced?.textContent)
      .toContain('Session and saved-item deletion can skip confirmation. Closing browser tabs and permanent deletion always require confirmation.');
    expect(advanced?.textContent).toContain('Open Keyboard Shortcuts');
    expect(advanced?.textContent).toContain('Reset to Defaults');
    expect(advanced?.querySelector('.options-action-danger')?.textContent)
      .toContain('Reset to Defaults');
  });

  it('deep-links and synchronizes the Advanced Settings disclosure', async () => {
    history.replaceState(null, '', '/options.html?advanced=1');
    await mountOptions();

    const advanced = document.querySelector<HTMLDetailsElement>('details');
    expect(advanced?.open).toBe(true);

    await act(async () => {
      advanced!.open = false;
      advanced?.dispatchEvent(new Event('toggle'));
      await Promise.resolve();
    });
    expect(location.search).not.toContain('advanced=1');
  });

  it('confirms before resetting every setting', async () => {
    await mountOptions();
    const reset = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Reset to Defaults');
    await act(async () => reset?.click());

    expect(harness.updateSettings).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent)
      .toContain('Reset all settings? Saved data stays.');

    const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Reset Settings');
    await act(async () => confirm?.click());
    expect(harness.updateSettings).toHaveBeenCalledWith(DEFAULT_SETTINGS);
  });
});
