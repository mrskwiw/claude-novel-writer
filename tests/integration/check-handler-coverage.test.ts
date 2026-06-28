/**
 * Coverage tests: src/cli/handlers/check-handler.ts
 *
 * Strategy
 * --------
 * handleCheckCommand builds its OWN extension internally via makeExtension()
 * (a fresh DirectSQLiteClient against <project>/.novel/data.db). It does not
 * accept an injected extension. So we:
 *   1. Stand up a real schema-backed DB via TestNovelWriterExtension.
 *   2. Seed contradictory / open-issue data through its mock client.
 *   3. close() the mock connection BEFORE invoking the handler so the
 *      handler's own DirectSQLiteClient (WAL) owns the file cleanly.
 *
 * REAL BUGS (documented, not fixed):
 *   BUG #1 — `check characters`, `check timeline`, `check plot-threads`:
 *     these read checker.getOpenIssues(), which returns RAW snake_case DB rows
 *     (issue_type, chapter_id …). The handler then filters on the camelCase
 *     `i.issueType` (e.g. === 'character_attribute'), which is always
 *     `undefined`. Result: the "issues found" branch is UNREACHABLE — these
 *     subcommands always report "No … issues found" even when matching open
 *     issues exist in consistency_issues. Demonstrated by the
 *     "characters: reports no issues despite a seeded ..." test below.
 *
 *   BUG #2 — `displayIssue` verbose details (Chapter/Scene/Character/Location
 *     ID lines) and the `[type]` badge read camelCase fields (issue.issueType,
 *     issue.chapterId …) but `check list` feeds it the same raw snake_case
 *     rows, so the badge prints "[undefined]" and the verbose ID lines never
 *     render for DB-sourced issues. (The checkAll/consistency path is fine —
 *     it constructs camelCase Partial<ConsistencyIssue> objects.)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleCheckCommand } from '../../project/src/cli/handlers/check-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';

function makeOutput() {
  const log: string[] = [];
  const out: OutputFormatter = {
    success: (m) => log.push(`SUCCESS: ${m}`),
    error: (m) => log.push(`ERROR: ${m}`),
    warning: (m) => log.push(`WARNING: ${m}`),
    info: (m) => log.push(`INFO: ${m}`),
    dim: (m) => log.push(`DIM: ${m}`),
    table: () => log.push('TABLE'),
    list: (items) => log.push(`LIST: ${items.join('|')}`),
    section: () => log.push('SECTION'),
    spinner: (m) => ({ stop: (msg?: string) => log.push(`SPINNER: ${msg ?? m}`) }),
    newline: () => log.push(''),
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: (d) => log.push(`KV: ${JSON.stringify(d)}`),
    code: (c) => log.push(`CODE: ${c}`),
  };
  return { log, out };
}

async function rmRetry(p: string) {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(p, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

function args(subcommand: string, flags: Record<string, string | number | boolean> = {}): ParsedArgs {
  return { command: 'check', subcommand, positional: [subcommand], arguments: {}, flags, raw: '' };
}

describe('check-handler coverage', () => {
  let dir: string;
  let ext: TestNovelWriterExtension | null;
  let mcp: any;
  let pid: number;
  let log: string[];
  let out: OutputFormatter;
  let closed = false;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'chk-h-'));
    ext = new TestNovelWriterExtension(dir);
    await ext.initialize({ title: 'T', author: 'A', genre: 'Fantasy', targetWordCount: 1000 });
    pid = ext.getProjectId()!;
    mcp = (ext as any).mcpClient;
    closed = false;
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    if (ext && !closed) {
      ext.cleanup();
    }
    ext = null;
    await rmRetry(dir);
  });

  /** Close the seeding (mock) connection so the handler's own client owns the DB. */
  function closeSeed() {
    ext!.cleanup();
    closed = true;
  }

  // ── consistency: no issues ──────────────────────────────────────────────────
  it('consistency: reports no issues on an empty project', async () => {
    closeSeed();
    await handleCheckCommand(args('consistency'), dir, out);
    expect(log.some((l) => l.includes('Running consistency checks'))).toBe(true);
    expect(log.some((l) => l.includes('No consistency issues found'))).toBe(true);
  });

  // ── consistency: errors + warnings + info, verbose ──────────────────────────
  it('consistency: detects errors, warnings and info (verbose) via checkAll', async () => {
    // chapters
    await mcp.writeQuery('INSERT INTO chapters (id, project_id, chapter_number, title) VALUES (?,?,?,?)', [1, pid, 1, 'One']);
    await mcp.writeQuery('INSERT INTO chapters (id, project_id, chapter_number, title) VALUES (?,?,?,?)', [2, pid, 2, 'Two']);
    // scene for sceneId verbose branch
    await mcp.writeQuery('INSERT INTO scenes (id, chapter_id, scene_number, title) VALUES (?,?,?,?)', [1, 1, 1, 'S1']);
    // character attribute contradiction (error: characterId + chapterId)
    await mcp.writeQuery('INSERT INTO characters (id, project_id, name) VALUES (?,?,?)', [1, pid, 'Alice']);
    await mcp.writeQuery(
      'INSERT INTO character_attributes (id, character_id, attribute_type, attribute_name, attribute_value, first_mentioned_chapter_id) VALUES (?,?,?,?,?,?)',
      [1, 1, 'physical', 'eye_color', 'blue', 1]
    );
    await mcp.writeQuery(
      'INSERT INTO character_attributes (id, character_id, attribute_type, attribute_name, attribute_value, first_mentioned_chapter_id) VALUES (?,?,?,?,?,?)',
      [2, 1, 'inferred', 'eye_color', 'brown', 2]
    );
    // timeline missing-timestamp warnings (2) with a dependency; one linked to a scene
    await mcp.writeQuery('INSERT INTO timeline_events (id, project_id, event_name, event_type, is_backstory, scene_id) VALUES (?,?,?,?,?,?)', [1, pid, 'EventA', 'plot', 0, 1]);
    await mcp.writeQuery('INSERT INTO timeline_events (id, project_id, event_name, event_type, is_backstory) VALUES (?,?,?,?,?)', [2, pid, 'EventB', 'plot', 0]);
    await mcp.writeQuery('INSERT INTO event_dependencies (event_before_id, event_after_id) VALUES (?,?)', [1, 2]);
    // timeline timestamp conflict (error)
    await mcp.writeQuery('INSERT INTO timeline_events (id, project_id, event_name, event_type, story_timestamp) VALUES (?,?,?,?,?)', [3, pid, 'Late', 'plot', 100]);
    await mcp.writeQuery('INSERT INTO timeline_events (id, project_id, event_name, event_type, story_timestamp) VALUES (?,?,?,?,?)', [4, pid, 'Early', 'plot', 50]);
    await mcp.writeQuery('INSERT INTO event_dependencies (event_before_id, event_after_id) VALUES (?,?)', [3, 4]);
    // high-priority unresolved plot thread (info)
    await mcp.writeQuery('INSERT INTO plot_threads (id, project_id, thread_name, status, priority) VALUES (?,?,?,?,?)', [1, pid, 'BigMystery', 'active', 5]);

    closeSeed();
    await handleCheckCommand(args('consistency', { verbose: true }), dir, out);

    expect(log.some((l) => l.includes('Critical Issues'))).toBe(true);
    expect(log.some((l) => l.includes('Warnings ('))).toBe(true);
    expect(log.some((l) => l.includes('Info ('))).toBe(true);
    expect(log.some((l) => l.includes('Total issues found'))).toBe(true);
    expect(log.some((l) => l.includes('Errors:'))).toBe(true);
    // verbose detail lines for the character-attribute error
    expect(log.some((l) => l.includes('Character ID:'))).toBe(true);
    expect(log.some((l) => l.includes('Chapter ID:'))).toBe(true);
    expect(log.some((l) => l.includes('Scene ID:'))).toBe(true);
  });

  // ── consistency: errors only, non-verbose ───────────────────────────────────
  it('consistency: errors-only path (non-verbose)', async () => {
    await mcp.writeQuery('INSERT INTO chapters (id, project_id, chapter_number, title) VALUES (?,?,?,?)', [1, pid, 1, 'One']);
    await mcp.writeQuery('INSERT INTO characters (id, project_id, name) VALUES (?,?,?)', [1, pid, 'Bob']);
    await mcp.writeQuery(
      'INSERT INTO character_attributes (id, character_id, attribute_type, attribute_name, attribute_value, first_mentioned_chapter_id) VALUES (?,?,?,?,?,?)',
      [1, 1, 'physical', 'height', 'tall', 1]
    );
    await mcp.writeQuery(
      'INSERT INTO character_attributes (id, character_id, attribute_type, attribute_name, attribute_value, first_mentioned_chapter_id) VALUES (?,?,?,?,?,?)',
      [2, 1, 'inferred', 'height', 'short', 1]
    );
    closeSeed();
    await handleCheckCommand(args('consistency', {}), dir, out);
    expect(log.some((l) => l.includes('Critical Issues'))).toBe(true);
    expect(log.some((l) => l.includes('Errors:'))).toBe(true);
  });

  // ── consistency: not initialized ────────────────────────────────────────────
  it('consistency: errors when project not initialized', async () => {
    closeSeed();
    const empty = await mkdtemp(join(tmpdir(), 'chk-empty-'));
    try {
      await handleCheckCommand(args('consistency'), empty, out);
      expect(log.some((l) => l.includes('Project not initialized'))).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  // ── per-subcommand "project not initialized" branches ───────────────────────
  describe('uninitialized project (no .novel/data.db)', () => {
    let empty: string;

    beforeEach(async () => {
      empty = await mkdtemp(join(tmpdir(), 'chk-uninit-'));
    });

    afterEach(async () => {
      await rmRetry(empty);
    });

    const subs: Array<[string, Record<string, string | number | boolean>]> = [
      ['characters', {}],
      ['timeline', {}],
      ['world-rules', {}],
      ['plot-threads', {}],
      ['list', {}],
      ['resolve', { id: 1 }],
      ['acknowledge', { id: 1 }],
      ['false-positive', { id: 1 }],
    ];

    for (const [sub, flags] of subs) {
      it(`${sub}: errors when project not initialized`, async () => {
        const o = makeOutput();
        await handleCheckCommand(args(sub, flags), empty, o.out);
        expect(o.log.some((l) => l.includes('Project not initialized'))).toBe(true);
      });
    }
  });

  // ── per-type checks: "no issues" branches ───────────────────────────────────
  it('characters: reports no issues on clean project', async () => {
    closeSeed();
    await handleCheckCommand(args('characters'), dir, out);
    expect(log.some((l) => l.includes('No character consistency issues found'))).toBe(true);
  });

  it('characters: finds a seeded character_attribute issue (CHECK-01 fixed)', async () => {
    // getOpenIssues() now maps snake_case rows → camelCase, so the issueType
    // filter matches and the open issue is reported.
    await mcp.writeQuery(
      "INSERT INTO consistency_issues (project_id, issue_type, severity, description, status) VALUES (?,?,?,?,?)",
      [pid, 'character_attribute', 'error', 'Alice eyes blue vs brown', 'open']
    );
    closeSeed();
    await handleCheckCommand(args('characters'), dir, out);
    expect(log.some((l) => l.includes('Found 1 character consistency issue'))).toBe(true);
    expect(log.some((l) => l.includes('Alice eyes blue vs brown'))).toBe(true);
  });

  it('timeline: reports no issues on clean project', async () => {
    closeSeed();
    await handleCheckCommand(args('timeline'), dir, out);
    expect(log.some((l) => l.includes('No timeline consistency issues found'))).toBe(true);
  });

  it('timeline: finds a seeded timeline issue (CHECK-01 fixed)', async () => {
    await mcp.writeQuery(
      "INSERT INTO consistency_issues (project_id, issue_type, severity, description, status) VALUES (?,?,?,?,?)",
      [pid, 'timeline', 'warning', 'Event B precedes its cause', 'open']
    );
    closeSeed();
    await handleCheckCommand(args('timeline'), dir, out);
    expect(log.some((l) => l.includes('Found 1 timeline consistency issue'))).toBe(true);
  });

  it('world-rules: reports no violations when there are no hard rules', async () => {
    closeSeed();
    await handleCheckCommand(args('world-rules'), dir, out);
    expect(log.some((l) => l.includes('Scanning chapters'))).toBe(true);
    expect(log.some((l) => l.includes('No world rule violations found'))).toBe(true);
  });

  it('plot-threads: reports no issues on clean project', async () => {
    closeSeed();
    await handleCheckCommand(args('plot-threads'), dir, out);
    expect(log.some((l) => l.includes('No unresolved plot thread issues found'))).toBe(true);
  });

  it('plot-threads: finds a seeded continuity issue (CHECK-01 fixed)', async () => {
    await mcp.writeQuery(
      "INSERT INTO consistency_issues (project_id, issue_type, severity, description, status) VALUES (?,?,?,?,?)",
      [pid, 'continuity', 'warning', 'Thread "the letter" never pays off', 'open']
    );
    closeSeed();
    await handleCheckCommand(args('plot-threads'), dir, out);
    expect(log.some((l) => l.includes('Found 1 plot thread issue'))).toBe(true);
  });

  // ── list ────────────────────────────────────────────────────────────────────
  it('list: reports no open issues when empty', async () => {
    closeSeed();
    await handleCheckCommand(args('list'), dir, out);
    expect(log.some((l) => l.includes('No open issues found'))).toBe(true);
  });

  it('list: reports no issues for a severity filter when empty', async () => {
    closeSeed();
    await handleCheckCommand(args('list', { severity: 'error' }), dir, out);
    expect(log.some((l) => l.includes('No error issues found'))).toBe(true);
  });

  it('list: renders seeded open issues (verbose) with total + hints', async () => {
    await mcp.writeQuery('INSERT INTO chapters (id, project_id, chapter_number, title) VALUES (?,?,?,?)', [1, pid, 1, 'One']);
    await mcp.writeQuery(
      'INSERT INTO consistency_issues (id, project_id, issue_type, severity, description, chapter_id, scene_id, character_id, status) VALUES (?,?,?,?,?,?,?,?,?)',
      [10, pid, 'character_attribute', 'error', 'an error issue', 1, null, null, 'open']
    );
    await mcp.writeQuery(
      'INSERT INTO consistency_issues (id, project_id, issue_type, severity, description, status) VALUES (?,?,?,?,?,?)',
      [11, pid, 'timeline', 'warning', 'a warning issue', 'open']
    );
    await mcp.writeQuery(
      'INSERT INTO consistency_issues (id, project_id, issue_type, severity, description, status) VALUES (?,?,?,?,?,?)',
      [12, pid, 'continuity', 'info', 'an info issue', 'open']
    );
    closeSeed();
    await handleCheckCommand(args('list', { verbose: true }), dir, out);
    expect(log.some((l) => l.includes('Open Consistency Issues'))).toBe(true);
    expect(log.some((l) => l.includes('Total: 3 issue'))).toBe(true);
    expect(log.some((l) => l.includes('mark as resolved'))).toBe(true);
  });

  it('list: renders with severity filter header', async () => {
    await mcp.writeQuery(
      'INSERT INTO consistency_issues (id, project_id, issue_type, severity, description, status) VALUES (?,?,?,?,?,?)',
      [20, pid, 'character_attribute', 'error', 'just one error', 'open']
    );
    closeSeed();
    await handleCheckCommand(args('list', { severity: 'error' }), dir, out);
    expect(log.some((l) => l.includes('Open Consistency Issues (error)'))).toBe(true);
    expect(log.some((l) => l.includes('Total: 1 issue'))).toBe(true);
  });

  // ── resolve / acknowledge / false-positive ──────────────────────────────────
  it('resolve: requires --id', async () => {
    closeSeed();
    await handleCheckCommand(args('resolve', {}), dir, out);
    expect(log.some((l) => l.includes('Issue ID required'))).toBe(true);
  });

  it('resolve: marks an issue resolved with notes', async () => {
    await mcp.writeQuery(
      'INSERT INTO consistency_issues (id, project_id, issue_type, severity, description, status) VALUES (?,?,?,?,?,?)',
      [30, pid, 'character_attribute', 'error', 'resolve me', 'open']
    );
    closeSeed();
    await handleCheckCommand(args('resolve', { id: 30, notes: 'fixed it' }), dir, out);
    expect(log.some((l) => l.includes('Issue #30 marked as resolved'))).toBe(true);
    expect(log.some((l) => l.includes('Notes: fixed it'))).toBe(true);
  });

  it('resolve: marks an issue resolved without notes', async () => {
    await mcp.writeQuery(
      'INSERT INTO consistency_issues (id, project_id, issue_type, severity, description, status) VALUES (?,?,?,?,?,?)',
      [31, pid, 'character_attribute', 'error', 'resolve me 2', 'open']
    );
    closeSeed();
    await handleCheckCommand(args('resolve', { id: 31 }), dir, out);
    expect(log.some((l) => l.includes('Issue #31 marked as resolved'))).toBe(true);
    expect(log.some((l) => l.includes('Notes:'))).toBe(false);
  });

  it('acknowledge: requires --id', async () => {
    closeSeed();
    await handleCheckCommand(args('acknowledge', {}), dir, out);
    expect(log.some((l) => l.includes('Issue ID required'))).toBe(true);
  });

  it('acknowledge: marks an issue acknowledged with notes', async () => {
    await mcp.writeQuery(
      'INSERT INTO consistency_issues (id, project_id, issue_type, severity, description, status) VALUES (?,?,?,?,?,?)',
      [40, pid, 'timeline', 'warning', 'ack me', 'open']
    );
    closeSeed();
    await handleCheckCommand(args('acknowledge', { id: 40, notes: 'intentional' }), dir, out);
    expect(log.some((l) => l.includes('Issue #40 acknowledged'))).toBe(true);
    expect(log.some((l) => l.includes('Notes: intentional'))).toBe(true);
  });

  it('false-positive: requires --id', async () => {
    closeSeed();
    await handleCheckCommand(args('false-positive', {}), dir, out);
    expect(log.some((l) => l.includes('Issue ID required'))).toBe(true);
  });

  it('false-positive: marks an issue as false positive with notes', async () => {
    await mcp.writeQuery(
      'INSERT INTO consistency_issues (id, project_id, issue_type, severity, description, status) VALUES (?,?,?,?,?,?)',
      [50, pid, 'continuity', 'info', 'fp me', 'open']
    );
    closeSeed();
    await handleCheckCommand(args('false-positive', { id: 50, notes: 'not real' }), dir, out);
    expect(log.some((l) => l.includes('Issue #50 marked as false positive'))).toBe(true);
    expect(log.some((l) => l.includes('Notes: not real'))).toBe(true);
  });

  // ── dispatcher ──────────────────────────────────────────────────────────────
  it('dispatcher: unknown subcommand', async () => {
    closeSeed();
    await handleCheckCommand(args('frobnicate'), dir, out);
    expect(log.some((l) => l.includes('Unknown check subcommand'))).toBe(true);
    expect(log.some((l) => l.includes('Available:'))).toBe(true);
  });

  it('dispatcher: defaults to consistency with no subcommand/positional', async () => {
    closeSeed();
    await handleCheckCommand(
      { command: 'check', subcommand: undefined, positional: [], arguments: {}, flags: {}, raw: '' },
      dir,
      out
    );
    expect(log.some((l) => l.includes('Running consistency checks'))).toBe(true);
  });

  // ── catch branches: corrupt DB makes makeExtension throw ─────────────────────
  describe('catch branches (corrupt database)', () => {
    let badDir: string;

    beforeEach(async () => {
      badDir = await mkdtemp(join(tmpdir(), 'chk-bad-'));
      await mkdir(join(badDir, '.novel'), { recursive: true });
      await writeFile(join(badDir, '.novel', 'data.db'), 'this is not a sqlite database', 'utf-8');
    });

    afterEach(async () => {
      await rmRetry(badDir);
    });

    const cases: Array<[string, Record<string, string | number | boolean>, string]> = [
      ['consistency', {}, 'Failed to run consistency check'],
      ['characters', {}, 'Failed to check characters'],
      ['timeline', {}, 'Failed to check timeline'],
      ['world-rules', {}, 'Failed to check world rules'],
      ['plot-threads', {}, 'Failed to check plot threads'],
      ['list', {}, 'Failed to list issues'],
      ['resolve', { id: 1 }, 'Failed to resolve issue'],
      ['acknowledge', { id: 1 }, 'Failed to acknowledge issue'],
      ['false-positive', { id: 1 }, 'Failed to mark false positive'],
    ];

    for (const [sub, flags, expected] of cases) {
      it(`${sub}: surfaces failure when DB is corrupt`, async () => {
        const o = makeOutput();
        await handleCheckCommand(args(sub, flags), badDir, o.out);
        expect(o.log.some((l) => l.includes(expected))).toBe(true);
      });
    }
  });
});
