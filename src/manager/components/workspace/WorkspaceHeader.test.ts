// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  act,
  createElement,
  useEffect,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';
import type { Workspace } from '../../../shared/model';
import {
  collapseSearchState,
  getInitialSearchExpanded,
  isCategoryDragMarkerFor,
  runCategoryMutation,
  runValidatedCategoryMutation,
  shouldExpandSearchShortcut,
  usePendingCreatedWorkspaceNavigation,
} from './WorkspaceHeader';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const source = readFileSync(resolve(process.cwd(), 'src/manager/components/workspace/WorkspaceHeader.tsx'), 'utf8');
const globalActionsSource = readFileSync(resolve(process.cwd(), 'src/manager/components/workspace/ManagerGlobalActions.tsx'), 'utf8');
const workspaceMenuSource = readFileSync(resolve(process.cwd(), 'src/manager/components/workspace/WorkspaceMenu.tsx'), 'utf8');
const categoryNavSource = readFileSync(resolve(process.cwd(), 'src/manager/components/workspace/CategoryNav.tsx'), 'utf8');
const categoryManagerSource = readFileSync(resolve(process.cwd(), 'src/manager/components/workspace/CategoryManager.tsx'), 'utf8');
const searchCommandSource = readFileSync(resolve(process.cwd(), 'src/manager/components/workspace/ManagerSearchCommand.tsx'), 'utf8');
const searchSource = readFileSync(resolve(process.cwd(), 'src/manager/components/search/SearchBar.tsx'), 'utf8');
const boardProjectionSource = readFileSync(resolve(process.cwd(), 'src/manager/hooks/useBoardProjection.ts'), 'utf8');
const selectorsSource = readFileSync(resolve(process.cwd(), 'src/manager/core/selectors.ts'), 'utf8');
const timestamp = '2026-07-31T00:00:00.000Z';
let navigationRoot: Root | null = null;
let navigationContainer: HTMLDivElement | null = null;

