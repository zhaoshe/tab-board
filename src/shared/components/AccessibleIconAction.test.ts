// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTheme,
  MantineProvider,
  type MantineThemeOverride,
} from '@mantine/core';
import { AccessibleIconAction } from './AccessibleIconAction';
import {
  theme,
  type TabBoardThemeTokens,
} from '../styles/theme';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(
  element: ReturnType<typeof createElement>,
  providerTheme: MantineThemeOverride = theme,
): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(MantineProvider, { theme: providerTheme }, element));
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
});

describe('AccessibleIconAction', () => {
  it('uses a neutral subtle treatment unless the caller explicitly overrides it', async () => {
    await mount(createElement(
      'div',
      null,
      createElement(
        AccessibleIconAction,
        {
          label: 'Neutral Action',
          children: createElement('svg'),
        },
      ),
      createElement(
        AccessibleIconAction,
        {
          label: 'Explicit Filled Action',
          variant: 'filled',
          children: createElement('svg'),
        },
      ),
    ));

    const neutral = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="Neutral Action"]',
    );
    const filled = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="Explicit Filled Action"]',
    );
    expect(neutral?.getAttribute('data-variant')).toBe('subtle');
    expect(filled?.getAttribute('data-variant')).toBe('filled');
  });

  it('does not attach tooltip semantics while an owned overlay is open', async () => {
    await mount(createElement(
      AccessibleIconAction,
      {
        label: 'More Actions',
        tooltipDisabled: true,
        children: createElement('svg'),
      },
    ));

    const button = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="More Actions"]',
    );
    await act(async () => button?.focus());
    expect(button?.hasAttribute('aria-describedby')).toBe(false);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

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
    expect(button?.hasAttribute('title')).toBe(false);
    expect(icon?.getAttribute('aria-hidden')).toBe('true');

    await act(async () => button?.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not reopen a delayed tooltip after click until the pointer moves', async () => {
    vi.useFakeTimers();
    await mount(createElement(
      AccessibleIconAction,
      {
        label: 'Delayed Action',
        children: createElement('svg'),
      },
    ));

    const button = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="Delayed Action"]',
    )!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(500);
      button.click();
      vi.advanceTimersByTime(1_000);
    });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();

    await act(async () => {
      button.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 2,
        clientY: 2,
      }));
      vi.advanceTimersByTime(1_000);
    });
    expect(document.querySelector('[role="tooltip"]')?.textContent)
      .toBe('Delayed Action');
  });

  it('closes the previous action tip when another action claims the page tip', async () => {
    vi.useFakeTimers();
    await mount(createElement(
      'div',
      null,
      createElement(
        AccessibleIconAction,
        {
          label: 'First Action',
          children: createElement('svg'),
        },
      ),
      createElement(
        AccessibleIconAction,
        {
          label: 'Second Action',
          children: createElement('svg'),
        },
      ),
    ));

    const first = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="First Action"]',
    )!;
    const second = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="Second Action"]',
    )!;

    await act(async () => {
      first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(1_000);
    });
    expect(document.querySelector('[role="tooltip"]')?.textContent)
      .toBe('First Action');

    await act(async () => {
      second.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();

    await act(async () => vi.advanceTimersByTime(1_000));
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    expect(document.querySelector('[role="tooltip"]')?.textContent)
      .toBe('Second Action');
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
    expect(button?.style.getPropertyValue('--ai-size')).toContain('2.75rem');
  });

  it('exposes selected and danger state classes', async () => {
    await mount(createElement(
      AccessibleIconAction,
      {
        label: 'Delete Session',
        selected: true,
        danger: true,
        children: createElement('svg'),
      },
    ));

    const button = container!.querySelector<HTMLButtonElement>('button');
    expect(button?.classList).toContain('accessible-icon-action--selected');
    expect(button?.classList).toContain('accessible-icon-action--danger');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
  });

  it('preserves an explicit caller-controlled unpressed state', async () => {
    await mount(createElement(
      AccessibleIconAction,
      {
        label: 'Toggle Details',
        'aria-pressed': false,
        children: createElement('svg'),
      },
    ));

    const button = container!.querySelector<HTMLButtonElement>('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.classList).not.toContain('accessible-icon-action--selected');
  });

  it('exposes data-disabled through the shared disabled state', async () => {
    await mount(createElement(
      AccessibleIconAction,
      {
        label: 'Unavailable Action',
        'data-disabled': true,
        children: createElement('svg'),
      },
    ));

    const button = container!.querySelector<HTMLButtonElement>('button')!;
    expect(button.getAttribute('data-disabled')).toBe('true');
    expect(button.disabled).toBe(false);
    expect(button.classList).toContain('accessible-icon-action--disabled');
  });

  it('keeps shared action geometry equal while disabled or loading', async () => {
    await mount(createElement(
      'div',
      null,
      createElement(
        AccessibleIconAction,
        {
          label: 'Available Action',
          children: createElement('svg'),
        },
      ),
      createElement(
        AccessibleIconAction,
        {
          label: 'Unavailable Action',
          disabled: true,
          children: createElement('svg'),
        },
      ),
      createElement(
        AccessibleIconAction,
        {
          label: 'Loading Action',
          loading: true,
          children: createElement('svg'),
        },
      ),
    ));

    const [enabledButton, disabledButton, loadingButton] = [
      ...container!.querySelectorAll<HTMLButtonElement>('button'),
    ];
    const renderedGeometry = (button: HTMLButtonElement) => ({
      mantineSize: button.style.getPropertyValue('--ai-size'),
      sharedSize: button.style.getPropertyValue('--tabboard-action-size'),
    });

    expect(disabledButton.disabled).toBe(true);
    expect(disabledButton.classList).toContain('accessible-icon-action--disabled');
    expect(loadingButton.disabled).toBe(true);
    expect(loadingButton.getAttribute('data-loading')).toBe('true');
    expect(loadingButton.classList).toContain('accessible-icon-action--disabled');
    expect(renderedGeometry(enabledButton)).toEqual({
      mantineSize: expect.stringContaining('2rem'),
      sharedSize: '32px',
    });
    expect(renderedGeometry(disabledButton)).toEqual(renderedGeometry(enabledButton));
    expect(renderedGeometry(loadingButton)).toEqual(renderedGeometry(enabledButton));
  });

  it('derives geometry and state variables from the typed Mantine tokens', async () => {
    const customTokens: TabBoardThemeTokens = {
      icon: {
        toolbarSize: 21,
        menuSize: 17,
        emptySize: 52,
        strokeWidth: 1.5,
      },
      action: {
        desktopSize: 36,
        touchSize: 48,
        states: {
          selectedColor: '#123456',
          selectedBackground: '#ddeeff',
          dangerColor: '#aa1122',
          disabledOpacity: 0.4,
        },
      },
    };
    const customTheme = createTheme({ other: { tabBoard: customTokens } });
    await mount(createElement(
      AccessibleIconAction,
      {
        label: 'Delete Session',
        selected: true,
        danger: true,
        disabled: true,
        children: createElement('svg'),
      },
    ), customTheme);

    const button = container!.querySelector<HTMLButtonElement>('button')!;
    expect(button.style.getPropertyValue('--ai-size')).toContain('2.25rem');
    expect(button.style.getPropertyValue('--tabboard-action-touch-size')).toBe('48px');
    expect(button.style.getPropertyValue('--tabboard-action-selected-color')).toBe('#123456');
    expect(button.style.getPropertyValue('--tabboard-action-selected-background')).toBe('#ddeeff');
    expect(button.style.getPropertyValue('--tabboard-action-danger-color')).toBe('#aa1122');
    expect(button.style.getPropertyValue('--tabboard-action-disabled-opacity')).toBe('0.4');
  });
});
