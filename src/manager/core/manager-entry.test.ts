// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { build as viteBuild, createServer, type Plugin } from 'vite';
import { describe, expect, it, vi } from 'vitest';

const projectRoot = resolve(process.cwd());

type PreviewReactRoot = { unmount: () => void };

type PreviewGlobals = {
  chrome?: unknown;
  __tabboardPreviewRoots?: PreviewReactRoot[];
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const previewRootCapturePlugin: Plugin = {
  name: 'tabboard-preview-root-capture',
  enforce: 'pre',
  transform(code, id) {
    const sourceId = id.split('?')[0];
    if (![
      resolve(projectRoot, 'src/manager/main.tsx'),
      resolve(projectRoot, 'src/popup/main.tsx'),
    ].includes(sourceId)) {
      return undefined;
    }

    const rootDeclaration = '  const root = createRoot(container);';
    if (!code.includes(rootDeclaration)) return undefined;

    return {
      code: code.replace(
        rootDeclaration,
        `${rootDeclaration}\n  globalThis.__tabboardPreviewRoots ??= [];\n  globalThis.__tabboardPreviewRoots.push(root);`,
      ),
      map: null,
    };
  },
};

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), 'utf8');
}

function readInlineModule(path: string): string {
  const html = readProjectFile(path.replace(/^\/+/, ''));
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];

  expect(html).toMatch(/<div\s+id=["']root["']\s*>\s*<\/div>/);
  expect(scripts).toHaveLength(1);
  expect(scripts[0][1]).toMatch(/\btype=["']module["']/);
  expect(scripts[0][1]).not.toMatch(/\bsrc=/);

  return scripts[0][2];
}

async function listOutputFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(current, entry.name);
    return entry.isDirectory() ? listOutputFiles(root, path) : [relative(root, path)];
  }));
  return nested.flat();
}

