import { useEffect, useState } from 'react';
import { MantineProvider, LoadingOverlay, Center, Stack, Text, Button, Group } from '@mantine/core';
import '@mantine/core/styles.css';
import './styles/manager.css';
import { managerTheme, theme } from '../shared/styles/theme';
import { ManagerLayout } from './components/shell/ManagerLayout';
import { ErrorBoundary } from './components/shell/ErrorBoundary';
import { useStoreHydration } from '../shared/hooks/useStoreHydration';
import { useColorScheme } from '../shared/hooks/useColorScheme';
import { usePageTheme } from '../shared/hooks/usePageTheme';
import { ToastProvider, useToast } from './hooks/useToast';
import { onFallback } from '../shared/store/activeAdapter';
import { logBreadcrumb, logWarning } from '../shared/utils/diagnostics';
import { DestructiveConfirmationProvider } from '../shared/components/DestructiveConfirmation';

// If hydration has not completed within this window, stop showing a blank
// loading overlay and offer a recovery action instead of an endless white page.
const HYDRATION_WATCHDOG_MS = 8000;

function FileStorageFallbackToast() {
  const { showError } = useToast();
  useEffect(() => {
    const unsub = onFallback((reason: string) => {
      logWarning('manager', `file storage fallback: ${reason}`);
      showError(
        'File storage is unavailable. Using browser storage for now. Open settings to reconnect.',
        'Storage fallback',
      );
    });
    return unsub;
  }, [showError]);
  return null;
}

function AppContent() {
  const colorScheme = useColorScheme();
  usePageTheme(colorScheme);

  return (
    <MantineProvider theme={managerTheme} forceColorScheme={colorScheme}>
      <ToastProvider>
        <DestructiveConfirmationProvider>
          <FileStorageFallbackToast />
          <ManagerLayout />
        </DestructiveConfirmationProvider>
      </ToastProvider>
    </MantineProvider>
  );
}

function HydrationStalled() {
  return (
    <MantineProvider theme={theme}>
      <Center h="100vh" p="md">
        <Stack align="center" gap="sm" maw={420}>
          <Text fw={600}><span translate="no">TabBoard</span> is taking longer than expected to load</Text>
          <Text size="sm" c="dimmed" ta="center">
            The saved data could not be read yet. This usually recovers on reload.
            If it keeps happening, open the extension diagnostics to report it.
          </Text>
          <Group>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </Group>
        </Stack>
      </Center>
    </MantineProvider>
  );
}

export function ManagerApp() {
  return (
    <ErrorBoundary scope="manager">
      <ManagerAppInner />
    </ErrorBoundary>
  );
}

function ManagerAppInner() {
  const { hydrated } = useStoreHydration();
  const [watchdogTripped, setWatchdogTripped] = useState(false);

  useEffect(() => {
    document.title = 'TabBoard - Tab Manager';
    logBreadcrumb('manager', 'ManagerApp mounted');
  }, []);

  useEffect(() => {
    if (hydrated) {
      logBreadcrumb('manager', 'hydration complete, rendering manager');
      return;
    }
    const timer = window.setTimeout(() => {
      logWarning('manager', `hydration did not complete within ${HYDRATION_WATCHDOG_MS}ms`);
      setWatchdogTripped(true);
    }, HYDRATION_WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, [hydrated]);

  if (!hydrated) {
    if (watchdogTripped) {
      return <HydrationStalled />;
    }
    return (
      <MantineProvider theme={theme}>
        <Center h="100vh">
          <LoadingOverlay visible />
        </Center>
      </MantineProvider>
    );
  }

  return <AppContent />;
}
