import { useCallback, useEffect, useRef, useState } from 'react';

export function useSettingsDraft({
  value,
  delay = 500,
  onCommit,
}: {
  value: string;
  delay?: number;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);
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
    setPending(false);
  }, [clearTimer, onCommit]);

  const updateDraft = useCallback((next: string) => {
    latestDraftRef.current = next;
    setDraft(next);
    setPending(true);
    clearTimer();
    timerRef.current = setTimeout(commit, delay);
  }, [clearTimer, commit, delay]);

  useEffect(() => {
    latestDraftRef.current = value;
    setDraft(value);
    setPending(false);
  }, [value]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    draft,
    flush: commit,
    pending,
    setDraft: updateDraft,
  };
}
