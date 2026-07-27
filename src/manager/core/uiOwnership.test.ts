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
