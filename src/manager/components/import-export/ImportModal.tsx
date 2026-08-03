import { useState, useCallback } from 'react';
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
} from '@mantine/core';
import {
  Check as IconCheck,
  CircleAlert as IconAlertCircle,
  Download as IconUpload,
  FileInput as IconFileImport,
} from 'lucide-react';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { parseImportedText } from '../../../shared/model/session-operations';
import { formatNumber } from '../../../shared/utils/formatters';
import type { CategoryFilter } from '../../core/selectors';
import { ManagerModal } from '../shell/ManagerModal';

interface ImportModalProps {
  opened: boolean;
  onClose: () => void;
  category?: CategoryFilter;
}

export function ImportModal({ opened, onClose, category = 'inbox' }: ImportModalProps) {
  const [importText, setImportText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<{ groupCount: number; tabCount: number } | null>(null);
  const importGroups = useTabBoardStore((state) => state.importGroups);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);

  const folderId = category.startsWith('folder:') ? category.slice('folder:'.length) : null;

  const updatePreview = useCallback((text: string) => {
    if (!text.trim()) {
      setPreview(null);
      setError(null);
      return;
    }
    try {
      const groups = parseImportedText(text);
      const tabCount = groups.reduce((sum, g) => sum + g.tabs.length, 0);
      setPreview({ groupCount: groups.length, tabCount });
      setError(null);
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'The import text could not be parsed.';
      const message = `${detail} Check that the text is a TabBoard export or OneTab URL list.`;
      setPreview(null);
      setError(message);
    }
  }, []);

  const handleTextChange = (value: string) => {
    setImportText(value);
    updatePreview(value);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      readFile(file);
    }
  }, []);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || '');
      setImportText(text);
      updatePreview(text);
    };
    reader.onerror = () => {
      setImportText('');
      setPreview(null);
      setError('The file could not be read. Choose a readable JSON or text export and try again.');
    };
    reader.readAsText(file);
  };

  const handleFileSelect = (file: File | null) => {
    if (file) {
      readFile(file);
    }
  };

  const handleImport = () => {
    if (!importText.trim()) {
      setError('Paste a TabBoard export or OneTab URL list before importing.');
      return;
    }
    try {
      importGroups(importText, { workspaceId: activeWorkspaceId, folderId });
      setImportText('');
      setPreview(null);
      setError(null);
      onClose();
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : 'unknown error'}. Check the format and try again.`);
    }
  };

  const handleClose = () => {
    setImportText('');
    setPreview(null);
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
          value={importText}
          onChange={(e) => handleTextChange(e.target.value)}
          minRows={10}
          autosize
          style={{ fontFamily: 'monospace', fontSize: 'var(--mantine-font-size-xs)' }}
        />

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

        {preview && preview.groupCount > 0 && (
          <Alert icon={<IconCheck size={16} aria-hidden="true" />} color="green" variant="light">
            <Text size="sm" className="tabular-nums">
              Will import <strong>{formatNumber(preview.groupCount)}</strong> session{preview.groupCount !== 1 ? 's' : ''}{' '}
              with <strong>{formatNumber(preview.tabCount)}</strong> tab{preview.tabCount !== 1 ? 's' : ''}
            </Text>
          </Alert>
        )}

        {preview && preview.groupCount === 0 && importText.trim() && (
          <Alert icon={<IconAlertCircle size={16} aria-hidden="true" />} color="yellow" variant="light">
            <Text size="sm">No sessions found in the import text</Text>
          </Alert>
        )}

        {error && (
          <Alert icon={<IconAlertCircle size={16} aria-hidden="true" />} color="red" variant="light">
            <Text size="sm">{error}</Text>
          </Alert>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!preview || preview.groupCount === 0}
            leftSection={<IconUpload size={16} aria-hidden="true" />}
          >
            Import
          </Button>
        </Group>
      </Stack>
    </ManagerModal>
  );
}
