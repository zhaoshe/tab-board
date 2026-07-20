import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/manager/components/sidebar/Sidebar.tsx'), 'utf8');

describe('sidebar responsibilities', () => {
  it('keeps only Open Tabs responsibilities', () => {
    expect(source).toContain('<OpenTabsPanel');
    expect(source).not.toContain('<ImportModal');
    expect(source).not.toContain('<ExportModal');
    expect(source).not.toContain('aria-label="Trash"');
    expect(source).not.toContain('aria-label="Import"');
    expect(source).not.toContain('aria-label="Export"');
  });

  it('does not render category navigation, droppables, or category modals', () => {
    expect(source).not.toContain('useDroppable');
    expect(source).not.toContain('useWorkspaceFolders');
    expect(source).not.toContain('<NavLink');
    expect(source).not.toContain('<Modal');
    expect(source).not.toContain('addFolder');
    expect(source).not.toContain('renameFolder');
    expect(source).not.toContain('deleteFolder');
  });
});
