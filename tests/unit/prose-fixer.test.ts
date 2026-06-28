/**
 * Unit tests: ProseFixer (deterministic mechanical prose fixes)
 *
 * Covers each fixer category, the safety rules (frontmatter / code fences /
 * EOL preservation), category de-duplication & ordering, and the file-I/O
 * wrapper (dry run vs --apply).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ProseFixer,
  ALL_CATEGORIES,
  isReviseCategory,
  type ReviseCategory,
} from '../../project/src/analysis/prose-fixer.js';

const fix = (raw: string, cats: ReviseCategory[]) => ProseFixer._fixText(raw, cats);

async function rmWithRetry(dir: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

describe('ProseFixer._fixText — category dictionary', () => {
  it('exposes six categories and a working type guard', () => {
    expect(ALL_CATEGORIES).toHaveLength(6);
    expect(isReviseCategory('doubled-words')).toBe(true);
    expect(isReviseCategory('nonsense')).toBe(false);
  });

  it('produces no changes when no categories are enabled', () => {
    const r = fix('the the  cat said angrily. \n', []);
    expect(r.totalFixes).toBe(0);
    expect(r.changedLines).toBe(0);
    expect(r.changes).toEqual([]);
    expect(r.output).toBe('the the  cat said angrily. \n');
  });
});

describe('ProseFixer — doubled-words', () => {
  it('collapses a simple doubled word, preserving first casing', () => {
    const r = fix('The the cat sat.', ['doubled-words']);
    expect(r.output).toBe('The cat sat.');
    expect(r.counts['doubled-words']).toBe(1);
  });

  it('collapses a triple in a single pass', () => {
    const r = fix('the the the end', ['doubled-words']);
    expect(r.output).toBe('the end');
    expect(r.counts['doubled-words']).toBe(2);
  });

  it('collapses a non-adjacent dup where the first word differs (a the the)', () => {
    const r = fix('a the the door', ['doubled-words']);
    expect(r.output).toBe('a the door');
    expect(r.counts['doubled-words']).toBe(1);
  });

  it('leaves legitimate doubles in the denylist alone', () => {
    const r = fix('I had had a dream that that man left.', ['doubled-words']);
    expect(r.output).toBe('I had had a dream that that man left.');
    expect(r.counts['doubled-words']).toBe(0);
  });

  it('does not treat different adjacent words as duplicates', () => {
    const r = fix('the cat sat', ['doubled-words']);
    expect(r.totalFixes).toBe(0);
  });
});

describe('ProseFixer — trailing-whitespace & multiple-spaces', () => {
  it('strips trailing spaces and tabs', () => {
    const r = fix('hello world   \nbye\t', ['trailing-whitespace']);
    expect(r.output).toBe('hello world\nbye');
    expect(r.counts['trailing-whitespace']).toBe(2);
  });

  it('collapses interior multiple spaces but keeps leading indentation', () => {
    const r = fix('  indented   text   here', ['multiple-spaces']);
    expect(r.output).toBe('  indented text here');
    expect(r.counts['multiple-spaces']).toBe(2);
  });

  it('does not collapse trailing spaces under multiple-spaces alone', () => {
    const r = fix('word   ', ['multiple-spaces']);
    expect(r.output).toBe('word   ');
    expect(r.counts['multiple-spaces']).toBe(0);
  });
});

describe('ProseFixer — redundant-intensifiers', () => {
  it('removes very/really/quite before a weak adjective', () => {
    const r = fix('It was very good and really nice and quite big.', [
      'redundant-intensifiers',
    ]);
    expect(r.output).toBe('It was good and nice and big.');
    expect(r.counts['redundant-intensifiers']).toBe(3);
  });

  it('promotes sentence-start capitalisation to the adjective', () => {
    const r = fix('Very good.', ['redundant-intensifiers']);
    expect(r.output).toBe('Good.');
  });

  it('leaves intensifiers before non-weak words untouched', () => {
    const r = fix('It was very serendipitous.', ['redundant-intensifiers']);
    expect(r.output).toBe('It was very serendipitous.');
    expect(r.counts['redundant-intensifiers']).toBe(0);
  });
});

describe('ProseFixer — adverb-dialogue-tags', () => {
  it('strips an -ly adverb after a dialogue tag verb', () => {
    const r = fix('"Stop," she said angrily.', ['adverb-dialogue-tags']);
    expect(r.output).toBe('"Stop," she said.');
    expect(r.counts['adverb-dialogue-tags']).toBe(1);
  });

  it('keeps denylisted -ly words (said only)', () => {
    const r = fix('He said only that.', ['adverb-dialogue-tags']);
    expect(r.output).toBe('He said only that.');
    expect(r.counts['adverb-dialogue-tags']).toBe(0);
  });

  it('does not touch -ly adverbs not following a tag verb', () => {
    const r = fix('She ran quickly.', ['adverb-dialogue-tags']);
    expect(r.totalFixes).toBe(0);
  });
});

describe('ProseFixer — straight-to-curly-quotes', () => {
  it('converts opening and closing double quotes by context', () => {
    const r = fix('He said "hello" loudly.', ['straight-to-curly-quotes']);
    expect(r.output).toBe('He said “hello” loudly.');
    expect(r.counts['straight-to-curly-quotes']).toBe(2);
  });

  it('treats word-internal and possessive apostrophes as right single quotes', () => {
    const r = fix("don't touch Sara's bag", ['straight-to-curly-quotes']);
    expect(r.output).toBe('don’t touch Sara’s bag');
  });

  it('opens a single quote at the start of a quotation', () => {
    const r = fix("'Yes,' he said", ['straight-to-curly-quotes']);
    expect(r.output.startsWith('‘Yes')).toBe(true);
  });
});

describe('ProseFixer — safety rules', () => {
  it('never modifies YAML frontmatter', () => {
    const raw = ['---', 'pov:   Alice   ', 'title: the the book', '---', '', 'the the cat'].join(
      '\n'
    );
    const r = fix(raw, [...ALL_CATEGORIES]);
    expect(r.output).toContain('pov:   Alice   ');
    expect(r.output).toContain('title: the the book');
    expect(r.output).toContain('the cat');
    // Only the body line changed (line 6).
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0].line).toBe(6);
  });

  it('ignores an unterminated frontmatter block (treats it as body)', () => {
    const raw = ['---', 'pov: Alice', 'the the cat'].join('\n');
    const r = fix(raw, ['doubled-words']);
    expect(r.output).toContain('the cat');
  });

  it('never modifies lines inside fenced code blocks', () => {
    const raw = ['the the one', '```', 'the the code', '```', 'the the two'].join('\n');
    const r = fix(raw, ['doubled-words']);
    const lines = r.output.split('\n');
    expect(lines[0]).toBe('the one');
    expect(lines[2]).toBe('the the code'); // untouched inside fence
    expect(lines[4]).toBe('the two');
  });

  it('preserves CRLF line endings', () => {
    const r = fix('the the cat\r\nbye  \r\n', ['doubled-words', 'trailing-whitespace']);
    expect(r.output).toBe('the cat\r\nbye\r\n');
  });

  it('records every category that touched a line, in canonical order', () => {
    const r = fix('the the very good   place   ', [...ALL_CATEGORIES]);
    const change = r.changes[0];
    expect(change.categories).toEqual([
      'doubled-words',
      'redundant-intensifiers',
      'multiple-spaces',
      'trailing-whitespace',
    ]);
    expect(change.after).toBe('the good place');
  });

  it('de-duplicates and canonically orders requested categories', () => {
    // Request out of order and with a duplicate; result must be stable.
    const r = fix('word   here', [
      'multiple-spaces',
      'multiple-spaces',
      'doubled-words',
    ] as ReviseCategory[]);
    expect(r.output).toBe('word here');
  });
});

describe('ProseFixer.reviseChapter — file I/O', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'novel-revise-unit-'));
    await mkdir(join(dir, 'chapters'), { recursive: true });
  });

  afterEach(async () => {
    await rmWithRetry(dir);
  });

  it('dry run does not modify the file on disk', async () => {
    const file = join(dir, 'chapters', '01-intro.md');
    await writeFile(file, 'the the cat', 'utf-8');
    const fixer = new ProseFixer(dir);
    const result = await fixer.reviseChapter('01-intro.md', ['doubled-words'], { apply: false });
    expect(result.totalFixes).toBe(1);
    expect(await readFile(file, 'utf-8')).toBe('the the cat'); // unchanged
  });

  it('apply writes the fixed file back', async () => {
    const file = join(dir, 'chapters', '01-intro.md');
    await writeFile(file, 'the the cat', 'utf-8');
    const fixer = new ProseFixer(dir);
    const result = await fixer.reviseChapter('01-intro.md', ['doubled-words'], { apply: true });
    expect(result.totalFixes).toBe(1);
    expect(await readFile(file, 'utf-8')).toBe('the cat');
  });

  it('apply with zero fixes leaves the file byte-identical', async () => {
    const file = join(dir, 'chapters', '02-clean.md');
    await writeFile(file, 'the cat sat\n', 'utf-8');
    const fixer = new ProseFixer(dir);
    const result = await fixer.reviseChapter('02-clean.md', [...ALL_CATEGORIES], { apply: true });
    expect(result.totalFixes).toBe(0);
    expect(await readFile(file, 'utf-8')).toBe('the cat sat\n');
  });

  it('accepts an absolute chapter path', async () => {
    const file = join(dir, 'chapters', '03-abs.md');
    await writeFile(file, 'the the end', 'utf-8');
    const fixer = new ProseFixer(dir);
    const result = await fixer.reviseChapter(file, ['doubled-words'], { apply: false });
    expect(result.filePath).toBe(file);
    expect(result.totalFixes).toBe(1);
  });
});
