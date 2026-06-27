/**
 * Install smoke test — verifies the extension module loads without errors
 * and core exports are present. Runs in CI before publish.
 */

import { describe, it, expect } from 'vitest';

describe('Extension smoke test', () => {
  it('package.json has all required publish fields', async () => {
    const pkg = await import('../../project/package.json', { assert: { type: 'json' } });
    const p = pkg.default as Record<string, unknown>;

    expect(p.name).toBe('claude-novel-writer');
    expect(typeof p.version).toBe('string');
    expect(p.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(p.license).toBe('MIT');
    expect(typeof p.author).toBe('string');
    expect((p.author as string).length).toBeGreaterThan(0);
    expect(p.repository).toBeTruthy();
    expect(p.homepage).toBeTruthy();
    expect(p.bugs).toBeTruthy();
    expect(Array.isArray(p.files)).toBe(true);
    expect((p.files as string[])).toContain('dist');
    expect((p.files as string[])).toContain('README.md');
    expect((p.files as string[])).toContain('LICENSE');
  });

  it('claudeCode.extension is well-formed', async () => {
    const pkg = await import('../../project/package.json', { assert: { type: 'json' } });
    const p = pkg.default as Record<string, unknown>;
    const ext = (p.claudeCode as Record<string, unknown>).extension as Record<string, unknown>;

    expect(typeof ext.name).toBe('string');
    expect(typeof ext.description).toBe('string');
    expect(ext.mcpServers).toBeTruthy();
    expect(Array.isArray(ext.slashCommands)).toBe(true);

    // MCP server paths must not reference old claudenovel_plugin path
    const servers = ext.mcpServers as Record<string, unknown>;
    for (const [serverName, config] of Object.entries(servers)) {
      const args = (config as { args?: string[] }).args ?? [];
      for (const arg of args) {
        expect(arg, `${serverName} arg should not reference old claudenovel_plugin path`).not.toContain('claudenovel_plugin');
      }
    }
  });

  it('dist/index.js exists after build', async () => {
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    const distIndex = join(__dirname, '../../project/dist/index.js');
    expect(existsSync(distIndex), `dist/index.js should exist — run npm run build first`).toBe(true);
  });

  it('mcp-server/launch.js is executable', async () => {
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    const launchJs = join(__dirname, '../../project/mcp-server/launch.js');
    expect(existsSync(launchJs), 'mcp-server/launch.js must exist').toBe(true);
  });

  it('LICENSE file exists', async () => {
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    expect(existsSync(join(__dirname, '../../project/LICENSE'))).toBe(true);
  });

  it('CHANGELOG.md exists', async () => {
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    expect(existsSync(join(__dirname, '../../project/CHANGELOG.md'))).toBe(true);
  });

  it('README.md exists', async () => {
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    expect(existsSync(join(__dirname, '../../project/README.md'))).toBe(true);
  });

  it('QUICKSTART.md exists', async () => {
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    expect(existsSync(join(__dirname, '../../project/QUICKSTART.md'))).toBe(true);
  });
});
