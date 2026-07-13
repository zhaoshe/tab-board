import { useEffect } from 'react';
import { useToast } from '../../hooks/useToast';
import { onEvent, AppEvents } from '../../../shared/utils/events';

export function useToastNotifications() {
  const { showSuccess } = useToast();

  useEffect(() => {
    const unsubSave = onEvent(AppEvents.SAVE_SUCCESS, (data: unknown) => {
      const info = data as { title: string; tabCount: number };
      showSuccess(
        `${info.tabCount} tab${info.tabCount === 1 ? '' : 's'} saved`,
        info.title
      );
    });

    const unsubImport = onEvent(AppEvents.IMPORT_SUCCESS, (data: unknown) => {
      const info = data as { groupCount: number; tabCount: number };
      showSuccess(
        `Imported ${info.groupCount} session${info.groupCount === 1 ? '' : 's'} (${info.tabCount} tabs)`,
        'Import successful'
      );
    });

    const unsubRestore = onEvent(AppEvents.RESTORE_SUCCESS, (data: unknown) => {
      const info = data as { type: string; count: number; label: string };
      if (info.type === 'group') {
        showSuccess(
          `Restored ${info.count} tab${info.count === 1 ? '' : 's'}`,
          info.label
        );
      } else {
        showSuccess('Tab restored', info.label);
      }
    });

    return () => {
      unsubSave();
      unsubImport();
      unsubRestore();
    };
  }, [showSuccess]);
}
