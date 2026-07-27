// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { ExportModal } from './ExportModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface MountedExportModal {
  container: HTMLDivElement;
  root: Root;
}

let activeMount: MountedExportModal | null = null;

async function mountExportModal(): Promise<MountedExportModal> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(
      MantineProvider,
      null,
      createElement(ExportModal, { opened: true, onClose: vi.fn() }),
    ));
  });
  const mounted = { container, root };
  activeMount = mounted;
  return mounted;
}

function getButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

async function clickButton(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

afterEach(async () => {
  if (activeMount) {
    await act(async () => activeMount?.root.unmount());
    activeMount.container.remove();
    activeMount = null;
  }
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ExportModal layout', () => {
  it('mounts separate scrollable content and footer regions with all export actions', async () => {
    await mountExportModal();

    const scrollRegion = document.querySelector<HTMLElement>('[data-testid="export-scroll-region"]');
    const footer = document.querySelector<HTMLElement>('[data-testid="export-footer"]');

    expect(scrollRegion).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(scrollRegion?.contains(footer ?? null)).toBe(false);
    expect(footer?.parentElement).toBe(scrollRegion?.parentElement);
    expect(scrollRegion?.querySelector('textarea[aria-label="Exported session data"]')).not.toBeNull();
    expect(footer?.querySelector('button')?.textContent).toContain('Close');
    expect(footer?.textContent).toContain('Copy');
    expect(footer?.textContent).toContain('Download');
    expect(footer?.querySelector('.manager-export-action--copy')?.textContent).toContain('Copy');
    expect(footer?.querySelector('.manager-export-action--download')?.textContent).toContain('Download');
  });

  it('names the export format and read-only data controls', async () => {
    await mountExportModal();

    expect(document.querySelector('[role="radiogroup"][aria-label="Export format"]')).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[name="export-format"]')).not.toBeNull();
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea?.name).toBe('session-export-text');
    expect(textarea?.autocomplete).toBe('off');
    expect(textarea?.getAttribute('spellcheck')).toBe('false');
  });
});

describe('ExportModal copy feedback timer', () => {
  it('keeps copy feedback active for 2000ms after consecutive copies', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    await mountExportModal();
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const copyButton = getButton('Copy');
    await clickButton(copyButton);
    expect(copyButton.textContent?.trim()).toBe('Copied!');
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Copied');

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    await clickButton(copyButton);
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    expect(copyButton.textContent?.trim()).toBe('Copied!');
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(copyButton.textContent?.trim()).toBe('Copy');
  });

  it('clears the copy feedback timer when unmounted', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const writeText = vi.fn().mockResolvedValue(undefined);
    const mounted = await mountExportModal();
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await clickButton(getButton('Copy'));
    const copyTimerIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === 2000);
    expect(copyTimerIndex).toBeGreaterThanOrEqual(0);
    const copyTimer = setTimeoutSpy.mock.results[copyTimerIndex]?.value;
    expect(copyTimer).toBeDefined();

    await act(async () => mounted.root.unmount());
    mounted.container.remove();
    activeMount = null;

    expect(clearTimeoutSpy).toHaveBeenCalledWith(copyTimer);
  });
});
