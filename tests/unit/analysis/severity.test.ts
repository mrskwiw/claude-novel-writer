/**
 * Unit tests for the advisory severity-grading module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  gradeChecks,
  isAllowed,
  loadAllowList,
} from '../../../project/src/analysis/severity.js';
import { DEFAULT_STYLE_TARGETS, type StyleTargets } from '../../../project/src/analysis/style-targets.js';
import type { ProseCheck } from '../../../project/src/types/novel.js';

function check(type: ProseCheck['type'], text: string, line = 1): ProseCheck {
  return { type, line, text, severity: 'info' };
}

function many(type: ProseCheck['type'], n: number): ProseCheck[] {
  return Array.from({ length: n }, (_, i) => check(type, `${type}-${i}`, i + 1));
}

// ─── density grading ───────────────────────────────────────────────────────────

describe('gradeChecks — density-relative grading', () => {
  it('grades low density as info', () => {
    // intensifier tolerance = 8 / 1000 words. 1 in 1000 → density 1 → info.
    const graded = gradeChecks(many('intensifier', 1), 1000, DEFAULT_STYLE_TARGETS, []);
    expect(graded[0].severity).toBe('info');
  });

  it('grades moderate density as suggestion', () => {
    // 10 intensifiers / 1000 words → density 10 (> 8, ≤ 16) → suggestion.
    const graded = gradeChecks(many('intensifier', 10), 1000, DEFAULT_STYLE_TARGETS, []);
    expect(graded.every((g) => g.severity === 'suggestion')).toBe(true);
  });

  it('grades high density as warning', () => {
    // 20 intensifiers / 1000 words → density 20 (> 16) → warning.
    const graded = gradeChecks(many('intensifier', 20), 1000, DEFAULT_STYLE_TARGETS, []);
    expect(graded.every((g) => g.severity === 'warning')).toBe(true);
  });

  it('treats any redundant doubling as a suggestion (zero tolerance)', () => {
    const graded = gradeChecks([check('doubled_word', 'end result')], 1000, DEFAULT_STYLE_TARGETS, []);
    expect(graded[0].severity).toBe('suggestion');
  });

  it('uses a fallback tolerance for types without an explicit rule', () => {
    // 'dialogue_tag' has no TYPE_TOLERANCE entry → fallback 5/1000.
    const lo = gradeChecks(many('dialogue_tag', 5), 1000, DEFAULT_STYLE_TARGETS, []);
    const hi = gradeChecks(many('dialogue_tag', 11), 1000, DEFAULT_STYLE_TARGETS, []);
    expect(lo[0].severity).toBe('info');
    expect(hi[0].severity).toBe('warning');
  });

  it('does not divide by zero when wordCount is 0', () => {
    const graded = gradeChecks(many('intensifier', 1), 0, DEFAULT_STYLE_TARGETS, []);
    expect(graded).toHaveLength(1);
    expect(graded[0].severity).toBe('info');
  });

  it('attaches softened, non-imperative guidance', () => {
    const graded = gradeChecks([check('filter_word', 'felt')], 1000, DEFAULT_STYLE_TARGETS, []);
    expect(graded[0].message).toMatch(/render|directly|closer/i);
    expect(graded[0].message).not.toMatch(/^(Remove|Delete|Avoid|Don't)/);
  });
});

// ─── style-target scaling ──────────────────────────────────────────────────────

describe('gradeChecks — scales to project style targets', () => {
  it('a loose filter-word target keeps a high count at info', () => {
    const loose: StyleTargets = { ...DEFAULT_STYLE_TARGETS, filterWordsPer1000: { max: 100 } };
    const graded = gradeChecks(many('filter_word', 50), 1000, loose, []);
    expect(graded.every((g) => g.severity === 'info')).toBe(true);
  });

  it('a strict filter-word target escalates the same count', () => {
    const strict: StyleTargets = { ...DEFAULT_STYLE_TARGETS, filterWordsPer1000: { max: 5 } };
    const graded = gradeChecks(many('filter_word', 6), 1000, strict, []);
    expect(graded[0].severity).toBe('suggestion');
  });
});

// ─── allow-list ────────────────────────────────────────────────────────────────

describe('isAllowed', () => {
  it('matches exact (case-insensitive) text', () => {
    expect(isAllowed('Very', ['very'])).toBe(true);
  });

  it('matches when an allow phrase is contained in the flagged text', () => {
    expect(isAllowed('said darkly', ['darkly'])).toBe(true);
  });

  it('matches when the flagged text is contained in an allow phrase', () => {
    expect(isAllowed('old', ['old man'])).toBe(true);
  });

  it('returns false on an empty allow-list or empty text', () => {
    expect(isAllowed('very', [])).toBe(false);
    expect(isAllowed('   ', ['very'])).toBe(false);
  });
});

describe('gradeChecks — allow-list suppression', () => {
  it('drops checks whose text the author has allow-listed', () => {
    const checks = [check('intensifier', 'very'), check('intensifier', 'really')];
    const graded = gradeChecks(checks, 1000, DEFAULT_STYLE_TARGETS, ['very']);
    expect(graded).toHaveLength(1);
    expect(graded[0].text).toBe('really');
  });

  it('excludes allow-listed flags from the density count', () => {
    // 20 'very' (allow-listed) + 1 'really'. Without the allow-list this would
    // be a warning; with it, density is just 1 → info.
    const checks = [...Array.from({ length: 20 }, () => check('intensifier', 'very')), check('intensifier', 'really')];
    const graded = gradeChecks(checks, 1000, DEFAULT_STYLE_TARGETS, ['very']);
    expect(graded).toHaveLength(1);
    expect(graded[0].severity).toBe('info');
  });
});

describe('loadAllowList', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'allow-test-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns [] when no style-targets.yml exists', () => {
    expect(loadAllowList(dir)).toEqual([]);
  });

  it('reads, trims and lowercases an allow list', async () => {
    await fs.writeFile(path.join(dir, 'style-targets.yml'), 'allow:\n  - Very\n  - "Old Man"\n', 'utf-8');
    expect(loadAllowList(dir)).toEqual(['very', 'old man']);
  });

  it('returns [] when allow is not an array', async () => {
    await fs.writeFile(path.join(dir, 'style-targets.yml'), 'allow: nope\n', 'utf-8');
    expect(loadAllowList(dir)).toEqual([]);
  });

  it('ignores non-string and empty entries', async () => {
    await fs.writeFile(path.join(dir, 'style-targets.yml'), 'allow:\n  - 42\n  - ""\n  - keep\n', 'utf-8');
    expect(loadAllowList(dir)).toEqual(['keep']);
  });

  it('returns [] for malformed YAML', async () => {
    await fs.writeFile(path.join(dir, 'style-targets.yml'), 'allow: [unterminated\n', 'utf-8');
    expect(loadAllowList(dir)).toEqual([]);
  });

  it('returns [] when the file has no allow key', async () => {
    await fs.writeFile(path.join(dir, 'style-targets.yml'), 'tense: past\n', 'utf-8');
    expect(loadAllowList(dir)).toEqual([]);
  });
});
