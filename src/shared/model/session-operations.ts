import {
  createGroupFromTabRecords,
  createId,
  createNoteRecord,
  createTabRecord,
  normalizeState,
  nowIso,
  resolveRestoreGroupPlacement,
} from './schema';
import { parseImportText, parseOneTabText } from './import-export';
import type { Group, TabBoardState, TabItem } from './types';

export function restoreGroupFromBin(
  state: TabBoardState,
  entryId: string,
  restoredAt = nowIso(),
): TabBoardState {
  const matchingEntries = state.bin.filter((item) => item.id === entryId);
  if (matchingEntries.length !== 1 || matchingEntries[0].kind !== 'group') {
    return state;
  }
  const entry = matchingEntries[0];
  const originalGroup = entry.item as Group;
  const placement = resolveRestoreGroupPlacement(
    state,
    entry,
    originalGroup.workspaceId,
    originalGroup.folderId,
    originalGroup.starred,
    originalGroup.archived,
  );
  const restored: Group = {
    ...originalGroup,
    id: originalGroup.id,
    workspaceId: placement.workspaceId,
    folderId: placement.folderId,
    createdAt: originalGroup.createdAt,
    updatedAt: restoredAt,
    tabs: originalGroup.tabs.map((tab) => ({
      ...tab,
      id: tab.id,
      createdAt: tab.createdAt,
      updatedAt: restoredAt,
    })),
  };

  const matchingIndexes = state.groups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) =>
      group.workspaceId === restored.workspaceId
      && group.folderId === restored.folderId
      && group.starred === restored.starred)
    .map(({ index }) => index);
  const categoryIndex = typeof entry.originalIndex === 'number'
    && entry.originalIndex >= 0
    ? Math.min(Math.trunc(entry.originalIndex), matchingIndexes.length)
    : matchingIndexes.length;
  const workspaceIndexes = state.groups
    .map((group, groupIndex) =>
      group.workspaceId === restored.workspaceId ? groupIndex : -1)
    .filter((groupIndex) => groupIndex >= 0);
  const insertionIndex = categoryIndex < matchingIndexes.length
    ? matchingIndexes[categoryIndex]
    : matchingIndexes.length
      ? matchingIndexes[matchingIndexes.length - 1] + 1
      : workspaceIndexes.length
        ? workspaceIndexes[workspaceIndexes.length - 1] + 1
        : state.groups.length;
  return {
    ...state,
    groups: [
      ...state.groups.slice(0, insertionIndex),
      restored,
      ...state.groups.slice(insertionIndex),
    ],
    bin: state.bin.filter((item) => item !== entry),
    updatedAt: restoredAt,
  };
}

function markdownOneTabGroups(text: string): Group[] {
  const groups: Group[] = [];
  for (const [index, block] of text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .entries()) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    const firstLine = lines[0];
    const firstLineIsMarkdown =
      /^(?:[-*+]\s+)?\[[^\]]+\]\([^)]+\)$/.test(firstLine);
    const title = firstLine.startsWith('http') || firstLineIsMarkdown
      ? ''
      : firstLine.replace(/^#+\s*/, '').trim();
    const tabs = lines.slice(title ? 1 : 0).flatMap((line): TabItem[] => {
      const markdown =
        line.match(/^(?:[-*+]\s+)?\[([^\]]+)\]\(([^)]+)\)$/);
      if (!markdown) return [];
      return [createTabRecord({
        title: markdown[1].trim(),
        url: markdown[2].trim(),
      })];
    });
    if (tabs.length) {
      groups.push(createGroupFromTabRecords(tabs, {
        title: title || `OneTab import ${index + 1}`,
      }));
    }
  }
  return groups;
}

function tabBoardTextGroups(text: string): Group[] {
  const groups: Group[] = [];
  let groupTitle = '';
  let pendingTitles: string[] = [];
  let tabs: TabItem[] = [];

  const flush = (): void => {
    if (!groupTitle) {
      pendingTitles = [];
      tabs = [];
      return;
    }
    const outputTabs = [
      ...tabs,
      ...pendingTitles.map((note) =>
        createNoteRecord(note, { title: note })),
    ];
    if (!outputTabs.length) {
      groupTitle = '';
      pendingTitles = [];
      tabs = [];
      return;
    }
    groups.push(createGroupFromTabRecords(outputTabs, { title: groupTitle }));
    groupTitle = '';
    pendingTitles = [];
    tabs = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) {
      flush();
      continue;
    }
    if (/^===\s.*\s===$/.test(value) || /^---\s.*\s---$/.test(value)) {
      flush();
      continue;
    }
    if (/^https?:\/\/\S+$/i.test(value)
      || /^(?:chrome|file|ftp):\/\/\S+$/i.test(value)) {
      if (!groupTitle) groupTitle = value;
      const linkTitle = pendingTitles.at(-1) || value;
      const notes = pendingTitles
        .slice(0, -1)
        .map((note) => createNoteRecord(note, { title: note }));
      tabs = [
        ...tabs,
        ...notes,
        createTabRecord({ title: linkTitle, url: value }),
      ];
      pendingTitles = [];
      continue;
    }
    if (!groupTitle) {
      groupTitle = value;
    } else {
      pendingTitles = [...pendingTitles, value];
    }
  }
  flush();
  return groups;
}

export function parseImportedText(text: string): Group[] {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error('Import text is required.');

  const isTabBoardText = /^===\s.*\s===$/m.test(raw)
    || /^---\s.*\s---$/m.test(raw);
  if (isTabBoardText) {
    const tabBoardGroups = tabBoardTextGroups(raw);
    if (tabBoardGroups.length) return tabBoardGroups;
  }

  const oneTabGroups = parseOneTabText(raw);
  const markdownGroups = markdownOneTabGroups(raw);
  if (markdownGroups.length) return markdownGroups;
  if (oneTabGroups.length) return oneTabGroups;
  const genericGroups = parseImportText(raw);
  if (!genericGroups.length) {
    throw new Error('No importable sessions found.');
  }
  return genericGroups;
}

export function importText(
  state: TabBoardState,
  text: string,
  options: { workspaceId: string; folderId: string | null },
): TabBoardState {
  const workspace = state.workspaces.find(
    (item) => item.id === options.workspaceId,
  );
  if (!workspace) throw new Error('Workspace not found.');
  if (options.folderId !== null) {
    const folder = state.folders.find(
      (item) => item.id === options.folderId,
    );
    if (!folder || folder.workspaceId !== workspace.id) {
      throw new Error('Folder does not belong to the requested workspace.');
    }
  }

  const importedGroups = parseImportedText(text);
  const timestamp = nowIso();
  const groups = importedGroups.map((source) => ({
    ...source,
    id: createId('group'),
    workspaceId: workspace.id,
    folderId: options.folderId,
    starred: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    tabs: source.tabs.map((tab) => ({
      ...tab,
      id: createId('tab'),
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  }));

  return normalizeState({
    ...state,
    groups: [...state.groups, ...groups],
    updatedAt: timestamp,
  });
}
