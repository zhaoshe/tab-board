import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTabDropMarkerPlacement } from '../components/sessions/TabItemRow';

const managerRoot = resolve(process.cwd(), 'src/manager');
const workspace = readFileSync(resolve(managerRoot, 'components/workspace/WorkspaceContent.tsx'), 'utf8');
const layout = readFileSync(resolve(managerRoot, 'components/shell/ManagerLayout.tsx'), 'utf8');
const card = readFileSync(resolve(managerRoot, 'components/sessions/SessionCard.tsx'), 'utf8');
const row = readFileSync(resolve(managerRoot, 'components/sessions/TabItemRow.tsx'), 'utf8');
const placeholder = readFileSync(resolve(managerRoot, 'components/sessions/SessionPlaceholder.tsx'), 'utf8');
const runtimePath = resolve(managerRoot, 'hooks/useManagerRuntime.ts');
const runtime = existsSync(runtimePath) ? readFileSync(runtimePath, 'utf8') : '';
const css = readFileSync(resolve(managerRoot, 'styles/manager.css'), 'utf8');

function cssBlock(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end + 1);
}

describe('Task108 session rendering contracts', () => {
  it('uses scoped shallow equality for workspace and session folder store selectors', () => {
    expect(workspace).toMatch(/import \{ useShallow \} from 'zustand\/react\/shallow';/);
    expect(workspace).toMatch(/useTabBoardStore\(\s*useShallow\(\(state\) => \(\{/);
    expect(workspace).toContain('currentFolder:');
    expect(workspace).not.toMatch(/folders: state\.folders/);
    expect(card).toMatch(/import \{ useShallow \} from 'zustand\/react\/shallow';/);
    expect(card).toMatch(/useTabBoardStore\(\s*useShallow\(\(state\) => state\.folders\.filter\(/);
  });

  it('uses a horizontal fixed-width board with a persistent new-session drop target', () => {
    expect(workspace).not.toContain('<SimpleGrid');
    expect(workspace).toContain('className="manager-board"');
    expect(workspace).toContain('className="session-board"');
    expect(workspace).toContain('data-drop-target="new-group"');

    const board = cssBlock('.manager-board');
    const sessions = cssBlock('.session-board');
    expect(board).toContain('overflow-x: auto');
    expect(board).toContain('overflow-y: hidden');
    expect(sessions).toContain('grid-auto-flow: column');
    expect(sessions).toContain('grid-auto-columns: minmax(320px, 360px)');
    expect(sessions).toContain('width: max-content');
    expect(sessions).toContain('height: 100%');
  });

  it('keeps the end target narrow without allocating a session-sized track', () => {
    const sessions = cssBlock('.session-board');
    const endTarget = cssBlock('.session-board__end-target');
    expect(sessions).toContain('position: relative');
    expect(sessions).toContain('padding-inline-end: 16px');
    expect(endTarget).toContain('position: absolute');
    expect(endTarget).toContain('inset-inline-end: 0');
    expect(endTarget).toContain('width: 16px');
    expect(endTarget).not.toContain('grid-column');
  });

  it('keeps targetGroupId reveals addressable by the session card id', () => {
    expect(layout).toContain('getElementById(`session-card-${pendingTargetGroupId}`)');
    expect(layout).toContain('setPendingTargetGroupId(targetGroupId)');
    expect(card).toContain('id={`session-card-${group.id}`}');
  });

  it('renders insertion-target highlight only for confirmed drag markers', () => {
    expect(workspace).toContain('data-over={isMarker || undefined}');
    expect(workspace).not.toContain('data-over={isOver || undefined}');
  });

  it('renders note bodies and falls back to the note title when empty', () => {
    expect(row).toContain('{tab.note || tab.title}');
  });

  it('makes the tab list the only vertical scroll owner inside full-height cards', () => {
    const cardBlock = cssBlock('.session-card');
    const tabsBlock = cssBlock('.session-card__tabs');
    expect(cardBlock).toContain('display: flex');
    expect(cardBlock).toContain('height: 100%');
    expect(cardBlock).toContain('min-width: 0');
    expect(cardBlock).toContain('min-height: 0');
    expect(tabsBlock).toContain('flex: 1');
    expect(tabsBlock).toContain('min-height: 0');
    expect(tabsBlock).toContain('overflow-y: auto');
    expect(tabsBlock).toContain('overflow-x: hidden');
  });

  it('keeps secondary metadata and tab delete controls hover-or-focus only', () => {
    expect(css).toContain('.session-card__header:hover .session-card__created');
    expect(css).toContain('.session-card__header:focus-within .session-card__created');
    expect(css).toContain('.tab-item-row__content:hover .tab-item-row__more');
    expect(row).toContain('className="tab-item-row__more"');
    expect(row).toContain('disabled={locked}');
  });

  it('keeps title opening exclusive to Restore', () => {
    expect(card).toMatch(/<button\s+type="button"\s+className="session-card__title"/);
    expect(card).not.toContain('handleTitleClick');
    expect(card).not.toContain('openSavedTabs(restorableTabs');
    expect(card).toContain('onDoubleClick={isDragOverlay ? undefined : handleTitleDoubleClick}');
    const titleControl = card.match(/<button type="button" className="session-card__title"[\s\S]*?<\/button>/)?.[0] || '';
    expect(titleControl).not.toContain('<button');
  });

  it('renders every matching tab and uses canonical indexes for filtered targets', () => {
    expect(card).not.toContain('slice(0, 5)');
    expect(card).toContain('group.tabs');
    expect(card).toContain('const tabMetadata = useMemo');
    expect(card).toContain('canonicalIndexByTabId');
    expect(card).toContain('selectedRefs');
    expect(card).toContain('linkCount');
    expect(card).toContain('noteCount');
    expect(card).toContain('tabIndex={tabMetadata.canonicalIndexByTabId.get(tab.id) ?? 0}');
    expect(card).not.toContain('group.tabs.findIndex');
    const title = cssBlock('.tab-item-row__title');
    expect(title).toContain('white-space: nowrap');
    expect(title).toContain('text-overflow: ellipsis');
    expect(row).not.toContain('lineClamp={1}');
  });

  it('shows saved link titles and URLs as separate lines', () => {
    expect(row).toContain('className="tab-item-row__details"');
    expect(row).toContain('className="tab-item-row__url"');
    expect(row).toContain('{tab.url}');
    const details = cssBlock('.tab-item-row__details');
    const url = cssBlock('.tab-item-row__url');
    expect(details).toContain('display: grid');
    expect(url).toContain('text-overflow: ellipsis');
  });

  it('keeps session metadata directly beneath the session title', () => {
    expect(card).toContain('className="session-card__heading"');
    expect(card).toContain('className="session-card__meta"');
    expect(card).not.toContain('session-card__footer');
    expect(cssBlock('.session-card__meta')).toContain('flex-wrap: wrap');
  });

  it('keeps insertion targets inside session slots instead of allocating grid tracks', () => {
    const slot = cssBlock('.session-board__group-slot');
    const insertion = cssBlock('.session-board__group-insert-target');
    expect(slot).toContain('position: relative');
    expect(slot).not.toContain('display: contents');
    expect(insertion).toContain('position: absolute');
    expect(insertion).toContain('inset-block: 0');
    expect(insertion).toContain('pointer-events: auto');
    expect(workspace).toContain('session-board__end-target');
  });

  it('renders resolved tab markers for rows and the group body/end position', () => {
    const marker = { kind: 'tab', groupId: 'group-a', tabId: 'tab-a', placement: 'after' } as const;
    expect(getTabDropMarkerPlacement(marker, 'group-a', 'tab-a')).toBe('after');
    expect(getTabDropMarkerPlacement(marker, 'group-a', 'other-tab')).toBeNull();
    expect(row).toContain('tab-item-row__drop-marker');
    expect(card).toContain('session-card__drop-marker');
    expect(card).toContain("dragMarker?.placement === 'body'");
  });

  it('memoizes session cards and scopes drag markers before passing props', () => {
    expect(card).toContain('export const SessionCard = memo(function SessionCard');
    expect(workspace).toContain('const GroupInsertionTarget = memo(function GroupInsertionTarget');
    expect(workspace).toContain('dragMarker={getSessionCardDragMarker(dragMarker, group.id)}');
    expect(workspace).not.toMatch(/<SessionCard[\s\S]*?dragMarker=\{dragMarker\}/);
  });

  it('keeps Chrome APIs behind the typed runtime boundary', () => {
    expect(card).not.toMatch(/\bchrome\./);
    expect(row).not.toMatch(/\bchrome\./);
    expect(runtime).toContain('openSavedTab');
    expect(runtime).toContain('openSavedTabs');
    expect(runtime).toContain('restoreGroup');
    expect(runtime).toContain('restoreTab');
    expect(layout).toContain('useManagerRuntime');
    expect(layout).toContain('runtime={runtime}');
    expect(workspace).toContain('runtime={runtime}');
  });

  it('keeps the approved session and tab action surfaces', () => {
    for (const label of ['Add link', 'Add note', 'Rename', 'Move to category', 'Lock', 'Unlock', 'Copy', 'Delete']) {
      expect(card).toContain(label);
    }
    expect(card).not.toContain('<ManagerMenuItem onClick={handleEditNote}>Edit note</ManagerMenuItem>');
    expect(card).toContain('disabled={isSessionMenuOpen}');
    for (const label of ['Copy URL', 'Copy text', 'Delete']) {
      expect(row).toContain(label);
    }
    expect(card).toContain('isRestorableTab');
    expect(card).not.toContain('IconStar');
    expect(card).not.toContain('starGroup');
    expect(row).not.toContain('IconEye');
    expect(row).not.toContain('preview');
  });

  it('keeps Restore as an external action instead of repeating it in More', () => {
    const moreMenu = card.match(/const menuItems = [\s\S]*?\n\n  if \(isDragging/)?.[0] || '';
    expect(moreMenu).not.toContain('Restore');
    expect(card).toContain('aria-label="Restore"');
  });

  it('guards destructive tab actions for locked groups', () => {
    expect(card).toContain('locked={group.locked}');
    expect(row).toContain('locked');
    expect(row).toMatch(/if \(locked[^\n]*return/);
    expect(card).toMatch(/if \(group\.locked[^\n]*return/);
  });

  it('keeps saved-tab identity on direct delete controls', () => {
    expect(card).toContain('lifecycleAllowance="session-removal"');
    expect(row).toContain('data-group-id={groupId}');
    expect(row).toContain('data-tab-id={tab.id}');
  });

  it('exposes an accessible keyboard drag handle carrying the sortable activator', () => {
    // The activator lives on a focusable button (not the non-focusable header),
    // so @dnd-kit's KeyboardSensor can pick up and reorder sessions. Spreading
    // attributes provides role/tabindex/aria-roledescription for AT.
    expect(card).toContain('ref={setActivatorNodeRef}');
    expect(card).toContain('className="session-card__drag-handle"');
    expect(card).toContain('aria-label={`Drag ${group.title} to reorder`}');
    expect(card).toContain('{...attributes}');
    expect(card).toContain('setActivatorNodeRef');
    // The header no longer owns the activator ref or keyboard listeners.
    expect(card).not.toContain('ref={isDragOverlay ? undefined : setActivatorNodeRef}');
    // The keyboard sensor uses sortable coordinates so arrows traverse columns.
    expect(layout).toContain('sortableKeyboardCoordinates');
    expect(layout).toContain('coordinateGetter: sortableKeyboardCoordinates');
  });

  it('uses immutable drag-start geometry for source placeholders', () => {
    expect(placeholder).not.toContain('height = 200');
    expect(placeholder).not.toContain('height,');
    expect(row).not.toContain('height: 28');
    expect(card).toContain('<SessionPlaceholder');
    expect(card).toContain('sourceRect');
    expect(row).toContain('sourceRect');
    expect(card).not.toContain('rect.current');
    expect(row).not.toContain('rect.current');
  });

  it('keeps hidden search sessions in canonical end-target indexing', () => {
    const emptyBranchStart = workspace.indexOf('{groups.length === 0 ?');
    const emptyBranchEnd = workspace.indexOf(') : (', emptyBranchStart);
    const emptyBranch = workspace.slice(emptyBranchStart, emptyBranchEnd);

    expect(emptyBranch).toContain('index={categoryGroups.length}');
    expect(emptyBranch).not.toContain('index={0}');
  });
});
