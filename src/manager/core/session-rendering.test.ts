import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTabDropMarkerPlacement } from '../components/sessions/TabItemRow';

const managerRoot = resolve(process.cwd(), 'src/manager');
const workspace = readFileSync(resolve(managerRoot, 'components/workspace/WorkspaceContent.tsx'), 'utf8');
const newSessionGapTargetPath = resolve(
  managerRoot,
  'components/workspace/NewSessionGapTarget.tsx',
);
const newSessionGapTarget = existsSync(newSessionGapTargetPath)
  ? readFileSync(newSessionGapTargetPath, 'utf8')
  : '';
const layout = [
  'components/shell/ManagerLayout.tsx',
  'components/shell/ManagerDndCoordinator.tsx',
  'components/shell/managerDndGeometry.ts',
  'components/shell/ManagerDragOverlay.tsx',
  'components/shell/useManagerDndSensors.ts',
  'hooks/useCaptureReveal.ts',
].map((file) => readFileSync(resolve(managerRoot, file), 'utf8')).join('\n');
const card = readFileSync(resolve(managerRoot, 'components/sessions/SessionCard.tsx'), 'utf8');
const slot = readFileSync(resolve(managerRoot, 'components/sessions/SessionSlot.tsx'), 'utf8');
const cardShell = readFileSync(
  resolve(managerRoot, 'components/sessions/SessionCardShell.tsx'),
  'utf8',
);
const cardHeader = readFileSync(resolve(managerRoot, 'components/sessions/SessionCardHeader.tsx'), 'utf8');
const sortableBindings = readFileSync(
  resolve(managerRoot, 'components/sessions/SessionSortableBindings.ts'),
  'utf8',
);
const sensorSource = readFileSync(
  resolve(managerRoot, 'components/shell/useManagerDndSensors.ts'),
  'utf8',
);
const cardMeta = readFileSync(resolve(managerRoot, 'components/sessions/SessionCardMeta.tsx'), 'utf8');
const tabList = readFileSync(resolve(managerRoot, 'components/sessions/SessionTabList.tsx'), 'utf8');
const row = readFileSync(resolve(managerRoot, 'components/sessions/TabItemRow.tsx'), 'utf8');
const composer = readFileSync(resolve(managerRoot, 'components/sessions/SessionItemComposer.tsx'), 'utf8');
const placeholder = readFileSync(resolve(managerRoot, 'components/sessions/SessionPlaceholder.tsx'), 'utf8');
const selectionToolbarPath = resolve(
  managerRoot,
  'components/sessions/SessionSelectionToolbar.tsx',
);
const selectionToolbar = existsSync(selectionToolbarPath)
  ? readFileSync(selectionToolbarPath, 'utf8')
  : '';
const targetPickerPath = resolve(
  managerRoot,
  'components/shell/SessionTargetPicker.tsx',
);
const targetPicker = existsSync(targetPickerPath)
  ? readFileSync(targetPickerPath, 'utf8')
  : '';
