import type { TabBoardState } from '../model';

export type StorageMode = 'browser' | 'file';

export interface StorageAdapter {
  getState(): Promise<TabBoardState>;
  setState(state: TabBoardState): Promise<void>;
  ensureState(): Promise<TabBoardState>;
  subscribeState(callback: (state: TabBoardState) => void): () => void;
}

export interface ReloadableStorageAdapter extends StorageAdapter {
  reloadFromDisk(): Promise<void>;
}

export interface AdapterInitError extends Error {
  code: 'ADAPTER_INIT_FAILED' | 'PERMISSION_DENIED' | 'FILE_CORRUPT' | 'NO_HANDLE';
}
