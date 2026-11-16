import type { TabBoardState } from '../model';
import type { BoundSnapshot, OriginScope, RestoreMetadata } from './restoreCommit';

export type StorageMode = 'browser' | 'file';

export interface StateWriteOptions {
  backupBeforeRestore?: TabBoardState;
  restoreMetadata?: RestoreMetadata;
}

export interface StorageObservation {
  kind?: 'ordinary' | 'explicit-reread';
  eventId?: string;
  origin?: OriginScope;
}

export interface StorageAdapter {
  getState(): Promise<TabBoardState>;
  /** Origin cached by the same completed state read, without another disk read. */
  getStateOrigin?(): OriginScope | undefined;
  getBoundState?(expectedOrigin?: OriginScope, initializeLegacy?: boolean): Promise<BoundSnapshot>;
  setRestoreMetadata?(metadata: RestoreMetadata | undefined): Promise<void>;
  setState(state: TabBoardState, options?: StateWriteOptions): Promise<void>;
  ensureState(): Promise<TabBoardState>;
  subscribeState(callback: (state: TabBoardState, observation?: StorageObservation) => void): () => void;
}

export interface ReloadableStorageAdapter extends StorageAdapter {
  reloadFromDisk(observation?: StorageObservation): Promise<void>;
}

export interface FileStorageAdapter extends ReloadableStorageAdapter {
  getFileUpdatedAt(): string | null;
  getUnreadSessionCount(): number;
}

export interface AdapterInitError extends Error {
  code: 'ADAPTER_INIT_FAILED' | 'PERMISSION_DENIED' | 'FILE_CORRUPT' | 'NO_HANDLE';
}
