import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collapseSearchState,
  getInitialSearchExpanded,
  isCategoryDragMarkerFor,
  runCategoryMutation,
  runValidatedCategoryMutation,
  shouldExpandSearchShortcut,
} from './WorkspaceHeader';

const source = readFileSync(resolve(process.cwd(), 'src/manager/components/workspace/WorkspaceHeader.tsx'), 'utf8');
const globalActionsSource = readFileSync(resolve(process.cwd(), 'src/manager/components/workspace/ManagerGlobalActions.tsx'), 'utf8');
const workspaceMenuSource = readFileSync(resolve(process.cwd(), 'src/manager/components/workspace/WorkspaceMenu.tsx'), 'utf8');
const categoryNavSource = readFileSync(resolve(process.cwd(), 'src/manager/components/workspace/CategoryNav.tsx'), 'utf8');
const categoryManagerSource = readFileSync(resolve(process.cwd(), 'src/manager/components/workspace/CategoryManager.tsx'), 'utf8');
const searchCommandSource = readFileSync(resolve(process.cwd(), 'src/manager/components/workspace/ManagerSearchCommand.tsx'), 'utf8');
const searchSource = readFileSync(resolve(process.cwd(), 'src/manager/components/search/SearchBar.tsx'), 'utf8');
const boardProjectionSource = readFileSync(resolve(process.cwd(), 'src/manager/hooks/useBoardProjection.ts'), 'utf8');
const selectorsSource = readFileSync(resolve(process.cwd(), 'src/manager/core/selectors.ts'), 'utf8');

describe('WorkspaceHeader source contracts', () => {
  it('renders an accessible category strip with a single category options menu', () => {
    expect(source).toContain('<CategoryNav');
    expect(source).toContain('<CategoryManager');
    expect(categoryNavSource).toContain('aria-label="Categories"');
    expect(categoryNavSource).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(categoryManagerSource).toContain('aria-label="Category Options"');
    expect(categoryManagerSource).toContain('Manage Categories');
    expect(categoryManagerSource).toContain('Add Category');
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

  it('keeps category drag labels focused on navigation', () => {
    expect(categoryNavSource).toContain('data-category-trigger="label"');
    expect(categoryNavSource).toContain('data-category-drag-handle');
    expect(categoryNavSource).toContain('setActivatorNodeRef');
    expect(categoryNavSource).toContain('aria-label={`Reorder ${item.label}`}');
    expect(categoryNavSource).not.toMatch(
      /data-category-trigger="label"[\s\S]{0,300}\{\.\.\.listeners\}/,
    );
    expect(categoryNavSource).not.toContain('className="manager-category-actions"');
    expect(categoryManagerSource).toContain('className="manager-category-actions"');
  });

  it('manages category creation, ordering, and custom-category naming in one surface', () => {
    expect(categoryManagerSource).toContain('title="Manage Categories"');
    expect(categoryManagerSource).toContain('moveCategory');
    expect(source).toContain('state.updateCategoryOrder(workspace.id, order)');
    expect(categoryManagerSource).toContain('openRename(item.folderId!)');
    expect(categoryManagerSource).toContain('Add Category');
  });

  it('shares validated and core mutation orchestration paths', () => {
    expect(categoryManagerSource).toContain('validateFolderName');
    expect(categoryManagerSource).toContain('runValidatedCategoryMutation');
    expect(source).toContain('state.addFolder(workspace.id');
    expect(source).toContain('onRenameFolder={state.renameFolder}');
    expect(categoryManagerSource).toContain('runCategoryMutation');
    expect(source).toContain('onDeleteFolder={state.deleteFolder}');
    expect(categoryManagerSource).toContain("onSelectCategory('inbox')");
    expect(categoryManagerSource).toContain('loading={submitting}');
  });

  it('keeps workspace selection and actions separate from header actions', () => {
    expect(source).toContain('<WorkspaceMenu');
    expect(workspaceMenuSource).toContain('New Workspace');
    expect(workspaceMenuSource).toContain('Rename Workspace');
    expect(workspaceMenuSource).toContain('Current Workspace');
    expect(workspaceMenuSource).toContain('IconCheck');
    expect(workspaceMenuSource).not.toContain('window.prompt');
    expect(source).toContain('<ManagerGlobalActions');
    expect(globalActionsSource).toContain('aria-label="Import"');
    expect(globalActionsSource).toContain('aria-label="Export"');
    expect(globalActionsSource).toContain('aria-label="Trash"');
    expect(globalActionsSource).toContain('aria-label="Options"');
    expect(globalActionsSource).toContain('aria-label="More Actions"');
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
    expect(source).toContain("workspace-header${searchExpanded ? ' workspace-header--search-expanded' : ''}");
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

    expect(selectorsSource).toMatch(/export type CategoryStripState = Pick<\s*TabBoardState,\s*'activeWorkspaceId'\s*\|\s*'workspaces'\s*\|\s*'folders'\s*\|\s*'groups'\s*\|\s*'categoryOrderByWorkspace'\s*>;/);
    expect(selectorsSource).toContain('getCategoryStrip(state: CategoryStripState)');
    expect(source).toMatch(/const categories = getCategoryStrip\(\{\s*activeWorkspaceId: state\.activeWorkspaceId,\s*workspaces: state\.workspaces,\s*folders: state\.folders,\s*groups: state\.groups,\s*categoryOrderByWorkspace: state\.categoryOrderByWorkspace,\s*\}\);/);
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
