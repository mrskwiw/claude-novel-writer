/**
 * Coverage tests for session-handler.ts.
 *
 * Drives the real handler against an on-disk `.novel/data.db`: the project is
 * seeded with TestNovelWriterExtension, whose connection is then closed so the
 * handler's own NovelWriterExtension reads the persisted data. Covers the
 * start / end / stats / progress success paths (now that the handler resolves
 * the project id), validation errors, the not-initialized guard, and helpers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleSessionCommand } from '../../project/src/cli/handlers/session-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';

let outputLog: string[] = [];
const mockOutput: OutputFormatter = {
  success: (m: string) => outputLog.push(`SUCCESS: ${m}`),
  error: (m: string) => outputLog.push(`ERROR: ${m}`),
  warning: (m: string) => outputLog.push(`WARNING: ${m}`),
  info: (m: string) => outputLog.push(`INFO: ${m}`),
  dim: (m: string) => outputLog.push(`DIM: ${m}`),
  table: () => outputLog.push('TABLE'),
  list: () => outputLog.push('LIST'),
  section: () => outputLog.push('SECTION'),
  spinner: () => ({ stop: () => {} }),
  newline: () => outputLog.push(''),
  heading: () => outputLog.push('HEADING'),
  keyValue: () => outputLog.push('KEYVALUE'),
  code: () => outputLog.push('CODE'),
};

function args(command: string, subcommand: string | undefined, flags: Record<string, unknown> = {}): ParsedArgs {
  return { command, subcommand, positional: [], arguments: {}, flags, raw: '' } as ParsedArgs;
}

async function cleanupDir(dir: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

describe('session-handler', () => {
  let dir: string;

  beforeEach(async () => {
    outputLog = [];
    dir = await mkdtemp(join(tmpdir(), 'session-h-'));
    // Seed a real project DB, then close the seeding connection so the handler's
    // own extension reads the persisted project row.
    const seed = new TestNovelWriterExtension(dir);
    await seed.initialize({ title: 'Session Test', author: 'T', genre: 'fantasy', targetWordCount: 80000 });
    seed.cleanup();
  });

  afterEach(async () => {
    await cleanupDir(dir);
  });

  // ── not-initialized guard ──────────────────────────────────────────────────
  describe('project not initialized', () => {
    it('errors for each subcommand when there is no data.db', async () => {
      const empty = await mkdtemp(join(tmpdir(), 'session-empty-'));
      try {
        for (const sub of ['start', 'end', 'stats']) {
          outputLog = [];
          await handleSessionCommand(args('session', sub), empty, mockOutput);
          expect(outputLog.some((l) => l.includes('Project not initialized'))).toBe(true);
        }
        outputLog = [];
        await handleSessionCommand(args('progress', undefined), empty, mockOutput);
        expect(outputLog.some((l) => l.includes('Project not initialized'))).toBe(true);
      } finally {
        await cleanupDir(empty);
      }
    });
  });

  // ── start ──────────────────────────────────────────────────────────────────
  describe('session start', () => {
    it('starts a session and reports success', async () => {
      await handleSessionCommand(args('session', 'start', { type: 'drafting', mood: 4, notes: 'fresh' }), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Writing session started'))).toBe(true);
    });

    it('rejects an invalid session type', async () => {
      await handleSessionCommand(args('session', 'start', { type: 'bogus' }), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Invalid session type'))).toBe(true);
    });

    it('rejects an out-of-range mood', async () => {
      await handleSessionCommand(args('session', 'start', { mood: 9 }), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Mood must be between 1 and 5'))).toBe(true);
    });

    it('shows the ritual checklist and focus timer when requested', async () => {
      await handleSessionCommand(args('session', 'start', { ritual: true, timer: 25 }), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Pre-Writing Ritual'))).toBe(true);
      expect(outputLog.some((l) => l.includes('Focus timer'))).toBe(true);
    });

    it.each([5, 3, 2, 1])('renders the mood emoji for mood %i', async (mood) => {
      await handleSessionCommand(args('session', 'start', { mood }), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Mood before'))).toBe(true);
    });

    it('handles a chapter that is only frontmatter (no paragraph to show)', async () => {
      await mkdir(join(dir, 'chapters'), { recursive: true });
      await writeFile(join(dir, 'chapters', 'chapter-01.md'), '---\ntitle: Empty\n---\n', 'utf-8');
      await handleSessionCommand(args('session', 'start', {}), dir, mockOutput);
      // No "Last paragraph" block when the body is empty.
      expect(outputLog.some((l) => l.includes('Writing session started'))).toBe(true);
      expect(outputLog.some((l) => l.includes('Last paragraph written'))).toBe(false);
    });

    it('displays the last paragraph from the most recent chapter', async () => {
      await mkdir(join(dir, 'chapters'), { recursive: true });
      await writeFile(
        join(dir, 'chapters', 'chapter-01.md'),
        '---\ntitle: One\n---\n\nFirst paragraph.\n\nThe very last paragraph that should surface.\n',
        'utf-8'
      );
      await handleSessionCommand(args('session', 'start', {}), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Last paragraph written'))).toBe(true);
    });
  });

  // ── end ─────────────────────────────────────────────────────────────────────
  describe('session end', () => {
    it('ends an active session and prints metrics + streak', async () => {
      await handleSessionCommand(args('session', 'start', { type: 'drafting' }), dir, mockOutput);
      outputLog = [];
      await handleSessionCommand(args('session', 'end', { mood: 5 }), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Session ended'))).toBe(true);
      expect(outputLog.some((l) => l.includes('Session Summary'))).toBe(true);
    });

    it('persists a stop note when --note is given', async () => {
      await handleSessionCommand(args('session', 'start', {}), dir, mockOutput);
      outputLog = [];
      await handleSessionCommand(args('session', 'end', { note: 'pick up at the chase' }), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Stop note saved'))).toBe(true);
    });

    it('rejects an out-of-range mood on end', async () => {
      await handleSessionCommand(args('session', 'start', {}), dir, mockOutput);
      outputLog = [];
      await handleSessionCommand(args('session', 'end', { mood: 9 }), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Mood must be between 1 and 5'))).toBe(true);
    });

    it('ends cleanly when both before/after moods are given', async () => {
      await handleSessionCommand(args('session', 'start', { mood: 2 }), dir, mockOutput);
      outputLog = [];
      await handleSessionCommand(args('session', 'end', { mood: 5 }), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Session ended'))).toBe(true);
    });
  });

  // ── stats ────────────────────────────────────────────────────────────────────
  describe('session stats', () => {
    it('renders statistics (with and without prior sessions)', async () => {
      outputLog = [];
      await handleSessionCommand(args('session', 'stats'), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Session Statistics'))).toBe(true);

      // After a completed session, averages + activity render.
      await handleSessionCommand(args('session', 'start', {}), dir, mockOutput);
      await handleSessionCommand(args('session', 'end', {}), dir, mockOutput);
      outputLog = [];
      await handleSessionCommand(args('session', 'stats', { days: 30 }), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Overall'))).toBe(true);
    });
  });

  // ── progress ──────────────────────────────────────────────────────────────────
  describe('progress', () => {
    it('renders the progress dashboard via the `progress` command', async () => {
      await handleSessionCommand(args('progress', undefined, { milestones: true }), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Failed to show progress'))).toBe(false);
    });

    it('renders progress via the default session subcommand', async () => {
      await handleSessionCommand(args('session', undefined), dir, mockOutput);
      expect(outputLog.some((l) => l.includes('Failed to show progress'))).toBe(false);
    });
  });
});
