/**
 * Unit tests: src/analysis/theme-analyzer.ts
 *
 * Deterministic, no LLM, no DB. We write real themes/*.yml and chapters/*.md
 * into a temp project and assert on the motif-density scan, plus the pure
 * helpers (slugifyTheme, parseMotifs, renderSparkline).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ThemeAnalyzer,
  slugifyTheme,
  parseMotifs,
  renderSparkline,
} from '../../../project/src/analysis/theme-analyzer.js';

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

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'theme-an-'));
});

afterEach(async () => {
  await rmRetry(dir);
});

async function writeTheme(slug: string, body: string) {
  await mkdir(join(dir, 'themes'), { recursive: true });
  await writeFile(join(dir, 'themes', `${slug}.yml`), body, 'utf-8');
}

async function writeChapter(file: string, body: string) {
  await mkdir(join(dir, 'chapters'), { recursive: true });
  await writeFile(join(dir, 'chapters', file), body, 'utf-8');
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('slugifyTheme', () => {
  it('lowercases and dashes non-alphanumerics', () => {
    expect(slugifyTheme('The Cold Isolation!')).toBe('the-cold-isolation');
  });
  it('returns empty for symbols-only', () => {
    expect(slugifyTheme('!!!')).toBe('');
  });
});

describe('parseMotifs', () => {
  it('trims, drops empties, dedupes case-insensitively', () => {
    expect(parseMotifs(' cold , mirror,, Cold , SILENCE ')).toEqual([
      'cold',
      'mirror',
      'SILENCE',
    ]);
  });
  it('returns empty array for blank input', () => {
    expect(parseMotifs('   ,  , ')).toEqual([]);
  });
});

describe('renderSparkline', () => {
  it('returns empty string for empty input', () => {
    expect(renderSparkline([])).toBe('');
  });
  it('renders all-gap when every value is zero', () => {
    expect(renderSparkline([0, 0, 0])).toBe('···');
  });
  it('marks zero as gap and scales positives against max', () => {
    const s = renderSparkline([0, 1, 10]);
    expect(s[0]).toBe('·');
    expect(s[2]).toBe('█'); // the max maps to the heaviest bar
    expect(s).toHaveLength(3);
  });
});

// ─── loadThemes ───────────────────────────────────────────────────────────────

describe('ThemeAnalyzer.loadThemes', () => {
  it('returns empty when themes/ is missing', async () => {
    const analyzer = new ThemeAnalyzer(dir);
    expect(await analyzer.loadThemes()).toEqual([]);
  });

  it('loads valid themes sorted by name and skips malformed/empty', async () => {
    await writeTheme('isolation', 'name: isolation\nmotifs:\n  - cold\n  - mirror\n');
    await writeTheme('betrayal', 'name: Betrayal\nmotifs:\n  - knife\ndescription: a turn\n');
    await writeTheme('broken', ': : not yaml ::\n');      // malformed → skipped
    await writeTheme('noname', 'motifs:\n  - x\n');        // no name → skipped
    await writeTheme('nomotifs', 'name: Empty\n');         // motifs missing → motifs: []

    const analyzer = new ThemeAnalyzer(dir);
    const themes = await analyzer.loadThemes();
    const names = themes.map((t) => t.name);
    expect(names).toContain('isolation');
    expect(names).toContain('Betrayal');
    expect(names).toContain('Empty');
    expect(names).not.toContain(undefined);
    // sorted by name: Betrayal < Empty < isolation (localeCompare)
    expect(names.indexOf('Betrayal')).toBeLessThan(names.indexOf('isolation'));

    const empty = themes.find((t) => t.name === 'Empty');
    expect(empty?.motifs).toEqual([]);
    const betrayal = themes.find((t) => t.name === 'Betrayal');
    expect(betrayal?.description).toBe('a turn');
    expect(betrayal?.slug).toBe('betrayal');
  });

  it('filters non-string / blank motifs out', async () => {
    await writeTheme('mixed', 'name: Mixed\nmotifs:\n  - cold\n  - ""\n  - 42\n');
    const analyzer = new ThemeAnalyzer(dir);
    const [theme] = await analyzer.loadThemes();
    expect(theme.motifs).toEqual(['cold']);
  });
});

// ─── trace ────────────────────────────────────────────────────────────────────

describe('ThemeAnalyzer.trace', () => {
  it('returns empty when no themes registered', async () => {
    const analyzer = new ThemeAnalyzer(dir);
    expect(await analyzer.trace()).toEqual([]);
  });

  it('returns empty when filter matches nothing', async () => {
    await writeTheme('isolation', 'name: isolation\nmotifs:\n  - cold\n');
    const analyzer = new ThemeAnalyzer(dir);
    expect(await analyzer.trace('nonexistent')).toEqual([]);
  });

  it('matches a theme by name or by slug, case-insensitively', async () => {
    await writeTheme('cold-isolation', 'name: Cold Isolation\nmotifs:\n  - cold\n');
    await writeChapter('01-intro.md', 'It was cold.');
    const analyzer = new ThemeAnalyzer(dir);
    expect((await analyzer.trace('cold isolation')).length).toBe(1);
    expect((await analyzer.trace('cold-isolation')).length).toBe(1);
  });

  it('counts whole-word, case-insensitive motif hits per chapter', async () => {
    await writeTheme('isolation', 'name: isolation\nmotifs:\n  - cold\n  - mirror\n');
    // "scolded" must NOT match "cold" (word boundary).
    await writeChapter('01-a.md', '---\ntitle: A\n---\n# One\nCold cold COLD scolded. A mirror.');
    await writeChapter('02-b.md', 'Nothing thematic happens here at all.');

    const analyzer = new ThemeAnalyzer(dir);
    const [trace] = await analyzer.trace('isolation');

    expect(trace.chapters).toHaveLength(2);
    const c1 = trace.chapters[0];
    expect(c1.byMotif['cold']).toBe(3); // 3 'cold', not 'scolded'
    expect(c1.byMotif['mirror']).toBe(1);
    expect(c1.hits).toBe(4);
    expect(c1.isGap).toBe(false);

    const c2 = trace.chapters[1];
    expect(c2.hits).toBe(0);
    expect(c2.isGap).toBe(true);
    expect(c2.density).toBe(0);

    expect(trace.totalHits).toBe(4);
    expect(trace.gaps).toEqual(['02-b']);
  });

  it('flags spikes above the mean and reports gaps', async () => {
    await writeTheme('isolation', 'name: isolation\nmotifs:\n  - cold\n');
    // Chapter 1: dense. Chapter 2: zero (gap). Chapter 3: sparse.
    await writeChapter('01.md', 'cold cold cold cold cold word word word word word');
    await writeChapter('02.md', 'warm warm warm warm warm warm warm warm warm warm');
    await writeChapter('03.md', 'cold word word word word word word word word word');

    const analyzer = new ThemeAnalyzer(dir);
    const [trace] = await analyzer.trace();

    expect(trace.gaps).toEqual(['02']);
    expect(trace.spikes).toContain('01');     // densest chapter spikes
    expect(trace.spikes).not.toContain('03'); // sparse chapter does not
    expect(trace.maxDensity).toBeGreaterThan(trace.meanDensity);
  });

  it('handles a theme with zero chapters present (no chapters dir)', async () => {
    await writeTheme('isolation', 'name: isolation\nmotifs:\n  - cold\n');
    const analyzer = new ThemeAnalyzer(dir);
    const [trace] = await analyzer.trace();
    expect(trace.chapters).toEqual([]);
    expect(trace.totalHits).toBe(0);
    expect(trace.meanDensity).toBe(0);
    expect(trace.maxDensity).toBe(0);
    expect(trace.spikes).toEqual([]);
  });

  it('handles an empty chapter (zero words) without dividing by zero', async () => {
    await writeTheme('isolation', 'name: isolation\nmotifs:\n  - cold\n');
    await writeChapter('01.md', '---\ntitle: x\n---\n');
    const analyzer = new ThemeAnalyzer(dir);
    const [trace] = await analyzer.trace();
    expect(trace.chapters[0].wordCount).toBe(0);
    expect(trace.chapters[0].density).toBe(0);
    expect(trace.chapters[0].isGap).toBe(true);
  });
});