function workspace(id: string): Workspace {
  return {
    id,
    name: id,
    emoji: '🗂️',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function PendingNavigationHarness({
  workspaces,
  onQueueReady,
  onSelectWorkspace,
  onSelectCategory,
}: {
  workspaces: readonly Workspace[];
  onQueueReady: (queue: (workspaceId: string) => void) => void;
  onSelectWorkspace: (workspaceId: string, category: 'inbox') => void;
  onSelectCategory: (category: 'inbox') => void;
}) {
  const queue = usePendingCreatedWorkspaceNavigation({
    workspaces,
    onSelectWorkspace,
    onSelectCategory,
  } as never);
  useEffect(() => onQueueReady(queue), [onQueueReady, queue]);
  return null;
}

afterEach(async () => {
  if (navigationRoot) await act(async () => navigationRoot?.unmount());
  navigationRoot = null;
  navigationContainer?.remove();
  navigationContainer = null;
});

describe('WorkspaceHeader create navigation', () => {
  it('waits for the optimistic workspace projection before navigating exactly once', async () => {
    navigationContainer = document.createElement('div');
    document.body.append(navigationContainer);
    navigationRoot = createRoot(navigationContainer);
    const onSelectWorkspace = vi.fn();
    const onSelectCategory = vi.fn();
    let queueCreatedWorkspace: (workspaceId: string) => void = () => undefined;
    const baseWorkspaces = [workspace('workspace-personal')];
    const render = async (workspaces: readonly Workspace[]) => {
      await act(async () => {
        navigationRoot?.render(createElement(PendingNavigationHarness, {
          workspaces,
          onQueueReady: (queue) => {
            queueCreatedWorkspace = queue;
          },
          onSelectWorkspace: (workspaceId, category) =>
            onSelectWorkspace(workspaceId, category),
          onSelectCategory,
        }));
      });
    };

    await render(baseWorkspaces);
    await act(async () => queueCreatedWorkspace('workspace-created'));
    expect(onSelectWorkspace).not.toHaveBeenCalled();
    expect(onSelectCategory).not.toHaveBeenCalled();

    await render([...baseWorkspaces, workspace('workspace-created')]);
    expect(onSelectWorkspace).toHaveBeenCalledTimes(1);
    expect(onSelectWorkspace).toHaveBeenCalledWith('workspace-created', 'inbox');
    expect(onSelectCategory).not.toHaveBeenCalled();

    await render([...baseWorkspaces, workspace('workspace-created')]);
    expect(onSelectWorkspace).toHaveBeenCalledTimes(1);

    await act(async () => queueCreatedWorkspace('workspace-created-later'));
    await render([
      ...baseWorkspaces,
      workspace('workspace-created'),
      workspace('workspace-created-later'),
    ]);
    expect(onSelectWorkspace).toHaveBeenCalledTimes(2);
    expect(onSelectWorkspace).toHaveBeenLastCalledWith(
      'workspace-created-later',
      'inbox',
    );
  });
});

describe('WorkspaceHeader source contracts', () => {
  it('renders an accessible category strip with a single category options menu', () => {
    expect(source).toContain('<CategoryNav');
    expect(source).toContain('<CategoryManager');
    expect(categoryNavSource).toContain('aria-label="Categories"');
    expect(categoryNavSource).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(categoryManagerSource).toContain('label="Category Options"');
    expect(categoryManagerSource).toContain('Manage Categories');
    expect(categoryManagerSource).toContain('Add Category');
    expect(categoryManagerSource).toContain('Rename, reorder, or remove Categories');
    expect(categoryManagerSource).toContain('Create a custom Category');
    expect(globalActionsSource).toContain('Bring sessions into TabBoard');
    expect(globalActionsSource).toContain('Download a TabBoard backup');
    expect(workspaceMenuSource).toContain('Create another Workspace');
    expect(workspaceMenuSource).toContain('Rename, reorder, or remove Workspaces');
    expect(categoryNavSource).not.toContain('aria-label={`Actions for ${item.label}`}');
    expect(categoryManagerSource).toContain('Menu.Target');
  });

  it('renders compact category counts without showing inactive zeros', () => {
    expect(categoryNavSource).toContain('formatNumber(item.count)');
    expect(categoryNavSource).toContain('item.count > 0 || isActive');
    expect(categoryNavSource).toContain('className="manager-category-count tabular-nums"');
  });

  it('matches locked category markers only to their category and placement', () => {
    const marker = { kind: 'category-reorder', categoryId: 'folder-a', placement: 'after' } as const;
    expect(isCategoryDragMarkerFor(marker, 'folder-a')).toBe(true);
    expect(isCategoryDragMarkerFor(marker, 'folder-a', 'after')).toBe(true);
    expect(isCategoryDragMarkerFor(marker, 'folder-a', 'before')).toBe(false);
    expect(isCategoryDragMarkerFor(marker, 'folder-b')).toBe(false);
    expect(isCategoryDragMarkerFor({ kind: 'category', categoryId: 'folder-a', placement: 'after' }, 'folder-a')).toBe(false);
  });

  it('uses the whole category tab as the pointer-only drag activator without explicit reorder mode', () => {
    expect(categoryNavSource).toContain('data-category-trigger="label"');
    expect(categoryNavSource).toContain('setActivatorNodeRef');
    expect(categoryNavSource).toContain('{...surfaceListeners}');
    expect(categoryNavSource).toContain('onPointerDown?.(event)');
    expect(categoryNavSource).toContain('onTouchStart?.(event)');
    expect(categoryNavSource).toContain("event.pointerType === 'touch'");
    expect(categoryNavSource).not.toContain('data-category-drag-handle');
    expect(categoryNavSource).not.toContain('reorderMode');
    expect(categoryNavSource).not.toContain('{...attributes}');
    expect(categoryManagerSource).not.toContain('Reorder Categories');
    expect(categoryManagerSource).not.toContain('Done Reordering');
    expect(source).not.toContain('categoryReorderMode');
    expect(source).not.toContain('workspace-header--category-reorder');
    expect(categoryNavSource).not.toContain('className="manager-category-actions"');
    expect(categoryManagerSource).toContain('className="manager-category-actions"');
  });

  it('manages canonical ordering and shared custom-category editing in one surface', () => {
    expect(categoryManagerSource).toContain('title="Manage Categories"');
    expect(categoryManagerSource).toContain('moveCategory');
    expect(categoryManagerSource).toContain('data-category-manager-id');
    expect(categoryManagerSource).toContain('onDragStart');
    expect(source).toContain('onUpdateOrder={(order, { expectedCategoryOrder }) =>');
    expect(source).toContain('{ expectedCategoryOrder }');
    expect(categoryManagerSource).toContain('Edit Category');
    expect(categoryManagerSource).toContain('Save Category');
    expect(categoryManagerSource).not.toContain('Rename Category');
    expect(categoryManagerSource).toContain('Add Category');
  });

  it('shares validated and core mutation orchestration paths', () => {
    expect(categoryManagerSource).toContain('validateFolderName');
    expect(categoryManagerSource).toContain('runValidatedCategoryMutation');
    expect(source).toContain('state.addFolder(workspace.id');
    expect(source).toContain('onUpdateFolder={state.updateFolder}');
    expect(categoryManagerSource).toContain('runCategoryMutation');
    expect(source).toContain('onDeleteFolder={state.deleteFolder}');
    expect(categoryManagerSource).toContain("onSelectCategory('inbox')");
    expect(categoryManagerSource).toContain('loading={submitting}');
    expect(source).toContain('groups={state.groups}');
  });

  it('keeps workspace selection and actions separate from header actions', () => {
    expect(source).toContain('<WorkspaceMenu');
    expect(workspaceMenuSource).toContain('New Workspace');
    expect(workspaceMenuSource).toContain('Manage Workspaces');
    expect(workspaceMenuSource).toContain('label="Edit Workspace"');
    expect(workspaceMenuSource).toContain('<WorkspaceEditorModal');
    expect(workspaceMenuSource).toContain('<WorkspaceManagerModal');
    expect(workspaceMenuSource).not.toContain('Rename Workspace');
    expect(workspaceMenuSource).not.toContain('Change Emoji');
    expect(workspaceMenuSource).not.toContain('Current Workspace');
    expect(workspaceMenuSource).not.toContain('IconCheck');
    expect(workspaceMenuSource).not.toContain('window.prompt');
    expect(source).toContain('const workspaceId = state.addWorkspace(name, emoji)');
    expect(source).toContain('queueCreatedWorkspaceNavigation(workspaceId)');
    const createHandler = source.slice(
      source.indexOf('onCreate={({ name, emoji }) => {'),
      source.indexOf('onUpdateWorkspace={state.updateWorkspace}'),
    );
    expect(source).toContain("onSelectWorkspace(workspaceId, 'inbox')");
    expect(createHandler).not.toContain("onSelectCategory('inbox')");
    expect(source).toContain("onSelectWorkspace(workspaceId, 'inbox')");
    expect(source).toContain('onUpdateWorkspace={state.updateWorkspace}');
    expect(source).toContain('onUpdateWorkspaceOrder={state.updateWorkspaceOrder}');
    expect(source).toContain('onDeleteWorkspace={state.deleteWorkspace}');
    expect(source).toContain('<ManagerGlobalActions');
    expect(globalActionsSource).toContain('label="Bin"');
    expect(globalActionsSource).not.toContain('label="Trash"');
    expect(globalActionsSource).toContain('label="More Actions"');
    expect(globalActionsSource).toContain('Import');
    expect(globalActionsSource).toContain('Export');
    expect(globalActionsSource).toContain('Options');
    expect(source).not.toContain('Delete workspace');
    expect(source).not.toContain('Workspace Stats');
    expect(source).not.toContain('Reset category order');
    expect(source).not.toContain('Keyboard shortcuts');
    expect(source).not.toContain('tabs saved');
  });

  it('owns expandable search state and keeps shortcut effects independent of query changes', () => {
    expect(source).toContain('<ManagerSearchCommand');
    expect(searchCommandSource).toContain('aria-controls={SEARCH_INPUT_ID}');
    expect(searchCommandSource).toContain('aria-expanded={expanded}');
    expect(searchCommandSource).toContain('setExpanded');
    expect(source).toContain("searchExpanded && 'workspace-header--search-expanded'");
    expect(source).not.toContain('workspace-header--category-reorder');
    expect(searchCommandSource).toContain('fullWidth={false}');
    expect(searchCommandSource).toContain('onEscape={() => setSearchExpanded(collapseSearchState(query).isExpanded)}');
    expect(getInitialSearchExpanded('needle')).toBe(true);
    expect(getInitialSearchExpanded('')).toBe(false);
    expect(collapseSearchState('needle')).toEqual({ query: 'needle', isExpanded: false });

    const effects = [...searchCommandSource.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n\s*\},\s*\[([^\]]*)\]\);/g)];
    const shortcutEffect = effects.find(([, body]) => body.includes("window.addEventListener('keydown'"));
    expect(shortcutEffect).toBeDefined();
    expect(shortcutEffect?.[2].trim()).toBe('');
    expect(effects.some(([, body]) => body.includes('query') && body.includes('setIsSearchExpanded(true)'))).toBe(false);
  });

  it('keeps persistent topbar ownership in Workspace, Categories, Search, Bin, More order', () => {
    const workspaceIndex = source.indexOf('<WorkspaceMenu');
    const categoriesIndex = source.indexOf('<div className="manager-category-strip">');
    const searchIndex = source.indexOf('<ManagerSearchCommand');
    const globalIndex = source.indexOf('<ManagerGlobalActions');

    expect(workspaceIndex).toBeGreaterThanOrEqual(0);
    expect(categoriesIndex).toBeGreaterThan(workspaceIndex);
    expect(searchIndex).toBeGreaterThan(categoriesIndex);
    expect(globalIndex).toBeGreaterThan(searchIndex);
    expect(globalActionsSource).toContain('label="Bin"');
    const importIndex = globalActionsSource.indexOf('Import');
    const exportIndex = globalActionsSource.indexOf('Export');
    const optionsIndex = globalActionsSource.indexOf('Options');
    expect(importIndex).toBeGreaterThanOrEqual(0);
    expect(exportIndex).toBeGreaterThan(importIndex);
    expect(optionsIndex).toBeGreaterThan(exportIndex);
  });

  it('keeps search visually neutral while preserving exclusive expansion at 48px', () => {
    const headerCss = readFileSync(
      resolve(process.cwd(), 'src/manager/styles/header.css'),
      'utf8',
    );
    expect(headerCss).toMatch(
      /\.manager-search-toggle\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/,
    );
    expect(headerCss).toMatch(
      /\.workspace-header--search-expanded \.manager-category-strip\s*\{[^}]*display:\s*none;/,
    );
    expect(headerCss).not.toMatch(
      /\.manager-search-toggle\s*\{[^}]*background:\s*var\(--mantine-primary/,
    );
    expect(headerCss).toMatch(
      /\.manager-search-input \.mantine-TextInput-input\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;/,
    );
    expect(headerCss).toContain('.manager-topbar');
    expect(headerCss).toContain('grid-template-rows: 48px minmax(0, 1fr)');
  });

  it('keeps coarse Workspace manager actions visible, clickable, and 44px without row focus', () => {
    const headerCss = readFileSync(
      resolve(process.cwd(), 'src/manager/styles/header.css'),
      'utf8',
    );
    expect(headerCss).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.workspace-manager-row__actions\s*\{[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;[^}]*opacity:\s*1;/,
    );
    expect(headerCss).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.workspace-manager-row__actions \.accessible-icon-action\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/,
    );
  });

  it('uses concrete shallow store selectors and an exact category projection', () => {
    const selectorPattern = /useTabBoardStore\(\s*useShallow\(\(currentState\) => \(\{/;
    const memoizedSelectorPattern = /useTabBoardStore\(\s*useShallow\(\s*selectBoardState\s*\)\s*\)/;
    expect(source).toMatch(selectorPattern);
    expect(searchSource).not.toContain('useTabBoardStore');
    expect(searchSource).toContain('useBoardProjection(category)');
    expect(boardProjectionSource).toMatch(memoizedSelectorPattern);
    expect(boardProjectionSource).toContain('const selectBoardState = useMemo(createBoardStateSelector, []);');
    expect(source).not.toMatch(/useTabBoardStore\(\s*\)/);
    expect(boardProjectionSource).not.toMatch(/useTabBoardStore\(\s*\)/);

    expect(selectorsSource).toMatch(/export type CategoryStripState = Pick<\s*TabBoardState,\s*'activeWorkspaceId'\s*\|\s*'workspaces'\s*\|\s*'folders'\s*\|\s*'groups'\s*\|\s*'categoryOrderByWorkspace'\s*>\s*&\s*\{\s*bookmarkGroups\?: readonly Group\[\];\s*\};/);
    expect(selectorsSource).toContain('getCategoryStrip(state: CategoryStripState)');
    expect(source).toMatch(/const categories = getCategoryStrip\(\{\s*activeWorkspaceId: state\.activeWorkspaceId,\s*workspaces: state\.workspaces,\s*folders: state\.folders,\s*groups: state\.groups,\s*bookmarkGroups,\s*categoryOrderByWorkspace: state\.categoryOrderByWorkspace,\s*\}\);/);
  });

  it('orchestrates category validation, locking, errors, and cleanup', async () => {
    const invalidLock = { current: false };
    const invalidErrors: string[] = [];
    let invalidMutationCalls = 0;
    let validationSawLock = true;
    const invalidResult = await runValidatedCategoryMutation(
      invalidLock,
      () => {
        validationSawLock = invalidLock.current;
        return { ok: false as const, reason: 'empty' as const };
      },
      async () => {
        invalidMutationCalls += 1;
      },
      (message) => invalidErrors.push(message),
    );

    expect(invalidResult).toBe(false);
    expect(validationSawLock).toBe(false);
    expect(invalidMutationCalls).toBe(0);
    expect(invalidLock.current).toBe(false);
    expect(invalidErrors).toEqual(['Category name is required.']);

    const lock = { current: false };
    const errors: string[] = [];
    let resolveMutation!: () => void;
    const pendingMutation = new Promise<void>((resolve) => {
      resolveMutation = resolve;
    });
    let mutationCalls = 0;
    let firstSettled = false;
    const first = runCategoryMutation(
      lock,
      async () => {
        mutationCalls += 1;
        await pendingMutation;
      },
      (message) => errors.push(message),
    );
    void first.then(() => {
      firstSettled = true;
    });
    expect(await Promise.race([first.then(() => 'settled'), Promise.resolve('pending')])).toBe('pending');
    expect(firstSettled).toBe(false);

    const second = await runCategoryMutation(
      lock,
      async () => {
        mutationCalls += 1;
      },
      (message) => errors.push(message),
    );

    expect(second).toBe(false);
    expect(mutationCalls).toBe(1);
    resolveMutation();
    const firstResult = await first;
    expect(firstResult).toBe(true);
    expect(firstSettled).toBe(true);
    expect(lock.current).toBe(false);

    const rejected = { current: false };
    const rejectionErrors: string[] = [];
    const rejectionResult = await runCategoryMutation(
      rejected,
      async () => {
        throw new Error('Unable to save category.');
      },
      (message) => rejectionErrors.push(message),
    );

    expect(rejectionResult).toBe(false);
    expect(rejectionErrors).toEqual(['Unable to save category.']);
    expect(rejected.current).toBe(false);
  });
});

describe('WorkspaceHeader search shortcut guard', () => {
  it('opens from non-editable page targets', () => {
    expect(shouldExpandSearchShortcut({ tagName: 'DIV' } as unknown as EventTarget)).toBe(true);
    expect(shouldExpandSearchShortcut(null)).toBe(true);
  });

  it('expands only from slash or Ctrl/Cmd+K while preserving the editable-target guard', () => {
    expect(searchCommandSource).toContain("event.key.toLowerCase() === 'k'");
    expect(searchCommandSource).not.toContain("event.key.toLowerCase() === 'f'");
    expect(searchCommandSource).toContain("event.key === '/'");
  });

  it('does not steal slash from editable controls', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(shouldExpandSearchShortcut({ tagName } as unknown as EventTarget)).toBe(false);
    }
    expect(shouldExpandSearchShortcut({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(false);
  });

  it('keeps SearchBar free of the duplicate global find listener and gives close a label', () => {
    expect(searchSource).not.toContain("e.key === 'f'");
    expect(searchSource).not.toContain("window.addEventListener('keydown'");
    const textInputStart = searchSource.indexOf('<TextInput');
    const textInputEnd = searchSource.indexOf('\n      />', textInputStart);
    const textInputSource = searchSource.slice(textInputStart, textInputEnd);
    expect(textInputSource).toMatch(/rightSectionPointerEvents="all"[\s\S]*rightSection=\{[\s\S]*aria-label="Close Search"/);
    expect(searchSource).toContain("label=\"/ or Ctrl/Cmd + K\"");
  });
});
