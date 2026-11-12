import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Textarea,
  Button,
  Group,
  Stack,
  Text,
  FileButton,
  Alert,
  Box,
  Paper,
  Divider,
  Radio,
} from '@mantine/core';
import {
  Check as IconCheck,
  CircleAlert as IconAlertCircle,
  Download as IconUpload,
  FileInput as IconFileImport,
} from 'lucide-react';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { parseCompleteBackup, parseImportedText } from '../../../shared/model/session-operations';
import { formatNumber } from '../../../shared/utils/formatters';
import type { CategoryFilter } from '../../core/selectors';
import { ManagerModal } from '../shell/ManagerModal';

interface ImportModalProps {
  opened: boolean;
  onClose: () => void;
  category?: CategoryFilter;
  onRestoreBackup?: (text: string, expectedRevision: number) => Promise<void>;
}

export function ImportModal({ opened, onClose, category = 'inbox', onRestoreBackup }: ImportModalProps) {
  const [importText, setImportText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [mode, setMode] = useState<'sessions' | 'restore'>('sessions');
  const [expectedRevision, setExpectedRevision] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const fileReadGeneration = useRef(0);
  const mutationRevision = useTabBoardStore((state) => state.mutationRevision);
  const restoreBackup = useTabBoardStore((state) => state.restoreBackup);
  const importGroups = useTabBoardStore((state) => state.importGroups);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);

  const isLargeImport = importText.length >= 65_536;
  const folderId = category.startsWith('folder:') ? category.slice('folder:'.length) : null;

  useEffect(() => () => { fileReadGeneration.current += 1; }, []);

  useEffect(() => {
    if (!opened || !importText) {
      setPreviewText('');
      return;
    }
    const timeout = setTimeout(() => setPreviewText(importText), 150);
    return () => clearTimeout(timeout);
  }, [importText, opened]);

  // Cache by text, independent of mode, commit state and authority revision.
  const parsed = useMemo(() => {
    if (!previewText.trim()) return { preview: null, completeBackup: null, error: null, restoreError: null };
    let backup = null;
    let restoreError = null;
    const formatError = (e: unknown) => `${e instanceof Error ? e.message : 'The import text could not be parsed.'} Check that the text is a TabBoard export or OneTab URL list.`;
    try { backup = parseCompleteBackup(previewText); } catch (e) { restoreError = formatError(e); }
    try {
      const groups = backup ? backup.groups : parseImportedText(previewText);
      return {
        preview: { groupCount: groups.length, tabCount: groups.reduce((sum, group) => sum + group.tabs.length, 0) },
        completeBackup: backup ? { workspaceCount: backup.workspaces.length } : null,
        error: null,
        restoreError,
      };
    } catch (e) {
      return { preview: null, completeBackup: null, error: formatError(e), restoreError };
    }
  }, [previewText]);
  const isPreviewPending = importText !== previewText;
  const preview = isPreviewPending ? null : parsed.preview;
  const completeBackup = isPreviewPending ? null : parsed.completeBackup;
  const previewError = isPreviewPending ? null : mode === 'restore' ? parsed.restoreError ?? parsed.error : parsed.error;
  const displayedError = error ?? previewError;

  const handleTextChange = (value: string) => {
    if (isImporting) return;
    fileReadGeneration.current += 1;
    setImportText(value);
    if (!value) setPreviewText('');
    setError(null);
    setExpectedRevision(mutationRevision);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isImporting) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  const readFile = (file: File) => {
    const generation = ++fileReadGeneration.current;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (generation !== fileReadGeneration.current) return;
      const text = String(e.target?.result || '');
      handleTextChange(text);
    };
    reader.onerror = () => {
      if (generation !== fileReadGeneration.current) return;
      setError('The file could not be read. Choose a readable JSON or text export and try again.');
    };
    reader.readAsText(file);
  };

  const handleFileSelect = (file: File | null) => {
    if (file && !isImporting) {
      readFile(file);
    }
  };

  const handleImport = async () => {
    if (isImporting || isPreviewPending || !preview || previewError || (mode === 'restore' ? !completeBackup : preview.groupCount === 0)) return;
    fileReadGeneration.current += 1;
    setIsImporting(true);
    try {
      if (mode === 'restore') {
        await (onRestoreBackup ?? restoreBackup)(importText, expectedRevision);
      } else {
        await importGroups(importText, { workspaceId: activeWorkspaceId, folderId });
      }
      setImportText('');
      setPreviewText('');
      setError(null);
      setMode('sessions');
      onClose();
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : 'unknown error'}. Check the format and try again.`);
      setExpectedRevision(useTabBoardStore.getState().mutationRevision);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    if (isImporting) return;
    fileReadGeneration.current += 1;
    setMode('sessions');
    setImportText('');
    setPreviewText('');
    setError(null);
    onClose();
  };

  return (
    <ManagerModal
      opened={opened}
      onClose={handleClose}
      title="Import Sessions"
      size="lg"
      centered
    >
      <Stack gap="md">
        <Box
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragging ? 'var(--tabboard-accent)' : 'var(--mantine-color-gray-4)'}`,
            borderRadius: 'var(--mantine-radius-md)',
            padding: 'var(--mantine-spacing-xl)',
            textAlign: 'center',
            backgroundColor: isDragging ? 'var(--tabboard-accent-soft)' : 'transparent',
          }}
        >
          <Stack gap="xs" align="center">
            <IconUpload size={32} aria-hidden="true" style={{ color: 'var(--mantine-color-gray-5)' }} />
            <Text size="sm" c="dimmed">
              Drag and drop a file here, or
            </Text>
            <Group justify="center">
              <FileButton
                onChange={handleFileSelect}
                accept=".json,.txt"
                inputProps={{
                  name: 'session-import-file',
                  'aria-label': 'Import Session File',
                }}
              >
                {(props) => (
                  <Button
                    disabled={isImporting}
                    variant="light"
                    leftSection={<IconFileImport size={16} aria-hidden="true" />}
                    {...props}
                  >
                    Choose File
                  </Button>
                )}
              </FileButton>
            </Group>
          </Stack>
        </Box>

        <Divider label="or paste text" labelPosition="center" />

        <Textarea
          name="session-import-text"
          aria-label="Session import text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste import text here…"
          readOnly={isImporting}
          value={importText}
          onChange={(e) => handleTextChange(e.target.value)}
          minRows={10}
          rows={isLargeImport ? 6 : undefined}
          autosize={!isLargeImport}
          styles={isLargeImport ? { input: { overflowY: 'auto', resize: 'none' } } : undefined}
          style={{ fontFamily: 'monospace', fontSize: 'var(--mantine-font-size-xs)' }}
        />

        {(completeBackup || mode === 'restore') && (
          <Radio.Group
            label="Import mode"
            value={mode}
            onChange={(value) => { setMode(value === 'restore' ? 'restore' : 'sessions'); setError(null); setExpectedRevision(mutationRevision); }}
          >
            <Stack gap="xs" mt="xs">
              <Radio value="sessions" label="Add sessions to this workspace" disabled={isImporting} />
              <Radio value="restore" label="Restore complete TabBoard backup" disabled={isImporting} />
            </Stack>
          </Radio.Group>
        )}

        {mode === 'restore' && (
          <Alert color="yellow" variant="light">
            Restore replaces all workspaces, sessions, categories, notes, settings and Bin entries.
            Your current storage location stays selected. A copy of current data is saved locally before replacement.
          </Alert>
        )}

        <Paper withBorder p="sm" bg="var(--mantine-color-gray-0)">
          <Text size="xs" c="dimmed" fw={500} mb="xs">
            Supported formats:
          </Text>
          <Stack gap={4}>
            <Text size="xs">
              <strong translate="no">TabBoard JSON</strong> - Full export format from <span translate="no">TabBoard</span>
            </Text>
            <Text size="xs">
              <strong>OneTab text</strong> - OneTab export format (title + URL pairs)
            </Text>
          </Stack>
        </Paper>

        {isPreviewPending && (
          <Text size="sm" c="dimmed" role="status">Updating preview…</Text>
        )}

        {preview && !previewError && (preview.groupCount > 0 || mode === 'restore' && completeBackup) && (
          <Alert icon={<IconCheck size={16} aria-hidden="true" />} color="green" variant="light">
            <Text size="sm" className="tabular-nums">
              {mode === 'restore' ? `Will restore ${formatNumber(completeBackup?.workspaceCount || 0)} workspace(s) and ` : 'Will import '}<strong>{formatNumber(preview.groupCount)}</strong> session{preview.groupCount !== 1 ? 's' : ''}{' '}
              with <strong>{formatNumber(preview.tabCount)}</strong> tab{preview.tabCount !== 1 ? 's' : ''}
            </Text>
          </Alert>
        )}

        {mode === 'sessions' && preview && preview.groupCount === 0 && importText.trim() && (
          <Alert icon={<IconAlertCircle size={16} aria-hidden="true" />} color="yellow" variant="light">
            <Text size="sm">No sessions found in the import text</Text>
          </Alert>
        )}

        {displayedError && (
          <Alert icon={<IconAlertCircle size={16} aria-hidden="true" />} color="red" variant="light">
            <Text size="sm">{displayedError}</Text>
          </Alert>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={handleClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            loading={isImporting}
            disabled={isPreviewPending || !!previewError || !preview || (mode === 'restore' ? !completeBackup : preview.groupCount === 0)}
            leftSection={<IconUpload size={16} aria-hidden="true" />}
          >
            {mode === 'restore' ? 'Restore Backup' : 'Import'}
          </Button>
        </Group>
      </Stack>
    </ManagerModal>
  );
}
