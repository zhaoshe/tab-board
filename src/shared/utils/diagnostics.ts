/**
 * Crash-surviving diagnostics.
 *
 * A white screen destroys the page's console, so we persist a small ring buffer
 * of breadcrumbs and errors to `chrome.storage.local` under a key that is
 * independent of `tabboardState`. Even if the app state is corrupt or the React
 * tree fails to mount, the trail survives a reload and can be read back to
 * explain what happened right before the blank page.
 *
 * Design constraints:
 * - Never throw. Diagnostics must not become a second failure source, so every
 *   storage access is guarded and fire-and-forget.
 * - No dependency on the store, the service worker, or a healthy React tree.
 * - Bounded size (ring buffer) so it can never grow without limit.
 */

export const DIAGNOSTICS_KEY = 'tabboardDiagnostics';
export const DIAGNOSTICS_LIMIT = 100;

export type DiagnosticLevel = 'info' | 'warn' | 'error';

export interface DiagnosticEntry {
  ts: string;
  level: DiagnosticLevel;
  scope: string;
  message: string;
  detail?: string;
}

interface DiagnosticsChromeLike {
  storage?: {
    local?: {
      get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
  };
}

function chromeStorage() {
  const api = (globalThis as { chrome?: DiagnosticsChromeLike }).chrome;
  return api?.storage?.local;
}

function normalizeEntries(raw: unknown): DiagnosticEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is DiagnosticEntry =>
    Boolean(entry)
    && typeof entry === 'object'
    && typeof (entry as DiagnosticEntry).ts === 'string'
    && typeof (entry as DiagnosticEntry).message === 'string');
}

export function serializeDetail(detail: unknown): string | undefined {
  if (detail === undefined || detail === null) return undefined;
  if (detail instanceof Error) {
    return detail.stack ? `${detail.message}\n${detail.stack}` : detail.message;
  }
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

// Serialize writes so concurrent log calls cannot clobber each other's ring.
let writeChain: Promise<void> = Promise.resolve();
let persistenceEnabled = true;

export function enableDiagnosticsPersistence(enabled: boolean): void {
  persistenceEnabled = enabled;
}

function isVitestEnvironment(): boolean {
  return typeof process !== 'undefined'
    && process.env?.['VITEST'] === 'true';
}

if (isVitestEnvironment()) {
  persistenceEnabled = false;
}

async function appendEntry(entry: DiagnosticEntry): Promise<void> {
  if (!persistenceEnabled) return;
  const local = chromeStorage();
  if (!local) return;
  const run = writeChain.then(async () => {
    try {
      const stored = await local.get(DIAGNOSTICS_KEY);
      const existing = normalizeEntries(stored[DIAGNOSTICS_KEY]);
      const next = [...existing, entry].slice(-DIAGNOSTICS_LIMIT);
      await local.set({ [DIAGNOSTICS_KEY]: next });
    } catch {
      // Diagnostics must never surface their own failures.
    }
  });
  writeChain = run.then(() => undefined, () => undefined);
  return run;
}

function log(level: DiagnosticLevel, scope: string, message: string, detail?: unknown): void {
  const entry: DiagnosticEntry = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(serializeDetail(detail) !== undefined ? { detail: serializeDetail(detail) } : {}),
  };
  // Mirror to the console too, for the case where the page is still alive.
  const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  consoleMethod?.(`[tabboard:${scope}] ${message}`, detail ?? '');
  void appendEntry(entry);
}

export function logBreadcrumb(scope: string, message: string, detail?: unknown): void {
  log('info', scope, message, detail);
}

export function logWarning(scope: string, message: string, detail?: unknown): void {
  log('warn', scope, message, detail);
}

export function logError(scope: string, message: string, detail?: unknown): void {
  log('error', scope, message, detail);
}

export async function readDiagnostics(): Promise<DiagnosticEntry[]> {
  if (!persistenceEnabled) return [];
  const local = chromeStorage();
  if (!local) return [];
  // Wait for any in-flight appends so a read taken right after logging (e.g.
  // from the ErrorBoundary) reflects the latest breadcrumbs.
  await writeChain;
  try {
    const stored = await local.get(DIAGNOSTICS_KEY);
    return normalizeEntries(stored[DIAGNOSTICS_KEY]);
  } catch {
    return [];
  }
}

export async function clearDiagnostics(): Promise<void> {
  if (!persistenceEnabled) return;
  const local = chromeStorage();
  if (!local) return;
  try {
    await local.remove(DIAGNOSTICS_KEY);
  } catch {
    // ignore
  }
}

export function formatDiagnostics(entries: readonly DiagnosticEntry[]): string {
  if (!entries.length) return 'No diagnostics recorded.';
  return entries
    .map((entry) => {
      const head = `${entry.ts} [${entry.level.toUpperCase()}] ${entry.scope}: ${entry.message}`;
      return entry.detail ? `${head}\n    ${entry.detail.replace(/\n/g, '\n    ')}` : head;
    })
    .join('\n');
}

/**
 * Install global capture for uncaught errors and unhandled promise rejections.
 * Returns a disposer. Safe to call outside a browser (no-ops).
 */
export function installGlobalErrorCapture(scope = 'window'): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onError = (event: ErrorEvent) => {
    logError(scope, event.message || 'Uncaught error', event.error ?? `${event.filename}:${event.lineno}:${event.colno}`);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    logError(scope, 'Unhandled promise rejection', event.reason);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
