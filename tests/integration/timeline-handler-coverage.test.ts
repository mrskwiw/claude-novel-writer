/**
 * Coverage tests: src/cli/handlers/timeline-handler.ts
 *
 * NOTE ON A REAL BUG (documented, not fixed):
 *   handleTimelineCommand builds its own `new NovelWriterExtension(projectPath)`
 *   internally and never loads/sets the projectId, so EVERY subcommand throws
 *   "Project ID not set" (getTimelineBuilder()/getTimelineSync() call the
 *   private ensureProjectId()). See the "documents real projectId bug" test for
 *   the raw broken behavior. To exercise the otherwise-correct logic for
 *   coverage we spy on ensureProjectId so the internal extension resolves the
 *   seeded project id — i.e. we simulate the fix.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { NovelWriterExtension } from '../../project/src/index.js';
import { handleTimelineCommand } from '../../project/src/cli/handlers/timeline-handler.js';
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
  return { command: 'timeline', subcommand, positional: [subcommand], arguments: {}, flags, raw: '' };
}

describe('timeline-handler coverage', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let log: string[];
  let out: OutputFormatter;
  let projectId: number;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tl-h-'));
    ext = new TestNovelWriterExtension(dir);
    await ext.initialize({ title: 'T', author: 'A', genre: 'Fantasy', targetWordCount: 1000 });
    projectId = ext.getProjectId()!;
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    ext?.cleanup();
    await rmRetry(dir);
  });

  function patchProjectId() {
    vi.spyOn(NovelWriterExtension.prototype as any, 'ensureProjectId').mockImplementation(
      function (this: any) {
        if (this.projectId == null) this.projectId = projectId;
      }
    );
  }

  /** add an event directly through the seeded extension's real builder */
  async function addEvent(name: string, fields: Record<string, unknown> = {}) {
    return ext.getTimelineBuilder().createEvent({ eventName: name, ...fields } as any);
  }

  // ── regression: handler now resolves the projectId (no spy needed) ─────────
  it('add resolves the projectId (regression: was "Project ID not set")', async () => {
    await handleTimelineCommand(args('add', { name: 'Coronation' }), dir, out);
    // The handler now calls loadProjectId(), so add no longer throws.
    expect(log.some((l) => l.includes('Project ID not set'))).toBe(false);
  });

  // ── dispatcher ────────────────────────────────────────────────────────────
  it('unknown subcommand', async () => {
    await handleTimelineCommand(args('frobnicate'), dir, out);
    expect(log.some((l) => l.includes('Unknown timeline subcommand'))).toBe(true);
  });

  // ── add ───────────────────────────────────────────────────────────────────
  it('add requires --name', async () => {
    patchProjectId();
    await handleTimelineCommand(args('add', {}), dir, out);
    expect(log.some((l) => l.includes('Event name required'))).toBe(true);
  });

  it('add rejects invalid type', async () => {
    patchProjectId();
    await handleTimelineCommand(args('add', { name: 'X', type: 'bogus' }), dir, out);
    expect(log.some((l) => l.includes('Event type must be one of'))).toBe(true);
  });

  it('add creates an event with date and timestamp', async () => {
    patchProjectId();
    await handleTimelineCommand(
      args('add', { name: 'Coronation', type: 'plot', description: 'crown', date: 'Summer', timestamp: 100, importance: 8 }),
      dir,
      out
    );
    expect(log.some((l) => l.includes('Created timeline event: Coronation'))).toBe(true);
    expect(log.some((l) => l.includes('Timestamp: 100'))).toBe(true);
    expect(log.some((l) => l.includes('Story date: Summer'))).toBe(true);
  });

  it('add links to an existing event via --before', async () => {
    patchProjectId();
    await addEvent('Rebellion', { storyTimestamp: 500 });
    await handleTimelineCommand(args('add', { name: 'Coronation', timestamp: 100, before: 'Rebellion' }), dir, out);
    expect(log.some((l) => l.includes('Linked'))).toBe(true);
  });

  it('add warns when --before references a missing event', async () => {
    patchProjectId();
    await handleTimelineCommand(args('add', { name: 'Coronation', before: 'Ghost' }), dir, out);
    expect(log.some((l) => l.includes('not found, skipping dependency'))).toBe(true);
  });

  it('add reports failure on out-of-range importance', async () => {
    patchProjectId();
    await handleTimelineCommand(args('add', { name: 'X', importance: 99 }), dir, out);
    expect(log.some((l) => l.includes('Failed to add timeline event'))).toBe(true);
  });

  // ── list ──────────────────────────────────────────────────────────────────
  it('list shows empty message', async () => {
    patchProjectId();
    await handleTimelineCommand(args('list'), dir, out);
    expect(log.some((l) => l.includes('No timeline events found'))).toBe(true);
  });

  it('list renders events with verbose detail', async () => {
    patchProjectId();
    await addEvent('Coronation', {
      eventType: 'plot',
      description: 'crown',
      storyDate: 'Summer',
      storyTimestamp: 100,
      importance: 8,
      isBackstory: true,
    });
    await handleTimelineCommand(args('list', { verbose: true }), dir, out);
    expect(log.some((l) => l.includes('Timeline Events'))).toBe(true);
    expect(log.some((l) => l.includes('Coronation'))).toBe(true);
  });

  // ── show ──────────────────────────────────────────────────────────────────
  it('show requires --name', async () => {
    patchProjectId();
    await handleTimelineCommand(args('show'), dir, out);
    expect(log.some((l) => l.includes('Event name required'))).toBe(true);
  });

  it('show reports not found', async () => {
    patchProjectId();
    await handleTimelineCommand(args('show', { name: 'Ghost' }), dir, out);
    expect(log.some((l) => l.includes('not found'))).toBe(true);
  });

  it('show renders full event with dependencies', async () => {
    patchProjectId();
    const before = await addEvent('Coronation', {
      eventType: 'plot',
      description: 'crown',
      storyDate: 'Summer',
      storyTimestamp: 100,
      importance: 8,
      isBackstory: true,
    });
    const after = await addEvent('Rebellion', { storyTimestamp: 500 });
    await ext.getTimelineBuilder().createDependency({ eventBeforeId: before, eventAfterId: after });
    // Show the "after" event so it has a "before" dependency, and the "before"
    // event has an "after" dependency — covering both branches across calls.
    await handleTimelineCommand(args('show', { name: 'Coronation' }), dir, out);
    await handleTimelineCommand(args('show', { name: 'Rebellion' }), dir, out);
    expect(log.some((l) => l.includes('=== Coronation ==='))).toBe(true);
    expect(log.some((l) => l.includes('Must happen before'))).toBe(true);
    expect(log.some((l) => l.includes('Must happen after'))).toBe(true);
  });

  // ── update ────────────────────────────────────────────────────────────────
  it('update requires --name', async () => {
    patchProjectId();
    await handleTimelineCommand(args('update'), dir, out);
    expect(log.some((l) => l.includes('Event name required'))).toBe(true);
  });

  it('update reports not found', async () => {
    patchProjectId();
    await handleTimelineCommand(args('update', { name: 'Ghost' }), dir, out);
    expect(log.some((l) => l.includes('not found'))).toBe(true);
  });

  it('update warns when no fields provided', async () => {
    patchProjectId();
    await addEvent('Coronation', { storyTimestamp: 100 });
    await handleTimelineCommand(args('update', { name: 'Coronation' }), dir, out);
    expect(log.some((l) => l.includes('No updates specified'))).toBe(true);
  });

  it('update applies field changes', async () => {
    patchProjectId();
    await addEvent('Coronation', { storyTimestamp: 100 });
    await handleTimelineCommand(
      args('update', { name: 'Coronation', description: 'new', date: 'Fall', timestamp: 200, importance: 5 }),
      dir,
      out
    );
    expect(log.some((l) => l.includes('Updated event: Coronation'))).toBe(true);
  });

  // ── delete ────────────────────────────────────────────────────────────────
  it('delete requires --name', async () => {
    patchProjectId();
    await handleTimelineCommand(args('delete'), dir, out);
    expect(log.some((l) => l.includes('Event name required'))).toBe(true);
  });

  it('delete reports not found', async () => {
    patchProjectId();
    await handleTimelineCommand(args('delete', { name: 'Ghost' }), dir, out);
    expect(log.some((l) => l.includes('not found'))).toBe(true);
  });

  it('delete removes an event', async () => {
    patchProjectId();
    await addEvent('Coronation', { storyTimestamp: 100 });
    await handleTimelineCommand(args('delete', { name: 'Coronation' }), dir, out);
    expect(log.some((l) => l.includes('Deleted event: Coronation'))).toBe(true);
  });

  // ── link ──────────────────────────────────────────────────────────────────
  it('link requires --before and --after', async () => {
    patchProjectId();
    await handleTimelineCommand(args('link', { before: 'A' }), dir, out);
    expect(log.some((l) => l.includes('Both --before and --after required'))).toBe(true);
  });

  it('link reports missing before event', async () => {
    patchProjectId();
    await addEvent('After', { storyTimestamp: 200 });
    await handleTimelineCommand(args('link', { before: 'Ghost', after: 'After' }), dir, out);
    expect(log.some((l) => l.includes('Event "Ghost" not found'))).toBe(true);
  });

  it('link reports missing after event', async () => {
    patchProjectId();
    await addEvent('Before', { storyTimestamp: 100 });
    await handleTimelineCommand(args('link', { before: 'Before', after: 'Ghost' }), dir, out);
    expect(log.some((l) => l.includes('Event "Ghost" not found'))).toBe(true);
  });

  it('link creates a dependency', async () => {
    patchProjectId();
    await addEvent('Before', { storyTimestamp: 100 });
    await addEvent('After', { storyTimestamp: 200 });
    await handleTimelineCommand(
      args('link', { before: 'Before', after: 'After', type: 'causation', notes: 'because' }),
      dir,
      out
    );
    expect(log.some((l) => l.includes('Linked: "Before" → "After"'))).toBe(true);
  });

  it('link reports failure on invalid dependency type', async () => {
    patchProjectId();
    await addEvent('Before', { storyTimestamp: 100 });
    await addEvent('After', { storyTimestamp: 200 });
    await handleTimelineCommand(args('link', { before: 'Before', after: 'After', type: 'bogus' }), dir, out);
    expect(log.some((l) => l.includes('Failed to link events'))).toBe(true);
  });

  // ── check ─────────────────────────────────────────────────────────────────
  it('check reports no conflicts', async () => {
    patchProjectId();
    await handleTimelineCommand(args('check'), dir, out);
    expect(log.some((l) => l.includes('No timeline conflicts found'))).toBe(true);
  });

  it('check detects a reversed-timestamp conflict', async () => {
    patchProjectId();
    const before = await addEvent('Before', { storyTimestamp: 500 });
    const after = await addEvent('After', { storyTimestamp: 100 });
    await ext.getTimelineBuilder().createDependency({ eventBeforeId: before, eventAfterId: after });
    await handleTimelineCommand(args('check'), dir, out);
    expect(log.some((l) => l.includes('timeline conflict'))).toBe(true);
  });

  // ── sync ──────────────────────────────────────────────────────────────────
  it('sync syncs timeline files', async () => {
    patchProjectId();
    await mkdir(join(dir, 'timeline'), { recursive: true });
    await handleTimelineCommand(args('sync'), dir, out);
    expect(log.some((l) => l.includes('Synced'))).toBe(true);
  });

  // ── export ────────────────────────────────────────────────────────────────
  it('export writes timeline to default path', async () => {
    patchProjectId();
    await addEvent('Coronation', { storyTimestamp: 100 });
    await handleTimelineCommand(args('export'), dir, out);
    expect(log.some((l) => l.includes('Timeline exported successfully'))).toBe(true);
  });

  it('export honors --output flag', async () => {
    patchProjectId();
    await mkdir(join(dir, 'out'), { recursive: true });
    await addEvent('Coronation', { storyTimestamp: 100 });
    await handleTimelineCommand(args('export', { output: join(dir, 'out', 'tl.yaml') }), dir, out);
    expect(log.some((l) => l.includes('Timeline exported successfully'))).toBe(true);
  });
});
