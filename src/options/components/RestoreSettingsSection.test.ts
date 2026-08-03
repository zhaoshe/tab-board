// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/model';
import { RestoreSettingsSection } from './RestoreSettingsSection';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(
  overrides: Partial<typeof DEFAULT_SETTINGS> = {},
  onChange = vi.fn(),
): Promise<typeof onChange> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      null,
      createElement(RestoreSettingsSection, {
        settings: { ...DEFAULT_SETTINGS, ...overrides },
        onChange,
      }),
    ));
  });
  return onChange;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('RestoreSettingsSection', () => {
  it('maps destination and placement controls to the existing settings booleans', async () => {
    const onChange = await mount();
    const current = document.querySelector<HTMLInputElement>(
      'input[name="restore-destination"][value="current"]',
    );
    const newWindow = document.querySelector<HTMLInputElement>(
      'input[name="restore-destination"][value="new"]',
    );
    const next = document.querySelector<HTMLInputElement>(
      'input[name="restore-placement"][value="next"]',
    );

    expect(current?.checked).toBe(true);
    expect(next?.checked).toBe(true);
    await act(async () => newWindow?.click());
    expect(onChange).toHaveBeenCalledWith({
      restoreGroupsInNewWindow: true,
    });
  });

  it('disables current-window placement with an explanation for new-window restore', async () => {
    await mount({ restoreGroupsInNewWindow: true });

    expect(document.querySelector<HTMLInputElement>(
      'input[name="restore-placement"][value="next"]',
    )?.disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>(
      'input[name="restore-placement"][value="end"]',
    )?.disabled).toBe(true);
    expect(document.body.textContent).toContain(
      'Placement applies only when restoring into the current window.',
    );
  });
});
