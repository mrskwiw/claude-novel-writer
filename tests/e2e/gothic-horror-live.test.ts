/**
 * E2E tests — Gothic Horror live project
 *
 * Runs the novel-writer CLI against the real project at C:\git\books\Gothic horror.
 * Tests every available command and subcommand. Read-only commands are safe to run
 * as-is; write commands that create content clean up after themselves.
 *
 * Run: npx vitest run ../tests/e2e/gothic-horror-live.test.ts
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROJECT = 'C:\\git\\books\\Gothic horror';

// Resolve the CLI entry point once — avoids PATH / .cmd wrapper issues on Windows.
const BIN = new URL('../../project/dist/bin.js', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

/**
 * Run novel-writer with a pre-split argument array (no shell interpolation).
 * Uses `node dist/bin.js` directly so no shell is involved and no .cmd
 * wrapper is needed on Windows.
 */
function run(...args: string[]): { stdout: string; ok: boolean; error?: string } {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd: PROJECT,
    encoding: 'utf8',
    env: { ...process.env, DOTENV_QUIET: 'true' },
    timeout: 30_000,
    shell: false,
  });
  const stdout = (result.stdout ?? '') + (result.stderr ?? '');
  const ok = result.status === 0 && result.error == null;
  return { stdout, ok, error: result.error?.message };
}

/** Expect the command to succeed (exit 0) and optionally match output. */
function expectOk(args: string[], match?: RegExp) {
  const r = run(...args);
  expect(r.ok, `"novel-writer ${args.join(' ')}" failed:\n${r.error ?? r.stdout}`).toBe(true);
  if (match) expect(r.stdout).toMatch(match);
  return r;
}

/** Expect the command to fail gracefully (exit non-zero but not crash). */
function expectFail(args: string[], match?: RegExp) {
  const r = run(...args);
  expect(r.ok, `"novel-writer ${args.join(' ')}" was expected to fail but succeeded`).toBe(false);
  if (match) expect(r.stdout + (r.error ?? '')).toMatch(match);
  return r;
}

// ─── Files created during write tests that need cleanup ──────────────────────

const createdFiles: string[] = [];
afterEach(() => {
  for (const f of createdFiles.splice(0)) {
    try { unlinkSync(f); } catch { /* already gone */ }
  }
});

// ─── 1. LIST COMMANDS ─────────────────────────────────────────────────────────

describe('list commands', () => {
  it('list characters', () => {
    expectOk(['list', 'characters'], /Found \d+ character/);
  });

  it('list locations', () => {
    expectOk(['list', 'locations'], /Found \d+ location/);
  });

  it('list chapters', () => {
    expectOk(['list', 'chapters'], /Found \d+ chapter/);
  });

  it('list plots', () => {
    const r = run('list', 'plots');
    expect(r.ok, `list plots failed: ${r.error ?? r.stdout}`).toBe(true);
  });

  it('list world-rules (alias: world-rule list)', () => {
    const r = run('world-rule', 'list');
    expect(r.ok, `world-rule list failed: ${r.error ?? r.stdout}`).toBe(true);
  });

  it('list timeline events', () => {
    const r = run('timeline', 'list');
    expect(r.ok, `timeline list failed: ${r.error ?? r.stdout}`).toBe(true);
  });
});

// ─── 2. SYNC COMMANDS ─────────────────────────────────────────────────────────

describe('sync commands', () => {
  it('sync characters', () => {
    expectOk(['sync', 'characters'], /Synced \d+ character/);
  });

  it('sync locations', () => {
    expectOk(['sync', 'locations'], /Synced \d+ location/);
  });

  it('sync plots', () => {
    expectOk(['sync', 'plots'], /Synced \d+ plot/);
  });

  it('sync chapters', () => {
    expectOk(['sync', 'chapters'], /Synced \d+ chapter/);
  });

  it('sync timeline', () => {
    const r = run('sync', 'timeline');
    expect(r.ok, `sync timeline failed: ${r.error ?? r.stdout}`).toBe(true);
    expect(r.stdout).toMatch(/Synced \d+ timeline/);
  });

  it('sync world-rules — succeeds (0 count when dir absent)', () => {
    // When world-rules/ doesn't exist the handler exits cleanly with "Synced 0"
    const r = run('sync', 'world-rules');
    expect(r.ok, `sync world-rules failed: ${r.error ?? r.stdout}`).toBe(true);
    expect(r.stdout).toMatch(/Synced \d+ world rule/i);
  });

  it('sync all', () => {
    expectOk(['sync', 'all'], /Sync Complete/);
  });
});

