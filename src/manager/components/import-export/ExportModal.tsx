import { useState, useEffect } from 'react';
import {
  Modal,
  Textarea,
  Button,
  Group,
  Stack,
  Text,
  SegmentedControl,
  Alert,
} from '@mantine/core';
import { IconDownload, IconCopy, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { exportToText } from '../../../shared/model';

interface ExportModalProps {
  opened: boolean;
  onClose: () => void;
}

type ExportFormat = 'json' | 'text';

export function ExportModal({ opened, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('json');
  const [exportContent, setExportContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportAll = useTabBoardStore((state) => state.exportAll);
  const state = useTabBoardStore((state) => state);

  useEffect(() => {
    if (!opened) return;
    try {
      if (format === 'json') {
        setExportContent(exportAll());
      } else {
        setExportContent(exportToText(state));
      }
      setError(null);
    } catch (e) {
      setError('Export failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
      setExportContent('');
    }
  }, [format, opened, exportAll, state]);

  const handleCopy = async () => {
    if (!exportContent) return;
    try {
      await navigator.clipboard.writeText(exportContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError('Failed to copy to clipboard');
    }
  };

  const handleDownload = () => {
    if (!exportContent) return;
    const blob = new Blob([exportContent], {
      type: format === 'json' ? 'application/json' : 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = format === 'json' ? 'ziptab-export.json' : 'ziptab-export.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Export Sessions"
      size="lg"
      centered
    >
      <Stack gap="md">
        <SegmentedControl
          value={format}
          onChange={(value) => setFormat(value as ExportFormat)}
          data={[
            { label: 'JSON', value: 'json' },
            { label: 'Text (OneTab format)', value: 'text' },
          ]}
          fullWidth
        />

        {format === 'json' && (
          <Text size="xs" c="dimmed">
            TabBoard/ZipTab full format with all workspaces, folders, sessions, and settings.
          </Text>
        )}
        {format === 'text' && (
          <Text size="xs" c="dimmed">
            OneTab-compatible text format with titles and URLs. Can be imported into OneTab or other tools.
          </Text>
        )}

        <Textarea
          value={exportContent}
          readOnly
          minRows={15}
          autosize
          style={{ fontFamily: 'monospace', fontSize: 'var(--mantine-font-size-xs)' }}
        />

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            <Text size="sm">{error}</Text>
          </Alert>
        )}

        <Group justify="space-between" mt="md">
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
          <Group gap="xs">
            <Button
              variant="light"
              leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              onClick={handleCopy}
              disabled={!exportContent}
              color={copied ? 'green' : 'blue'}
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button
              leftSection={<IconDownload size={16} />}
              onClick={handleDownload}
              disabled={!exportContent}
            >
              Download
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
