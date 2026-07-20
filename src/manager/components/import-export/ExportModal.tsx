import { useState, useEffect, useRef } from 'react';
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
import { persistedSnapshot, useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { exportToText } from '../../../shared/model';

interface ExportModalProps {
  opened: boolean;
  onClose: () => void;
}

type ExportFormat = 'json' | 'text';

const COPY_FEEDBACK_DURATION_MS = 2000;

export function ExportModal({ opened, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('json');
  const [exportContent, setExportContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportAll = useTabBoardStore((state) => state.exportAll);
  const snapshot = useTabBoardStore(persistedSnapshot);

  useEffect(() => {
    if (!opened) return;
    try {
      if (format === 'json') {
        setExportContent(exportAll());
      } else {
        setExportContent(exportToText(snapshot));
      }
      setError(null);
    } catch (e) {
      setError('Export failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
      setExportContent('');
    }
  }, [format, opened, exportAll, snapshot]);

  useEffect(() => {
    if (!opened) {
      if (copyResetTimerRef.current !== null) {
        clearTimeout(copyResetTimerRef.current);
        copyResetTimerRef.current = null;
      }
      setCopied(false);
    }

    return () => {
      if (copyResetTimerRef.current !== null) {
        clearTimeout(copyResetTimerRef.current);
        copyResetTimerRef.current = null;
      }
    };
  }, [opened]);

  const handleCopy = async () => {
    if (!exportContent) return;
    try {
      await navigator.clipboard.writeText(exportContent);
      setCopied(true);
      if (copyResetTimerRef.current !== null) {
        clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = setTimeout(() => {
        copyResetTimerRef.current = null;
        setCopied(false);
      }, COPY_FEEDBACK_DURATION_MS);
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
    a.download = format === 'json' ? 'tabboard-export.json' : 'tabboard-export.txt';
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
      styles={{
        content: { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
        body: { display: 'flex', flexDirection: 'column', minHeight: 0 },
      }}
    >
      <Stack gap="md" style={{ minHeight: 0, flex: '1 1 auto', overflow: 'hidden' }}>
        <Stack
          data-testid="export-scroll-region"
          gap="md"
          style={{ minHeight: 0, overflowY: 'auto' }}
        >
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
            TabBoard full format with all workspaces, folders, sessions, and settings.
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
          aria-label="Exported session data"
          minRows={15}
          autosize
          style={{ fontFamily: 'monospace', fontSize: 'var(--mantine-font-size-xs)' }}
        />

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            <Text size="sm">{error}</Text>
          </Alert>
        )}

        </Stack>

        <Group
          data-testid="export-footer"
          justify="space-between"
          mt="md"
          style={{ flexShrink: 0 }}
        >
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
