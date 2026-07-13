import { Stack, Title, Text, SimpleGrid, Group as MantineGroup, ActionIcon, Tooltip, Box } from '@mantine/core';
import { IconPlus, IconArchive, IconSearch, IconFolder, IconStar } from '@tabler/icons-react';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useFilteredGroups, useSearchQuery } from '../../hooks/useFilteredGroups';
import { SessionCard } from '../sessions/SessionCard';

interface WorkspaceContentProps {
  folderId: string | null;
  starred: boolean;
  workspaceName: string;
  highlightedGroupId?: string | null;
}

export function WorkspaceContent({ folderId, starred, workspaceName, highlightedGroupId }: WorkspaceContentProps) {
  const groups = useFilteredGroups(folderId, starred);
  const searchQuery = useSearchQuery();
  const hasSearch = searchQuery.trim().length > 0;

  const getTitle = () => {
    if (starred) return 'Starred';
    if (folderId) return 'Category';
    return 'Inbox';
  };

  const getEmptyState = () => {
    if (hasSearch) {
      return (
        <Box
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            border: '2px dashed var(--mantine-color-gray-3)',
            borderRadius: 'var(--mantine-radius-md)',
          }}
        >
          <IconSearch size={48} style={{ opacity: 0.3 }} />
          <Text mt="md" fw={500}>
            No results for "{searchQuery}"
          </Text>
          <Text size="sm" c="dimmed">
            Try different keywords or check your spelling
          </Text>
        </Box>
      );
    }

    if (starred) {
      return (
        <Box
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            border: '2px dashed var(--mantine-color-gray-3)',
            borderRadius: 'var(--mantine-radius-md)',
          }}
        >
          <IconStar size={48} style={{ opacity: 0.3 }} />
          <Text mt="md" fw={500}>
            No starred sessions yet
          </Text>
          <Text size="sm" c="dimmed">
            Star important sessions to find them quickly
          </Text>
        </Box>
      );
    }

    if (folderId) {
      return (
        <Box
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            border: '2px dashed var(--mantine-color-gray-3)',
            borderRadius: 'var(--mantine-radius-md)',
          }}
        >
          <IconFolder size={48} style={{ opacity: 0.3 }} />
          <Text mt="md" fw={500}>
            This category is empty
          </Text>
          <Text size="sm" c="dimmed">
            Move sessions here to organize your work
          </Text>
        </Box>
      );
    }

    return (
      <Box
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
          border: '2px dashed var(--mantine-color-gray-3)',
          borderRadius: 'var(--mantine-radius-md)',
        }}
      >
        <IconArchive size={48} style={{ opacity: 0.3 }} />
        <Text mt="md" fw={500}>
          No sessions here yet
        </Text>
        <Text size="sm" c="dimmed">
          Save tabs from your browser to get started
        </Text>
      </Box>
    );
  };

  return (
    <Stack gap="md">
      <MantineGroup justify="space-between">
        <Box>
          <Title order={2} size="h4">
            {getTitle()}
          </Title>
          <Text size="sm" c="dimmed">
            {groups.length} {groups.length === 1 ? 'session' : 'sessions'}
            {hasSearch && ` found`}
          </Text>
        </Box>
        <MantineGroup>
          <Tooltip label="Save current tabs">
            <ActionIcon variant="filled" color="blue">
              <IconPlus size={18} />
            </ActionIcon>
          </Tooltip>
        </MantineGroup>
      </MantineGroup>

      {groups.length === 0 ? (
        getEmptyState()
      ) : (
        <SortableContext
          items={groups.map((g) => `group-${g.id}`)}
          strategy={rectSortingStrategy}
        >
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {groups.map((group) => (
              <SessionCard key={group.id} group={group} highlighted={highlightedGroupId === group.id} />
            ))}
          </SimpleGrid>
        </SortableContext>
      )}
    </Stack>
  );
}
