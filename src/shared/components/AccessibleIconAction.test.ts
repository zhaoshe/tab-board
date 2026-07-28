// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { AccessibleIconAction } from './AccessibleIconAction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(element: ReturnType<typeof createElement>): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(MantineProvider, null, element));
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('AccessibleIconAction', () => {
  it('names the action and hides its icon from the accessibility tree', async () => {
    const onClick = vi.fn();
    await mount(createElement(
      AccessibleIconAction,
      {
        label: 'Restore Session',
        onClick,
        children: createElement('svg', { 'data-testid': 'action-icon' }),
      },
    ));

    const button = container!.querySelector<HTMLButtonElement>('button[aria-label="Restore Session"]');
    const icon = container!.querySelector<SVGElement>('[data-testid="action-icon"]');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('title')).toBe('Restore Session');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');

    await act(async () => button?.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('exposes compact and touch density contracts', async () => {
    await mount(createElement(
      AccessibleIconAction,
      {
        label: 'More Actions',
        density: 'touch',
        children: createElement('svg'),
      },
    ));

    const button = document.querySelector<HTMLButtonElement>('button');
    expect(button?.classList).toContain('accessible-icon-action');
    expect(button?.getAttribute('data-density')).toBe('touch');
  });
});
