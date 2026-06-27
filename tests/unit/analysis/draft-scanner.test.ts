/**
 * Unit tests for DraftScanner — SPEC-06 Drafting Support Tools
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { DraftScanner } from '../../../project/src/analysis/draft-scanner.js';

/** Create a unique temp directory for the test project. */
async function makeTempProject(): Promise<string> {
  const dir = join(tmpdir(), `novel-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(join(dir, 'chapters'), { recursive: true });
  return dir;
}

/** Write a chapter file and return the filename. */
async function writeChapter(
  projectPath: string,
  filename: string,
  content: string
): Promise<void> {
  await writeFile(join(projectPath, 'chapters', filename), content, 'utf-8');
}

describe('DraftScanner', () => {
  let projectPath: string;
  let scanner: DraftScanner;

  beforeEach(async () => {
    projectPath = await makeTempProject();
    scanner = new DraftScanner(projectPath);
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  // ── findPlaceholders ────────────────────────────────────────────────────────

  describe('findPlaceholders()', () => {
    it('detects [TK] marker', async () => {
      await writeChapter(projectPath, '01-opening.md', 'Some prose [TK] more prose\n');
      const marks = await scanner.findPlaceholders();
      expect(marks).toHaveLength(1);
      expect(marks[0].marker).toBe('TK');
      expect(marks[0].note).toBe('');
      expect(marks[0].chapterFilename).toBe('01-opening.md');
    });

    it('detects [TODO] marker', async () => {
      await writeChapter(projectPath, '02-ch.md', 'Line one\n[TODO] something\n');
      const marks = await scanner.findPlaceholders();
      expect(marks.some((m) => m.marker === 'TODO')).toBe(true);
    });

    it('detects [FIXME] marker', async () => {
      await writeChapter(projectPath, '03-ch.md', '[FIXME] broken sentence here\n');
      const marks = await scanner.findPlaceholders();
      expect(marks.some((m) => m.marker === 'FIXME')).toBe(true);
    });

    it('detects [CHECK] marker', async () => {
      await writeChapter(projectPath, '04-ch.md', 'Verify dates [CHECK] then continue\n');
      const marks = await scanner.findPlaceholders();
      expect(marks.some((m) => m.marker === 'CHECK')).toBe(true);
    });

    it('captures note text from [TK: write this scene]', async () => {
      await writeChapter(projectPath, '05-ch.md', '[TK: write this scene] placeholder\n');
      const marks = await scanner.findPlaceholders();
      expect(marks).toHaveLength(1);
      expect(marks[0].marker).toBe('TK');
      expect(marks[0].note).toBe('write this scene');
    });

    it('captures note text from [TODO: expand this section]', async () => {
      await writeChapter(projectPath, '06-ch.md', 'Text [TODO: expand this section] end\n');
      const marks = await scanner.findPlaceholders();
      const todo = marks.find((m) => m.marker === 'TODO');
      expect(todo).toBeDefined();
      expect(todo!.note).toBe('expand this section');
    });

    it('skips content inside code fences', async () => {
      const content = [
        'Normal paragraph [TK] here',
        '```',
        'code block [TODO: do not detect this]',
        '[FIXME] also ignored',
        '```',
        'After fence [CHECK] detected',
      ].join('\n');
      await writeChapter(projectPath, '07-ch.md', content);

      const marks = await scanner.findPlaceholders();
      const markers = marks.map((m) => m.marker);
      expect(markers).toContain('TK');
      expect(markers).toContain('CHECK');
      // Items inside the fence must NOT appear
      expect(marks.some((m) => m.note === 'do not detect this')).toBe(false);
      expect(marks.some((m) => m.marker === 'FIXME')).toBe(false);
    });

    it('returns correct 1-based lineNumber', async () => {
      const content = 'First line\nSecond line [TK: here]\nThird line\n';
      await writeChapter(projectPath, '08-ch.md', content);

      const marks = await scanner.findPlaceholders();
      expect(marks).toHaveLength(1);
      expect(marks[0].lineNumber).toBe(2);
    });

    it('chapterFilter only returns markers from that chapter number', async () => {
      await writeChapter(projectPath, '01-intro.md', '[TK] from chapter 1\n');
      await writeChapter(projectPath, '02-rising.md', '[TODO] from chapter 2\n');

      const marks = await scanner.findPlaceholders(2);
      expect(marks).toHaveLength(1);
      expect(marks[0].marker).toBe('TODO');
      expect(marks[0].chapterFilename).toBe('02-rising.md');
    });

    it('chapterFilter returns empty array when chapter not found', async () => {
      await writeChapter(projectPath, '01-intro.md', '[TK] something\n');
      const marks = await scanner.findPlaceholders(99);
      expect(marks).toHaveLength(0);
    });

    it('returns empty array for empty chapter file', async () => {
      await writeChapter(projectPath, '01-empty.md', '');
      const marks = await scanner.findPlaceholders();
      expect(marks).toHaveLength(0);
    });

    it('returns empty array when chapters directory does not exist', async () => {
      // Remove the chapters directory
      await rm(join(projectPath, 'chapters'), { recursive: true, force: true });
      const marks = await scanner.findPlaceholders();
      expect(marks).toHaveLength(0);
    });

    it('returns markers sorted by chapterFilename then lineNumber', async () => {
      await writeChapter(projectPath, '02-ch.md', '[TK] second file\n');
      await writeChapter(projectPath, '01-ch.md', 'Line one\n[TODO] first file, line 2\n[FIXME] first file, line 3\n');

      const marks = await scanner.findPlaceholders();

      expect(marks[0].chapterFilename).toBe('01-ch.md');
      expect(marks[1].chapterFilename).toBe('01-ch.md');
      expect(marks[2].chapterFilename).toBe('02-ch.md');
      expect(marks[0].lineNumber).toBe(2);
      expect(marks[1].lineNumber).toBe(3);
    });

    it('multiple markers on one line are all captured', async () => {
      await writeChapter(projectPath, '01-ch.md', '[TK] [TODO: do this] same line\n');
      const marks = await scanner.findPlaceholders();
      expect(marks).toHaveLength(2);
    });
  });

  // ── checkChapter ────────────────────────────────────────────────────────────

  describe('checkChapter()', () => {
    it('returns a checklist string containing the chapter number', async () => {
      await writeChapter(projectPath, '03-ch.md', 'Some content\n');
      const result = await DraftScanner.checkChapter(projectPath, 3);
      expect(result).toContain('Chapter 3 checklist:');
    });

    it('marks Purpose declared when <!-- purpose: ... --> is present', async () => {
      const content = '<!-- purpose: establish setting -->\nSome prose\n';
      await writeChapter(projectPath, '01-ch.md', content);
      const result = await DraftScanner.checkChapter(projectPath, 1);
      expect(result).toContain('[x] Purpose declared');
    });

    it('marks Purpose not declared when comment is absent', async () => {
      await writeChapter(projectPath, '01-ch.md', 'Just prose, no purpose comment\n');
      const result = await DraftScanner.checkChapter(projectPath, 1);
      expect(result).toContain('[ ] Purpose declared');
    });

    it('marks Has conflict when tension_level > 0 in frontmatter', async () => {
      const content = '---\ntension_level: 7\npov: Alice\n---\nProse\n';
      await writeChapter(projectPath, '01-ch.md', content);
      const result = await DraftScanner.checkChapter(projectPath, 1);
      expect(result).toContain('[x] Has conflict');
    });

    it('marks POV declared when pov: is in frontmatter', async () => {
      const content = '---\npov: Alice\n---\nProse\n';
      await writeChapter(projectPath, '01-ch.md', content);
      const result = await DraftScanner.checkChapter(projectPath, 1);
      expect(result).toContain('[x] POV declared');
    });

    it('reports TK marker count', async () => {
      const content = '---\npov: Bob\n---\n[TK] placeholder one\n[TK: another] two\n';
      await writeChapter(projectPath, '01-ch.md', content);
      const result = await DraftScanner.checkChapter(projectPath, 1);
      expect(result).toContain('[?] Open TK markers: 2 found');
    });

    it('reports 0 TK markers when none present', async () => {
      await writeChapter(projectPath, '01-ch.md', 'Clean prose here\n');
      const result = await DraftScanner.checkChapter(projectPath, 1);
      expect(result).toContain('[?] Open TK markers: 0 found');
    });

    it('handles missing chapter file gracefully', async () => {
      // No chapter 99 file written
      const result = await DraftScanner.checkChapter(projectPath, 99);
      expect(result).toContain('Chapter 99 checklist:');
      expect(result).toContain('[?] Open TK markers: 0 found');
    });
  });
});
