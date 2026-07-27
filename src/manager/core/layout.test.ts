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
const layout = [
  'components/shell/ManagerLayout.tsx',
  'components/shell/ManagerFrame.tsx',
  'components/shell/ManagerDndCoordinator.tsx',
  'hooks/useSidebarDisclosure.ts',
  'hooks/useCaptureReveal.ts',
].map((file) => readFileSync(resolve(managerRoot, file), 'utf8')).join('\n');
const sidebarSource = readFileSync(resolve(managerRoot, 'components/sidebar/Sidebar.tsx'), 'utf8');
const workspace = readFileSync(resolve(managerRoot, 'components/workspace/WorkspaceContent.tsx'), 'utf8');

function cssBlock(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end + 1);
}

describe('Task105 manager layout contracts', () => {
  it('uses the explicit two-column 100dvh shell and owns overflow', () => {
    const shell = cssBlock('.manager-shell');

    expect(css).toContain('--manager-sidebar-expanded-width: clamp(250px, 22vw, 300px)');
    expect(shell).toContain('display: grid');
    expect(shell).toContain('grid-template-columns: var(--manager-sidebar-expanded-width) minmax(0, 1fr)');
    expect(shell).toContain('height: 100dvh');
    expect(shell).toContain('overflow: hidden');
  });

  it('keeps the collapsed shell on the same main track while using a 54px rail', () => {
    expect(css).toContain('--manager-sidebar-rail-width: 54px');
    const collapsed = cssBlock('.manager-shell--sidebar-collapsed');
    expect(collapsed).toContain('grid-template-columns: var(--manager-sidebar-rail-width) minmax(0, 1fr)');
    expect(collapsed).not.toContain('transition:');
    expect(css).toContain('.manager-shell--sidebar-collapsed:not(.manager-shell--sidebar-hover-suppressed):has(.manager-sidebar:hover)');
  });

  it('lets Open Tabs fill remaining sidebar height after header owns utilities', () => {
    expect(css).toMatch(/\.manager-open-tabs\s*\{[\s\S]*?flex: 1 1 auto[\s\S]*?min-height: 0/);
    expect(css).not.toContain('height: 280px');
  });

  it('keeps Open Tabs selection checkboxes above favicons when revealed', () => {
    const select = cssBlock('.manager-open-tab-select');
    const content = cssBlock('.manager-open-tab-content');
    const favicon = cssBlock('.manager-open-tab-favicon');
    const faviconImage = cssBlock('.manager-open-tab-favicon img');
    const hoverDisclosure = css.match(/\.manager-open-tab-row:hover \.manager-open-tab-select,[\s\S]*?\{[\s\S]*?\}/)?.[0] ?? '';
    const selectedDisclosure = cssBlock('.manager-open-tabs--selection-mode .manager-open-tab-select');

    expect(content).toContain('z-index: 0');
    expect(select).toContain('z-index: 3');
    expect(cssBlock('.manager-open-tab-select,\n.manager-open-tab-close')).toContain('pointer-events: none');
    expect(favicon).toContain('pointer-events: none');
    expect(faviconImage).toContain('z-index: 1');
    expect(faviconImage).toContain('pointer-events: none');
    expect(hoverDisclosure).toContain('opacity: 1');
    expect(hoverDisclosure).toContain('pointer-events: auto');
    expect(selectedDisclosure).toContain('opacity: 1');
    expect(selectedDisclosure).toContain('pointer-events: auto');
  });

  it('keeps Open Tabs rows flush while preserving compact spacing below the selection bar', () => {
    const row = cssBlock('.manager-open-tab-row');
    const scrollArea = cssBlock('.manager-open-tabs .mantine-ScrollArea-root');
    const selectionBar = cssBlock('.manager-open-tabs-selection-bar');
    const openTabsPanel = readFileSync(resolve(managerRoot, 'components/sidebar/OpenTabsPanel.tsx'), 'utf8');

    expect(row).toContain('margin-inline: 0');
    expect(scrollArea).toContain('margin-inline: calc(-1 * var(--manager-sidebar-padding))');
    expect(scrollArea).toContain('padding-top: 2px');
    expect(selectionBar).toContain('height: 28px');
    expect(selectionBar).toContain('flex: 0 0 28px');
    expect(openTabsPanel).toContain('ActionIcon size={24}');
    expect(openTabsPanel).toContain('IconSelectAll size={16}');
  });

  it('uses tabular numerals for changing count displays', () => {
    expect(cssBlock('.manager-window-tab-count')).toContain('font-variant-numeric: tabular-nums');
    expect(cssBlock('.manager-open-tabs-selection-actions__count'))
      .toContain('font-variant-numeric: tabular-nums');
  });

  it('limits UI transitions to compositor-friendly properties', () => {
    expect(css).toContain('transition: opacity 140ms ease, transform 160ms ease');
    expect(css).not.toContain('transition: width');
    expect(css).not.toContain('transition: grid-template-columns');
  });

  it('keeps the Open Tabs icon column fixed while the collapsed rail expands', () => {
    const root = cssBlock(':root');
    const content = cssBlock('.manager-open-tab-content');
    const select = cssBlock('.manager-open-tab-select');
    const collapsedContent = css.match(
      /\.manager-shell--sidebar-collapsed:is\(:not\(:has\(\.manager-sidebar:hover\)\), \.manager-shell--sidebar-hover-suppressed\):not\(\.manager-shell--sidebar-overlay-open\) \.manager-open-tab-content\s*\{[\s\S]*?\}/,
    )?.[0] ?? '';

    expect(root).toContain(
      '--manager-open-tab-leading-offset: calc((var(--manager-sidebar-rail-width) - 1px - 20px) / 2)',
    );
    expect(content).toContain('padding-inline: var(--manager-open-tab-leading-offset)');
    expect(select).toContain('inset-inline-start: var(--manager-open-tab-leading-offset)');
    expect(css).toMatch(
      /\.manager-shell--sidebar-collapsed:is\(:not\(:has\(\.manager-sidebar:hover\)\), \.manager-shell--sidebar-hover-suppressed\):not\(\.manager-shell--sidebar-overlay-open\) \.manager-open-tabs \.mantine-ScrollArea-root\s*\{[\s\S]*?margin-inline: calc\(-1 \* var\(--manager-sidebar-padding\)\)/,
    );
    expect(collapsedContent).toContain('flex: 1 1 auto !important');
    expect(collapsedContent).toContain('justify-content: flex-start');
    expect(collapsedContent).toContain('padding-inline: var(--manager-open-tab-leading-offset) !important');
    expect(css).not.toMatch(/\.manager-shell--sidebar-collapsed[^{}]*\.manager-open-tab-favicon\s*\{/);
    expect(css).toMatch(
      /\.manager-shell--sidebar-collapsed:is\(:not\(:has\(\.manager-sidebar:hover\)\), \.manager-shell--sidebar-hover-suppressed\):not\(\.manager-shell--sidebar-overlay-open\) \.manager-open-tabs-window-bar\s*\{[\s\S]*?padding-inline: 0;/,
    );
    expect(css).toMatch(
      /\.manager-shell--sidebar-collapsed:is\(:not\(:has\(\.manager-sidebar:hover\)\), \.manager-shell--sidebar-hover-suppressed\):not\(\.manager-shell--sidebar-overlay-open\) \.manager-window-switcher\s*\{[\s\S]*?width: 100%;[\s\S]*?justify-content: center;/,
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

  it('supports a collapsed overlay sidebar with drag suppression and accessible toggle contracts', () => {
    const sidebarStyles = cssBlock('.manager-sidebar');
    expect(sidebarStyles).toContain('position: relative');
    expect(sidebarStyles).toContain('overflow: visible');
    expect(css).toMatch(/\.manager-shell--sidebar-collapsed \.manager-sidebar__overlay[\s\S]*?width: var\(--manager-sidebar-rail-width\)/);
    expect(css).toContain('.manager-sidebar-compact-toggle');
    expect(css).toMatch(/\.manager-shell--sidebar-collapsed:not\(\.manager-shell--sidebar-hover-suppressed\) \.manager-sidebar:hover \.manager-sidebar__overlay,[\s\S]*?pointer-events: auto/);
    expect(css).toContain('.manager-shell--open-tabs-drag-active .manager-sidebar__overlay');
    expect(css).toMatch(/\.manager-shell--open-tabs-drag-active \.manager-sidebar__overlay[\s\S]*?pointer-events: none/);
    expect(css).toMatch(/\.manager-shell--open-tabs-drag-active \.manager-sidebar__overlay:hover[\s\S]*?pointer-events: none/);
    expect(css).toMatch(/\.manager-shell--open-tabs-drag-active \.manager-sidebar__overlay[\s\S]*?visibility: hidden/);
    expect(css).toContain('.manager-shell--open-tabs-drag-active .manager-sidebar-content');
    expect(css).toMatch(/\.manager-shell--open-tabs-drag-active \.manager-sidebar-content[\s\S]*?visibility: hidden/);
    expect(layout).toContain("dragUiState.payload?.kind === 'open-tabs'");
    expect(sidebarSource).toContain('className="manager-sidebar__overlay"');
    expect(sidebarSource).toContain('sidebarPinned={sidebarExpanded}');
    expect(sidebarSource).toContain('onToggleSidebar={onToggleSidebar}');
    expect(layout).toContain('tabboard.sidebarCollapsed');
    expect(layout).toContain('manager-main');
    expect(layout).toContain('focus()');
  });

  it('stacks only the normal shell below 900px and preserves the collapsed rail grid', () => {
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.manager-shell\s*\{[\s\S]*?grid-template-columns: 1fr/);
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.manager-shell:not\(\.manager-shell--sidebar-collapsed\)[\s\S]*?grid-template-columns: 1fr/);
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.manager-shell:not\(\.manager-shell--sidebar-collapsed\) \.manager-open-tabs[\s\S]*?height: 180px/);
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.manager-shell--sidebar-collapsed[\s\S]*?grid-template-columns: var\(--manager-sidebar-rail-width\) minmax\(0, 1fr\)/);
    expect(css).toContain('height: 100dvh');
  });

  it('starts collapsed and re-collapses when the viewport becomes narrow', () => {
    expect(layout).toContain("const NARROW_SIDEBAR_QUERY = '(max-width: 900px)';");
    expect(layout).toContain('window.matchMedia(NARROW_SIDEBAR_QUERY).matches');
    expect(layout).toContain("mediaQuery.addEventListener('change', collapseForNarrowViewport);");
    expect(layout).toContain('if (mediaQuery.matches) setCollapsed(true);');
  });

  it('gives the board ownership of horizontal scrolling and uses column session geometry', () => {
    const board = cssBlock('.manager-board');
    const sessions = cssBlock('.session-board');

    expect(board).toContain('overflow-x: auto');
    expect(board).toContain('overflow-y: hidden');
    expect(board).toContain('min-width: 0');
    expect(sessions).toContain('grid-auto-flow: column');
    expect(sessions).toContain('grid-auto-columns: minmax(320px, 360px)');
    expect(sessions).toContain('min-height: 100%');
    expect(sessions).toContain('height: 100%');
    expect(workspace).not.toContain('manager-board__header');
    expect(workspace).not.toContain('<SimpleGrid');
    expect(workspace).toContain('visibleGroups.map((group) =>');
    expect(workspace).toContain('highlighted={highlightedGroupId === group.id}');
  });

  it('skips layout/paint for off-screen session slots without removing them from the DOM', () => {
    const slot = cssBlock('.session-board__group-slot');

    // content-visibility keeps large boards cheap while preserving @dnd-kit
    // measurement, find-in-page, and scrollIntoView (unlike JS virtualization).
    expect(slot).toContain('content-visibility: auto');
    expect(slot).toContain('contain-intrinsic-size:');
  });

  it('skips layout and paint for off-screen Trash entries', () => {
    const binEntry = cssBlock('.manager-bin-entry');

    expect(binEntry).toContain('content-visibility: auto');
    expect(binEntry).toContain('contain-intrinsic-size:');
  });
});
