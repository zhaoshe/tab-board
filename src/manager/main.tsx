import React from 'react';
import { createRoot } from 'react-dom/client';
import { ManagerApp } from './ManagerApp';
import { installGlobalErrorCapture, logBreadcrumb, logError } from '../shared/utils/diagnostics';

installGlobalErrorCapture('manager');
logBreadcrumb('manager', 'manager entry script loaded');

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  try {
    root.render(
      <React.StrictMode>
        <ManagerApp />
      </React.StrictMode>
    );
  } catch (error: unknown) {
    logError('manager', 'initial render threw', error);
    throw error;
  }
} else {
  logError('manager', 'root container #root not found');
}
