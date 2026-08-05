import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Popup static startup shell', () => {
  it('provides stable non-interactive content before application JavaScript runs', () => {
    const html = readFileSync(resolve(process.cwd(), 'popup.html'), 'utf8');
    const rootStart = html.indexOf('<div id="root">');
    const scriptStart = html.indexOf('<script type="module"', rootStart);
    const bootShell = html.slice(rootStart, scriptStart);

    expect(rootStart).toBeGreaterThan(-1);
    expect(scriptStart).toBeGreaterThan(rootStart);
    expect(bootShell).toContain('data-popup-boot-shell');
    expect(bootShell).toContain('role="status"');
    expect(bootShell).toContain('aria-live="polite"');
    expect(bootShell).toContain('/icons/icon-32.png');
    expect(bootShell).toContain('Loading current window…');
    expect(bootShell).not.toMatch(/<(?:button|input|a)\b/i);
    expect(html).toMatch(/width:\s*320px/);
    expect(html).toMatch(/min-height:\s*180px/);
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('prefers-reduced-motion: reduce');
    expect(html).not.toMatch(/<link\b[^>]*(?:stylesheet|font)/i);
    expect(html.match(/<script\b/g)).toHaveLength(1);
    expect(html).toContain(
      '<script type="module" src="/src/popup/main.tsx"></script>',
    );
  });
});