describe('Manager production entry', () => {
  it('ships React Manager as the only production Manager entry', () => {
    const managerHtml = readProjectFile('manager.html');
    const scriptTags = [...managerHtml.matchAll(/<script\b([^>]*)>/g)];
    const scriptSources = scriptTags
      .map((match) => match[1].match(/\bsrc=["']([^"']+)["']/)?.[1])
      .filter((source): source is string => Boolean(source));

    const manifest = JSON.parse(readProjectFile('manifest.json')) as {
      chrome_url_overrides?: { newtab?: string };
    };

    expect(managerHtml).toMatch(/id=["']root["']/);
    expect(managerHtml).not.toContain('/dev/');
    expect(scriptTags).toHaveLength(1);
    expect(scriptTags[0][1]).toMatch(/\btype=["']module["']/);
    expect(scriptSources).toHaveLength(1);
    const managerEntry = scriptSources[0];
    expect(managerEntry).toBe('/src/manager/main.tsx');
    expect(readProjectFile(managerEntry.slice(1))).toMatch(/createRoot\(container\)/);
    expect(manifest.chrome_url_overrides?.newtab).toBe('manager.html');
  });

  it.each([
    ['/dev/manager-preview.html', '/src/manager/main.tsx'],
    ['/dev/popup-preview.html', '/src/popup/main.tsx'],
  ] as const)('boots %s through Vite module graph before first render', async (path, entry) => {
    const moduleSource = readInlineModule(path);
    const installImport = moduleSource.indexOf("import { installPreviewChrome } from '/src/dev/previewChrome.ts';");
    const installCall = moduleSource.indexOf('installPreviewChrome();');
    const entryImport = moduleSource.indexOf(`await import('${entry}');`);

    expect(installImport).toBeGreaterThanOrEqual(0);
    expect(installCall).toBeGreaterThan(installImport);
    expect(entryImport).toBeGreaterThan(installCall);

    const tempDir = await mkdtemp(join(projectRoot, '.preview-entry-'));
    const tempModulePath = join(tempDir, 'preview-entry.ts');
    const globalWithChrome = globalThis as PreviewGlobals;
    const windowWithChrome = window as { chrome?: unknown };
    const hadChrome = Object.prototype.hasOwnProperty.call(globalWithChrome, 'chrome');
    const hadWindowChrome = Object.prototype.hasOwnProperty.call(windowWithChrome, 'chrome');
    const hadPreviewRoots = Object.prototype.hasOwnProperty.call(globalWithChrome, '__tabboardPreviewRoots');
    const previousChrome = globalWithChrome.chrome;
    const previousWindowChrome = windowWithChrome.chrome;
    const previousPreviewRoots = globalWithChrome.__tabboardPreviewRoots;
    const previewRoots: PreviewReactRoot[] = [];
    let server: Awaited<ReturnType<typeof createServer>> | undefined;

    try {
      await writeFile(tempModulePath, moduleSource, 'utf8');
      globalWithChrome.__tabboardPreviewRoots = previewRoots;
      server = await createServer({
        root: projectRoot,
        configFile: resolve(projectRoot, 'vite.config.ts'),
        plugins: [previewRootCapturePlugin],
        server: { middlewareMode: true, hmr: false },
      });
      document.body.innerHTML = '<div id="root"></div>';

      // Keep source unchanged: ssrLoadModule executes exact absolute /src entry import.
      await server.ssrLoadModule(tempModulePath);
      expect(globalWithChrome.chrome).toBeDefined();
      expect(previewRoots).toHaveLength(1);
      await vi.waitFor(() => {
        expect(document.getElementById('root')?.childElementCount).toBeGreaterThan(0);
      }, { timeout: 2_000, interval: 10 });
    } finally {
      [...previewRoots].reverse().forEach((root) => root.unmount());
      document.body.innerHTML = '';
      if (hadChrome) {
        globalWithChrome.chrome = previousChrome;
      } else {
        delete globalWithChrome.chrome;
      }
      if (hadWindowChrome) {
        windowWithChrome.chrome = previousWindowChrome;
      } else {
        delete windowWithChrome.chrome;
      }
      if (hadPreviewRoots) {
        globalWithChrome.__tabboardPreviewRoots = previousPreviewRoots;
      } else {
        delete globalWithChrome.__tabboardPreviewRoots;
      }
      await server?.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps production entries and Vite inputs free of dev previews', () => {
    const popupHtml = readProjectFile('popup.html');
    const popupScriptTags = [...popupHtml.matchAll(/<script\b([^>]*)>/g)];
    const popupScriptSources = popupScriptTags
      .map((match) => match[1].match(/\bsrc=["']([^"']+)["']/)?.[1])
      .filter((source): source is string => Boolean(source));
    const productionInputs = ['manager.html', 'popup.html', 'options.html'];
    const manifest = JSON.parse(readProjectFile('manifest.json')) as {
      chrome_url_overrides?: { newtab?: string };
    };

    expect(popupHtml).toMatch(/<div\s+id=["']root["']\s*>\s*<\/div>/);
    expect(popupScriptTags).toHaveLength(1);
    expect(popupScriptTags[0][1]).toMatch(/\btype=["']module["']/);
    expect(popupScriptSources).toEqual(['/src/popup/main.tsx']);
    expect(popupHtml).not.toContain('/dev/');
    expect(manifest.chrome_url_overrides?.newtab).toBe('manager.html');

    for (const configPath of ['vite.config.ts', 'vite.config.js']) {
      const config = readProjectFile(configPath);
      expect(config).not.toContain('dev/manager-preview.html');
      expect(config).not.toContain('dev/popup-preview.html');
      for (const input of productionInputs) expect(config).toContain(`'${input}'`);
    }
  });

  it('builds production output without preview pages or harness references', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'tabboard-production-build-'));

    try {
      await viteBuild({
        configFile: resolve(projectRoot, 'vite.config.ts'),
        root: projectRoot,
        build: { outDir: outputDir, emptyOutDir: true },
      });

      const files = await listOutputFiles(outputDir);
      expect(files.filter((file) => file.endsWith('.html')).sort()).toEqual([
        'manager.html',
        'options.html',
        'popup.html',
      ]);
      expect(files).not.toContain('dev/manager-preview.html');
      expect(files).not.toContain('dev/popup-preview.html');

      const outputText = (await Promise.all(
        files
          .filter((file) => /\.(?:html|js|json|css)$/.test(file))
          .map((file) => readFile(join(outputDir, file), 'utf8')),
      )).join('\n');
      expect(outputText).not.toMatch(/(?:manager|popup)-preview\.html|src\/dev\/|previewChrome/);

      const managerHtml = await readFile(join(outputDir, 'manager.html'), 'utf8');
      const popupHtml = await readFile(join(outputDir, 'popup.html'), 'utf8');
      expect(managerHtml).toMatch(/<script type="module" crossorigin src="\/assets\/manager-[^"]+\.js"><\/script>/);
      expect(popupHtml).toMatch(/<script type="module" crossorigin src="\/assets\/popup-[^"]+\.js"><\/script>/);

      const manifest = JSON.parse(await readFile(join(outputDir, 'manifest.json'), 'utf8')) as {
        action?: { default_popup?: string };
        chrome_url_overrides?: { newtab?: string };
      };
      expect(manifest.action?.default_popup).toBe('popup.html');
      expect(manifest.chrome_url_overrides?.newtab).toBe('manager.html');
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }, 15_000);
});
