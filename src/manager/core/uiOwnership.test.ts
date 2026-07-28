import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Manager UI ownership', () => {
  it('keeps ManagerLayout focused on composition', () => {
    const source = read('src/manager/components/shell/ManagerLayout.tsx');
    expect(source).toContain('ManagerDndCoordinator');
    expect(source).toContain('useCaptureReveal');
    expect(source).toContain('ManagerFrame');
    expect(source).not.toContain('createGeometryCollisionDetection');
    expect(source).not.toContain("const targetGroupId = params.get('targetGroupId')");
    expect(source).not.toContain('highlightTimeoutRef');
  });

  it('keeps WorkspaceHeader focused on composing workspace, category, search, and actions', () => {
    const source = read('src/manager/components/workspace/WorkspaceHeader.tsx');
    expect(source).toContain('<WorkspaceMenu');
    expect(source).toContain('<CategoryNav');
    expect(source).toContain('<CategoryManager');
    expect(source).toContain('<ManagerSearchCommand');
    expect(source).toContain('<ManagerGlobalActions');
    expect(source).not.toContain('title="Manage categories"');
    expect(source).not.toContain('validateFolderName');
    expect(source).not.toContain('FOLDER_COLORS');
  });

  it('keeps ManagerDndCoordinator focused on lifecycle composition', () => {
    const source = read('src/manager/components/shell/ManagerDndCoordinator.tsx');
    const geometry = read('src/manager/components/shell/managerDndGeometry.ts');
    const overlay = read('src/manager/components/shell/ManagerDragOverlay.tsx');
    const sensors = read('src/manager/components/shell/useManagerDndSensors.ts');

    expect(source).toContain("from './managerDndGeometry'");
    expect(source).toContain('<ManagerDragOverlay');
    expect(source).toContain('useManagerDndSensors');
    expect(source).not.toContain('useSensor(');
    expect(source).not.toContain('PointerSensor');
    expect(source).not.toContain('function distanceToRect');
    expect(source).not.toContain('export function createGeometryCollisionDetection');
    expect(source).not.toContain('dragUiState.payload?.kind === \'category\' ?');
    expect(geometry).toContain('export function createGeometryCollisionDetection');
    expect(geometry).toContain('export function createManagerKeyboardCoordinates');
    expect(overlay).toContain('export function ManagerDragOverlay');
    expect(sensors).toContain('export function useManagerDndSensors');
  });

  it('keeps SessionCard focused on state and command orchestration', () => {
    const source = read('src/manager/components/sessions/SessionCard.tsx');
    const header = read('src/manager/components/sessions/SessionCardHeader.tsx');
    const meta = read('src/manager/components/sessions/SessionCardMeta.tsx');
    const editor = read('src/manager/components/sessions/SessionCardEditor.tsx');
    const list = read('src/manager/components/sessions/SessionTabList.tsx');

    expect(source).toContain('<SessionCardHeader');
    expect(source).toContain('<SessionCardEditor');
    expect(source).toContain('<SessionTabList');
    expect(source).not.toContain('<header');
    expect(source).not.toContain('<Textarea');
    expect(source).not.toContain('<SortableContext');
    expect(header).toContain('<SessionCardMeta');
    expect(meta).toContain('export function SessionCardMeta');
    expect(editor).toContain('export function SessionCardEditor');
    expect(list).toContain('export function SessionTabList');
  });

  it('keeps OpenTabsPanel focused on workflow composition', () => {
    const source = read('src/manager/components/sidebar/OpenTabsPanel.tsx');
    const selection = read('src/manager/components/sidebar/OpenTabsSelectionBar.tsx');
    const list = read('src/manager/components/sidebar/OpenTabsList.tsx');
    const filter = read('src/manager/components/sidebar/OpenTabsFilterFooter.tsx');

    expect(source).toContain('<OpenTabsSelectionBar');
    expect(source).toContain('<OpenTabsList');
    expect(source).toContain('<OpenTabsFilterFooter');
    expect(source).not.toContain('<ScrollArea');
    expect(source).not.toContain('<TextInput');
    expect(source).not.toContain('Create Session from');
    expect(selection).toContain('export function OpenTabsSelectionBar');
    expect(list).toContain('export function OpenTabsList');
    expect(filter).toContain('export function OpenTabsFilterFooter');
  });

  it('keeps overflow measurement in one passive hook owner', () => {
    const source = read('src/manager/hooks/useOverflowCues.ts');
    expect(source).toContain('export function getOverflowCueState');
    expect(source).toContain("addEventListener('scroll'");
    expect(source).toContain('{ passive: true }');
    expect(source).toContain('ResizeObserver');
    expect(source).toContain('MutationObserver');
  });

  it('uses manager.css as an import-only style entrypoint', () => {
    const source = read('src/manager/styles/manager.css');
    expect(source).toMatch(/^@import ['"].+['"];\n(?:@import ['"].+['"];\n)*$/);
    for (const file of [
      'shell.css',
      'header.css',
      'sidebar.css',
      'session.css',
      'overlays.css',
      'responsive.css',
    ]) {
      expect(source).toContain(file);
      expect(read(`src/manager/styles/${file}`).trim().length).toBeGreaterThan(0);
    }
  });
});
