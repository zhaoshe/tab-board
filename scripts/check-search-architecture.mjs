import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

function parseArgs(argv) {
  let root = '.';
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') {
      root = argv[index + 1] || '';
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!root) throw new Error('--root requires a directory');
  return { root: resolve(root) };
}

function normalizePath(path) {
  return path.split(sep).join('/');
}

function isProductionSource(path) {
  return ['.ts', '.tsx'].includes(extname(path))
    && !/\.(?:test|spec)\.[^.]+$/.test(path);
}

function listProductionSource(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listProductionSource(path);
    return entry.isFile() && isProductionSource(path) ? [path] : [];
  });
}

function addViolation(violations, root, file, rule) {
  violations.push(`${normalizePath(relative(root, file))}: ${rule}`);
}

function scanAllSource(root, files, violations) {
  const legacyFeedbackNames = [
    'tabboard:save-success',
    'tabboard:import-success',
    'tabboard:restore-success',
    'tabboard:error',
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (source.includes('tabboard-search-change')) {
      addViolation(
        violations,
        root,
        file,
        'saved search must not use a window event bus',
      );
    }
    if (legacyFeedbackNames.some((name) => source.includes(name))) {
      addViolation(
        violations,
        root,
        file,
        'application feedback must not use legacy event names',
      );
    }
  }
}

function scanSearchBar(root, violations) {
  const file = join(root, 'src/manager/components/search/SearchBar.tsx');
  if (!existsSync(file)) return;
  const source = readFileSync(file, 'utf8');
  if (/\bwindow\.addEventListener\s*\(/.test(source)) {
    addViolation(
      violations,
      root,
      file,
      'SearchBar must subscribe through the query store',
    );
  }
}

function scanWorkspaceContent(root, violations) {
  const file = join(root, 'src/manager/components/workspace/WorkspaceContent.tsx');
  if (!existsSync(file)) return;
  const source = readFileSync(file, 'utf8');
  if (/\bstate\.groups\b|\ballGroups\b|groups\s*:\s*state\.groups/.test(source)) {
    addViolation(
      violations,
      root,
      file,
      'WorkspaceContent must not read all groups',
    );
  }
  if (/\bgroup\.(?:starred|archived|folderId)\b/.test(source)) {
    addViolation(
      violations,
      root,
      file,
      'WorkspaceContent must not own category membership',
    );
  }
}

function scanCoreOwner(root, violations) {
  const file = join(root, 'src/manager/core/searchQueryStore.ts');
  if (!existsSync(file)) return;
  const source = readFileSync(file, 'utf8');
  const rules = [
    [/(?:from\s+|import\s*)['"]react['"]/, 'core query owner must not import React'],
    [/(?:from\s+|import\s*)['"]zustand(?:\/[^'"]*)?['"]/, 'core query owner must not import Zustand'],
    [/(?:from\s+|import\s*)['"][^'"]*shared\/store[^'"]*['"]/, 'core query owner must not import TabBoard store'],
    [/\b(?:window|sessionStorage)\b/, 'core query owner must not read browser globals'],
  ];
  for (const [pattern, rule] of rules) {
    if (pattern.test(source)) addViolation(violations, root, file, rule);
  }
}

function scanFeedbackOwner(root, violations) {
  const file = join(root, 'src/shared/applicationFeedback.ts');
  if (!existsSync(file)) return;
  const source = readFileSync(file, 'utf8');
  const rules = [
    [/(?:from\s+|import\s*)['"]react['"]/, 'feedback owner must not import React'],
    [/(?:from\s+|import\s*)['"]zustand(?:\/[^'"]*)?['"]/, 'feedback owner must not import Zustand'],
    [/(?:from\s+|import\s*)['"][^'"]*(?:shared\/)?store(?:\/[^'"]*)?['"]/, 'feedback owner must not import shared store'],
    [/(?:from\s+|import\s*)['"][^'"]*manager(?:\/[^'"]*)?['"]/, 'feedback owner must not import Manager'],
    [/\b(?:window|document|chrome)\b/, 'feedback owner must not read browser globals'],
  ];
  for (const [pattern, rule] of rules) {
    if (pattern.test(source)) addViolation(violations, root, file, rule);
  }
}

function scanToastFeedback(root, violations) {
  const file = join(root, 'src/manager/components/shell/useToastNotifications.ts');
  if (!existsSync(file)) return;
  const source = readFileSync(file, 'utf8');
  if (/\bwindow\.(?:addEventListener|dispatchEvent)\s*\(/.test(source)) {
    addViolation(
      violations,
      root,
      file,
      'toast feedback must subscribe through the typed channel',
    );
  }
  if (/\bas\s+\{[^}]+\}/.test(source)) {
    addViolation(
      violations,
      root,
      file,
      'toast feedback must not assert raw payload shapes',
    );
  }
}

function scanRetiredEventModule(root, violations) {
  const file = join(root, 'src/shared/utils/events.ts');
  if (existsSync(file)) {
    addViolation(
      violations,
      root,
      file,
      'retired application event module must not exist',
    );
  }
}

function main() {
  const { root } = parseArgs(process.argv.slice(2));
  const files = listProductionSource(join(root, 'src'));
  const violations = [];

  scanAllSource(root, files, violations);
  scanSearchBar(root, violations);
  scanWorkspaceContent(root, violations);
  scanCoreOwner(root, violations);
  scanFeedbackOwner(root, violations);
  scanToastFeedback(root, violations);
  scanRetiredEventModule(root, violations);

  for (const violation of violations) {
    console.error(`Search architecture violation: ${violation}`);
  }
  if (violations.length) {
    console.error(`Search architecture violation count: ${violations.length}`);
    process.exit(1);
  }
  console.log(`Search architecture checks passed (${files.length} production source files checked).`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
