import { useCallback, useEffect, useRef, useState } from 'react';

export function useSettingsDraft({
  value,
  delay = 500,
  onCommit,
  onPendingChange,
}: {
  value: string;
  delay?: number;
  onCommit: (value: string) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraftRef = useRef(value);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const commit = useCallback(() => {
    clearTimer();
    onCommit(latestDraftRef.current);
    onPendingChange?.(false);
  }, [clearTimer, onCommit, onPendingChange]);

  const updateDraft = useCallback((next: string) => {
    latestDraftRef.current = next;
    setDraft(next);
    clearTimer();
    onPendingChange?.(true);
    timerRef.current = setTimeout(commit, delay);
  }, [clearTimer, commit, delay, onPendingChange]);

  useEffect(() => {
    latestDraftRef.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    draft,
    flush: commit,
    setDraft: updateDraft,
  };
}
