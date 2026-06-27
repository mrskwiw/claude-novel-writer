/**
 * SnapshotManager tests — uses real temp directories (no mocks).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, readdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SnapshotManager } from '../../../project/src/revision/snapshot-manager.js';
import type { SnapshotMeta } from '../../../project/src/revision/snapshot-manager.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Create an isolated temp directory for each test. */
function makeTmpDir(): string {
  return join(tmpdir(), `novel-snap-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

/** Write a minimal markdown chapter file with optional YAML frontmatter. */
async function writeChapter(
  dir: string,
  filename: string,
  body: string,
  frontmatter?: Record<string, string>
): Promise<void> {
  let content = '';
  if (frontmatter) {
    const fm = Object.entries(frontmatter)
      .map(([k, v]) => `${k}: "${v}"`)
      .join('\n');
    content = `---\n${fm}\n---\n${body}`;
  } else {
    content = body;
  }
  await writeFile(join(dir, filename), content, 'utf-8');
}

// ── test suite ───────────────────────────────────────────────────────────────

describe('SnapshotManager', () => {
  let projectDir: string;
  let chaptersDir: string;
  let manager: SnapshotManager;

  beforeEach(async () => {
    projectDir = makeTmpDir();
    chaptersDir = join(projectDir, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    manager = new SnapshotManager(projectDir);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  // ── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a revisions/ directory and a _snapshot.json file', async () => {
      await writeChapter(chaptersDir, 'chapter-01.md', 'Once upon a time.');
      const meta = await manager.create('first-draft');

      const revisionsDir = join(projectDir, 'revisions');
      expect(existsSync(revisionsDir)).toBe(true);

      // Find the snapshot dir
      const entries = await readdir(revisionsDir);
      expect(entries.length).toBe(1);

      const snapshotMetaPath = join(revisionsDir, entries[0], '_snapshot.json');
      expect(existsSync(snapshotMetaPath)).toBe(true);

      const stored = JSON.parse(await readFile(snapshotMetaPath, 'utf-8')) as SnapshotMeta;
      expect(stored.label).toBe('first-draft');
      expect(stored.chapterCount).toBe(1);
      expect(typeof stored.createdAt).toBe('string');
      expect(stored.totalWordCount).toBeGreaterThanOrEqual(0);
    });

    it('returns SnapshotMeta with correct shape', async () => {
      await writeChapter(chaptersDir, 'chapter-01.md', 'Hello world.');
      await writeChapter(chaptersDir, 'chapter-02.md', 'Goodbye world.');
      const meta = await manager.create('v1');

      expect(meta.label).toBe('v1');
      expect(meta.chapterCount).toBe(2);
      expect(typeof meta.totalWordCount).toBe('number');
      expect(typeof meta.chapterWordCounts).toBe('object');
      expect('chapter-01.md' in meta.chapterWordCounts).toBe(true);
      expect('chapter-02.md' in meta.chapterWordCounts).toBe(true);
    });

    it('copies chapter files into the snapshot chapters/ sub-directory', async () => {
      const body = 'The quick brown fox jumps over the lazy dog.';
      await writeChapter(chaptersDir, 'chapter-01.md', body);
      await manager.create('copy-check');

      const revisionsDir = join(projectDir, 'revisions');
      const entries = await readdir(revisionsDir);
      const snapshotChaptersDir = join(revisionsDir, entries[0], 'chapters');

      expect(existsSync(snapshotChaptersDir)).toBe(true);
      const files = await readdir(snapshotChaptersDir);
      expect(files).toContain('chapter-01.md');
    });

    it('works when chapters/ directory is empty', async () => {
      const meta = await manager.create('empty');
      expect(meta.chapterCount).toBe(0);
      expect(meta.totalWordCount).toBe(0);
    });

    it('sanitises special characters in the label for directory naming', async () => {
      await manager.create('hello world / special');
      const revisionsDir = join(projectDir, 'revisions');
      const entries = await readdir(revisionsDir);
      // Directory name should not contain spaces or slashes
      expect(entries[0]).not.toContain(' ');
      expect(entries[0]).not.toContain('/');
    });
  });

  // ── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns empty array when no snapshots exist', async () => {
      const result = await manager.list();
      expect(result).toEqual([]);
    });

    it('returns all snapshots sorted by createdAt DESC', async () => {
      await writeChapter(chaptersDir, 'chapter-01.md', 'draft one');
      await manager.create('alpha');

      // Ensure timestamps differ
      await new Promise(r => setTimeout(r, 10));

      await manager.create('beta');

      const list = await manager.list();
      expect(list.length).toBe(2);
      // beta is newer, should come first
      expect(list[0].label).toBe('beta');
      expect(list[1].label).toBe('alpha');
    });

    it('returns correct metadata for each snapshot', async () => {
      await writeChapter(chaptersDir, 'ch1.md', 'word1 word2 word3');
      await manager.create('my-snap');

      const list = await manager.list();
      expect(list.length).toBe(1);
      expect(list[0].label).toBe('my-snap');
      expect(list[0].chapterCount).toBe(1);
      expect(list[0].totalWordCount).toBeGreaterThan(0);
    });
  });

  // ── diff() ────────────────────────────────────────────────────────────────

  describe('diff()', () => {
    it('returns lines prefixed with + for additions and - for removals', async () => {
      // Snapshot A
      await writeChapter(chaptersDir, 'chapter-01.md', 'Line one\nLine two\nLine three');
      await manager.create('snap-a');

      // Modify chapter
      await writeChapter(chaptersDir, 'chapter-01.md', 'Line one\nLine TWO modified\nLine three\nLine four added');
      await manager.create('snap-b');

      const result = await manager.diff('snap-a', 'snap-b', 'chapter-01.md');
      expect(result).toContain('+');
      expect(result).toContain('-');
    });

    it('returns "(no differences)" when files are identical', async () => {
      await writeChapter(chaptersDir, 'chapter-01.md', 'Same content\nSame line 2');
      await manager.create('snap-x');
      await new Promise(r => setTimeout(r, 10));
      await manager.create('snap-y');

      const result = await manager.diff('snap-x', 'snap-y', 'chapter-01.md');
      expect(result).toContain('no differences');
    });

    it('includes from/to header lines', async () => {
      await writeChapter(chaptersDir, 'chapter-01.md', 'Version A');
      await manager.create('from-snap');
      await writeChapter(chaptersDir, 'chapter-01.md', 'Version B');
      await manager.create('to-snap');

      const result = await manager.diff('from-snap', 'to-snap', 'chapter-01.md');
      expect(result).toContain('from-snap');
      expect(result).toContain('to-snap');
      expect(result).toContain('chapter-01.md');
    });

    it('throws when a snapshot label does not exist', async () => {
      await writeChapter(chaptersDir, 'chapter-01.md', 'Content');
      await manager.create('exists');

      await expect(
        manager.diff('exists', 'does-not-exist', 'chapter-01.md')
      ).rejects.toThrow(/Snapshot not found/);
    });
  });

  // ── restore() ─────────────────────────────────────────────────────────────

  describe('restore()', () => {
    it('overwrites chapters/ with files from the snapshot', async () => {
      // Create snapshot with original content
      await writeChapter(chaptersDir, 'chapter-01.md', 'Original content');
      await manager.create('original');

      // Mutate chapter
      await writeChapter(chaptersDir, 'chapter-01.md', 'Mutated content');

      // Restore
      await manager.restore('original');

      const restored = await readFile(join(chaptersDir, 'chapter-01.md'), 'utf-8');
      expect(restored).toContain('Original content');
    });

    it('removes files that were not in the snapshot', async () => {
      await writeChapter(chaptersDir, 'chapter-01.md', 'Only this');
      await manager.create('baseline');

      // Add an extra chapter after snapshot
      await writeChapter(chaptersDir, 'chapter-02.md', 'Extra chapter');

      // Restore should remove chapter-02.md
      await manager.restore('baseline');

      const files = await readdir(chaptersDir);
      expect(files).toContain('chapter-01.md');
      expect(files).not.toContain('chapter-02.md');
    });

    it('throws when snapshot label does not exist', async () => {
      await expect(manager.restore('phantom')).rejects.toThrow();
    });

    it('restores to empty chapters/ when snapshot had no files', async () => {
      await manager.create('empty-snap');

      // Put a file in chapters
      await writeChapter(chaptersDir, 'chapter-01.md', 'Should go away');

      await manager.restore('empty-snap');

      const files = await readdir(chaptersDir);
      expect(files.length).toBe(0);
    });
  });

  // ── word count estimate ───────────────────────────────────────────────────

  describe('word count estimation', () => {
    it('counts prose words and excludes YAML frontmatter lines', async () => {
      // 100 prose words; frontmatter lines should not inflate the count
      const prose = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
      const content = `---\ntitle: "Chapter One"\nauthor: "Author"\n---\n${prose}`;
      await writeChapter(chaptersDir, 'chapter-01.md', content);

      const meta = await manager.create('wc-test');
      const wc = meta.chapterWordCounts['chapter-01.md'];

      // Rough estimate: should be at least 80 words (spec says ≥ 80 for 100-word chapter)
      expect(wc).toBeGreaterThanOrEqual(80);
      // Should not be wildly inflated by frontmatter
      expect(wc).toBeLessThanOrEqual(110);
    });

    it('counts words in a file with no frontmatter', async () => {
      const prose = 'one two three four five six seven eight nine ten';
      await writeFile(join(chaptersDir, 'no-fm.md'), prose, 'utf-8');

      const meta = await manager.create('no-fm-test');
      const wc = meta.chapterWordCounts['no-fm.md'];
      expect(wc).toBe(10);
    });
  });
});
