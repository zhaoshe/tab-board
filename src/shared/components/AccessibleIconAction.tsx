import {
  cloneElement,
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
  children: ReactElement;
}

export function AccessibleIconAction({
  label,
  tooltip = label,
  children,
  ...props
}: AccessibleIconActionProps) {
  const icon = cloneElement(children, {
    'aria-hidden': true,
    focusable: false,
  });

  return (
    <Tooltip label={tooltip}>
      <ActionIcon {...props} aria-label={label} title={label}>
        {icon}
      </ActionIcon>
    </Tooltip>
  );
}
