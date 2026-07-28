import {
  cloneElement,
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
} from 'react';
import {
  ActionIcon,
  Tooltip,
  type ActionIconProps,
} from '@mantine/core';

type NativeButtonProps = Omit<
  ComponentPropsWithoutRef<'button'>,
  keyof ActionIconProps | 'children' | 'title'
>;

export interface AccessibleIconActionProps
  extends ActionIconProps, NativeButtonProps {
  label: string;
  tooltip?: string;
  density?: 'compact' | 'touch';
  children: ReactElement;
}

export const AccessibleIconAction = forwardRef<HTMLButtonElement, AccessibleIconActionProps>(
function AccessibleIconAction({
  label,
  tooltip = label,
  density = 'compact',
  className,
  children,
  ...props
}, ref) {
  const icon = cloneElement(children, {
    'aria-hidden': true,
    focusable: false,
  });

  return (
    <Tooltip label={tooltip}>
      <ActionIcon
        {...props}
        ref={ref}
        className={['accessible-icon-action', className].filter(Boolean).join(' ')}
        data-density={density}
        aria-label={label}
        title={label}
      >
        {icon}
      </ActionIcon>
    </Tooltip>
  );
});
