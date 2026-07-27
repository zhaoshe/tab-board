import { Modal, type ModalProps } from '@mantine/core';

interface ManagerModalProps extends Omit<ModalProps, 'title'> {
  title: string;
}

export function ManagerModal({
  title,
  portalProps,
  closeButtonProps,
  children,
  ...props
}: ManagerModalProps) {
  const managerMain = typeof document === 'undefined'
    ? undefined
    : document.querySelector<HTMLElement>('#manager-main') ?? undefined;

  return (
    <Modal
      {...props}
      title={title}
      portalProps={{
        ...portalProps,
        target: portalProps?.target ?? managerMain,
      }}
      closeButtonProps={{
        ...closeButtonProps,
        'aria-label': closeButtonProps?.['aria-label'] ?? `Close ${title}`,
      }}
    >
      {children}
    </Modal>
  );
}
