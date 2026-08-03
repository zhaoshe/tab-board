import type { ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useTabBoardThemeTokens } from '../styles/theme';

export type TabBoardIconSize = 'toolbar' | 'menu' | 'empty';

export function TabBoardIcon({
  icon: Icon,
  size = 'toolbar',
}: {
  icon: LucideIcon;
  size?: TabBoardIconSize;
}): ReactElement {
  const tokens = useTabBoardThemeTokens();
  const iconSize = {
    toolbar: tokens.icon.toolbarSize,
    menu: tokens.icon.menuSize,
    empty: tokens.icon.emptySize,
  }[size];

  return (
    <Icon
      size={iconSize}
      strokeWidth={tokens.icon.strokeWidth}
      style={size === 'menu' ? {
        width: iconSize,
        height: iconSize,
      } : undefined}
      className={[
        'tabboard-icon',
        `tabboard-icon--${size}`,
        size === 'menu' ? 'tabboard-leading-icon' : '',
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
    />
  );
}
