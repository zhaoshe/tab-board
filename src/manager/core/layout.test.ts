import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const managerRoot = resolve(process.cwd(), 'src/manager');
const css = [
  'header.css',
  'sidebar.css',
  'shell.css',
  'session.css',
  'overlays.css',
  'responsive.css',
].map((file) => readFileSync(resolve(managerRoot, 'styles', file), 'utf8')).join('\n');
const sharedCss = readFileSync(
  resolve(process.cwd(), 'src/shared/styles/accessibility.css'),
  'utf8',
);
const layout = [
  'components/shell/ManagerLayout.tsx',
  'components/shell/ManagerFrame.tsx',
  'components/shell/ManagerDndCoordinator.tsx',
  'hooks/useSidebarDisclosure.ts',
  'hooks/useCaptureReveal.ts',
].map((file) => readFileSync(resolve(managerRoot, file), 'utf8')).join('\n');
const sidebarSource = readFileSync(resolve(managerRoot, 'components/sidebar/Sidebar.tsx'), 'utf8');
const openTabsListSource = readFileSync(
  resolve(managerRoot, 'components/sidebar/OpenTabsList.tsx'),
  'utf8',
);
const workspace = readFileSync(resolve(managerRoot, 'components/workspace/WorkspaceContent.tsx'), 'utf8');

function cssBlock(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end + 1);
}

