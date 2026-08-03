import {
  Modal,
  getDefaultZIndex,
  useProps,
  type ModalProps,
} from '@mantine/core';
import type { ReactNode } from 'react';

export interface TabBoardModalProps extends Omit<ModalProps, 'stackId'> {
  headerAction?: ReactNode;
  headerSubtitle?: ReactNode;
}

const defaultProps = {
  closeOnClickOutside: true,
  withinPortal: true,
  lockScroll: true,
  trapFocus: true,
  returnFocus: true,
  closeOnEscape: true,
  keepMounted: false,
  zIndex: getDefaultZIndex('modal'),
  transitionProps: { duration: 200, transition: 'fade-down' },
  withOverlay: true,
  withCloseButton: true,
  portalProps: {},
} satisfies Partial<TabBoardModalProps>;

export function TabBoardModal(props: TabBoardModalProps) {
  const {
    title,
    withOverlay,
    overlayProps,
    withCloseButton,
    closeButtonProps,
    headerAction,
    headerSubtitle,
    children,
    radius,
    opened,
    portalProps,
    ...rootProps
  } = useProps('Modal', defaultProps, props);

  return (
    <Modal.Root
      {...rootProps}
      opened={opened}
      radius={radius}
      portalProps={portalProps ?? {}}
    >
      {withOverlay ? <Modal.Overlay visible={opened} {...overlayProps} /> : null}
      <Modal.Content
        radius={radius}
        data-has-header-action={headerAction ? 'true' : undefined}
      >
        {title || withCloseButton ? (
          <Modal.Header role="presentation">
            {title ? (
              <span className="tabboard-modal__header-copy">
                <Modal.Title>{title}</Modal.Title>
                {headerSubtitle ? (
                  <span className="tabboard-modal__header-subtitle">
                    {headerSubtitle}
                  </span>
                ) : null}
              </span>
            ) : null}
            {headerAction ? (
              <span className="tabboard-modal__header-action">
                {headerAction}
              </span>
            ) : null}
            {withCloseButton ? <Modal.CloseButton {...closeButtonProps} /> : null}
          </Modal.Header>
        ) : null}
        <Modal.Body>{children}</Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
