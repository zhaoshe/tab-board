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
const searchSource = readFileSync(resolve(process.cwd(), 'src/manager/components/search/SearchBar.tsx'), 'utf8');
const filteredGroupsSource = readFileSync(resolve(process.cwd(), 'src/manager/hooks/useFilteredGroups.ts'), 'utf8');
const selectorsSource = readFileSync(resolve(process.cwd(), 'src/manager/core/selectors.ts'), 'utf8');

describe('WorkspaceHeader source contracts', () => {
  it('renders an accessible category strip with a single category options menu', () => {
    expect(source).toContain('aria-label="Categories"');
    expect(source).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(source).toContain('aria-label="Category options"');
    expect(source).toContain('Manage categories');
    expect(source).toContain('Add category');
    expect(source).not.toContain('aria-label={`Actions for ${item.label}`}');
    expect(source).toContain('Menu.Target');
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
    const categorySource = source.slice(source.indexOf('{categories.map'), source.indexOf('</nav>'));
    expect(source).toContain('data-category-trigger="label"');
    expect(source).not.toContain('data-category-trigger="dots"');
    expect(categorySource).not.toContain('className="manager-category-actions"');
    expect(source.indexOf('className="manager-category-actions"')).toBeGreaterThan(source.indexOf('</nav>'));
  });

  it('manages category creation, ordering, and custom-category naming in one surface', () => {
    expect(source).toContain('title="Manage categories"');
    expect(source).toContain('handleMoveCategory');
    expect(source).toContain('state.updateCategoryOrder(workspace.id, order)');
    expect(source).toContain('openRenameModal(item.folderId!)');
    expect(source).toContain('Add category');
  });

  it('shares validated and core mutation orchestration paths', () => {
    expect(source).toContain('validateFolderName');
    expect(source).toContain('runValidatedCategoryMutation');
    expect(source).toContain('state.addFolder(workspace.id');
    expect(source).toContain('state.renameFolder(folder.id');
    expect(source).toContain('runCategoryMutation');
    expect(source).toContain('state.deleteFolder(deletedId');
    expect(source).toContain("onSelectCategory('inbox')");
  });

  it('keeps workspace selection and actions separate from header actions', () => {
    expect(source).toContain('New workspace');
    expect(source).toContain('Rename workspace');
    expect(source).toContain('Current workspace');
    expect(source).toContain('IconCheck');
    expect(source).toContain('aria-label="Import"');
    expect(source).toContain('aria-label="Export"');
    expect(source).toContain('aria-label="Trash"');
    expect(source).toContain('aria-label="Options"');
    expect(source).not.toContain('Delete workspace');
    expect(source).not.toContain('Workspace Stats');
    expect(source).not.toContain('Reset category order');
    expect(source).not.toContain('Keyboard shortcuts');
    expect(source).not.toContain('tabs saved');
  });

  it('owns expandable search state and keeps shortcut effects independent of query changes', () => {
    expect(source).toContain('aria-controls={SEARCH_INPUT_ID}');
    expect(source).toContain('aria-expanded={isSearchExpanded}');
    expect(source).toContain('setIsSearchExpanded');
    expect(source).toContain("workspace-header${isSearchExpanded ? ' workspace-header--search-expanded' : ''}");
    expect(source).toContain('fullWidth={false}');
    expect(source).toContain('onEscape={() => setIsSearchExpanded(false)}');
    expect(getInitialSearchExpanded('needle')).toBe(true);
    expect(getInitialSearchExpanded('')).toBe(false);
    expect(collapseSearchState('needle')).toEqual({ query: 'needle', isExpanded: false });

    const effects = [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n\s*\},\s*\[([^\]]*)\]\);/g)];
    const shortcutEffect = effects.find(([, body]) => body.includes("window.addEventListener('keydown'"));
    expect(shortcutEffect).toBeDefined();
    expect(shortcutEffect?.[2].trim()).toBe('');
    expect(effects.some(([, body]) => body.includes('query') && body.includes('setIsSearchExpanded(true)'))).toBe(false);
  });

  it('uses concrete shallow store selectors and an exact category projection', () => {
    const selectorPattern = /useTabBoardStore\(\s*useShallow\(\(currentState\) => \(\{/;
    const memoizedSelectorPattern = /useTabBoardStore\(\s*useShallow\(\s*selectVisibleGroupsState\s*\)\s*\)/;
    expect(source).toMatch(selectorPattern);
    expect(searchSource).toMatch(selectorPattern);
    expect(filteredGroupsSource).toMatch(memoizedSelectorPattern);
    expect(filteredGroupsSource).toContain('const selectVisibleGroupsState = useMemo(createVisibleGroupsSelector, []);');
    expect(source).not.toMatch(/useTabBoardStore\(\s*\)/);
    expect(filteredGroupsSource).not.toMatch(/useTabBoardStore\(\s*\)/);

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
    expect(source).toContain("event.key.toLowerCase() === 'k'");
    expect(source).not.toContain("event.key.toLowerCase() === 'f'");
    expect(source).toContain("event.key === '/'");
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
    expect(textInputSource).toMatch(/rightSectionPointerEvents="all"[\s\S]*rightSection=\{[\s\S]*aria-label="Close search"/);
    expect(searchSource).toContain("label=\"/ or Ctrl/Cmd + K\"");
  });
});
