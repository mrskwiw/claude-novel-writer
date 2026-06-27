/**
 * Unit tests: style-targets loader + StyleTargetAnalyzer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFileSync } from 'fs';
import {
  loadStyleTargets,
  DEFAULT_STYLE_TARGETS,
} from '../../../project/src/analysis/style-targets.js';
import { StyleTargetAnalyzer } from '../../../project/src/analysis/style-target-analyzer.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'style-targets-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('loadStyleTargets', () => {
  it('returns defaults when no file exists', () => {
    const { targets, source } = loadStyleTargets(dir);
    expect(source).toBe('defaults');
    expect(targets).toEqual(DEFAULT_STYLE_TARGETS);
  });

  it('merges a project file over defaults and reports source "file"', () => {
    writeFileSync(
      join(dir, 'style-targets.yml'),
      'adverbsPer1000: { max: 4 }\ntense: present\n',
      'utf-8',
    );
    const { targets, source } = loadStyleTargets(dir);
    expect(source).toBe('file');
    expect(targets.adverbsPer1000).toEqual({ max: 4 }); // overridden
    expect(targets.meanSentenceWords).toEqual(DEFAULT_STYLE_TARGETS.meanSentenceWords); // default kept
    expect(targets.tense).toBe('present');
  });

  it('disables a metric when set to null', () => {
    writeFileSync(join(dir, 'style-targets.yml'), 'passivePercent: null\n', 'utf-8');
    const { targets } = loadStyleTargets(dir);
    expect(targets.passivePercent).toBeNull();
  });

  it('falls back to defaults on malformed YAML', () => {
    writeFileSync(join(dir, 'style-targets.yml'), ':::not yaml:::\n[', 'utf-8');
    const { source } = loadStyleTargets(dir);
    expect(source).toBe('defaults');
  });

  it('ships a templates/style-targets.yml that parses to valid targets', () => {
    // The shipped template file is the canonical scaffold source.
    const template = readFileSync(
      join(process.cwd(), 'templates', 'style-targets.yml'),
      'utf-8',
    );
    writeFileSync(join(dir, 'style-targets.yml'), template, 'utf-8');
    const { targets, source } = loadStyleTargets(dir);
    expect(source).toBe('file');
    expect(targets.meanSentenceWords).toEqual({ min: 12, max: 25 });
    expect(targets.tense).toBe('past');
  });
});

describe('StyleTargetAnalyzer', () => {
  it('measures core metrics and grades against targets', () => {
    const analyzer = new StyleTargetAnalyzer(dir);
    const text = [
      'The cold wind howled across the empty field.',
      'She ran. He shouted; the door slammed behind them—hard.',
      'It was a dark, quiet, bitter morning, and the rain tasted of salt.',
    ].join('\n\n');

    const report = analyzer.analyzeText(text, 'ch1.md');
    expect(report.wordCount).toBeGreaterThan(0);
    expect(report.sentenceCount).toBeGreaterThan(0);
    expect(report.source).toBe('defaults');

    const byKey = Object.fromEntries(report.metrics.map((m) => [m.key, m]));
    expect(byKey.meanSentenceWords).toBeDefined();
    expect(byKey.emDashesPerChapter.measured).toBe(1); // one — dash
    expect(byKey.semicolonsPerChapter.measured).toBe(1); // one ;
    // Senses present should detect at least tactile (cold) + gustatory (tasted)
    expect(byKey.sensesPerChapter.measured as number).toBeGreaterThanOrEqual(2);
  });

  it('flags passive voice over the target ceiling', () => {
    const analyzer = new StyleTargetAnalyzer(dir);
    // Every sentence passive → passivePercent 100 > default max 10
    const text = 'The vase was shattered. The note was written. The room was searched.';
    const report = analyzer.analyzeText(text, 'ch.md');
    const passive = report.metrics.find((m) => m.key === 'passivePercent')!;
    expect(passive.measured as number).toBeGreaterThan(10);
    expect(passive.status).toBe('high');
    expect(report.warnings).toBeGreaterThan(0);
  });

  it('skips code fences and frontmatter when counting', () => {
    const analyzer = new StyleTargetAnalyzer(dir);
    const text = [
      '---',
      'title: Test',
      '---',
      '',
      'A plain sentence here.',
      '',
      '```',
      'this; code; has; semicolons; that must not count',
      '```',
    ].join('\n');
    const report = analyzer.analyzeText(text, 'ch.md');
    const semis = report.metrics.find((m) => m.key === 'semicolonsPerChapter')!;
    expect(semis.measured).toBe(0); // fenced semicolons ignored
  });

  it('analyzeAll returns empty when no chapters dir', async () => {
    const analyzer = new StyleTargetAnalyzer(dir);
    const reports = await analyzer.analyzeAll();
    expect(reports).toEqual([]);
  });

  it('analyzeChapter reads a real chapter file', async () => {
    mkdirSync(join(dir, 'chapters'), { recursive: true });
    writeFileSync(join(dir, 'chapters', '01-test.md'), 'She walked into the cold room.\n', 'utf-8');
    const analyzer = new StyleTargetAnalyzer(dir);
    const report = await analyzer.analyzeChapter(join(dir, 'chapters', '01-test.md'));
    expect(report.chapter).toBe('01-test.md');
    expect(report.wordCount).toBeGreaterThan(0);
  });
});
