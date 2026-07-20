import { useState, useCallback } from 'react';
import {
  Modal,
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
import { IconUpload, IconFileImport, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { parseImportedText } from '../../core/commands';

interface ImportModalProps {
  opened: boolean;
  onClose: () => void;
  folderId?: string | null;
}

export function ImportModal({ opened, onClose, folderId = null }: ImportModalProps) {
  const [importText, setImportText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<{ groupCount: number; tabCount: number } | null>(null);
  const importGroups = useTabBoardStore((state) => state.importGroups);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);

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
      const message = e instanceof Error ? e.message : 'Failed to parse import text';
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
      setError('Failed to read file');
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
      setError('Please enter or paste import text');
      return;
    }
    try {
      importGroups(importText, { workspaceId: activeWorkspaceId, folderId });
      setImportText('');
      setPreview(null);
      setError(null);
      onClose();
    } catch (e) {
      setError('Import failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  };

  const handleClose = () => {
    setImportText('');
    setPreview(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
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
            border: `2px dashed ${isDragging ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-gray-4)'}`,
            borderRadius: 'var(--mantine-radius-md)',
            padding: 'var(--mantine-spacing-xl)',
            textAlign: 'center',
            backgroundColor: isDragging ? 'var(--mantine-color-blue-0)' : 'transparent',
            transition: 'all 0.2s ease',
          }}
        >
          <Stack gap="xs" align="center">
            <IconUpload size={32} style={{ color: 'var(--mantine-color-gray-5)' }} />
            <Text size="sm" c="dimmed">
              Drag and drop a file here, or
            </Text>
            <Group justify="center">
              <FileButton
                onChange={handleFileSelect}
                accept=".json,.txt"
              >
                {(props) => (
                  <Button
                    variant="light"
                    leftSection={<IconFileImport size={16} />}
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
          placeholder="Paste import text here..."
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
              <strong>TabBoard JSON</strong> - Full export format from TabBoard
            </Text>
            <Text size="xs">
              <strong>OneTab text</strong> - OneTab export format (title + URL pairs)
            </Text>
          </Stack>
        </Paper>

        {preview && preview.groupCount > 0 && (
          <Alert icon={<IconCheck size={16} />} color="green" variant="light">
            <Text size="sm">
              Will import <strong>{preview.groupCount}</strong> session{preview.groupCount !== 1 ? 's' : ''}{' '}
              with <strong>{preview.tabCount}</strong> tab{preview.tabCount !== 1 ? 's' : ''}
            </Text>
          </Alert>
        )}

        {preview && preview.groupCount === 0 && importText.trim() && (
          <Alert icon={<IconAlertCircle size={16} />} color="yellow" variant="light">
            <Text size="sm">No sessions found in the import text</Text>
          </Alert>
        )}

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
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
            leftSection={<IconUpload size={16} />}
          >
            Import
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