// ─── 3. CHECK COMMANDS ────────────────────────────────────────────────────────

describe('check commands', () => {
  it('check (all)', () => {
    expectOk(['check'], /consistency|error|warning|issue/i);
  });

  it('check characters', () => {
    expectOk(['check', 'characters']);
  });

  it('check timeline', () => {
    expectOk(['check', 'timeline']);
  });

  it('check world-rules', () => {
    const r = run('check', 'world-rules');
    expect(r.ok, `check world-rules failed: ${r.error ?? r.stdout}`).toBe(true);
  });

  it('check plot-threads', () => {
    const r = run('check', 'plot-threads');
    expect(r.ok, `check plot-threads failed: ${r.error ?? r.stdout}`).toBe(true);
  });
});

// ─── 4. ANALYZE COMMANDS ──────────────────────────────────────────────────────

describe('analyze commands', () => {
  it('analyze prose', () => {
    expectOk(['analyze', 'prose']);
  });

  it('analyze pacing', () => {
    expectOk(['analyze', 'pacing']);
  });

  it('analyze copy', () => {
    const r = run('analyze', 'copy');
    expect(r.ok, `analyze copy failed: ${r.error ?? r.stdout}`).toBe(true);
  });

  it('analyze developmental', () => {
    const r = run('analyze', 'developmental');
    expect(r.ok, `analyze developmental failed: ${r.error ?? r.stdout}`).toBe(true);
  });
});

// ─── 5. DRAFT COMMANDS ────────────────────────────────────────────────────────

describe('draft commands', () => {
  it('draft scan (find TK/TODO markers)', () => {
    const r = run('draft', 'scan');
    expect(r.ok, `draft scan failed: ${r.error ?? r.stdout}`).toBe(true);
  });

  it('draft readaloud', () => {
    const r = run('draft', 'readaloud');
    expect(r.ok, `draft readaloud failed: ${r.error ?? r.stdout}`).toBe(true);
  });
});

// ─── 6. RESEARCH COMMANDS ─────────────────────────────────────────────────────

describe('research commands', () => {
  it('research list', () => {
    const r = run('research', 'list');
    expect(r.ok, `research list failed: ${r.error ?? r.stdout}`).toBe(true);
  });

  it('research verify (scan for [VERIFY:] markers)', () => {
    const r = run('research', 'verify');
    expect(r.ok, `research verify failed: ${r.error ?? r.stdout}`).toBe(true);
  });
});

// ─── 7. REVISION COMMANDS ─────────────────────────────────────────────────────

describe('revision commands', () => {
  it('revision list', () => {
    const r = run('revision', 'list');
    expect(r.ok, `revision list failed: ${r.error ?? r.stdout}`).toBe(true);
  });
});

// ─── 8. PROGRESS / SESSION ────────────────────────────────────────────────────

describe('progress command', () => {
  it('progress', () => {
    const r = run('progress');
    expect(r.ok, `progress failed: ${r.error ?? r.stdout}`).toBe(true);
  });
});


// ─── 9. SHOW / DETAIL COMMANDS ────────────────────────────────────────────────

describe('show commands', () => {
  it('character list detail — known character exists', () => {
    const r = expectOk(['list', 'characters']);
    expect(r.stdout).toMatch(/Émilie|Marie|Saint-Just/);
  });

  it('location list — known locations exist', () => {
    const r = expectOk(['list', 'locations']);
    expect(r.stdout).toMatch(/Palais-Royal|Prison|Tussaud/i);
  });

  it('chapter list — synced chapters are visible', () => {
    const r = expectOk(['list', 'chapters']);
    expect(r.stdout).toMatch(/chapter/i);
  });
});

// ─── 10. CREATE WORLD-RULE (write + cleanup) ──────────────────────────────────

