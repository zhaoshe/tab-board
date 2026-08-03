import {
  cloneElement,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type Ref,
} from 'react';
import {
  Tooltip,
  type TooltipProps,
} from '@mantine/core';
import { useMergedRef } from '@mantine/hooks';
import { claimTip, releaseTip } from './tipLifecycle';

type TooltipTargetProps = {
  onMouseEnter?: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLElement>) => void;
  onMouseMove?: (event: MouseEvent<HTMLElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
};

export interface TabBoardTooltipProps extends Omit<
  TooltipProps,
  | 'children'
  | 'defaultOpened'
  | 'events'
  | 'onMouseEnter'
  | 'onMouseLeave'
  | 'onMouseMove'
  | 'onPointerDown'
  | 'opened'
> {
  children: ReactElement<TooltipTargetProps>;
}

export const TabBoardTooltip = forwardRef<HTMLElement, TabBoardTooltipProps>(
function TabBoardTooltip({
  children,
  disabled = false,
  openDelay = 1000,
  ...props
}, ref) {
  const [opened, setOpened] = useState(false);
  const ownerRef = useRef({});
  const suppressedUntilMovementRef = useRef(false);
  const targetRef = useRef<HTMLElement>(null);
  const mergedRef = useMergedRef(targetRef, ref);

  const scheduleOpen = useCallback(() => {
    if (disabled || suppressedUntilMovementRef.current) return;
    claimTip(
      ownerRef.current,
      openDelay,
      () => setOpened(true),
      () => setOpened(false),
    );
  }, [disabled, openDelay]);

  const dismissUntilMovement = useCallback(() => {
    releaseTip(ownerRef.current);
    suppressedUntilMovementRef.current = true;
  }, []);

  useEffect(() => {
    if (disabled) {
      releaseTip(ownerRef.current);
    }
    return () => releaseTip(ownerRef.current);
  }, [disabled]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return undefined;
    target.addEventListener('click', dismissUntilMovement);
    return () => target.removeEventListener('click', dismissUntilMovement);
  }, [dismissUntilMovement]);

  const childProps = children.props;
  const target = cloneElement(children, {
    onMouseEnter: (event) => {
      childProps.onMouseEnter?.(event);
      scheduleOpen();
    },
    onMouseLeave: (event) => {
      childProps.onMouseLeave?.(event);
      releaseTip(ownerRef.current);
      suppressedUntilMovementRef.current = false;
    },
    onMouseMove: (event) => {
      childProps.onMouseMove?.(event);
      if (!suppressedUntilMovementRef.current) return;
      suppressedUntilMovementRef.current = false;
      scheduleOpen();
    },
    onPointerDown: (event) => {
      dismissUntilMovement();
      childProps.onPointerDown?.(event);
    },
  });

  return (
    <Tooltip
      {...props}
      ref={mergedRef as Ref<HTMLDivElement>}
      disabled={disabled}
      events={{ hover: false, focus: false, touch: false }}
      opened={opened || undefined}
    >
      {target}
    </Tooltip>
  );
});