const runtimePath = resolve(managerRoot, 'hooks/useManagerRuntime.ts');
const runtime = existsSync(runtimePath) ? readFileSync(runtimePath, 'utf8') : '';
const css = [
  'header.css',
  'shell.css',
  'session.css',
  'overlays.css',
  'responsive.css',
].map((file) => readFileSync(resolve(managerRoot, 'styles', file), 'utf8')).join('\n');

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
    expect(card).not.toMatch(/import \{ useShallow \} from 'zustand\/react\/shallow';/);
    expect(card).not.toContain('state.folders');
  });

  it('uses a horizontal fixed-width board with explicit new-session gap targets', () => {
    expect(workspace).not.toContain('<SimpleGrid');
    expect(workspace).toContain('className="manager-board"');
    expect(workspace).toContain('className="session-board"');
    expect(workspace).toContain('<NewSessionGapTarget');
    expect(newSessionGapTarget).toContain("kind: 'new-session-insert'");
    expect(newSessionGapTarget).toContain('aria-hidden="true"');

    const board = cssBlock('.manager-board');
    const sessions = cssBlock('.session-board');
    const newSessionTarget = cssBlock('.new-session-gap-target');
    expect(board).toContain('overflow-x: auto');
    expect(board).toContain('overflow-y: hidden');
    expect(sessions).toContain('grid-auto-flow: column');
    expect(sessions).toContain('grid-auto-columns: 340px');
    expect(sessions).toContain('gap: 16px');
    expect(sessions).toContain('width: max-content');
    expect(sessions).toContain('height: 100%');
    expect(newSessionTarget).toContain('width: 20px');
    expect(newSessionTarget).toContain('height: 20px');
  });

  it('passes current drag state into the new-session anchor owner', () => {
    expect(layout).toContain('activeDragPayload={dnd.dragUiState.payload}');
    expect(layout).toContain('activeDropTarget={dnd.dragUiState.target}');
    expect(workspace).toContain("activeDragPayload?.kind === 'tab'");
    expect(workspace).toContain("activeDragPayload?.kind === 'tabs'");
    expect(workspace).toContain("activeDragPayload?.kind === 'open-tabs'");
    expect(workspace).toContain("activeDropTarget?.kind === 'new-session-insert'");
  });

  it('inherits the semantic foreground through native session title buttons', () => {
    const shell = cssBlock('.manager-shell');
    const titles = cssBlock('.session-card__title,\n.tab-item-row__title');

    expect(shell).toContain('color: var(--tabboard-text)');
    expect(titles).toContain('color: inherit');
  });

  it('centers the exact 20px hit area on the 16px gap and full-height slot', () => {
    const target = cssBlock('.new-session-gap-target');
    expect(target).toContain('position: absolute');
    expect(target).toContain('inset-inline-start: -18px');
    expect(target).toContain('inset-block-start: calc(50% - 10px)');
    expect(target).toContain('width: 20px');
    expect(target).toContain('height: 20px');
    expect(target).not.toContain('transform:');
    expect(target).not.toContain('inset-block: 0');
    expect(target).not.toContain('min-height:');
  });

  it('uses the whole first fixed track for canonical-empty category creation', () => {
    expect(workspace).toContain('categoryGroups.length === 0');
    expect(workspace).toContain('!hasSearch');
    expect(workspace).toContain("kind: 'new-session-insert'");
    expect(workspace).toContain('index: 0');
    expect(workspace).toContain('className="session-board__empty-slot-target"');
    expect(workspace).toContain('className="session-board__empty-slot-plus"');
    expect(workspace).toContain('Release to create session');

    const target = cssBlock('.session-board__empty-slot-target');
    const plus = cssBlock('.session-board__empty-slot-plus');
    expect(target).toContain('position: relative');
    expect(target).toContain('width: 340px');
    expect(target).toContain('height: 100%');
    expect(target).toContain('pointer-events: auto');
    expect(plus).toContain('position: absolute');
    expect(plus).toContain('inset-block-start: 50%');
    expect(plus).toContain('inset-inline-start: 50%');
    expect(plus).toContain('width: 20px');
    expect(plus).toContain('height: 20px');
    expect(plus).toContain('pointer-events: none');
    expect(css).toMatch(
      /\.session-board__empty-slot-target\[data-active='true'\]\s*\{[\s\S]*?border-color:[\s\S]*?background:/,
    );
  });

  it('keeps the drag overlay above the empty first-slot target and plus', () => {
    const target = cssBlock('.session-board__empty-slot-target');
    const plus = cssBlock('.session-board__empty-slot-plus');
    expect(target).toContain('z-index: 1');
    expect(plus).toContain('z-index: 2');
    expect(target).not.toMatch(/z-index:\s*(?:999|\d{4,})/);
    expect(plus).not.toMatch(/z-index:\s*(?:999|\d{4,})/);
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
    expect(row).toContain('const displayText = tab.note || tab.title');
    expect(row).toContain('{displayText}');
    expect(row).toContain("tab.itemType === ITEM_LINK ? tab.url : displayText");
    expect(row).toContain("title: tab.itemType === ITEM_LINK ? tab.title : displayText");
  });

  it('makes the tab list the only vertical scroll owner inside full-height cards', () => {
    const cardBlock = cssBlock('.session-card');
    const tabsBlock = cssBlock('.session-card__tabs');
    const slotBlock = cssBlock('.session-board__group-slot');
    expect(cardBlock).toContain('display: flex');
    expect(cardBlock).toContain('height: 100%');
    expect(cardBlock).toContain('min-width: 0');
    expect(cardBlock).toContain('min-height: 0');
    expect(tabsBlock).toContain('flex: 1');
    expect(tabsBlock).toContain('min-height: 0');
    expect(tabsBlock).toContain('overflow-y: auto');
    expect(tabsBlock).toContain('overflow-x: hidden');
    expect(slotBlock).toContain('height: calc(100% - 8px)');
    expect(slotBlock).toContain('margin-block: 3px 5px');
    expect(cssBlock('.session-board__empty-slot-target')).toContain('height: 100%');
  });

  it('uses subtle elevation with stronger interaction borders without changing geometry', () => {
    const cardBlock = cssBlock('.session-card');
    expect(cardBlock).toContain('box-shadow: var(--tabboard-session-shadow)');
    expect(css).toMatch(
      /\.session-card:is\(:hover, :focus-within\)\s*\{[\s\S]*?border-color:/,
    );
    expect(css).toMatch(
      /\.session-card\[data-highlighted='true'\]\s*\{[\s\S]*?border-color:/,
    );
  });

  it('uses the shared 32px action primitive and progressive disclosure in the Session header', () => {
    expect(cardHeader).toContain("from '../../../shared/components/AccessibleIconAction'");
    expect(cardHeader).toContain("from '../../../shared/components/TabBoardIcon'");
    expect(cardHeader).not.toContain('<ActionIcon');
    expect(cardHeader).toContain('<AccessibleIconAction');
    expect(cardHeader).toContain('<TabBoardIcon');
    expect(cardHeader).toContain('aria-expanded={isDragOverlay ? undefined : isMenuOpen}');

    const actions = cssBlock('.session-card__actions');
    expect(actions).toContain('opacity: 0');
    expect(actions).toContain('pointer-events: none');
    expect(css).toMatch(
      /\.session-card__header:hover \.session-card__actions,[\s\S]*?opacity: 1;[\s\S]*?pointer-events: auto;/,
    );
    expect(css).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.session-card__actions\s*\{[\s\S]*?opacity: 1;[\s\S]*?pointer-events: auto;/,
    );
  });

  it('implements the confirmed T1 title and S1 Session note hierarchy', () => {
    const title = cssBlock('.session-card__title');

    expect(title).toContain('display: -webkit-box');
    expect(title).toContain('font-size: 14px');
    expect(title).toContain('line-height: 18px');
    expect(title).toContain('-webkit-line-clamp: 2');
    expect(title).toContain('white-space: normal');
    expect(css).toMatch(
      /button\.session-card__note\s*\{[\s\S]*?border-inline-start: 2px solid var\(--tabboard-accent\);[\s\S]*?border-radius: var\(--mantine-radius-sm\);[\s\S]*?background: var\(--tabboard-accent-soft\);/,
    );
  });

  it('keeps secondary metadata and tab delete controls hover-or-focus only', () => {
    expect(css).toContain('.session-card__header:hover .session-card__created');
    expect(css).toContain('.session-card__header:focus-within .session-card__created');
    expect(css).toContain('.tab-item-row__content:hover .tab-item-row__delete');
    expect(css).not.toContain(
      '.tab-item-row__content[data-selection-mode] .tab-item-row__delete',
    );
    expect(row).toContain("'tab-item-row__delete'");
    expect(row).toContain("'tab-item-row__delete--loading'");
    expect(row).toContain('disabled={locked}');
  });

  it('uses the shared 32px neutral quick action for Saved Tab deletion', () => {
    expect(row).toContain("from '../../../shared/components/AccessibleIconAction'");
    expect(row).not.toContain('<ActionIcon');
    expect(row).toContain('<AccessibleIconAction');
    expect(row).toContain("'tab-item-row__delete'");
    expect(row).toContain("label={isTitleRefreshing ? 'Refreshing title' : 'Delete'}");
    expect(row).toContain('loading={isTitleRefreshing}');
    expect(cssBlock('.tab-item-row__content'))
      .toContain('grid-template-columns: 20px minmax(0, 1fr)');
    expect(css).toMatch(
      /\.tab-item-row__delete\.accessible-icon-action\s*\{[\s\S]*?position: absolute;[\s\S]*?inset-inline-end: 6px;/,
    );
    expect(css).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.tab-item-row__content\s*\{[\s\S]*?grid-template-columns: 20px minmax\(0, 1fr\) 32px;/,
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.tab-item-row__content\s*\{[\s\S]*?grid-template-columns: 20px minmax\(0, 1fr\) 44px;/,
    );
    expect(css).toMatch(
      /\.tab-item-row__delete\.accessible-icon-action\s*\{[\s\S]*?opacity: 0;[\s\S]*?pointer-events: none;/,
    );
    expect(css).toMatch(
      /\.tab-item-row__content:hover \.tab-item-row__delete\.accessible-icon-action--disabled,[\s\S]*?opacity: var\(--tabboard-action-disabled-opacity\);/,
    );
  });

  it('keeps title opening exclusive to Restore', () => {
    expect(cardHeader).toMatch(/<button\s+type="button"\s+className="session-card__title"/);
    expect(card).not.toContain('handleTitleClick');
    expect(card).not.toContain('openSavedTabs(restorableTabs');
    expect(cardHeader).toContain('onDoubleClick={isDragOverlay ? undefined : onTitleDoubleClick}');
    const titleControl = cardHeader.match(/<button type="button" className="session-card__title"[\s\S]*?<\/button>/)?.[0] || '';
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
    expect(card).toContain('canonicalIndexByTabId={tabMetadata.canonicalIndexByTabId}');
    expect(tabList).toContain('tabIndex={canonicalIndexByTabId.get(tab.id) ?? 0}');
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
    const url = cssBlock('.tab-item-row__url,\n.tab-item-row__type');
    expect(details).toContain('display: grid');
    expect(url).toContain('text-overflow: ellipsis');
  });

  it('uses stored favicons for saved links while notes keep their note icon', () => {
    expect(row).toContain('<Favicon');
    expect(row).toContain('src={tab.favIconUrl}');
    expect(row).toContain('fallback={<IconLink');
    expect(row).toContain('<IconFileText size={16} aria-hidden="true" />');
  });

  it('keeps session metadata directly beneath the session title', () => {
    expect(cardHeader).toContain('className="session-card__heading"');
    expect(cardHeader).toContain('<SessionCardMeta');
    expect(cardMeta).toContain('className="session-card__meta"');
    expect(cardMeta).toContain('role="group"');
    expect(cardMeta).toContain('aria-label="Session Details"');
    expect(card).not.toContain('session-card__footer');
    expect(cssBlock('.session-card__meta')).toContain('flex-wrap: wrap');
  });

  it('uses semantic title buttons as read-only tooltip triggers', () => {
    const details = row.match(/<div className="tab-item-row__details">[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(details.match(/<button/g)).toHaveLength(2);
    expect(details).toContain('data-info-popover');
    expect(details).not.toContain('aria-haspopup');
    expect(details).not.toContain('aria-expanded');
  });

  it('keeps insertion targets inside session slots instead of allocating grid tracks', () => {
    const slot = cssBlock('.session-board__group-slot');
    const insertion = cssBlock('.session-board__group-insert-target');
    const newSessionTarget = cssBlock('.new-session-gap-target');
    expect(slot).toContain('position: relative');
    expect(slot).not.toContain('display: contents');
    expect(insertion).toContain('position: absolute');
    expect(insertion).toContain('inset-block: 0');
    expect(insertion).toContain('pointer-events: auto');
    expect(newSessionTarget).toContain('position: absolute');
    expect(workspace).not.toContain('session-board__end-target');
  });

  it('renders resolved tab markers for rows and the group body/end position', () => {
    const marker = { kind: 'tab', groupId: 'group-a', tabId: 'tab-a', placement: 'after' } as const;
    expect(getTabDropMarkerPlacement(marker, 'group-a', 'tab-a')).toBe('after');
    expect(getTabDropMarkerPlacement(marker, 'group-a', 'other-tab')).toBeNull();
    expect(row).toContain('tab-item-row__drop-marker');
    expect(tabList).toContain('session-card__drop-marker');
    expect(tabList).toContain("dragMarker.placement === 'body'");
  });

  it('memoizes session cards and scopes drag markers before passing props', () => {
    expect(card).toContain('export const SessionCard = memo(function SessionCard');
    expect(workspace).toContain('const GroupInsertionTarget = memo(function GroupInsertionTarget');
    expect(workspace).toContain('dragMarker={getSessionCardDragMarker(dragMarker, group.id)}');
    expect(workspace).not.toMatch(/<SessionCard[\s\S]*?dragMarker=\{dragMarker\}/);
  });

  it('uses the Manager selection scope instead of deriving saved mode from selected IDs', () => {
    expect(layout).toContain('useManagerSelectionScope');
    expect(layout).toContain('selectionScope={selectionScope}');
    expect(workspace).toContain('selectionScope={selectionScope}');
    expect(slot).toContain('selectionScope={selectionScope}');
    expect(card).toContain("selectionScope?.scope?.kind === 'saved-tabs'");
    expect(card).toContain('selectionScope.scope.groupId === group.id');
    expect(card).toContain('selectionScope?.commands.enterSavedTabs(group.id)');
    expect(tabList).toContain('selectionMode={selectionMode}');
    expect(tabList).not.toContain('selectionMode={selectedTabIds.size > 0}');
  });

  it('keeps drag overlay SessionCards outside selection scope registration', () => {
    const overlay = readFileSync(
      resolve(managerRoot, 'components/shell/ManagerDragOverlay.tsx'),
      'utf8',
    );
    expect(overlay).toContain(
      '<SessionCard group={activeGroup} runtime={runtime} isDragOverlay />',
    );
    expect(overlay).not.toMatch(
      /<SessionCard[^>]*isDragOverlay[^>]*selectionScope=/,
    );
    expect(card).toContain('if (isDragOverlay || !registerSavedTabsClear) return;');
  });

  it('keeps Chrome APIs behind the typed runtime boundary', () => {
    expect(card).not.toMatch(/\bchrome\./);
    expect(row).not.toMatch(/\bchrome\./);
    expect(runtime).toContain('openSavedTab');
    expect(runtime).toContain('openSavedTabs');
    expect(runtime).toContain('refreshSavedTabTitle');
    expect(runtime).toContain("type: 'refresh-saved-tab-title'");
    expect(runtime).toContain('restoreGroup');
    expect(runtime).toContain('restoreTab');
    expect(runtime).toContain('restoreTabs');
    expect(runtime).toContain("type: 'restore-refs'");
    expect(layout).toContain('useManagerRuntime');
    expect(layout).toContain('runtime={runtime}');
    expect(workspace).toContain('runtime={runtime}');
  });

  it('keeps the approved session and tab action surfaces', () => {
    for (const label of ['Add Link', 'Add Note', 'Rename Session', 'Edit Session Note', 'Move Session', 'Lock Session', 'Unlock Session', 'Refresh All Titles', 'Copy Links', 'Select Tabs', 'Delete Session']) {
      expect(card).toContain(label);
    }
    expect(card).toContain('runtime.refreshSavedGroupTitles(group.id)');
    expect(card).toContain("showSuccess('Titles refreshed')");
    expect(card).toContain('`${result.refreshed} titles refreshed, ${result.failed} failed`');
    expect(card).toMatch(
      /\{!readOnly && \(\s*<ManagerMenuItem[\s\S]*?label="Refresh All Titles"/,
    );
    expect(card).not.toContain('Move to Category');
    expect(card).not.toContain('categoryOptions');
    expect(card).not.toContain('handleMoveToCategory');
    expect(card).not.toContain('openMoveMenu');
    expect(card).toMatch(
      /<ManagerMenuItem[\s\S]*?label="Move Session"[\s\S]*?disabled=\{group\.locked \|\| !onOpenSessionTargetPicker\}[\s\S]*?preventFocusRestore=\{Boolean\(onOpenSessionTargetPicker\)\}/,
    );
    expect(card).toContain("mode: 'move-session-category'");
    expect(card).toContain("source: { kind: 'session', groupId: group.id }");
    expect(card).toContain('if (!onOpenSessionTargetPicker || !trigger) return;');
    expect(card).toMatch(
      /if \(!onOpenSessionTargetPicker \|\| !trigger\) return;[\s\S]*?onOpenSessionTargetPicker\(\{/,
    );
    expect(card).toContain('onClick={handleEditNote}');
    expect(cardHeader).toContain('tooltipDisabled={isMenuOpen}');
    expect(card).toContain('icon={Trash}');
    expect(card).not.toContain('icon={Trash2}');
    for (const label of ['Add Note', 'Edit Note', 'Refresh Title', 'Copy URL', 'Copy Text', 'Delete Saved Tab', 'Delete Saved Note']) {
      expect(row).toContain(label);
    }
    expect(row).toMatch(
      /label="Refresh Title"[\s\S]*?onClick=\{handleRefreshTitle\}/,
    );
    expect(row).toContain('else void runtime.restoreTab(groupId, tab.id)');
    expect(row).toContain('icon={Trash}');
    expect(row).not.toContain('icon={Trash2}');
    expect(row).toContain("ariaLabel: 'Saved Tab Actions'");
    expect(row).toContain('isContextMenuKey');
    expect(row).toContain('onContextMenu');
    expect(row).not.toMatch(/<ManagerMenuItem[^>]*>Select<\/ManagerMenuItem>/);
    expect(card).toContain('isRestorableTab');
    expect(card).not.toContain('IconStar');
    expect(card).not.toContain('starGroup');
    expect(row).not.toContain('IconEye');
    expect(row).not.toContain('preview');
  });

  it('replaces the Session header in place with the shared selection toolbar', () => {
    expect(card).toContain('<SessionSelectionToolbar');
    expect(card).toMatch(/selectionMode\s*\?\s*\(\s*<SessionSelectionToolbar/);
    expect(card).not.toMatch(
      /<SessionCardHeader[\s\S]*?<SessionSelectionToolbar/,
    );
    expect(selectionToolbar).toContain('Restore Selected Links');
    expect(selectionToolbar).toContain('Copy Selected URLs');
    expect(selectionToolbar).toContain('Move Selected Items');
    expect(selectionToolbar).toContain('Delete Selected Items');
    expect(selectionToolbar).toContain('Exit Session Selection Mode');
    expect(selectionToolbar).toContain('<TabBoardIcon');
    expect(selectionToolbar).not.toContain(['@tabler', 'icons-react'].join('/'));
  });

  it('keeps picker preview UI-only and commits through the typed store facade', () => {
    expect(targetPicker).toContain("export type SessionTargetPickerMode =");
    expect(targetPicker).toContain("| 'move-saved-tabs'");
    expect(targetPicker).toContain("| 'save-open-tabs'");
    expect(targetPicker).toContain("| 'move-session-category'");
    expect(targetPicker).toContain('onPreview');
    expect(targetPicker).toContain('onCancel');
    expect(targetPicker).toContain('onCommit');
    expect(targetPicker).toContain('<ManagerModal');
    expect(targetPicker).not.toContain('DropTarget');
    expect(targetPicker).not.toContain('new-session-insert');
    expect(layout).toContain('<SessionTargetPicker');
    expect(layout).toContain('applyDropIntent');
  });

  it('shares one 20px owner slot between the saved favicon and checkbox', () => {
    expect(row).toContain('className="manager-tab-owner-slot tab-item-row__owner-slot"');
    expect(row).toContain('size={16}');
    const ownerSlot = cssBlock('.manager-tab-owner-slot');
    expect(ownerSlot).toContain('width: 20px');
    expect(ownerSlot).toContain('height: 20px');
    expect(ownerSlot).toContain('position: relative');
    expect(ownerSlot).toContain('padding: 0');
  });

  it('uses a validated in-app composer instead of native prompts', () => {
    expect(card).toContain('<SessionItemComposer');
    expect(card).not.toContain('window.prompt');
    expect(composer).toContain('name="session-link-url"');
    expect(composer).toContain('name="session-link-title"');
    expect(composer).toContain('name="session-note-text"');
    expect(composer).not.toContain('window.prompt');
  });

  it('keeps Restore as an external action instead of repeating it in More', () => {
    const moreMenu = card.match(/const menuItems = [\s\S]*?\n\n  if \(isDragging/)?.[0] || '';
    expect(moreMenu).not.toContain('Restore');
    expect(cardHeader).toContain('label="Restore"');
  });

  it('guards destructive tab actions for locked groups', () => {
    expect(card).toContain('locked={group.locked}');
    expect(row).toContain('locked');
    expect(row).toMatch(/if \(locked[^\n]*return/);
    expect(card).toMatch(/if \(group\.locked[^\n]*return/);
  });

  it('routes saved-item deletion through the shared confirmation owner', () => {
    expect(card).toContain('useDestructiveConfirmation');
    expect(row).toContain('useDestructiveConfirmation');
    expect(card).not.toContain('window.confirm');
    expect(card).not.toMatch(/\bconfirm\(/);
    expect(row).not.toContain('window.confirm');
    expect(row).not.toMatch(/\bconfirm\(/);
    expect(card).toContain('confirmBeforeDestructive');
    expect(row).toContain('confirmBeforeDestructive');
    expect(row).toContain('Delete Saved Note');
  });

  it('keeps event-only store commands at SessionCard ownership', () => {
    expect(card).toContain('const tabCommands');
    expect(tabList).toContain('commands={commands}');
    expect(row).not.toContain('useTabBoardStore');
    expect(row).not.toContain('(state) => state.updateTab');
    expect(row).not.toContain('(state) => state.deleteTab');
    expect(row).not.toContain('(state) => state.settings');
  });

  it('replaces saved drag sources and disables text selection during drag', () => {
    expect(slot).toContain('if (isDragging)');
    expect(slot).toContain('className="session-card__placeholder-slot"');
    expect(row).toContain('if (isDragging && !isDragOverlay)');
    expect(row).toContain('className="tab-item-row-placeholder"');
    expect(layout).toContain('dragActive={Boolean(dnd.activeId)}');
    expect(css).toContain('.manager-shell--drag-active');
    expect(css).toContain('user-select: none');
  });

  it('keeps saved-tab identity on direct delete controls', () => {
    expect(card).toContain('lifecycleAllowance="session-removal"');
    expect(row).toContain('data-group-id={groupId}');
    expect(row).toContain('data-tab-id={tab.id}');
  });

  it('uses pointer-only session surfaces and leaves keyboard results to commands', () => {
    const gripIcon = ['Icon', 'GripVertical'].join('');
    const handleClass = ['session-card__drag', 'handle'].join('-');
    const keyboardSensor = ['Keyboard', 'Sensor'].join('');
    const keyboardCoordinates = ['sortableKeyboard', 'Coordinates'].join('');

    expect(card).toContain('onPointerDown={handleSessionPointerDown}');
    expect(card).toContain('onTouchStart={handleSessionTouchStart}');
    expect(card).toContain('sortable?.listeners?.onPointerDown?.(event)');
    expect(card).toContain('sortable?.listeners?.onTouchStart?.(event)');
    expect(card).toContain(
      "'input, textarea, a, [data-no-drag], .session-card__actions, .session-card__tabs'",
    );
    expect(card).toContain(
      "button.matches('.session-card__title, .session-card__note')",
    );
    expect(card).not.toContain(
      "target.closest('button, input, textarea, a, [data-no-drag]')",
    );
    expect(cardHeader).not.toContain('onPointerDown=');
    expect(cardHeader).not.toContain('onTouchStart=');
    expect(cardHeader).not.toContain('onHeaderPointerDown');
    expect(cardHeader).not.toContain('onHeaderTouchStart');
    expect(cardHeader).toContain('className="session-card__title"');
    expect(cardShell).toContain('sortable.listeners?.onPointerDown?.(event)');
    expect(cardShell).toContain('sortable.listeners?.onTouchStart?.(event)');
    expect(cardShell).toContain(
      "'input, textarea, a, [data-no-drag], .session-card__actions, .session-card__tabs'",
    );
    expect(cardShell).toContain(
      "button.matches('.session-card__title, .session-card__note')",
    );
    expect(cardShell).not.toContain(
      "target.closest('button, input, textarea, a, [data-no-drag]')",
    );
    expect(row).toContain('listeners?.onTouchStart?.(event)');
    expect(row).not.toContain('{...(!isDragOverlay ? listeners : {})}');

    expect(cssBlock('.session-card')).toContain('cursor: grab');
    expect(cssBlock('.session-card__tabs')).toContain('cursor: default');
    expect(cssBlock('.session-card__actions')).toContain('cursor: default');
    expect(css).toContain(
      '.session-card__title,\nbutton.session-card__note',
    );
    expect(css).toMatch(
      /\.session-card__title,\s*button\.session-card__note\s*\{[\s\S]*?cursor:\s*grab;/,
    );

    for (const source of [card, cardHeader, cardShell, slot, sortableBindings]) {
      expect(source).not.toContain(gripIcon);
      expect(source).not.toContain(handleClass);
      expect(source).not.toContain('setActivatorNodeRef');
      expect(source).not.toContain('DraggableAttributes');
    }
    expect(sortableBindings).toContain('listeners: DraggableSyntheticListeners');
    expect(sortableBindings).toContain('setNodeRef:');

    expect(sensorSource).toContain(
      'useSensor(PointerSensor, { activationConstraint: { distance: 5 } })',
    );
    expect(sensorSource).toContain(
      'activationConstraint: { delay: 200, tolerance: 5 }',
    );
    expect(layout).not.toContain(keyboardSensor);
    expect(layout).not.toContain(keyboardCoordinates);
    expect(layout).not.toContain('createManagerKeyboardCoordinates');
    expect(layout).not.toContain('getGroupKeyboardCoordinates');
  });

  it('uses immutable drag-start geometry for source placeholders', () => {
    const placeholderSlot = cssBlock('.session-card__placeholder-slot');
    const placeholderStyle = cssBlock('.session-placeholder');
    const overlayPreview = cssBlock('.manager-drag-overlay__preview');
    expect(placeholder).not.toContain('height = 200');
    expect(placeholder).not.toContain('height,');
    expect(row).not.toContain('height: 28');
    expect(slot).toContain('<SessionPlaceholder');
    expect(slot).toContain('sourceRect');
    expect(row).toContain('sourceRect');
    expect(card).not.toContain('rect.current');
    expect(row).not.toContain('rect.current');
    expect(placeholderSlot).toContain('height: 100%');
    expect(placeholderStyle).toContain('height: 100%');
    expect(placeholderStyle).toContain('border: 2px dashed');
    expect(overlayPreview).toContain('box-sizing: border-box');
    expect(overlayPreview).toContain('overflow: hidden');
  });

  it('renders explicit session and tab insertion markers', () => {
    expect(css).toContain(".session-board__group-insert-target[data-over='true']");
    expect(cssBlock('.session-board__drop-marker')).toContain('position: absolute');
    expect(cssBlock('.session-card__drop-marker')).toContain('min-height: 4px');
    expect(css).toMatch(/\.tab-item-row__drop-marker\s*\{[\s\S]*?height: 4px;/);
  });

  it('keeps hidden search sessions in canonical end-target indexing', () => {
    const filteredEmptyBranchStart = workspace.indexOf(
      '<div className="manager-board__empty-content">',
    );
    const filteredEmptyBranchEnd = workspace.indexOf(
      '<SortableContext',
      filteredEmptyBranchStart,
    );
    const filteredEmptyBranch = workspace.slice(
      filteredEmptyBranchStart,
      filteredEmptyBranchEnd,
    );

    expect(filteredEmptyBranch).toContain('index={categoryGroups.length}');
    expect(filteredEmptyBranch).not.toContain('<EmptySessionSlotTarget');
  });
});
