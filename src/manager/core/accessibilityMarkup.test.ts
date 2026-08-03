import { readdirSync, readFileSync } from 'node:fs';
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
const tabBoardModal = readFileSync(
  resolve(root, 'src/shared/components/TabBoardModal.tsx'),
  'utf8',
);
const confirmDialog = readFileSync(
  resolve(root, 'src/shared/components/ConfirmDialog.tsx'),
  'utf8',
);
const workspaceManagerModal = readFileSync(
  resolve(root, 'src/manager/components/workspace/WorkspaceManagerModal.tsx'),
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
  'src/manager/styles/overlays.css',
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
const allSurfaceCss = [
  accessibilityCss,
  managerCss,
  optionsCss,
  popupCss,
].join('\n');
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
  'src/manager/components/workspace/WorkspaceEditorModal.tsx',
  'src/manager/components/workspace/WorkspaceManagerModal.tsx',
];

function productionSourceFiles(directory: string): string[] {
  return readdirSync(resolve(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return productionSourceFiles(path);
      if (
        !entry.isFile()
        || !/\.[cm]?[jt]sx?$/.test(entry.name)
        || /\.test\.[cm]?[jt]sx?$/.test(entry.name)
      ) {
        return [];
      }
      return [path];
    });
}

describe('project UI accessibility markup', () => {
  it('uses Lucide as the only production icon library', () => {
    const retiredIconLibrary = ['@tabler', 'icons-react'].join('/');
    const tablerImports = productionSourceFiles('src').filter((file) =>
      readFileSync(resolve(root, file), 'utf8').includes(retiredIconLibrary)
    );

    expect(tablerImports).toEqual([]);
  });

  it('routes standard control tips through the single shared owner', () => {
    const sharedTooltip = 'src/shared/components/TabBoardTooltip.tsx';
    const failures = productionSourceFiles('src')
      .filter((file) => file !== sharedTooltip)
      .filter((file) => {
        const source = readFileSync(resolve(root, file), 'utf8');
        return source.includes('<Tooltip') || /<(?:ActionIcon|button)\b[^>]*\btitle=/.test(source);
      });

    expect(failures).toEqual([]);
  });

  it('marks every presentational icon as hidden from assistive technology', () => {
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
    expect(categoryManager).toContain('{...MANAGER_DENSE_MENU_PROPS}');
    expect(categoryManager).toContain('withInitialFocusPlaceholder={false}');
    expect(categoryManager).toContain("portalProps={{ target: '#manager-main' }}");
    expect(categoryManager).toContain('aria-haspopup="menu"');
    expect(categoryManager).toContain('aria-expanded={categoryMenuOpen}');
    expect(categoryManager).not.toContain('aria-controls=');
    expect(categoryManager).toContain('<Menu.Dropdown id="category-options-menu">');
  });

  it('makes only covered Manager surfaces inert while the compact sidebar drawer is open', () => {
    expect(managerFrame).toContain("const drawerOpen = sidebarState === 'drawer'");
    expect(managerFrame).toContain("{...(drawerOpen ? { inert: '' } : {})}");
    expect(managerFrame).toContain('className="manager-main-surface"');
    expect(managerFrame).toMatch(
      /<div[\s\S]*?className="manager-main-surface"[\s\S]*?\{\.\.\.\(drawerOpen \? \{ inert: '' \} : \{\}\)\}/,
    );
    expect(managerFrame).toMatch(
      /<main[\s\S]*?<h1 className="visually-hidden"[\s\S]*?<div[\s\S]*?className="manager-main-surface"/,
    );
    expect(managerFrame).not.toContain(
      'aria-hidden={drawerOpen || undefined}',
    );
  });

  it('routes fixed Manager modals through the shared body-portal owner', () => {
    expect(tabBoardModal).toContain('portalProps={portalProps ?? {}}');
    expect(tabBoardModal).toContain('<Modal.Header role="presentation">');
    expect(tabBoardModal).toContain('<Modal.Title>{title}</Modal.Title>');
    expect(managerModal).toContain('<TabBoardModal');
    expect(managerModal).toContain(
      "'aria-label': closeButtonProps?.['aria-label'] ?? `Close ${title}`",
    );
    for (const file of managerModalOwners) {
      const source = readFileSync(resolve(root, file), 'utf8');
      expect(source).toContain('<ManagerModal');
      expect(source).not.toMatch(/<Modal(?:\s|>)/);
    }
  });

  it('routes Manager confirmations through the same neutral-header owner', () => {
    const managerApp = readFileSync(resolve(root, 'src/manager/ManagerApp.tsx'), 'utf8');
    const destructiveConfirmation = readFileSync(
      resolve(root, 'src/shared/components/DestructiveConfirmation.tsx'),
      'utf8',
    );
    expect(confirmDialog).toContain('<TabBoardModal');
    expect(confirmDialog).not.toMatch(/<Modal(?:\s|>)/);
    expect(managerApp).toContain('<DestructiveConfirmationProvider>');
    expect(managerApp).not.toContain('portalTarget="#manager-main"');
    expect(workspaceManagerModal).not.toContain('portalTarget="#manager-main"');
    expect(destructiveConfirmation).toContain('portalTarget={portalTarget}');
  });

  it('keeps Manager Modal defaults body-portaled while menus and tooltips stay scoped', () => {
    const managerThemeStart = themeSource.indexOf('export const managerTheme');
    const managerThemeSource = themeSource.slice(managerThemeStart);
    const modalDefaults = managerThemeSource.slice(
      managerThemeSource.indexOf('Modal:'),
      managerThemeSource.indexOf('Button:'),
    );

    expect(modalDefaults).toContain('portalProps: {}');
    expect(modalDefaults).not.toContain("'#manager-main'");
    expect(managerThemeSource).toContain("Tooltip:");
    expect(managerThemeSource).toContain("Menu:");
    expect(managerThemeSource).toContain("portalProps: { target: '#manager-main' }");
  });

  it('defines explicit light and dark contrast tokens for category labels and window glyphs', () => {
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
    expect(managerCss).not.toContain('.manager-window-label');
    expect(optionsCss).toContain(
      ":root[data-mantine-color-scheme='light'] .options-theme-control",
    );
    expect(optionsCss).toContain(
      ":root[data-mantine-color-scheme='dark'] .options-theme-control",
    );
    expect(optionsCss).toContain(
      ":root[data-mantine-color-scheme='dark'] .options-theme-control .mantine-SegmentedControl-label[data-active='true']",
    );
    expect(optionsCss).toMatch(
      /\.options-theme-control \.mantine-SegmentedControl-indicator\s*\{[^}]*display: none;/,
    );
    expect(optionsCss).toMatch(
      /\.options-theme-control \.mantine-SegmentedControl-label\s*\{[^}]*transition: none;/,
    );
    expect(optionsCss).toMatch(
      /data-mantine-color-scheme='light'[\s\S]*label\[data-active='true'\]\s*\{[^}]*background: var\(--tabboard-accent-soft\)/,
    );
    expect(optionsCss).toMatch(
      /data-mantine-color-scheme='dark'[\s\S]*label\[data-active='true'\]\s*\{[^}]*background: var\(--tabboard-accent-soft\)/,
    );
    expect(optionsCss).not.toContain('.options-action-primary');
    expect(optionsCss).toContain('.options-action-danger');
  });

  it('bridges the confirmed A1 and D1 palette through semantic surface tokens', () => {
    for (const token of [
      '--tabboard-canvas: #f3f5f8',
      '--tabboard-surface: #ffffff',
      '--tabboard-sidebar: #f8f9fb',
      '--tabboard-toolbar: #fcfcfd',
      '--tabboard-text: #202a3b',
      '--tabboard-secondary: #5f6c80',
      '--tabboard-muted: #7b8799',
      '--tabboard-accent: #315ec9',
      '--tabboard-accent-soft: #eaf0fc',
      '--tabboard-canvas: #1a1e24',
      '--tabboard-sidebar: #20252c',
      '--tabboard-toolbar: #242930',
      '--tabboard-surface: #282e36',
      '--tabboard-surface-hover: #303741',
      '--tabboard-border: #3a424d',
      '--tabboard-border-strong: #444d59',
      '--tabboard-text: #eef2f7',
      '--tabboard-secondary: #c1c9d4',
      '--tabboard-muted: #919cab',
      '--tabboard-accent: #5a80dd',
      '--tabboard-accent-soft: #2b3a61',
      '--tabboard-accent-text: #b6c8fa',
      '--tabboard-session-shadow: 0 1px 3px rgba(31, 42, 62, 0.07)',
      '--tabboard-session-shadow: 0 1px 3px rgba(0, 0, 0, 0.28)',
    ]) {
      expect(accessibilityCss).toContain(token);
    }
    expect(accessibilityCss).toContain('--mantine-color-body: var(--tabboard-canvas)');
    expect(accessibilityCss).toContain('--mantine-color-default-border: var(--tabboard-border)');
    expect(accessibilityCss).toContain('--mantine-primary-color-filled: var(--tabboard-accent)');
    expect(accessibilityCss).toContain('--mantine-primary-color-light: var(--tabboard-accent-soft)');
  });

  it('uses zero letter spacing and shared compact/coarse geometry', () => {
    expect(accessibilityCss).toContain('letter-spacing: 0');
    expect(accessibilityCss).toMatch(
      /\.accessible-icon-action\s*\{[\s\S]*?width: var\(--tabboard-action-size\)[\s\S]*?height: var\(--tabboard-action-size\)/,
    );
    expect(themeSource).toContain('desktopSize: 32');
    expect(themeSource).toContain('touchSize: 44');
    expect(themeSource).toContain('toolbarSize: 18');
    expect(themeSource).toContain('menuSize: 16');
    expect(themeSource).toContain('strokeWidth: 1.75');
    expect(managerCss).toMatch(
      /\.manager-dense-menu__item,[\s\S]*?height: 29px;[\s\S]*?min-height: 29px;[\s\S]*?padding-block: 0;[\s\S]*?font-size: 13px;[\s\S]*?line-height: 18px;/,
    );
    expect(managerCss).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.manager-dense-menu__item,[\s\S]*?min-height: 44px/,
    );
    const letterSpacingValues = [...allSurfaceCss.matchAll(
      /letter-spacing:\s*([^;}\n]+)/g,
    )].map((match) => match[1].trim());
    expect(letterSpacingValues).toEqual(['0']);
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
    const openTabsWindowBar = readFileSync(
      resolve(root, 'src/manager/components/sidebar/OpenTabsWindowBar.tsx'),
      'utf8',
    );

    expect(importModal).not.toContain(
      "transition: 'border-color 0.2s ease, background-color 0.2s ease'",
    );
    expect(openTabsPanel).not.toContain(
      "style={{ transform: sidebarPinned ? undefined : 'rotate(180deg)' }}",
    );
    expect(openTabsWindowBar).not.toContain('IconRefresh');
    expect(openTabsWindowBar).not.toContain('manager-refresh-icon--loading');
  });

  it('uses the shared tabular class for other changing count displays', () => {
    const countOwners = [
      'src/manager/components/bin/BinView.tsx',
      'src/manager/components/import-export/ImportModal.tsx',
      'src/manager/components/search/SearchBar.tsx',
      'src/manager/components/shell/ManagerDragOverlay.tsx',
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
      'src/manager/components/sessions/SessionCardMeta.tsx',
      'src/manager/components/shell/ManagerDragOverlay.tsx',
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

  it('scopes Manager menus and tooltips to main while fixed dialogs use body', () => {
    const managerApp = readFileSync(resolve(root, 'src/manager/ManagerApp.tsx'), 'utf8');

    expect(managerApp).toContain('theme={managerTheme}');
    expect(themeSource).toContain('export const managerTheme');
    expect(themeSource).toContain("portalProps: { target: '#manager-main' }");
    expect(themeSource).toContain('portalProps: {}');
    expect(tabBoardModal).toContain('<Modal.Header role="presentation">');
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
    expect(accessibilityCss).toContain('background: var(--tabboard-surface)');
  });

  it('keeps secondary actions discoverable and provides coarse-pointer targets', () => {
    const sessionCss = readFileSync(
      resolve(root, 'src/manager/styles/session.css'),
      'utf8',
    );
    const sidebarCss = readFileSync(
      resolve(root, 'src/manager/styles/sidebar.css'),
      'utf8',
    );

    expect(sessionCss).toMatch(
      /\.tab-item-row__select,[\s\S]*?\.tab-item-row__delete\s*\{[\s\S]*?opacity:\s*0;/,
    );
    expect(sessionCss).toContain(
      '.tab-item-row__content[data-selection-mode] .tab-item-row__select',
    );
    expect(sessionCss).not.toContain(
      ['.session-card__drag', 'handle'].join('-'),
    );
    expect(accessibilityCss).not.toContain(
      ['.session-card__drag', 'handle'].join('-'),
    );
    expect(accessibilityCss).not.toContain(
      ['.manager-open-tab-drag', 'handle'].join('-'),
    );
    expect(sidebarCss).toMatch(
      /\.manager-open-tab-select,[\s\S]*?\.manager-open-tab-close\s*\{[\s\S]*?opacity:\s*0;/,
    );
    expect(sidebarCss).toContain(
      '.manager-open-tabs--selection-mode .manager-open-tab-select',
    );
    expect(accessibilityCss).toContain('@media (hover: none), (pointer: coarse)');
    expect(accessibilityCss).toContain('min-width: 44px');
    expect(accessibilityCss).toContain('min-height: 44px');
    expect(accessibilityCss).toContain('gap: 8px');
    expect(sidebarCss).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.manager-open-tab-row\s*\{[\s\S]*?gap: 8px;/,
    );
    expect(sidebarCss).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.manager-open-tab-row\s*\{[\s\S]*?gap: 8px;[\s\S]*?\.manager-open-tab-close\s*\{[\s\S]*?opacity: 1;/,
    );
    expect(sidebarCss).toMatch(
      /\.manager-shell--sidebar-collapsed:not\(\.manager-shell--sidebar-peek\):not\(\.manager-shell--sidebar-drawer\) \.manager-open-tab-select,[\s\S]*?\.manager-open-tab-close\s*\{[^}]*display:\s*none;/,
    );
    const openTabRow = readFileSync(
      resolve(root, 'src/manager/components/sidebar/OpenTabRow.tsx'),
      'utf8',
    );
    expect(openTabRow.match(/tabIndex=\{sidebarCollapsed \? -1 : undefined\}/g))
      .toHaveLength(3);
    expect(sidebarCss).not.toMatch(
      /html\[data-tabboard-hover-suppressed\][^{]*\.manager-open-tab-close\s*\{[^}]*!important/,
    );
    expect(sidebarCss).toMatch(
      /html\[data-tabboard-hover-suppressed\][^{]*\.manager-open-tab-row:not\(:focus-within\)[^{]*\.manager-open-tab-close/,
    );
    expect(sidebarCss).toMatch(
      /html\[data-tabboard-hover-suppressed\][^{]*\.manager-open-tabs:not\(\.manager-open-tabs--selection-mode\)[^{]*\.manager-open-tab-close/,
    );
    expect(sessionCss).not.toMatch(
      /html\[data-tabboard-hover-suppressed\][^{]*\.tab-item-row__delete\s*\{[^}]*!important/,
    );
    expect(sessionCss).toMatch(
      /html\[data-tabboard-hover-suppressed\][^{]*\.tab-item-row__content:not\(:focus-within\):not\(\[data-selection-mode\]\)[^{]*\.tab-item-row__delete/,
    );
    expect(sidebarCss).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.manager-open-tab-select,[\s\S]*?\.manager-open-tab-close\s*\{[^}]*pointer-events:\s*auto;/,
    );
    expect(sessionCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.tab-item-row__select,[\s\S]*?\.tab-item-row__delete\s*\{[^}]*pointer-events:\s*auto;/,
    );
    expect(sessionCss).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.tab-item-row__select,[\s\S]*?\.tab-item-row__delete\s*\{[^}]*pointer-events:\s*auto;/,
    );
    const productionActions = [
      'src/manager/components/sidebar/OpenTabsWindowBar.tsx',
      'src/popup/PopupApp.tsx',
    ].map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
    expect(productionActions).toContain('<AccessibleIconAction');
  });

  it('keeps functional session metadata at or above 12px', () => {
    const sessionCss = readFileSync(
      resolve(root, 'src/manager/styles/session.css'),
      'utf8',
    );
    expect(sessionCss).toMatch(
      /\.session-card__meta\s*\{[\s\S]*?font-size:\s*12px;[\s\S]*?line-height:\s*16px;/,
    );
    expect(sessionCss).not.toMatch(/font-size:\s*(?:10|11)px/);
  });
});
