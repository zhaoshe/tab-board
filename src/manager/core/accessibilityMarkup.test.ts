import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const uiFiles = [
  'src/manager/components/bin/BinView.tsx',
  'src/manager/components/import-export/ExportModal.tsx',
  'src/manager/components/import-export/ImportModal.tsx',
  'src/manager/components/search/SearchBar.tsx',
  'src/manager/components/sessions/SessionCard.tsx',
  'src/manager/components/sessions/TabItemRow.tsx',
  'src/manager/components/sidebar/OpenTabsPanel.tsx',
  'src/manager/components/workspace/WorkspaceContent.tsx',
  'src/manager/hooks/useToast.tsx',
  'src/options/components/DataStorageCard.tsx',
  'src/options/components/DisconnectDialog.tsx',
  'src/options/components/FolderPickerDialog.tsx',
  'src/manager/components/import-export/ExportModal.tsx',
];
const managerFrame = readFileSync(
  resolve(root, 'src/manager/components/shell/ManagerFrame.tsx'),
  'utf8',
);
const managerModal = readFileSync(
  resolve(root, 'src/manager/components/shell/ManagerModal.tsx'),
  'utf8',
);
const categoryManager = readFileSync(
  resolve(root, 'src/manager/components/workspace/CategoryManager.tsx'),
  'utf8',
);
const menuPolicy = readFileSync(
  resolve(root, 'src/manager/components/workspace/managerMenuPolicy.ts'),
  'utf8',
);
const managerCss = [
  'src/manager/styles/header.css',
  'src/manager/styles/sidebar.css',
].map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
const optionsCss = readFileSync(resolve(root, 'src/options/options.css'), 'utf8');
const popupCss = readFileSync(resolve(root, 'src/popup/popup.css'), 'utf8');
const accessibilityCss = readFileSync(
  resolve(root, 'src/shared/styles/accessibility.css'),
  'utf8',
);
const themeSource = readFileSync(
  resolve(root, 'src/shared/styles/theme.ts'),
  'utf8',
);
const tooltipCss = readFileSync(
  resolve(root, 'src/shared/styles/tooltip.css'),
  'utf8',
);
const managerModalOwners = [
  'src/manager/components/bin/BinView.tsx',
  'src/manager/components/import-export/ExportModal.tsx',
  'src/manager/components/import-export/ImportModal.tsx',
  'src/manager/components/sessions/SessionItemComposer.tsx',
  'src/manager/components/shell/KeyboardShortcutsHelp.tsx',
  'src/manager/components/workspace/CategoryManager.tsx',
  'src/manager/components/workspace/WorkspaceMenu.tsx',
];

