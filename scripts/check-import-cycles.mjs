import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

function parseArgs(argv) {
  const options = {
    root: '.',
    denyTogether: [],
    denyImports: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') {
      options.root = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (argument === '--deny-together') {
      const value = argv[index + 1] || '';
      options.denyTogether.push(value.split(',').filter(Boolean));
      index += 1;
      continue;
    }
    if (argument === '--deny-imports') {
      const value = argv[index + 1] || '';
      options.denyImports.push(value.split(',').filter(Boolean));
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.root) throw new Error('--root requires a directory');
  if (options.denyTogether.some((group) => group.length < 2)) {
    throw new Error('--deny-together requires at least two comma-separated paths');
  }
  if (options.denyImports.some((group) => group.length < 2)) {
    throw new Error('--deny-imports requires an owner and at least one forbidden target');
  }
  return options;
}

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return entry.isFile() && ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
  });
}

function normalizePath(path) {
  return path.split(sep).join('/');
}

function resolveImport(importer, specifier, sourceFiles) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(importer), specifier);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  return candidates.find((candidate) => sourceFiles.has(candidate)) || null;
}

function importedSpecifiers(source) {
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g,
    /import\s*['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
}

function buildGraph(root) {
  const sourceRoot = join(root, 'src');
  if (!existsSync(sourceRoot)) throw new Error(`Missing source directory: ${sourceRoot}`);
  const files = listSourceFiles(sourceRoot).map((path) => realpathSync(path));
  const sourceFiles = new Set(files);
  const edges = new Map();
  const importEdges = [];
  for (const file of files) {
    const imports = importedSpecifiers(readFileSync(file, 'utf8'));
    const resolvedImports = imports
      .map((specifier) => resolveImport(file, specifier, sourceFiles))
      .filter(Boolean);
    edges.set(file, [...new Set(resolvedImports)]);
    for (const specifier of imports) {
      importEdges.push({
        importer: file,
        specifier,
        resolved: resolveImport(file, specifier, sourceFiles),
      });
    }
  }
  return { files, edges, importEdges };
}

function stronglyConnectedComponents(files, edges) {
  let nextIndex = 0;
  const stack = [];
  const onStack = new Set();
  const indexes = new Map();
  const lowLinks = new Map();
  const components = [];

  const visit = (file) => {
    indexes.set(file, nextIndex);
    lowLinks.set(file, nextIndex);
    nextIndex += 1;
    stack.push(file);
    onStack.add(file);

    for (const dependency of edges.get(file) || []) {
      if (!indexes.has(dependency)) {
        visit(dependency);
        lowLinks.set(file, Math.min(lowLinks.get(file), lowLinks.get(dependency)));
      } else if (onStack.has(dependency)) {
        lowLinks.set(file, Math.min(lowLinks.get(file), indexes.get(dependency)));
      }
    }

    if (lowLinks.get(file) !== indexes.get(file)) return;
    const component = [];
    let current;
    do {
      current = stack.pop();
      onStack.delete(current);
      component.push(current);
    } while (current !== file);
    if (component.length > 1) components.push(component);
  };

  for (const file of files) {
    if (!indexes.has(file)) visit(file);
  }
  return components;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = realpathSync(options.root);
  const { files, edges, importEdges } = buildGraph(root);
  const cycles = stronglyConnectedComponents(files, edges)
    .map((component) => component.map((path) => normalizePath(relative(root, path))).sort())
    .sort((left, right) => left[0].localeCompare(right[0]));

  const deniedCycles = options.denyTogether.length
    ? cycles.filter((cycle) => options.denyTogether.some((group) =>
      group.every((path) => cycle.includes(normalizePath(path)))))
    : cycles;

  for (const cycle of cycles) {
    console.log(`Import cycle:\n  ${cycle.join('\n  ')}`);
  }

  const forbiddenImportEdges = options.denyImports.flatMap(([owner, ...targets]) => {
    const normalizedOwner = normalizePath(owner);
    return importEdges.flatMap(({ importer, specifier, resolved: resolvedTarget }) => {
      const normalizedImporter = normalizePath(relative(root, importer));
      if (normalizedImporter !== normalizedOwner) return [];
      const target = resolvedTarget
        ? normalizePath(relative(root, resolvedTarget))
        : specifier;
      const forbidden = targets.some((prefix) =>
        target === normalizePath(prefix)
        || target.startsWith(`${normalizePath(prefix)}/`)
        || target.startsWith(`${normalizePath(prefix)}.`));
      return forbidden ? [`${normalizedImporter} -> ${target}`] : [];
    });
  });

  for (const edge of forbiddenImportEdges) {
    console.error(`Forbidden import edge: ${edge}`);
  }

  if (deniedCycles.length) {
    console.error(`Denied import cycle count: ${deniedCycles.length}`);
    process.exit(1);
  }
  if (forbiddenImportEdges.length) {
    console.error(`Forbidden import edge count: ${forbiddenImportEdges.length}`);
    process.exit(1);
  }
  if (options.denyImports.length) {
    console.log(`No forbidden import edges (${files.length} source files checked).`);
  }
  console.log(`No denied import cycles (${files.length} source files checked).`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