describe('Task105 manager layout contracts', () => {
  it('locks the Manager document viewport without disabling internal scrollers', () => {
    expect(css).toMatch(
      /html,\s*body,\s*#root\s*\{[\s\S]*?height: 100%;[\s\S]*?overflow: hidden;/,
    );
    expect(css).toMatch(
      /html,\s*body\s*\{[\s\S]*?overscroll-behavior: none;/,
    );
    expect(cssBlock('.manager-board')).toContain('overflow-x: auto');
    expect(cssBlock('.manager-open-tabs-scroll')).toContain('overflow-y: auto');
    expect(cssBlock('.session-card__tabs')).toContain('overflow-y: auto');
  });

  it('uses the explicit two-column 100dvh shell and owns overflow', () => {
    const shell = cssBlock('.manager-shell');

    expect(css).toContain('--manager-sidebar-expanded-width: clamp(272px, 24vw, 320px)');
    expect(shell).toContain('display: grid');
    expect(shell).toContain('grid-template-columns: var(--manager-sidebar-expanded-width) minmax(0, 1fr)');
    expect(shell).toContain('height: 100dvh');
    expect(shell).toContain('overflow: hidden');
  });

  it('keeps the collapsed shell on the same main track with an exact 52px rail at every viewport', () => {
    expect(css).toContain('--manager-sidebar-rail-width: 52px');
    expect(css).not.toContain('--manager-sidebar-rail-width: 54px');
    expect(css).not.toContain('--manager-sidebar-rail-width: 62px');
    const collapsed = cssBlock('.manager-shell--sidebar-collapsed');
    expect(collapsed).toContain('grid-template-columns: var(--manager-sidebar-rail-width) minmax(0, 1fr)');
    expect(collapsed).not.toContain('transition:');
    expect(css).not.toContain(':has(.manager-sidebar:hover)');
    expect(css).toContain('.manager-shell--sidebar-peek .manager-sidebar__overlay');
    expect(css).toContain('.manager-shell--sidebar-drawer .manager-sidebar__overlay');
  });

  it('lets Open Tabs fill remaining sidebar height after header owns utilities', () => {
    expect(css).toMatch(/\.manager-open-tabs\s*\{[\s\S]*?flex: 1 1 auto[\s\S]*?min-height: 0/);
    expect(css).not.toContain('height: 280px');
  });

  it('uses the same native vertical scrollbar for Open Tabs and Session tabs', () => {
    const openTabsScroll = cssBlock('.manager-open-tabs-scroll');
    const sessionTabs = cssBlock('.session-card__tabs');

    expect(openTabsListSource).not.toContain('ScrollArea');
    expect(openTabsListSource).toContain('ref={overflowRef}');
    expect(openTabsScroll).toContain('overflow-x: hidden');
    expect(openTabsScroll).toContain('overflow-y: auto');
    expect(sessionTabs).toContain('overflow-x: hidden');
    expect(sessionTabs).toContain('overflow-y: auto');
    expect(css).not.toContain('.manager-open-tabs .mantine-ScrollArea-root');
  });

  it('keeps expanded Open Tabs compact while preserving explicit non-overlapping columns', () => {
    const row = cssBlock('.manager-open-tab-row');
    const select = cssBlock('.manager-open-tab-select');
    const content = cssBlock('.manager-open-tab-content');
    const favicon = cssBlock('.manager-open-tab-favicon');

    expect(row).toContain('grid-template-columns: 24px minmax(0, 1fr) 32px');
    expect(select).toContain('position: absolute');
    expect(select).toContain('width: 20px');
    expect(content).toContain('z-index: 0');
    expect(favicon).toContain('width: 16px');
    expect(favicon).toContain('height: 16px');
    expect(sharedCss).toMatch(
      /\.tabboard-favicon\s*\{[\s\S]*?pointer-events: none/,
    );
    expect(sharedCss).toMatch(
      /\.tabboard-favicon img\s*\{[\s\S]*?object-fit: cover/,
    );
  });

  it('uses the shared 32px neutral quick action for Open Tab closure', () => {
    const openTabRow = readFileSync(
      resolve(managerRoot, 'components/sidebar/OpenTabRow.tsx'),
      'utf8',
    );
    expect(openTabRow).toContain(
      "from '../../../shared/components/AccessibleIconAction'",
    );
    expect(openTabRow).not.toContain('<ActionIcon');
    expect(openTabRow).toContain('<AccessibleIconAction');
    expect(openTabRow).toContain('className="manager-open-tab-close"');
    expect(css).toMatch(
      /\.manager-open-tab-close\.accessible-icon-action\s*\{[\s\S]*?opacity: 0;[\s\S]*?pointer-events: none;/,
    );
    expect(css).toMatch(
      /\.manager-open-tab-row:hover \.manager-open-tab-close\.accessible-icon-action--disabled,[\s\S]*?opacity: var\(--tabboard-action-disabled-opacity\);/,
    );
  });

  it('reserves 44px Open Tabs columns across the full drawer breakpoint', () => {
    expect(css).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.manager-open-tab-row\s*\{[^}]*grid-template-columns: 44px minmax\(44px, 1fr\) 44px;[^}]*gap: 8px;/,
    );
    expect(css).toContain('min-width: 44px');
    expect(css).toContain('min-height: 44px');
  });

  it('uses a compact expanded inset and keeps collapsed rows flush below the selection bar', () => {
    const row = cssBlock('.manager-open-tab-row');
    const scrollArea = cssBlock('.manager-open-tabs-scroll');
    const selectionBar = cssBlock('.manager-open-tabs-selection-bar');
    const selectionBarSource = readFileSync(
      resolve(managerRoot, 'components/sidebar/OpenTabsSelectionBar.tsx'),
      'utf8',
    );

    expect(row).toContain('margin-inline: 9.5px 0');
    expect(css).toMatch(
      /\.manager-shell--sidebar-collapsed:not\(\.manager-shell--sidebar-peek\):not\(\.manager-shell--sidebar-drawer\) \.manager-open-tab-row\s*\{[\s\S]*?margin-inline-start: 0;/,
    );
    expect(scrollArea).toContain('margin-inline: calc(-1 * var(--manager-sidebar-padding))');
    expect(scrollArea).toContain('padding-top: 2px');
    expect(selectionBar).toContain('height: 36px');
    expect(selectionBar).toContain('flex: 0 0 36px');
    expect(selectionBar).toContain('background: var(--tabboard-sidebar)');
    expect(selectionBarSource).toContain('<AccessibleIconAction');
    expect(selectionBarSource).toContain('<TabBoardIcon');
    expect(css).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.manager-open-tabs-selection-bar,[\s\S]*?height: 48px/,
    );
  });

  it('uses tabular numerals for changing count displays', () => {
    expect(cssBlock('.manager-window-tab-count')).toContain('font-variant-numeric: tabular-nums');
    expect(cssBlock('.manager-open-tabs-selection-actions__count'))
      .toContain('font-variant-numeric: tabular-nums');
    expect(cssBlock('.manager-open-tabs-context-actions__count'))
      .toContain('background: var(--tabboard-sidebar)');
  });

  it('keeps the workspace context visible on desktop and compact on narrow screens', () => {
    const workspaceTrigger = cssBlock('.manager-workspace-trigger');
    expect(workspaceTrigger).toContain('width: clamp(112px, 14vw, 184px)');
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.manager-workspace-trigger__label\s*\{[\s\S]*?display: none/,
    );
  });

  it('keeps Bin direct while one More trigger owns global secondary commands at every width', () => {
    const globalActions = readFileSync(
      resolve(managerRoot, 'components/workspace/ManagerGlobalActions.tsx'),
      'utf8',
    );

    expect(globalActions).not.toContain('manager-header-actions-desktop');
    expect(globalActions).not.toContain('manager-header-actions-compact');
    expect(globalActions).toContain('Menu as MenuIcon');
    expect(globalActions).not.toContain('Ellipsis');
    expect(globalActions.match(/label="Bin"/g) ?? []).toHaveLength(1);
    expect(globalActions).not.toContain('label="Trash"');
    expect(globalActions.match(/label="More Actions"/g)).toHaveLength(1);
    expect(css).not.toContain('.manager-header-actions-desktop');
    expect(css).not.toContain('.manager-header-actions-compact');
  });

  it('keeps direct category drag inside the normal compact toolbar', () => {
    expect(cssBlock('.manager-category-nav')).toContain('overflow-x: auto');
    expect(cssBlock('.manager-category-reorder-target'))
      .toContain('pointer-events: none');
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.manager-category-item \[data-category-trigger='label'\],[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px/,
    );
    expect(css).not.toContain('workspace-header--category-reorder');
    expect(css).not.toContain('manager-category-reorder-done');
    expect(css).not.toContain('manager-category-drag-handle');
  });

  it('uses dense two-line Category object rows and touch-safe coarse actions', () => {
    const row = cssBlock('.manager-category-manager-row');
    expect(row).toContain('min-height: 48px');
    expect(row).toContain(
      'border: 1px solid var(--mantine-color-default-border)',
    );
    expect(row).toContain('background: var(--tabboard-surface)');
    expect(cssBlock('.manager-category-manager-row--active'))
      .toContain('background: var(--tabboard-accent-soft)');
    expect(css).toMatch(
      /\.manager-category-manager-row__name,\s*\.manager-category-manager-row__meta\s*\{[^}]*white-space:\s*nowrap;/,
    );
    expect(css).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.manager-category-manager-row\s*\{[\s\S]*?min-height: 56px/,
    );
    expect(css).toMatch(
      /\.manager-category-manager-row__action\s*\{[\s\S]*?--tabboard-action-size: 32px !important/,
    );
    expect(css).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.category-editor-color-option\s*\{[\s\S]*?width: 44px;[\s\S]*?height: 44px/,
    );
  });

  it('gives dense Workspace rows the same explicit surface material as Category rows', () => {
    const row = cssBlock('.workspace-manager-row');
    expect(row).toContain('background: var(--tabboard-surface)');
    expect(cssBlock('.workspace-manager-row--current'))
      .toContain('background: var(--tabboard-accent-soft)');
  });

  it('restores the confirmed C1 Hybrid Rail motion and disables it for reduced motion', () => {
    const shell = cssBlock('.manager-shell');
    const sidebarOverlay = cssBlock('.manager-sidebar__overlay');

    expect(css).toContain('--manager-sidebar-motion-duration: 180ms');
    expect(css).toContain('--manager-sidebar-motion-easing: cubic-bezier(.2, .8, .2, 1)');
    expect(shell).toContain(
      'transition: grid-template-columns var(--manager-sidebar-motion-duration) var(--manager-sidebar-motion-easing)',
    );
    expect(sidebarOverlay).toContain(
      'width var(--manager-sidebar-motion-duration) var(--manager-sidebar-motion-easing)',
    );
    expect(sidebarOverlay).toContain('box-shadow 150ms ease-out');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.manager-shell,[\s\S]*?\.manager-sidebar__overlay[\s\S]*?transition: none !important;/,
    );
  });

  it('keeps the Open Tabs icon column fixed while the collapsed rail expands', () => {
    const content = cssBlock('.manager-open-tab-content');
    const select = cssBlock('.manager-open-tab-select');

    expect(content).toContain('padding: 0');
    expect(select).toContain('position: absolute');
    expect(select).toContain('width: 20px');
    expect(css).toMatch(
      /\.manager-shell--sidebar-collapsed:not\(\.manager-shell--sidebar-peek\):not\(\.manager-shell--sidebar-drawer\) \.manager-open-tabs-scroll\s*\{[\s\S]*?margin-inline: calc\(-1 \* var\(--manager-sidebar-padding\)\)/,
    );
    expect(css).toMatch(
      /\.manager-shell--sidebar-collapsed:not\(\.manager-shell--sidebar-peek\):not\(\.manager-shell--sidebar-drawer\) \.manager-open-tab-row\s*\{[\s\S]*?grid-template-columns: 43px minmax\(0, 1fr\) 32px;/,
    );
    expect(cssBlock('.manager-open-tab-owner-slot'))
      .toContain('justify-self: center');
    expect(css).toMatch(
      /\.manager-shell--sidebar-collapsed:not\(\.manager-shell--sidebar-peek\):not\(\.manager-shell--sidebar-drawer\) \.manager-open-tab-favicon\s*\{[\s\S]*?opacity: 1;/,
    );
    expect(css).toMatch(
      /\.manager-shell--sidebar-collapsed:not\(\.manager-shell--sidebar-peek\):not\(\.manager-shell--sidebar-drawer\) \.manager-open-tabs-window-bar\s*\{[\s\S]*?padding-inline: 0;/,
    );
    expect(css).not.toContain('.manager-open-tab-drag-handle');
    expect(css).not.toContain('.manager-open-tab-more');
    expect(css).toMatch(
      /\.manager-shell--sidebar-collapsed:not\(\.manager-shell--sidebar-peek\):not\(\.manager-shell--sidebar-drawer\) \.manager-window-button\.manager-sidebar__expanded-content,[\s\S]*?\.manager-sidebar-utilities\s*\{[\s\S]*?position: absolute;/,
    );
    expect(css).toMatch(
      /\.manager-shell--sidebar-collapsed:not\(\.manager-shell--sidebar-peek\):not\(\.manager-shell--sidebar-drawer\) \.manager-window-switcher\s*\{[\s\S]*?width: 100%;[\s\S]*?justify-content: center;/,
    );
  });

  it('uses semantic sidebar and main landmarks without AppShell', () => {
    expect(layout).not.toContain('AppShell');
    expect(sidebarSource).toContain('<OpenTabsPanel');
    expect(layout).toContain('className="manager-sidebar"');
    expect(layout).toContain('aria-label="Open Tabs workspace"');
    expect(layout).toContain('className="manager-main"');
    expect(layout).toContain('id="manager-main"');
  });

  it('supports explicit peek and drawer classes with drag suppression and accessible toggle contracts', () => {
    const sidebarStyles = cssBlock('.manager-sidebar');
    expect(sidebarStyles).toContain('position: relative');
    expect(sidebarStyles).toContain('overflow: visible');
    expect(css).toMatch(/\.manager-shell--sidebar-collapsed \.manager-sidebar__overlay[\s\S]*?width: var\(--manager-sidebar-rail-width\)/);
    expect(css).not.toContain('.manager-sidebar-compact-toggle');
    expect(css).toMatch(/\.manager-shell--sidebar-peek \.manager-sidebar__overlay,[\s\S]*?\.manager-shell--sidebar-drawer \.manager-sidebar__overlay[\s\S]*?pointer-events: auto/);
    expect(css).toContain('.manager-shell--open-tabs-drag-active .manager-sidebar__overlay');
    expect(css).toMatch(/\.manager-shell--open-tabs-drag-active \.manager-sidebar__overlay[\s\S]*?pointer-events: none/);
    expect(css).toMatch(/\.manager-shell--open-tabs-drag-active \.manager-sidebar__overlay:hover[\s\S]*?pointer-events: none/);
    expect(css).toMatch(/\.manager-shell--open-tabs-drag-active \.manager-sidebar__overlay[\s\S]*?visibility: hidden/);
    expect(css).toContain('.manager-shell--open-tabs-drag-active .manager-sidebar-content');
    expect(css).toMatch(/\.manager-shell--open-tabs-drag-active \.manager-sidebar-content[\s\S]*?visibility: hidden/);
    expect(layout).toContain("dragUiState.payload?.kind === 'open-tabs'");
    expect(sidebarSource).toContain('className="manager-sidebar__overlay"');
    expect(sidebarSource).toContain('sidebarState={sidebarState}');
    expect(sidebarSource).toContain('onToggleSidebar={onToggleSidebar}');
    expect(layout).toContain('tabboard.sidebarCollapsed');
    expect(layout).toContain('SIDEBAR_PEEK_DELAY_MS = 350');
    expect(layout).toMatch(
      /export type SidebarDisclosureState\s*=\s*\|\s*'collapsed'\s*\|\s*'peek'\s*\|\s*'pinned'\s*\|\s*'drawer'/,
    );
    expect(layout).toContain('manager-main');
    expect(layout).toContain('focus()');
  });

  it('uses an overlay drawer below 900px while preserving the collapsed rail grid', () => {
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.manager-shell\s*\{[\s\S]*?grid-template-columns: var\(--manager-sidebar-rail-width\) minmax\(0, 1fr\)/);
    expect(css).not.toMatch(/@media \(max-width: 900px\)[\s\S]*?\.manager-open-tabs[\s\S]*?height: 180px/);
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.manager-shell--sidebar-collapsed[\s\S]*?grid-template-columns: var\(--manager-sidebar-rail-width\) minmax\(0, 1fr\)/);
    expect(css).toContain('height: 100dvh');
  });

  it('starts collapsed and re-collapses when the viewport becomes narrow', () => {
    expect(layout).toContain("const NARROW_SIDEBAR_QUERY = '(max-width: 900px)';");
    expect(layout).toContain('window.matchMedia(NARROW_SIDEBAR_QUERY).matches');
    expect(layout).toContain("mediaQuery.addEventListener('change', updateForViewport);");
    expect(layout).toMatch(
      /setState\(mediaQuery\.matches\s*\?\s*'collapsed'\s*:\s*pinnedPreferenceRef\.current\s*\?\s*'pinned'\s*:\s*'collapsed'\)/,
    );
  });

  it('uses quiet neutral A1/D1 material and neutral sidebar actions', () => {
    expect(cssBlock('.manager-shell')).toContain('background: var(--tabboard-canvas)');
    expect(cssBlock('.manager-sidebar__overlay')).toContain('background: var(--tabboard-sidebar)');
    expect(cssBlock('.manager-open-tabs-window-bar')).toContain('background: var(--tabboard-sidebar)');
    expect(cssBlock('.manager-topbar')).toContain('background: var(--tabboard-toolbar)');
    expect(cssBlock('.session-card')).toContain('background: var(--tabboard-surface)');
    expect(cssBlock('.manager-window-glyph')).toContain('border-radius: 6px');
    expect(css).toMatch(
      /(?:^|\n)\.manager-search-toggle\s*\{[^}]*background: transparent;[^}]*border: 0;/,
    );
    expect(css).not.toMatch(
      /(?:^|\n)\.manager-search-toggle\s*\{[^}]*accent/,
    );
    expect(css).not.toContain('.manager-refresh-icon--loading');
    expect(css).not.toContain('@keyframes manager-refresh-spin');
    expect(css).not.toContain('.manager-save-window');
    expect(css).not.toMatch(
      /\.manager-category-item \[aria-current='page'\]\s*\{[^}]*box-shadow:/,
    );
  });

  it('uses 8px session panels and 6px dense row controls', () => {
    expect(cssBlock('.session-card')).toContain('border-radius: 8px');
    expect(cssBlock('.manager-open-tab-row')).toContain('border-radius: 6px');
    expect(cssBlock('.tab-item-row__content')).toContain('border-radius: 6px');
  });

  it('gives the board ownership of horizontal scrolling and uses column session geometry', () => {
    const board = cssBlock('.manager-board');
    const sessions = cssBlock('.session-board');
    const newSessionTarget = cssBlock('.new-session-gap-target');

    expect(board).toContain('overflow-x: auto');
    expect(board).toContain('overflow-y: hidden');
    expect(board).toContain('min-width: 0');
    expect(sessions).toContain('grid-auto-flow: column');
    expect(sessions).toContain('grid-auto-columns: 340px');
    expect(sessions).toContain('gap: 16px');
    expect(sessions).toContain('min-height: 100%');
    expect(sessions).toContain('height: 100%');
    expect(newSessionTarget).toContain('width: 20px');
    expect(newSessionTarget).toContain('height: 20px');
    expect(newSessionTarget).toContain('inset-inline-start: -18px');
    expect(newSessionTarget).toContain('inset-block-start: calc(50% - 10px)');
    expect(newSessionTarget).not.toContain('transform:');
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.session-board\s*\{[\s\S]*?grid-auto-columns: min\(340px, calc\(100vw - var\(--manager-sidebar-rail-width\) - 32px\)\)/,
    );
    expect(css).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.new-session-gap-target\s*\{[\s\S]*?display: none/,
    );
    expect(workspace).not.toContain('manager-board__header');
    expect(workspace).not.toContain('<SimpleGrid');
    expect(workspace).toContain('visibleGroups.map((group) =>');
    expect(workspace).toContain('highlighted={highlightedGroupId === group.id}');
  });

  it('skips layout/paint for off-screen session slots without removing them from the DOM', () => {
    const groupSlot = cssBlock('.session-board__group-slot');
    const sessionSlot = cssBlock('.session-slot');

    // content-visibility keeps large boards cheap while preserving @dnd-kit
    // measurement, find-in-page, and scrollIntoView without clipping sibling
    // gap anchors that extend beyond the group slot.
    expect(groupSlot).not.toContain('content-visibility: auto');
    expect(sessionSlot).toContain('content-visibility: auto');
    expect(sessionSlot).toContain('contain-intrinsic-size:');
  });

  it('skips layout and paint for off-screen Trash entries', () => {
    const binEntry = cssBlock('.manager-bin-entry');

    expect(binEntry).toContain('content-visibility: auto');
    expect(binEntry).toContain('contain-intrinsic-size:');
  });
});