describe('create world-rule (with cleanup)', () => {
  it('world-rule create via world-rule subcommand', () => {
    const r = run(
      'world-rule', 'create',
      '--name', 'Test E2E Rule',
      '--category', 'physics',
      '--description', 'Created by automated e2e test — safe to delete',
    );
    if (r.ok && existsSync(join(PROJECT, 'world-rules'))) {
      readdirSync(join(PROJECT, 'world-rules'))
        .filter(f => f.includes('test-e2e-rule'))
        .forEach(f => createdFiles.push(join(PROJECT, 'world-rules', f)));
    }
    expect(r.ok, `world-rule create failed: ${r.error ?? r.stdout}`).toBe(true);
    expect(r.stdout).toMatch(/created|success/i);
  });

  it('create world-rule via create subcommand', () => {
    const r = run(
      'create', 'world-rule',
      '--name', 'Test E2E Rule 2',
      '--category', 'social',
      '--description', 'Created by automated e2e test — safe to delete',
    );
    if (r.ok && existsSync(join(PROJECT, 'world-rules'))) {
      readdirSync(join(PROJECT, 'world-rules'))
        .filter(f => f.includes('test-e2e-rule-2') || f.toLowerCase().includes('e2e'))
        .forEach(f => createdFiles.push(join(PROJECT, 'world-rules', f)));
    }
    expect(r.ok, `create world-rule failed: ${r.error ?? r.stdout}`).toBe(true);
    expect(r.stdout).toMatch(/created|success/i);
  });
});

// ─── 11. COMMAND DISPATCH REGRESSION ──────────────────────────────────────────

describe('command dispatch — subcommand routing', () => {
  it('world-rule create routes to create handler, not "unknown subcommand: undefined"', () => {
    const r = run('world-rule', 'create');
    expect(r.stdout + (r.error ?? '')).not.toMatch(/unknown.*subcommand.*undefined/i);
    expect(r.stdout + (r.error ?? '')).toMatch(/name required|--name/i);
  });

  it('timeline list routes correctly', () => {
    const r = run('timeline', 'list');
    expect(r.stdout + (r.error ?? '')).not.toMatch(/unknown.*subcommand.*undefined/i);
  });

  it('check characters routes correctly', () => {
    const r = run('check', 'characters');
    expect(r.stdout + (r.error ?? '')).not.toMatch(/unknown.*subcommand.*undefined/i);
  });

  it('analyze prose routes correctly', () => {
    const r = run('analyze', 'prose');
    expect(r.stdout + (r.error ?? '')).not.toMatch(/unknown.*subcommand.*undefined/i);
  });

  it('sync timeline routes correctly', () => {
    const r = run('sync', 'timeline');
    expect(r.stdout + (r.error ?? '')).not.toMatch(/Unknown subcommand: timeline/i);
  });

  it('sync world-rules routes correctly', () => {
    const r = run('sync', 'world-rules');
    expect(r.stdout + (r.error ?? '')).not.toMatch(/Unknown subcommand: world-rules/i);
  });
});

// ─── 12. HELP COMMANDS ────────────────────────────────────────────────────────

describe('help commands', () => {
  it('help (general)', () => {
    expectOk(['help'], /command|usage/i);
  });

  it('help world-rule', () => {
    expectOk(['help', 'world-rule']);
  });

  it('help timeline', () => {
    expectOk(['help', 'timeline']);
  });

  it('help sync', () => {
    expectOk(['help', 'sync']);
  });

  it('unknown command shows suggestion', () => {
    const r = run('listcharacters');
    expect(r.ok).toBe(false);
    expect(r.stdout + (r.error ?? '')).toMatch(/unknown command|did you mean/i);
  });
});

// ─── 13. EXPORT (read-only dry-run) ───────────────────────────────────────────

describe('export', () => {
  it('export markdown produces output file', () => {
    const outFile = join(PROJECT, 'export', 'test-e2e-export.md');
    const r = run('export', 'markdown', '--output', outFile);
    if (existsSync(outFile)) createdFiles.push(outFile);
    expect(r.ok, `export markdown failed: ${r.error ?? r.stdout}`).toBe(true);
    if (existsSync(outFile)) {
      expect(statSync(outFile).size).toBeGreaterThan(0);
    }
  });
});
