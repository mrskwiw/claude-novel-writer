/**
 * Coverage tests for list-handler.ts
 *
 * Exercises handleListCharacters, handleListLocations, handleListChapters,
 * handleListPlots, and handleListIssues across: missing-extension guard,
 * empty-list path, table/list/detailed formats, filters, and the error/catch
 * path (readQuery throws).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import type {
  ParsedArgs,
  CommandContext,
  OutputFormatter,
} from '../../project/src/cli/types.js';
import {
  handleListCharacters,
  handleListLocations,
  handleListChapters,
  handleListPlots,
  handleListIssues,
} from '../../project/src/cli/handlers/list-handler.js';

// ── shared helpers ─────────────────────────────────────────────────────────

function createMockOutput() {
  const log: string[] = [];
  const output: OutputFormatter = {
    success: (m) => log.push(`SUCCESS: ${m}`),
    error: (m) => log.push(`ERROR: ${m}`),
    warning: (m) => log.push(`WARNING: ${m}`),
    info: (m) => log.push(`INFO: ${m}`),
    dim: (m) => log.push(`DIM: ${m}`),
    table: (data, cols) => log.push(`TABLE: ${JSON.stringify({ rows: data.length, cols })}`),
    list: () => log.push('LIST'),
    section: () => log.push('SECTION'),
    spinner: () => ({ stop: (m?: string) => log.push(`SPINNER_STOP: ${m ?? ''}`) }),
    newline: () => log.push(''),
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: () => log.push('KEYVALUE'),
    code: (c) => log.push(`CODE: ${c}`),
  };
  return { log, output };
}

async function retryRm(dir: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

function makeArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    command: 'list',
    positional: [],
    arguments: {},
    flags: {},
    raw: '',
    ...overrides,
  };
}

const found = (log: string[], needle: string) => log.find((l) => l.includes(needle));

describe('list-handler coverage', () => {
  let dir: string;
  let extension: TestNovelWriterExtension;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'list-cov-'));
    extension = new TestNovelWriterExtension(dir);
    await extension.initialize({
      title: 'List Novel',
      author: 'Author',
      genre: 'Fantasy',
      targetWordCount: 80000,
    });
  });

  afterEach(async () => {
    extension.cleanup();
    await retryRm(dir);
  });

  function ctx(output: OutputFormatter, opts: { withExtension?: boolean; projectId?: number } = {}): CommandContext {
    return {
      cwd: dir,
      projectId: opts.projectId ?? 1,
      extension: opts.withExtension === false ? undefined : (extension as any),
      output,
    };
  }

  const client = () => (extension as any).mcpClient;

  async function seedCharacters() {
    await client().writeQuery(
      `INSERT INTO characters (project_id, name, full_name, role, summary) VALUES (?,?,?,?,?)`,
      [1, 'Alice', 'Alice Walker', 'protagonist', 'Detective']
    );
    await client().writeQuery(
      `INSERT INTO characters (project_id, name, full_name, role, summary) VALUES (?,?,?,?,?)`,
      [1, 'Bob', null, 'minor', null]
    );
  }

  // ── handleListCharacters ────────────────────────────────────────────────

  it('characters: missing-extension guard', async () => {
    const { log, output } = createMockOutput();
    await handleListCharacters(makeArgs(), ctx(output, { withExtension: false }));
    expect(found(log, 'Extension not initialized properly.')).toBeDefined();
  });

  it('characters: empty list shows create hint', async () => {
    const { log, output } = createMockOutput();
    await handleListCharacters(makeArgs(), ctx(output));
    expect(found(log, 'No characters found.')).toBeDefined();
    expect(found(log, 'CODE:')).toBeDefined();
  });

  it('characters: table format (default) + role filter', async () => {
    await seedCharacters();
    const { log, output } = createMockOutput();
    await handleListCharacters(makeArgs({ flags: { role: 'protagonist' } }), ctx(output));
    expect(found(log, 'character(s)')).toBeDefined();
    expect(found(log, 'TABLE:')).toBeDefined();
  });

  it('characters: list format', async () => {
    await seedCharacters();
    const { log, output } = createMockOutput();
    await handleListCharacters(makeArgs({ flags: { format: 'list' } }), ctx(output));
    expect(found(log, 'Alice (protagonist)')).toBeDefined();
  });

  it('characters: detailed format', async () => {
    await seedCharacters();
    const { log, output } = createMockOutput();
    await handleListCharacters(makeArgs({ flags: { format: 'detailed' } }), ctx(output));
    expect(found(log, 'HEADING: Alice')).toBeDefined();
    expect(found(log, 'KEYVALUE')).toBeDefined();
  });

  it('characters: error/catch path', async () => {
    const { log, output } = createMockOutput();
    const broken = { mcpClient: { readQuery: async () => { throw new Error('boom'); } } };
    await handleListCharacters(makeArgs(), { cwd: dir, projectId: 1, extension: broken as any, output });
    expect(found(log, 'Failed to list characters: boom')).toBeDefined();
    expect(found(log, 'SPINNER_STOP: Failed')).toBeDefined();
  });

  // ── handleListLocations ─────────────────────────────────────────────────

  async function seedLocations() {
    await client().writeQuery(
      `INSERT INTO locations (project_id, name, location_type, description) VALUES (?,?,?,?)`,
      [1, 'Station', 'building', 'Police HQ']
    );
    await client().writeQuery(
      `INSERT INTO locations (project_id, name, location_type, description) VALUES (?,?,?,?)`,
      [1, 'Nowhere', null, null]
    );
  }

  it('locations: missing-extension guard', async () => {
    const { log, output } = createMockOutput();
    await handleListLocations(makeArgs(), ctx(output, { withExtension: false }));
    expect(found(log, 'Extension not initialized properly.')).toBeDefined();
  });

  it('locations: empty', async () => {
    const { log, output } = createMockOutput();
    await handleListLocations(makeArgs(), ctx(output));
    expect(found(log, 'No locations found.')).toBeDefined();
  });

  it('locations: table + type filter', async () => {
    await seedLocations();
    const { log, output } = createMockOutput();
    await handleListLocations(makeArgs({ flags: { type: 'building' } }), ctx(output));
    expect(found(log, 'location(s)')).toBeDefined();
    expect(found(log, 'TABLE:')).toBeDefined();
  });

  it('locations: list format (with and without type)', async () => {
    await seedLocations();
    const { log, output } = createMockOutput();
    await handleListLocations(makeArgs({ flags: { format: 'list' } }), ctx(output));
    expect(found(log, 'Station (building)')).toBeDefined();
    expect(found(log, 'Nowhere')).toBeDefined();
  });

  it('locations: detailed format', async () => {
    await seedLocations();
    const { log, output } = createMockOutput();
    await handleListLocations(makeArgs({ flags: { format: 'detailed' } }), ctx(output));
    expect(found(log, 'HEADING: Station')).toBeDefined();
  });

  it('locations: catch path', async () => {
    const { log, output } = createMockOutput();
    const broken = { mcpClient: { readQuery: async () => { throw new Error('locerr'); } } };
    await handleListLocations(makeArgs(), { cwd: dir, projectId: 1, extension: broken as any, output });
    expect(found(log, 'Failed to list locations: locerr')).toBeDefined();
  });

  // ── handleListChapters ──────────────────────────────────────────────────

  async function seedChapters() {
    await client().writeQuery(
      `INSERT INTO characters (project_id, name, role) VALUES (?,?,?)`,
      [1, 'Alice', 'protagonist']
    );
    await client().writeQuery(
      `INSERT INTO chapters (project_id, chapter_number, title, word_count, status, pov_character_id) VALUES (?,?,?,?,?,?)`,
      [1, 1, 'The Beginning', 1200, 'drafted', 1]
    );
    await client().writeQuery(
      `INSERT INTO chapters (project_id, chapter_number, title) VALUES (?,?,?)`,
      [1, 2, 'The Middle']
    );
  }

  it('chapters: missing-extension guard', async () => {
    const { log, output } = createMockOutput();
    await handleListChapters(makeArgs(), ctx(output, { withExtension: false }));
    expect(found(log, 'Extension not initialized properly.')).toBeDefined();
  });

  it('chapters: empty', async () => {
    const { log, output } = createMockOutput();
    await handleListChapters(makeArgs(), ctx(output));
    expect(found(log, 'No chapters found.')).toBeDefined();
  });

  it('chapters: table + pov filter', async () => {
    await seedChapters();
    const { log, output } = createMockOutput();
    await handleListChapters(makeArgs({ flags: { pov: 'Alice' } }), ctx(output));
    expect(found(log, 'chapter(s)')).toBeDefined();
    expect(found(log, 'TABLE:')).toBeDefined();
  });

  it('chapters: list format', async () => {
    await seedChapters();
    const { log, output } = createMockOutput();
    await handleListChapters(makeArgs({ flags: { format: 'list' } }), ctx(output));
    expect(found(log, 'Chapter 1: The Beginning')).toBeDefined();
  });

  it('chapters: detailed format', async () => {
    await seedChapters();
    const { log, output } = createMockOutput();
    await handleListChapters(makeArgs({ flags: { format: 'detailed' } }), ctx(output));
    expect(found(log, 'Chapter 1: The Beginning')).toBeDefined();
    expect(found(log, 'KEYVALUE')).toBeDefined();
  });

  it('chapters: catch path', async () => {
    const { log, output } = createMockOutput();
    const broken = { mcpClient: { readQuery: async () => { throw new Error('cherr'); } } };
    await handleListChapters(makeArgs(), { cwd: dir, projectId: 1, extension: broken as any, output });
    expect(found(log, 'Failed to list chapters: cherr')).toBeDefined();
  });

  // ── handleListPlots ─────────────────────────────────────────────────────

  async function seedPlots() {
    await client().writeQuery(
      `INSERT INTO plot_threads (project_id, thread_name, thread_type, description, status, priority) VALUES (?,?,?,?,?,?)`,
      [1, 'Main Quest', 'main', 'Save the world', 'active', 9]
    );
    await client().writeQuery(
      `INSERT INTO plot_threads (project_id, thread_name, thread_type, description, status, priority) VALUES (?,?,?,?,?,?)`,
      [1, 'Romance', 'subplot', null, 'planned', 4]
    );
  }

  it('plots: missing-extension guard', async () => {
    const { log, output } = createMockOutput();
    await handleListPlots(makeArgs(), ctx(output, { withExtension: false }));
    expect(found(log, 'Extension not initialized properly.')).toBeDefined();
  });

  it('plots: empty', async () => {
    const { log, output } = createMockOutput();
    await handleListPlots(makeArgs(), ctx(output));
    expect(found(log, 'No plot threads found.')).toBeDefined();
  });

  it('plots: table + type + status filters', async () => {
    await seedPlots();
    const { log, output } = createMockOutput();
    await handleListPlots(makeArgs({ flags: { type: 'main', status: 'active' } }), ctx(output));
    expect(found(log, 'plot thread(s)')).toBeDefined();
    expect(found(log, 'TABLE:')).toBeDefined();
  });

  it('plots: list format', async () => {
    await seedPlots();
    const { log, output } = createMockOutput();
    await handleListPlots(makeArgs({ flags: { format: 'list' } }), ctx(output));
    expect(found(log, 'Main Quest (main, active)')).toBeDefined();
  });

  it('plots: detailed format', async () => {
    await seedPlots();
    const { log, output } = createMockOutput();
    await handleListPlots(makeArgs({ flags: { format: 'detailed' } }), ctx(output));
    expect(found(log, 'HEADING: Main Quest')).toBeDefined();
  });

  it('plots: catch path', async () => {
    const { log, output } = createMockOutput();
    const broken = { mcpClient: { readQuery: async () => { throw new Error('plerr'); } } };
    await handleListPlots(makeArgs(), { cwd: dir, projectId: 1, extension: broken as any, output });
    expect(found(log, 'Failed to list plot threads: plerr')).toBeDefined();
  });

  // ── handleListIssues ────────────────────────────────────────────────────

  async function seedIssues() {
    const rows: Array<[string, string, string]> = [
      ['character_attribute', 'error', 'Eye color mismatch'],
      ['timeline', 'warning', 'Out of order event'],
      ['continuity', 'info', 'Minor note'],
    ];
    for (const [type, sev, desc] of rows) {
      await client().writeQuery(
        `INSERT INTO consistency_issues (project_id, issue_type, severity, description, status) VALUES (?,?,?,?,?)`,
        [1, type, sev, desc, 'open']
      );
    }
  }

  it('issues: missing-extension guard', async () => {
    const { log, output } = createMockOutput();
    await handleListIssues(makeArgs(), ctx(output, { withExtension: false }));
    expect(found(log, 'Extension not initialized properly.')).toBeDefined();
  });

  it('issues: none found (success)', async () => {
    const { log, output } = createMockOutput();
    await handleListIssues(makeArgs(), ctx(output));
    expect(found(log, 'No issues found! Your manuscript is consistent.')).toBeDefined();
  });

  it('issues: grouped by severity with filters', async () => {
    await seedIssues();
    const { log, output } = createMockOutput();
    await handleListIssues(makeArgs({ flags: { status: 'open' } }), ctx(output));
    expect(found(log, 'consistency issue(s)')).toBeDefined();
    expect(found(log, 'Errors (1)')).toBeDefined();
    expect(found(log, 'Warnings (1)')).toBeDefined();
    expect(found(log, 'Info (1)')).toBeDefined();
  });

  it('issues: severity + type filters applied', async () => {
    await seedIssues();
    const { log, output } = createMockOutput();
    await handleListIssues(
      makeArgs({ flags: { severity: 'error', type: 'character_attribute', status: 'open' } }),
      ctx(output)
    );
    expect(found(log, 'consistency issue(s)')).toBeDefined();
    expect(found(log, 'Errors (1)')).toBeDefined();
  });

  it('issues: catch path', async () => {
    const { log, output } = createMockOutput();
    const broken = { mcpClient: { readQuery: async () => { throw new Error('iserr'); } } };
    await handleListIssues(makeArgs(), { cwd: dir, projectId: 1, extension: broken as any, output });
    expect(found(log, 'Failed to list issues: iserr')).toBeDefined();
  });
});
