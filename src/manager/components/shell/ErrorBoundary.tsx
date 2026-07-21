import { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  formatDiagnostics,
  logError,
  readDiagnostics,
} from '../../../shared/utils/diagnostics';

interface ErrorBoundaryProps {
  scope: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  diagnosticsText: string;
  copied: boolean;
}

/**
 * Root error boundary. A render/runtime crash in the tree would otherwise
 * unmount everything and leave a blank #root (white screen). Instead we catch
 * it, persist the error to crash-surviving diagnostics, and render an
 * actionable recovery panel showing the error plus the recorded breadcrumb
 * trail, with buttons to copy diagnostics and reload.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, diagnosticsText: '', copied: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError(this.props.scope, error.message || 'React render crash', {
      stack: error.stack,
      componentStack: info.componentStack,
    });
    void readDiagnostics().then((entries) => {
      this.setState({ diagnosticsText: formatDiagnostics(entries) });
    });
  }

  private handleCopy = (): void => {
    const text = this.buildReport();
    void navigator.clipboard?.writeText?.(text).then(
      () => this.setState({ copied: true }),
      () => this.setState({ copied: false }),
    );
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  private buildReport(): string {
    const { error, diagnosticsText } = this.state;
    return [
      'TabBoard error report',
      `When: ${new Date().toISOString()}`,
      `Error: ${error?.message ?? 'unknown'}`,
      error?.stack ? `Stack:\n${error.stack}` : '',
      '',
      'Diagnostics:',
      diagnosticsText || '(none)',
    ].filter(Boolean).join('\n');
  }

  render(): ReactNode {
    const { error, diagnosticsText, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" className="tabboard-error-boundary">
        <div className="tabboard-error-boundary__panel">
          <h1 className="tabboard-error-boundary__title">TabBoard hit an error</h1>
          <p className="tabboard-error-boundary__message">{error.message || 'Something went wrong while rendering.'}</p>
          <div className="tabboard-error-boundary__actions">
            <button type="button" onClick={this.handleReload}>Reload</button>
            <button type="button" onClick={this.handleCopy}>
              {copied ? 'Copied \u2713' : 'Copy diagnostics'}
            </button>
          </div>
          <details className="tabboard-error-boundary__details" open>
            <summary>Diagnostics (share this to report the issue)</summary>
            <pre className="tabboard-error-boundary__log">{diagnosticsText || 'Collecting…'}</pre>
          </details>
        </div>
      </div>
    );
  }
}
