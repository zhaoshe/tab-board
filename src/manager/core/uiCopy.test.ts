import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('Web Interface Guidelines copy contracts', () => {
  it('keeps shipped UI copy free of em-dash separators', () => {
    const sources = [
      'src/manager/ManagerApp.tsx',
      'src/manager/components/sidebar/OpenTabsWindowBar.tsx',
      'src/options/components/DataStorageCard.tsx',
      'src/options/OptionsApp.tsx',
      'src/popup/PopupApp.tsx',
    ].map(read).join('\n');

    expect(sources).not.toMatch(/[—–]/);
  });

  it('uses Title Case for visible action and dialog labels', () => {
    const sources = [
      'src/manager/components/sessions/SessionCard.tsx',
      'src/manager/components/sidebar/OpenTabsPanel.tsx',
      'src/manager/components/workspace/CategoryManager.tsx',
      'src/manager/components/workspace/WorkspaceMenu.tsx',
      'src/options/OptionsApp.tsx',
      'src/options/components/DataStorageCard.tsx',
      'src/options/components/DisconnectDialog.tsx',
      'src/options/components/FolderPickerDialog.tsx',
    ].map(read).join('\n');

    for (const sentenceCaseLabel of [
      '>Add link<',
      '>Add note<',
      '>Move to category<',
      '>Clear filter<',
      '>Manage categories<',
      '>Add category<',
      '>New workspace<',
      '>Open keyboard shortcuts<',
      '>Reset to defaults<',
      '>Choose folder<',
      '>Export & use folder<',
      '>Try again<',
      '>Stop using file storage<',
      '>Reconnect folder<',
    ]) {
      expect(sources).not.toContain(sentenceCaseLabel);
    }

    for (const sentenceCaseTitle of [
      'title="Manage categories"',
      'title="Choose storage folder"',
      'title="Stop using file storage"',
    ]) {
      expect(sources).not.toContain(sentenceCaseTitle);
    }
  });

  it('gives generic failures an actionable next step', () => {
    const popup = read('src/popup/PopupApp.tsx');
    const categoryManager = read(
      'src/manager/components/workspace/CategoryManager.tsx',
    );
    const exportModal = read(
      'src/manager/components/import-export/ExportModal.tsx',
    );

    expect(popup).toContain(
      "'Unable to load current tabs. Reopen the popup and try again.'",
    );
    expect(popup).toContain(
      "'Unable to save selected tabs. Try again.'",
    );
    expect(popup).toContain(
      "'Unable to remove duplicate tabs. Try again.'",
    );
    expect(categoryManager).toContain(
      "'Unable to save category. Try again.'",
    );
    expect(exportModal).toContain(
      "'Clipboard access failed. Use Download instead.'",
    );
  });

  it('uses Title Case and progress copy for action accessibility names', () => {
    const actions = [
      read('src/manager/components/search/SearchBar.tsx'),
      read('src/manager/components/sessions/SessionSelectionToolbar.tsx'),
      read('src/manager/components/shell/SessionTargetPicker.tsx'),
      read('src/manager/components/sidebar/OpenTabsPanel.tsx'),
      read('src/manager/components/sidebar/OpenTabsSelectionBar.tsx'),
      read('src/manager/components/workspace/CategoryManager.tsx'),
      read('src/manager/components/workspace/ManagerGlobalActions.tsx'),
      read('src/manager/components/workspace/ManagerSearchCommand.tsx'),
      read('src/manager/components/workspace/WorkspaceMenu.tsx'),
      read('src/manager/components/workspace/WorkspaceEditorModal.tsx'),
      read('src/manager/components/workspace/WorkspaceManagerModal.tsx'),
      read('src/options/components/DataStorageCard.tsx'),
      read('src/popup/PopupApp.tsx'),
    ].join('\n');

    for (const expected of [
      'aria-label="Close Search"',
      'aria-label="Clear Search"',
      'label="Category Options"',
      'label="More Actions"',
      'aria-label="Show Search"',
      'label="Edit Workspace"',
      'title="Manage Workspaces"',
      'title={title}',
      'label="Open Manager"',
      'label="Open Settings"',
      'Saving Selected Tabs…',
      'Creating Session…',
      'Restore Selected Links',
      'Copy Selected URLs',
      'Move Selected Items',
      'Delete Selected Items',
      'Save Selected Tabs To',
      'Move Session',
      'Move Session To',
      'Select All Visible Items',
      'Unselect All Visible Items',
      'Reconnecting…',
    ]) {
      expect(actions).toContain(expected);
    }
  });

  it('describes dedupe scope and duplicate source-tab closing accurately', () => {
    const options = read('src/options/OptionsApp.tsx');

    expect(options).toContain(
      'Close regular source tabs after they are stored; pinned tabs stay open.',
    );
    expect(options).toContain(
      'Keep one copy of repeated URLs; pinned source tabs stay open.',
    );
    expect(options).not.toContain(
      'Skip tabs whose URL is already saved somewhere',
    );
  });
});
