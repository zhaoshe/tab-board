import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const managerRoot = resolve(process.cwd(), 'src/manager');
const css = readFileSync(resolve(managerRoot, 'styles/manager.css'), 'utf8');
const layout = readFileSync(resolve(managerRoot, 'components/shell/ManagerLayout.tsx'), 'utf8');
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
    expect(collapsed).toContain('transition: grid-template-columns 180ms');
    expect(css).toContain('.manager-shell--sidebar-collapsed:not(.manager-shell--sidebar-hover-suppressed):has(.manager-sidebar:hover)');
  });

  it('lets Open Tabs fill remaining sidebar height after header owns utilities', () => {
    expect(css).toMatch(/\.manager-open-tabs\s*\{[\s\S]*?flex: 1 1 auto[\s\S]*?min-height: 0/);
    expect(css).not.toContain('height: 280px');
  });

  it('uses semantic sidebar and main landmarks without AppShell', () => {
    expect(layout).not.toContain('AppShell');
    expect(sidebarSource).toContain('<OpenTabsPanel');
    expect(layout).toContain('<aside className="manager-sidebar"');
    expect(layout).toContain('aria-label="Open Tabs workspace"');
    expect(layout).toContain('<main className="manager-main" id="manager-main"');
  });

  it('supports a collapsed overlay sidebar with drag suppression and accessible toggle contracts', () => {
    const sidebarStyles = cssBlock('.manager-sidebar');
    expect(sidebarStyles).toContain('position: relative');
    expect(sidebarStyles).toContain('overflow: visible');
    expect(css).toMatch(/\.manager-shell--sidebar-collapsed \.manager-sidebar__overlay[\s\S]*?position: absolute/);
    expect(css).toMatch(/\.manager-shell--sidebar-collapsed \.manager-sidebar__overlay[\s\S]*?width: var\(--manager-sidebar-expanded-width\)/);
    expect(css).toMatch(/\.manager-shell--sidebar-collapsed \.manager-sidebar-rail[\s\S]*?display: flex/);
    expect(css).toMatch(/\.manager-shell--sidebar-collapsed \.manager-sidebar__overlay[\s\S]*?inset: 0 auto 0 var\(--manager-sidebar-rail-width\)/);
    expect(css).toMatch(/\.manager-shell--sidebar-collapsed \.manager-sidebar__overlay[\s\S]*?visibility: hidden/);
    expect(css).toMatch(/\.manager-shell--sidebar-collapsed:not\(\.manager-shell--sidebar-hover-suppressed\) \.manager-sidebar:hover \.manager-sidebar__overlay,[\s\S]*?pointer-events: auto/);
    expect(css).toMatch(/\.manager-shell--sidebar-collapsed \.manager-sidebar__overlay:focus-within[\s\S]*?pointer-events: auto/);
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
    expect(layout).toContain('if (mediaQuery.matches) setSidebarCollapsed(true);');
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
    expect(workspace).toContain('groups.map((group) =>');
    expect(workspace).toContain('highlighted={highlightedGroupId === group.id}');
  });
});
