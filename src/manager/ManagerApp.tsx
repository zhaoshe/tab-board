import { useEffect } from 'react';
import { MantineProvider, LoadingOverlay, Center } from '@mantine/core';
import '@mantine/core/styles.css';
import './styles/manager.css';
import { theme } from '../shared/styles/theme';
import { ManagerLayout } from './components/shell/ManagerLayout';
import { useStoreHydration } from '../shared/hooks/useStoreHydration';
import { useColorScheme } from '../shared/hooks/useColorScheme';
import { ToastProvider } from './hooks/useToast';

function AppContent() {
  const colorScheme = useColorScheme();

  return (
    <MantineProvider theme={theme} forceColorScheme={colorScheme}>
      <ToastProvider>
        <ManagerLayout />
      </ToastProvider>
    </MantineProvider>
  );
}

export function ManagerApp() {
  const { hydrated } = useStoreHydration();

  useEffect(() => {
    document.title = 'TabBoard - Tab Manager';
  }, []);

  if (!hydrated) {
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