describe('project UI accessibility markup', () => {
  it('marks every presentational Tabler icon as hidden from assistive technology', () => {
    const failures: string[] = [];

    for (const file of uiFiles) {
      const source = readFileSync(resolve(root, file), 'utf8');
      for (const match of source.matchAll(/<Icon[A-Z][^>]*\/>/g)) {
        if (!match[0].includes('aria-hidden="true"')) {
          failures.push(`${file}: ${match[0].replace(/\s+/g, ' ')}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('names storage migration radio groups and loading regions', () => {
    const folderPicker = readFileSync(
      resolve(root, 'src/options/components/FolderPickerDialog.tsx'),
      'utf8',
    );
    const disconnect = readFileSync(
      resolve(root, 'src/options/components/DisconnectDialog.tsx'),
      'utf8',
    );

    expect(folderPicker).toContain('label="Existing folder data"');
    expect(folderPicker).toContain('name="existing-folder-data"');
    expect(folderPicker).toContain('role="status"');
    expect(disconnect).toContain('label="File data"');
    expect(disconnect).toContain('name="file-data-migration"');
    expect(disconnect).toContain('role="status"');
  });

  it('gives saved-tab selection controls stable form names', () => {
    const tabItemRow = readFileSync(
      resolve(root, 'src/manager/components/sessions/TabItemRow.tsx'),
      'utf8',
    );

    expect(tabItemRow).toContain('name="saved-tab-selection"');
  });

  it('keeps the page heading inside main and closed menu controls valid', () => {
    const main = managerFrame.match(/<main[\s\S]*?<\/main>/)?.[0] ?? '';
    expect(main).toContain(
      '<h1 className="visually-hidden"><span translate="no">TabBoard</span> Tab Manager</h1>',
    );
    expect(menuPolicy).toContain('withRoles: false');
    expect(categoryManager).toContain('{...MANAGER_MENU_A11Y_PROPS}');
    expect(categoryManager).toContain('withInitialFocusPlaceholder={false}');
    expect(categoryManager).toContain("portalProps={{ target: '#manager-main' }}");
    expect(categoryManager).toContain('aria-haspopup="menu"');
    expect(categoryManager).toContain('aria-expanded={categoryMenuOpen}');
    expect(categoryManager).not.toContain('aria-controls=');
    expect(categoryManager).toContain('<Menu.Dropdown id="category-options-menu">');
  });

  it('routes every Manager modal into main with a named close control', () => {
    expect(managerModal).toContain("document.querySelector<HTMLElement>('#manager-main')");
    expect(managerModal).toContain(
      "'aria-label': closeButtonProps?.['aria-label'] ?? `Close ${title}`",
    );
    for (const file of managerModalOwners) {
      const source = readFileSync(resolve(root, file), 'utf8');
      expect(source).toContain('<ManagerModal');
      expect(source).not.toMatch(/<Modal(?:\s|>)/);
    }
  });

  it('routes destructive confirmation into the Manager landmark', () => {
    const managerApp = readFileSync(resolve(root, 'src/manager/ManagerApp.tsx'), 'utf8');
    const destructiveConfirmation = readFileSync(
      resolve(root, 'src/shared/components/DestructiveConfirmation.tsx'),
      'utf8',
    );
    expect(managerApp).toContain('<DestructiveConfirmationProvider portalTarget="#manager-main">');
    expect(destructiveConfirmation).toContain('portalTarget={portalTarget}');
  });

  it('defines explicit light and dark contrast tokens for category and window labels', () => {
    expect(managerCss).toContain(
      ":root[data-mantine-color-scheme='light'] .manager-category-item [data-category-trigger='label']",
    );
    expect(managerCss).toContain(
      ":root[data-mantine-color-scheme='dark'] .manager-category-item [data-category-trigger='label']",
    );
    expect(managerCss).toContain(
      ":root[data-mantine-color-scheme='light'] .manager-window-glyph",
    );
    expect(managerCss).toContain(
      ":root[data-mantine-color-scheme='dark'] .manager-window-glyph",
    );
    expect(optionsCss).toContain(
      ":root[data-mantine-color-scheme='light'] .options-theme-control",
    );
    expect(optionsCss).toContain(
      ":root[data-mantine-color-scheme='dark'] .options-theme-control",
    );
    expect(optionsCss).toContain(
      ":root[data-mantine-color-scheme='dark'] .options-theme-control .mantine-SegmentedControl-label[data-active='true']",
    );
    expect(optionsCss).toContain('.options-action-primary');
    expect(optionsCss).toContain('.options-action-danger');
  });

  it('marks visible product names as non-translatable and count displays as tabular', () => {
    const managerApp = readFileSync(resolve(root, 'src/manager/ManagerApp.tsx'), 'utf8');
    const managerFrameSource = readFileSync(
      resolve(root, 'src/manager/components/shell/ManagerFrame.tsx'),
      'utf8',
    );
    const optionsApp = readFileSync(resolve(root, 'src/options/OptionsApp.tsx'), 'utf8');
    const popupApp = readFileSync(resolve(root, 'src/popup/PopupApp.tsx'), 'utf8');

    expect(managerApp).toContain('<span translate="no">TabBoard</span>');
    expect(managerFrameSource).toContain('<span translate="no">TabBoard</span>');
    expect(optionsApp).toContain('<span translate="no">TabBoard</span>');
    expect(popupApp).toContain('<span translate="no">TabBoard</span>');
    expect(popupCss).toMatch(
      /\.popup-app__count,[\s\S]*?font-variant-numeric: tabular-nums/,
    );
  });

  it('avoids non-compositor transitions and direct SVG transforms', () => {
    const importModal = readFileSync(
      resolve(root, 'src/manager/components/import-export/ImportModal.tsx'),
      'utf8',
    );
    const openTabsPanel = readFileSync(
      resolve(root, 'src/manager/components/sidebar/OpenTabsPanel.tsx'),
      'utf8',
    );

    expect(importModal).not.toContain(
      "transition: 'border-color 0.2s ease, background-color 0.2s ease'",
    );
    expect(openTabsPanel).not.toContain(
      "style={{ transform: sidebarPinned ? undefined : 'rotate(180deg)' }}",
    );
    expect(openTabsPanel).toContain(
      '<span className={loading ? \'manager-refresh-icon--loading\' : undefined} aria-hidden="true">',
    );
    expect(openTabsPanel).toContain('<IconRefresh size={20} aria-hidden="true" />');
    expect(openTabsPanel).not.toContain(
      '<IconRefresh className={loading ? \'manager-refresh-icon--loading\' : undefined}',
    );
  });

  it('uses the shared tabular class for other changing count displays', () => {
    const countOwners = [
      'src/manager/components/bin/BinView.tsx',
      'src/manager/components/import-export/ImportModal.tsx',
      'src/manager/components/search/SearchBar.tsx',
      'src/manager/components/shell/ManagerDndCoordinator.tsx',
    ];

    for (const file of countOwners) {
      expect(readFileSync(resolve(root, file), 'utf8')).toContain('tabular-nums');
    }
    expect(accessibilityCss).toContain('.tabular-nums');
    expect(accessibilityCss).toContain('font-variant-numeric: tabular-nums');
  });

  it('formats all shipped count displays through the shared Intl owner', () => {
    const countOwners = [
      'src/manager/components/bin/BinView.tsx',
      'src/manager/components/import-export/ImportModal.tsx',
      'src/manager/components/search/SearchBar.tsx',
      'src/manager/components/sessions/SessionCard.tsx',
      'src/manager/components/shell/ManagerDndCoordinator.tsx',
      'src/manager/components/sidebar/OpenTabsPanel.tsx',
      'src/manager/components/workspace/CategoryManager.tsx',
      'src/manager/components/shell/useToastNotifications.ts',
      'src/popup/PopupApp.tsx',
    ];

    for (const file of countOwners) {
      expect(readFileSync(resolve(root, file), 'utf8')).toContain('formatNumber');
    }
  });

  it('keeps tooltips user-controlled instead of force-hiding them', () => {
    expect(tooltipCss).not.toContain('animation:');
    expect(tooltipCss).not.toContain('@keyframes');
  });

  it('keeps Manager floating UI inside main without transient fade states', () => {
    const managerApp = readFileSync(resolve(root, 'src/manager/ManagerApp.tsx'), 'utf8');

    expect(managerApp).toContain('theme={managerTheme}');
    expect(themeSource).toContain('export const managerTheme');
    expect(themeSource).toContain("portalProps: { target: '#manager-main' }");
    expect(themeSource).toContain('zIndex: 1100');
    expect(themeSource.match(/transitionProps: \{ duration: 0 \}/g)?.length)
      .toBeGreaterThanOrEqual(3);
  });

  it('overrides Mantine danger button variables with contrast-safe tokens', () => {
    expect(optionsCss).toContain('--button-color: var(--mantine-color-red-9) !important');
    expect(optionsCss).toContain('--button-bg: var(--mantine-color-white) !important');
    expect(optionsCss).toContain('--button-color: var(--mantine-color-red-2) !important');
    expect(optionsCss).toContain('--button-bg: var(--mantine-color-dark-7) !important');
    expect(accessibilityCss).toContain('.destructive-confirm-action');
    expect(accessibilityCss).toContain('--button-bg: var(--mantine-color-red-8) !important');
    expect(accessibilityCss).toContain('.confirm-dialog__message');
    expect(accessibilityCss).toContain('background: var(--mantine-color-body)');
  });
});
