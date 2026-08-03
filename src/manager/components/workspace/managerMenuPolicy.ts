import { useRef, type KeyboardEvent } from 'react';

export const MANAGER_MENU_A11Y_PROPS = {
  withRoles: false,
} as const;

export function focusFirstManagerMenuItem(dropdownId: string): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(
      `#${CSS.escape(dropdownId)} [role="menuitem"]:not(:disabled)`,
    )?.focus();
  });
}

export function useManagerMenuOpening(dropdownId: string) {
  const keyboardOpenRef = useRef(false);
  return {
    onTriggerPointerDown: () => {
      keyboardOpenRef.current = false;
    },
    onTriggerKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        keyboardOpenRef.current = true;
      }
    },
    onMenuOpen: () => {
      const keyboardOpen = keyboardOpenRef.current;
      keyboardOpenRef.current = false;
      document.getElementById(dropdownId)?.removeAttribute('data-tip-keyboard-armed');
      if (keyboardOpen) focusFirstManagerMenuItem(dropdownId);
    },
  };
}

export const MANAGER_DENSE_MENU_PROPS = {
  ...MANAGER_MENU_A11Y_PROPS,
  width: 190,
  classNames: {
    dropdown: 'manager-dense-menu',
    item: 'manager-dense-menu__item',
  },
} as const;
