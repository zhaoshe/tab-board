import {
  cloneElement,
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
} from 'react';
import {
  ActionIcon,
  type ActionIconProps,
} from '@mantine/core';
import { useTabBoardThemeTokens } from '../styles/theme';
import { TabBoardTooltip } from './TabBoardTooltip';

type NativeButtonProps = Omit<
  ComponentPropsWithoutRef<'button'>,
  keyof ActionIconProps | 'children' | 'title'
>;

export interface AccessibleIconActionProps
  extends ActionIconProps, NativeButtonProps {
  label: string;
  tooltip?: string;
  tooltipDisabled?: boolean;
  density?: 'compact' | 'touch';
  selected?: boolean;
  danger?: boolean;
  children: ReactElement;
}

export const AccessibleIconAction = forwardRef<HTMLButtonElement, AccessibleIconActionProps>(
function AccessibleIconAction({
  label,
  tooltip = label,
  tooltipDisabled = false,
  density = 'compact',
  variant = 'subtle',
  selected,
  danger = false,
  disabled,
  loading,
  'data-disabled': dataDisabled,
  'aria-pressed': ariaPressed,
  className,
  style,
  children,
  ...props
}, ref) {
  const tokens = useTabBoardThemeTokens();
  const isDisabled = Boolean(disabled || loading || dataDisabled);
  const actionSize = density === 'touch'
    ? tokens.action.touchSize
    : tokens.action.desktopSize;
  const tokenStyle = {
    '--tabboard-action-size': `${actionSize}px`,
    '--tabboard-action-touch-size': `${tokens.action.touchSize}px`,
    '--tabboard-action-selected-color': tokens.action.states.selectedColor,
    '--tabboard-action-selected-background': tokens.action.states.selectedBackground,
    '--tabboard-action-danger-color': tokens.action.states.dangerColor,
    '--tabboard-action-disabled-opacity': tokens.action.states.disabledOpacity,
  } as React.CSSProperties;
  const icon = cloneElement(children, {
    'aria-hidden': true,
    focusable: false,
  });

  return (
    <TabBoardTooltip label={tooltip} disabled={tooltipDisabled}>
      <ActionIcon
        {...props}
        ref={ref}
        variant={variant}
        className={[
          'accessible-icon-action',
          selected ? 'accessible-icon-action--selected' : '',
          danger ? 'accessible-icon-action--danger' : '',
          isDisabled ? 'accessible-icon-action--disabled' : '',
          className,
        ].filter(Boolean).join(' ')}
        data-density={density}
        data-disabled={dataDisabled}
        disabled={disabled}
        loading={loading}
        size={actionSize}
        style={[tokenStyle, style]}
        aria-label={label}
        aria-pressed={selected ?? ariaPressed}
      >
        {icon}
      </ActionIcon>
    </TabBoardTooltip>
  );
});
