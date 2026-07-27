import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Notification, Group, Portal, Stack } from '@mantine/core';
import {
  IconCheck,
  IconAlertCircle,
  IconInfoCircle,
  IconX,
} from '@tabler/icons-react';

type NotificationType = 'success' | 'error' | 'info';

interface ToastNotification {
  id: string;
  message: string;
  type: NotificationType;
  title?: string;
}

interface ToastContextType {
  showToast: (message: string, type?: NotificationType, title?: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let notificationId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: NotificationType = 'info', title?: string) => {
      const id = `toast-${++notificationId}`;
      const notification: ToastNotification = { id, message, type, title };
      setNotifications((prev) => [...prev, notification]);
      setTimeout(() => {
        removeNotification(id);
      }, 3000);
    },
    [removeNotification]
  );

  const showSuccess = useCallback(
    (message: string, title?: string) => {
      showToast(message, 'success', title || 'Success');
    },
    [showToast]
  );

  const showError = useCallback(
    (message: string, title?: string) => {
      showToast(message, 'error', title || 'Error');
    },
    [showToast]
  );

  const showInfo = useCallback(
    (message: string, title?: string) => {
      showToast(message, 'info', title || 'Info');
    },
    [showToast]
  );

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return <IconCheck size={18} aria-hidden="true" />;
      case 'error':
        return <IconAlertCircle size={18} aria-hidden="true" />;
      default:
        return <IconInfoCircle size={18} aria-hidden="true" />;
    }
  };

  const getColor = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return 'green';
      case 'error':
        return 'red';
      default:
        return 'blue';
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showInfo }}>
      {children}
      <Portal>
        <Stack
          gap="xs"
          aria-live="polite"
          aria-atomic="false"
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 9999,
            maxWidth: 360,
          }}
        >
          {notifications.map((notification) => (
            <Notification
              key={notification.id}
              icon={getIcon(notification.type)}
              color={getColor(notification.type)}
              title={notification.title}
              onClose={() => removeNotification(notification.id)}
              withCloseButton
              role={notification.type === 'error' ? 'alert' : 'status'}
            >
              {notification.message}
            </Notification>
          ))}
        </Stack>
      </Portal>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
