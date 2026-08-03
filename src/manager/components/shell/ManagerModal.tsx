import {
  TabBoardModal,
  type TabBoardModalProps,
} from '../../../shared/components/TabBoardModal';

interface ManagerModalProps extends Omit<TabBoardModalProps, 'title'> {
  title: string;
}

export function ManagerModal({
  title,
  closeButtonProps,
  children,
  ...props
}: ManagerModalProps) {
  return (
    <TabBoardModal
      {...props}
      title={title}
      closeButtonProps={{
        ...closeButtonProps,
        'aria-label': closeButtonProps?.['aria-label'] ?? `Close ${title}`,
      }}
    >
      {children}
    </TabBoardModal>
  );
}
