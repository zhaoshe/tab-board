import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ConfirmDialog } from './ConfirmDialog';

export interface DestructiveConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
}

type ResolveConfirmation = (confirmed: boolean) => void;
type ConfirmDestructive = (
  request: DestructiveConfirmationRequest,
) => Promise<boolean>;

const DestructiveConfirmationContext = createContext<ConfirmDestructive | null>(null);

export function DestructiveConfirmationProvider({
  children,
  portalTarget,
}: {
  children: ReactNode;
  portalTarget?: HTMLElement | string;
}) {
  const [request, setRequest] = useState<DestructiveConfirmationRequest | null>(null);
  const resolveRef = useRef<ResolveConfirmation | null>(null);

  const finish = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setRequest(null);
  }, []);

  const confirmDestructive = useCallback<ConfirmDestructive>((nextRequest) => {
    resolveRef.current?.(false);
    setRequest(nextRequest);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  return (
    <DestructiveConfirmationContext.Provider value={confirmDestructive}>
      {children}
      <ConfirmDialog
        opened={request !== null}
        title={request?.title ?? ''}
        message={request?.message ?? ''}
        confirmLabel={request?.confirmLabel ?? 'Confirm'}
        portalTarget={portalTarget}
        onCancel={() => finish(false)}
        onConfirm={() => finish(true)}
      />
    </DestructiveConfirmationContext.Provider>
  );
}

export function useDestructiveConfirmation(): ConfirmDestructive {
  const confirmation = useContext(DestructiveConfirmationContext);
  if (!confirmation) {
    throw new Error(
      'useDestructiveConfirmation must be used within a DestructiveConfirmationProvider',
    );
  }
  return confirmation;
}
