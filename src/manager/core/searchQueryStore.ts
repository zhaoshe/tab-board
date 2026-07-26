export interface SearchQueryStore {
  getSnapshot(): string;
  subscribe(listener: () => void): () => void;
  set(value: string): void;
}

export interface SearchQueryStorePorts {
  locationSearch(): string;
  readStoredQuery(): string | null;
  writeStoredQuery(value: string): void;
}

function readInitialQuery(ports: SearchQueryStorePorts): string {
  let search = '';
  try {
    search = ports.locationSearch();
  } catch {
    search = '';
  }
  const urlQuery = new URLSearchParams(search).get('q');
  if (urlQuery) return urlQuery;
  try {
    return ports.readStoredQuery() || '';
  } catch {
    return '';
  }
}

function persistQuery(
  ports: SearchQueryStorePorts,
  value: string,
): void {
  try {
    ports.writeStoredQuery(value);
  } catch {
  }
}

export function createSearchQueryStore(
  ports: SearchQueryStorePorts,
): SearchQueryStore {
  let snapshot = readInitialQuery(ports);
  const listeners = new Set<() => void>();

  if (snapshot) persistQuery(ports, snapshot);

  const getSnapshot = () => snapshot;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const set = (value: string) => {
    if (value === snapshot) return;
    snapshot = value;
    persistQuery(ports, value);
    [...listeners].forEach((listener) => listener());
  };

  return { getSnapshot, subscribe, set };
}
