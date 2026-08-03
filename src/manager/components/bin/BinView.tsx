import { useState } from 'react';
import {
  Stack,
  Title,
  Text,
  Group as MantineGroup,
  ActionIcon,
  Button,
  ScrollArea,
  Divider,
  Badge,
  Box,
  Paper,
} from '@mantine/core';
import {
  File as IconFile,
  Folder as IconFolder,
  SquareArrowOutUpRight as IconRestore,
  Trash as IconTrash,
} from 'lucide-react';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import type { BinEntry } from '../../../shared/model';
import { BIN_LIMIT } from '../../../shared/model';
import { formatNumber, formatRelativeTime } from '../../../shared/utils/formatters';
import { TabBoardTooltip } from '../../../shared/components/TabBoardTooltip';
import { ManagerModal } from '../shell/ManagerModal';

function formatDeletedAt(deletedAt: string): string {
  return formatRelativeTime(deletedAt);
}

interface BinEntryItemProps {
  entry: BinEntry;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

function BinEntryItem({ entry, onRestore, onDelete }: BinEntryItemProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = () => {
    setConfirmOpen(true);
  };

  const confirmDelete = () => {
    onDelete(entry.id);
    setConfirmOpen(false);
  };

  const locationParts: string[] = [];
  if (entry.originalWorkspaceName) {
    locationParts.push(entry.originalWorkspaceName);
  }
  if (entry.originalFolderName) {
    locationParts.push(entry.originalFolderName);
  }
  if (entry.kind === 'tab' && entry.groupTitle) {
    locationParts.push(entry.groupTitle);
  }
  const locationText = locationParts.length > 0 ? locationParts.join(' / ') : null;

  return (
    <>
      <Paper className="manager-bin-entry" withBorder p="sm" radius="md">
        <MantineGroup justify="space-between" wrap="nowrap">
          <MantineGroup gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <Box
              data-testid="bin-item-icon"
              aria-hidden="true"
              w={34}
              h={34}
              style={{
                display: 'grid',
                placeItems: 'center',
                borderRadius: 'var(--mantine-radius-sm)',
                color: entry.kind === 'group'
                  ? 'var(--tabboard-accent)'
                  : 'var(--mantine-color-dimmed)',
              }}
            >
              {entry.kind === 'group' ? (
                <IconFolder size={20} aria-hidden="true" />
              ) : (
                <IconFile size={20} aria-hidden="true" />
              )}
            </Box>
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <MantineGroup gap="xs" wrap="nowrap">
                <Text size="sm" fw={500} lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
                  {entry.label}
                </Text>
                <Badge size="xs" variant="light" color={entry.kind === 'group' ? 'blue' : 'gray'}>
                  {entry.kind === 'group' ? 'Session' : 'Tab'}
                </Badge>
              </MantineGroup>
              {locationText && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {locationText}
                </Text>
              )}
              <MantineGroup gap="xs" wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {formatDeletedAt(entry.deletedAt)}
                </Text>
              </MantineGroup>
            </Stack>
          </MantineGroup>
          <MantineGroup gap={4}>
            <TabBoardTooltip label="Restore">
              <ActionIcon
                size="sm"
                variant="subtle"
                aria-label={`Restore ${entry.label}`}
                onClick={() => onRestore(entry.id)}
              >
                <IconRestore size={16} aria-hidden="true" />
              </ActionIcon>
            </TabBoardTooltip>
            <TabBoardTooltip label="Delete Permanently">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                aria-label={`Delete ${entry.label} Permanently`}
                onClick={handleDelete}
              >
                <IconTrash size={16} aria-hidden="true" />
              </ActionIcon>
            </TabBoardTooltip>
          </MantineGroup>
        </MantineGroup>
      </Paper>
      <ManagerModal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete Permanently"
        size="sm"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to permanently delete <strong>{entry.label}</strong>?
            This action cannot be undone.
          </Text>
          <MantineGroup justify="flex-end" gap="xs">
            <Button variant="subtle" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmDelete}>
              Delete
            </Button>
          </MantineGroup>
        </Stack>
      </ManagerModal>
    </>
  );
}

export function BinView() {
  const bin = useTabBoardStore((state) => state.bin);
  const restoreFromBin = useTabBoardStore((state) => state.restoreFromBin);
  const deleteBinEntry = useTabBoardStore((state) => state.deleteBinEntry);
  const clearBin = useTabBoardStore((state) => state.clearBin);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const handleClearBin = () => {
    setClearConfirmOpen(true);
  };

  const confirmClearBin = () => {
    clearBin();
    setClearConfirmOpen(false);
  };

  return (
    <Stack gap="md" h="100%">
      <MantineGroup justify="space-between">
        <Box>
          <MantineGroup gap="xs">
            <IconTrash size={24} aria-hidden="true" />
            <Title order={2} size="h4">
              Trash
            </Title>
          </MantineGroup>
          <Text size="sm" c="dimmed" className="tabular-nums">
            {formatNumber(bin.length)} / {formatNumber(BIN_LIMIT)} {bin.length === 1 ? 'item' : 'items'}
          </Text>
        </Box>
        {bin.length > 0 && (
          <Button
            variant="light"
            color="red"
            size="sm"
            leftSection={<IconTrash size={16} aria-hidden="true" />}
            onClick={handleClearBin}
          >
            Empty Trash
          </Button>
        )}
      </MantineGroup>

      <Divider />

      {bin.length === 0 ? (
        <Box
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            border: '2px dashed var(--mantine-color-gray-3)',
            borderRadius: 'var(--mantine-radius-md)',
            flex: 1,
          }}
        >
          <IconTrash size={48} aria-hidden="true" style={{ opacity: 0.3 }} />
          <Text mt="md" c="dimmed" fw={500}>
            Trash is empty
          </Text>
          <Text size="sm" c="dimmed">
            Deleted sessions and tabs will appear here
          </Text>
        </Box>
      ) : (
        <ScrollArea style={{ flex: 1 }} type="scroll" scrollbarSize={4}>
          <Stack gap="xs">
            {bin.map((entry) => (
              <BinEntryItem
                key={entry.id}
                entry={entry}
                onRestore={restoreFromBin}
                onDelete={deleteBinEntry}
              />
            ))}
          </Stack>
        </ScrollArea>
      )}
      <ManagerModal
        opened={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        title="Empty Trash"
        size="sm"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to permanently delete all {formatNumber(bin.length)}{' '}
            {bin.length === 1 ? 'item' : 'items'} in Trash?
            This action cannot be undone.
          </Text>
          <MantineGroup justify="flex-end" gap="xs">
            <Button variant="subtle" onClick={() => setClearConfirmOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmClearBin}>
              Empty Trash
            </Button>
          </MantineGroup>
        </Stack>
      </ManagerModal>
    </Stack>
  );
}
