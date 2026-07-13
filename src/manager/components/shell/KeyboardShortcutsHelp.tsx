import { useEffect } from 'react';
import { Modal, Stack, Group, Text, Kbd } from '@mantine/core';

interface Shortcut {
  keys: string[];
  description: string;
}

const shortcuts: Shortcut[] = [
  { keys: ['Ctrl', 'F'], description: 'Focus search' },
  { keys: ['Esc'], description: 'Clear search / Close dialog' },
  { keys: ['?'], description: 'Show keyboard shortcuts' },
];

interface KeyboardShortcutsHelpProps {
  opened: boolean;
  onClose: () => void;
  onOpen: () => void;
}

export function KeyboardShortcutsHelp({ opened, onClose, onOpen }: KeyboardShortcutsHelpProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        const tagName = target?.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) {
          return;
        }
        e.preventDefault();
        if (opened) {
          onClose();
        } else {
          onOpen();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [opened, onClose, onOpen]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Keyboard Shortcuts"
      size="sm"
      centered
    >
      <Stack gap="sm">
        {shortcuts.map((shortcut, index) => (
          <Group key={index} justify="space-between">
            <Text size="sm">{shortcut.description}</Text>
            <Group gap={4}>
              {shortcut.keys.map((key, i) => (
                <span key={i}>
                  {i > 0 && <Text size="sm" c="dimmed" span> + </Text>}
                  <Kbd>{key}</Kbd>
                </span>
              ))}
            </Group>
          </Group>
        ))}
      </Stack>
    </Modal>
  );
}
