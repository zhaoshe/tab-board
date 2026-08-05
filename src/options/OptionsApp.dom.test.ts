// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../shared/model';
import { OptionsApp } from './OptionsApp';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  hydrated: true,
  persistenceError: null as string | null,
  saveStatus: 'idle' as 'loading' | 'idle' | 'saving' | 'saved' | 'error',
  retryLastFailedMutation: vi.fn(),
  updateSettings: vi.fn(),
  settings: {} as typeof DEFAULT_SETTINGS,
}));

vi.mock('./hooks/useOptionsSettings', () => ({
  useOptionsSettings: () => ({
    hydrated: harness.hydrated,
    settings: harness.settings,
    persistenceError: harness.persistenceError,
    saveStatus: harness.saveStatus,
    projection: {
      settings: harness.settings,
      mutationRevision: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    retryLastFailedMutation: harness.retryLastFailedMutation,
    updateSettings: harness.updateSettings,
  }),
}));
vi.mock('../shared/hooks/usePreferredColorScheme', () => ({
  usePreferredColorScheme: () => 'dark',
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

async function openAdvanced(): Promise<HTMLDetailsElement> {
  const advanced = document.querySelector<HTMLDetailsElement>('details');
  if (!advanced) throw new Error('Advanced Settings disclosure was not rendered.');
  await act(async () => {
    await import('./components/AdvancedSettingsContent');
    advanced.open = true;
    advanced.dispatchEvent(new Event('toggle'));
    await Promise.resolve();
  });
  await vi.waitFor(() => {
    expect(advanced.textContent).toContain('Storage location');
  });
  return advanced;
}

function setTextareaValue(element: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  history.replaceState(null, '', '/options.html');
  harness.hydrated = true;
  harness.persistenceError = null;
  harness.saveStatus = 'idle';
  harness.retryLastFailedMutation.mockReset();
  harness.updateSettings.mockReset();
  harness.settings = { ...DEFAULT_SETTINGS };
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn(async () => ({ ok: true })) },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
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
  vi.useRealTimers();
});

describe('OptionsApp information architecture', () => {
  it('follows dark theme and renders settings inside one main landmark', async () => {
    await mountOptions();

    expect(document.documentElement.dataset.mantineColorScheme).toBe('dark');
    expect(document.querySelector('main h1')?.textContent).toBe('TabBoard Settings');
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('Configure how TabBoard works');
    expect(document.querySelector('.options-save-status')).not.toBeNull();
  });

  it('removes dashboard stats and labels grouped controls', async () => {
    await mountOptions();

    expect(document.body.textContent).not.toContain('Saved groups');
    expect(document.body.textContent).not.toContain('Saved tabs');
    const toolbarGroup = document.querySelector<HTMLElement>('[role="radiogroup"]');
    const toolbarLabelId = toolbarGroup?.getAttribute('aria-labelledby');
    expect(toolbarLabelId).toBeTruthy();
    expect(document.getElementById(toolbarLabelId!)?.textContent)
      .toBe('When the toolbar button is clicked');
    expect(document.querySelector('.mantine-RadioGroup-root')?.hasAttribute('aria-label')).toBe(false);
    expect(document.querySelector(
      '[role="radiogroup"][aria-label="Theme preference"].options-theme-control',
    )).not.toBeNull();
  });

  it('renders the settings shell immediately and disables controls during hydration', async () => {
    harness.hydrated = false;
    await mountOptions();

    expect(document.querySelector('main')).not.toBeNull();
    expect(document.querySelector('.options-header h1')?.textContent)
      .toBe('TabBoard Settings');
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Loading settings…');
    const basic = document.querySelector<HTMLFieldSetElement>('fieldset.options-basic');
    expect(basic?.disabled).toBe(true);
    expect(basic?.getAttribute('aria-busy')).toBe('true');
    expect(document.querySelector('details.options-advanced')).toBeNull();
    expect([...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Open Manager')?.disabled)
      .toBe(false);
  });

  it('names settings controls and uses an example placeholder with an ellipsis', async () => {
    await mountOptions();

    const filter = document.querySelector<HTMLTextAreaElement>('textarea[name="custom-url-filter"]');
    expect(filter?.placeholder).toBe('example.com, chrome://newtab…');
    expect(filter?.closest('.mantine-Textarea-root')?.textContent)
      .toContain('Exclude URL rules');
    expect(filter?.closest('.mantine-Textarea-root')?.textContent)
      .toContain(
        'Matching tabs are hidden from Open Tabs and excluded from selection, drag, and save. Separate URL keywords with commas or new lines.',
      );
    expect(document.querySelector<HTMLInputElement>('input[name="close-tabs-after-save"]')).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>(
      'input[name="open-manager-after-save"]',
    )?.closest('.mantine-Switch-root')?.textContent)
      .toContain('Show the manager after capturing tabs.');
    expect(document.querySelector<HTMLInputElement>(
      'input[name="delete-restored-tabs"]',
    )?.closest('.mantine-Switch-root')?.textContent)
      .toContain('Remove restored items from the session.');
    expect(document.querySelector<HTMLInputElement>(
      'input[name="focus-restored-tabs"]',
    )?.closest('.mantine-Switch-root')?.textContent)
      .toContain('Bring focus to the first newly opened tab.');
    await openAdvanced();
    expect(document.querySelector<HTMLInputElement>(
      'input[name="confirm-before-destructive"]',
    )?.getAttribute('aria-label')).toBe('Confirm before dangerous operations');
  });

  it('aligns Capture switch controls on the right in stable setting rows', async () => {
    await mountOptions();

    const switches = [
      'close-tabs-after-save',
      'open-manager-after-save',
      'dedupe-on-save',
    ].map((name) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`));
    expect(switches.every(Boolean)).toBe(true);
    for (const input of switches) {
      const row = input?.closest('.options-switch-row');
      expect(row).not.toBeNull();
      expect(row?.querySelector('.mantine-Switch-root')).not.toBeNull();
    }

    const css = readFileSync(
      resolve(process.cwd(), 'src/options/options.css'),
      'utf8',
    );
    expect(css).toMatch(
      /\.options-switch-row\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*space-between;/,
    );
    expect(css).toMatch(
      /\.options-switch-row \.mantine-Switch-root\s*\{[^}]*margin-inline-start:\s*auto;/,
    );
  });

  it('keeps one stable page-level save status', async () => {
    await mountOptions();
    expect(document.querySelector('.options-save-status[role="status"]')?.textContent)
      .toContain('Saved');

    const toggle = document.querySelector<HTMLInputElement>(
      'input[name="close-tabs-after-save"]',
    );
    await act(async () => toggle?.click());

    expect(document.querySelector('.options-save-status[role="status"]')?.textContent)
      .toContain('Saved');
    expect(harness.updateSettings).toHaveBeenCalledTimes(1);
  });

  it('reflects the authoritative save queue and retries failed settings', async () => {
    harness.saveStatus = 'saving';
    await mountOptions();
    expect(document.querySelector('.options-save-status[role="status"]')?.textContent)
      .toContain('Saving…');

    await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;

    harness.saveStatus = 'error';
    harness.persistenceError = 'Storage unavailable';
    await mountOptions();
    expect(document.querySelector('.options-save-status[role="status"]')?.textContent)
      .toContain('Could not save');
    const retry = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Retry');
    await act(async () => retry?.click());
    expect(harness.retryLastFailedMutation).toHaveBeenCalledTimes(1);
  });

  it('gives the compact Retry action a full touch target', async () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/options/options.css'),
      'utf8',
    );
    expect(css).toMatch(
      /@media \(max-width: 40em\)[\s\S]*?\.options-save-retry\s*\{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/,
    );
  });

  it('debounces long-text settings and commits only the latest draft', async () => {
    vi.useFakeTimers();
    await mountOptions();
    const filter = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="custom-url-filter"]',
    )!;

    await act(async () => {
      setTextareaValue(filter, 'first.example');
      setTextareaValue(filter, 'latest.example');
    });

    expect(harness.updateSettings).not.toHaveBeenCalled();
    expect(document.querySelector('.options-save-status')?.textContent)
      .toContain('Saving…');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(harness.updateSettings).toHaveBeenCalledTimes(1);
    expect(harness.updateSettings).toHaveBeenCalledWith({
      customUrlFilter: 'latest.example',
    });
    expect(document.querySelector('.options-save-status')?.textContent)
      .toContain('Saved');
  });

  it('flushes a pending text draft on blur without a later duplicate save', async () => {
    vi.useFakeTimers();
    await mountOptions();
    const filter = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="custom-url-filter"]',
    )!;

    await act(async () => {
      setTextareaValue(filter, 'blur.example');
      filter.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    expect(harness.updateSettings).toHaveBeenCalledTimes(1);
    expect(harness.updateSettings).toHaveBeenCalledWith({
      customUrlFilter: 'blur.example',
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(harness.updateSettings).toHaveBeenCalledTimes(1);
  });

  it('surfaces persistence errors in the stable save status', async () => {
    harness.persistenceError = 'Storage unavailable';
    await mountOptions();

    expect(document.querySelector('.options-save-status[role="status"]')?.textContent)
      .toContain('Could not save');
  });

  it('renders Basic settings as unframed sections instead of cards', async () => {
    await mountOptions();

    expect(document.querySelectorAll('.options-basic .options-settings-section'))
      .toHaveLength(4);
    expect(document.querySelector('.options-basic .mantine-Card-root')).toBeNull();
    const css = readFileSync(
      resolve(process.cwd(), 'src/options/options.css'),
      'utf8',
    );
    expect(css).toMatch(
      /\.options-page-container\s*\{[^}]*max-width:\s*680px;/,
    );
    expect(css).not.toContain('.options-action-primary');
  });

  it('defers storage controls until Advanced Settings opens', async () => {
    await mountOptions();

    const advanced = document.querySelector<HTMLDetailsElement>('details');
    expect(advanced?.querySelector('summary')?.textContent).toBe('Advanced Settings');
    expect(advanced?.textContent).not.toContain('Storage location');
    expect(advanced?.textContent).not.toContain('Confirm before dangerous operations');

    await openAdvanced();
    expect(advanced?.textContent).toContain('Storage location');
    expect(advanced?.textContent).toContain('Confirm before dangerous operations');
    expect(advanced?.textContent)
      .toContain('Ask before closing browser tabs, deleting saved data or structure, permanently deleting Trash items, and resetting settings.');
    expect(advanced?.textContent).toContain('Open Keyboard Shortcuts');
    expect(advanced?.textContent).toContain('Reset to Defaults');
    expect(advanced?.textContent)
      .toContain('Configure Save and Open Manager commands in Chrome.');
    expect(advanced?.textContent)
      .toContain(
        'Restore defaults. Saved sessions and local folder files remain unchanged.',
      );
    expect(advanced?.querySelector('.options-action-danger')?.textContent)
      .toContain('Reset to Defaults');
  });

  it('renders Advanced as four direct setting rows without one-item section wrappers', async () => {
    await mountOptions();
    const advanced = await openAdvanced();
    const rows = advanced.querySelectorAll('.options-advanced-sections > section');

    expect(rows).toHaveLength(4);
    expect([...rows].map((row) => row.querySelector('h2')?.textContent))
      .toEqual([
        'Storage location',
        'Confirm before dangerous operations',
        'Keyboard shortcuts',
        'Reset settings',
      ]);
    expect(advanced.querySelectorAll('.options-settings-section')).toHaveLength(0);
    expect(advanced.textContent).not.toContain('Safety');
    expect(advanced.textContent).not.toContain('Recovery');
    expect(advanced.querySelectorAll('.mantine-Card-root')).toHaveLength(0);
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
    await openAdvanced();
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

  it('resets settings directly when dangerous-operation confirmation is off', async () => {
    harness.settings = {
      ...DEFAULT_SETTINGS,
      confirmBeforeDestructive: false,
    };
    await mountOptions();
    await openAdvanced();
    const reset = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Reset to Defaults');
    await act(async () => reset?.click());

    expect(harness.updateSettings).toHaveBeenCalledWith(DEFAULT_SETTINGS);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('restores focus to Reset to Defaults after cancelling confirmation', async () => {
    await mountOptions();
    await openAdvanced();
    const reset = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Reset to Defaults');
    await act(async () => reset?.click());

    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Cancel');
    await act(async () => cancel?.click());

    await vi.waitFor(() => expect(document.activeElement).toBe(reset));
  });
});
