/**
 * Unit tests for HookAnalyzer — deterministic opening-line hook scorer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { HookAnalyzer, type HookScore } from '../../../project/src/analysis/hook-analyzer.js';

function score(text: string): HookScore {
  return new HookAnalyzer('/fake').analyzeText(text, 'chapter-01.md');
}

function signal(result: HookScore, key: string) {
  const s = result.signals.find((x) => x.key === key);
  if (!s) throw new Error(`signal ${key} not found`);
  return s;
}

describe('HookAnalyzer — question signal', () => {
  it('awards full points for a direct question mark', () => {
    const r = score('What had she done?');
    expect(signal(r, 'question').points).toBe(20);
  });

  it('awards points for an interrogative opener without a "?"', () => {
    const r = score('Why the old house still stood, no one in the village ever said.');
    expect(signal(r, 'question').points).toBe(20);
  });

  it('awards points for an implied/unanswered question', () => {
    const r = score('Marcus stared at the locked door. The truth was somewhere behind it.');
    expect(signal(r, 'question').points).toBe(20);
  });

  it('gives zero and a suggestion when no question is posed', () => {
    const r = score('The shelf held three books and a clock.');
    expect(signal(r, 'question').points).toBe(0);
    expect(r.suggestions.some((s) => s.includes('question'))).toBe(true);
  });
});

describe('HookAnalyzer — character signal', () => {
  it('awards full points when a name leads the opening', () => {
    const r = score('Marcus shoved the door open and ran.');
    expect(signal(r, 'character').points).toBe(20);
    expect(signal(r, 'character').detail).toContain('Marcus');
  });

  it('finds a name that appears mid-sentence', () => {
    const r = score('The cold room swallowed Eleanor whole.');
    expect(signal(r, 'character').points).toBe(20);
  });

  it('gives partial credit for a first-person voice with no name', () => {
    const r = score('I had never wanted any of this.');
    expect(signal(r, 'character').points).toBe(14);
  });

  it('does not mistake a sentence-starter like "The" or "She" for a name', () => {
    const r = score('The garden was very still. She waited.');
    expect(signal(r, 'character').points).toBe(0);
  });
});

describe('HookAnalyzer — atmosphere signal', () => {
  it('awards points when sensory grounding is present', () => {
    const r = score('Smoke hung in the cold air above the ruined hall.');
    expect(signal(r, 'atmosphere').points).toBe(15);
  });

  it('gives zero without sensory grounding', () => {
    const r = score('He considered the proposal and disagreed with it.');
    expect(signal(r, 'atmosphere').points).toBe(0);
  });
});

describe('HookAnalyzer — in-medias-res signal', () => {
  it('awards full points for an early action verb', () => {
    const r = score('Marcus ran for the tree line as the gunfire chased him.');
    expect(signal(r, 'action').points).toBe(20);
  });

  it('gives partial credit for action that arrives later in the opening', () => {
    const r = score(
      'The long afternoon had been peaceful and slow and uneventful until at last the heavy front gate slammed.',
    );
    expect(signal(r, 'action').points).toBe(12);
  });

  it('gives zero for a static opening', () => {
    const r = score('The table was old and the chairs matched it well enough.');
    expect(signal(r, 'action').points).toBe(0);
  });
});

describe('HookAnalyzer — tension signal', () => {
  it('awards points when stakes vocabulary is present', () => {
    const r = score('Marcus knew the killer was still inside the house.');
    expect(signal(r, 'tension').points).toBe(15);
  });

  it('gives zero with no stakes', () => {
    const r = score('Eleanor poured the tea and offered a biscuit.');
    expect(signal(r, 'tension').points).toBe(0);
  });
});

describe('HookAnalyzer — throat-clearing penalty', () => {
  it('penalises a weather-only opening', () => {
    const r = score('It was a cold and rainy morning over the grey hills.');
    expect(signal(r, 'throat_clearing').points).toBe(0);
    expect(r.suggestions.some((s) => s.toLowerCase().includes('weather'))).toBe(true);
  });

  it('penalises a waking-up opening', () => {
    const r = score('Marcus woke up to the sound of the alarm and groaned.');
    expect(signal(r, 'throat_clearing').points).toBe(0);
    expect(r.suggestions.some((s) => s.toLowerCase().includes('waking'))).toBe(true);
  });

  it('awards points when no cliché opening is present', () => {
    const r = score('Marcus ran.');
    expect(signal(r, 'throat_clearing').points).toBe(10);
  });
});

describe('HookAnalyzer — scoring & aggregation', () => {
  it('a strong opening scores high and produces no suggestions', () => {
    const r = score('Why was there blood on the knife? Marcus ran from the smoke-filled room.');
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.suggestions.length).toBe(0);
  });

  it('a weak, clichéd opening scores low', () => {
    const r = score('It was a quiet morning.');
    expect(r.score).toBeLessThan(25);
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it('score never exceeds 100 and signal maxima sum to 100', () => {
    const r = score('Why was there blood on the knife? Marcus ran from the smoke-filled room.');
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.signals.reduce((sum, s) => sum + s.max, 0)).toBe(100);
  });

  it('reports the first sentence as the opening line', () => {
    const r = score('Marcus ran. The rest came later.');
    expect(r.openingLine).toBe('Marcus ran.');
  });
});

describe('HookAnalyzer — markup handling', () => {
  it('skips frontmatter, headings, comments and code fences', () => {
    const text = [
      '---',
      'title: Test',
      '---',
      '# Chapter 1',
      '<!-- pov: Marcus -->',
      '```',
      'It was a stormy morning.',
      '```',
      'Marcus ran for the door as the killer screamed behind him.',
    ].join('\n');
    const r = score(text);
    // Opening should be the prose line, not the fenced weather cliché.
    expect(r.openingText).toContain('Marcus ran');
    expect(signal(r, 'throat_clearing').points).toBe(10);
  });
});

describe('HookAnalyzer.analyzeChapter()', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    await fs.mkdir(path.join(dir, 'chapters'));
    await fs.writeFile(
      path.join(dir, 'chapters', 'chapter-01.md'),
      '# Chapter 1\n\nMarcus ran for the tree line as gunfire chased him through the cold dark.\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reads a real chapter file and scores it', async () => {
    const analyzer = new HookAnalyzer(dir);
    const r = await analyzer.analyzeChapter(path.join(dir, 'chapters', 'chapter-01.md'));
    expect(r.chapter).toBe('chapter-01.md');
    expect(r.score).toBeGreaterThan(0);
  });

  it('resolves a relative chapter path against chapters/', async () => {
    const analyzer = new HookAnalyzer(dir);
    const r = await analyzer.analyzeChapter('chapter-01.md');
    expect(r.score).toBeGreaterThan(0);
  });
});
