/**
 * Unit tests for ProseAnalyzer (SPEC-05)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ProseAnalyzer } from '../../../project/src/analysis/prose-analyzer.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a temporary directory containing a `chapters/` subdirectory,
 * write one file into it, and return the temp dir path + file basename.
 */
async function createTempChapter(content: string): Promise<{ dir: string; file: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prose-test-'));
  const chaptersDir = path.join(dir, 'chapters');
  await fs.mkdir(chaptersDir);
  const file = 'chapter-01.md';
  await fs.writeFile(path.join(chaptersDir, file), content, 'utf-8');
  return { dir, file };
}

// ─── Intensifier regex ────────────────────────────────────────────────────────

describe('ProseAnalyzer — intensifier detection', () => {
  it('finds "very" in prose', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('He was very tired today.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'intensifier');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].text.toLowerCase()).toBe('very');
  });

  it('finds "really" in prose', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('She really wanted to leave.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'intensifier');
    expect(matches.some((c) => c.text.toLowerCase() === 'really')).toBe(true);
  });

  it('finds "quite" in prose', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('It was quite dark outside.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'intensifier');
    expect(matches.some((c) => c.text.toLowerCase() === 'quite')).toBe(true);
  });

  it('does NOT flag "every" as an intensifier (false-positive guard)', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('Every morning she woke at dawn.', 'ch.md');
    const intensifiers = result.checks.filter((c) => c.type === 'intensifier');
    const texts = intensifiers.map((c) => c.text.toLowerCase());
    expect(texts).not.toContain('every');
  });

  it('intensifiers carry severity "info"', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('It was just incredible.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'intensifier');
    for (const m of matches) {
      expect(m.severity).toBe('info');
    }
  });
});

// ─── Filter word regex ────────────────────────────────────────────────────────

describe('ProseAnalyzer — filter word detection', () => {
  it('finds "felt" on a non-dialogue line', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('He felt a chill run down his spine.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'filter_word');
    expect(matches.some((c) => c.text.toLowerCase() === 'felt')).toBe(true);
  });

  it('finds "noticed" on a non-dialogue line', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('She noticed the door was ajar.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'filter_word');
    expect(matches.some((c) => c.text.toLowerCase() === 'noticed')).toBe(true);
  });

  it('filter words carry severity "warning"', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('He saw the light flicker.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'filter_word');
    for (const m of matches) {
      expect(m.severity).toBe('warning');
    }
  });
});

// ─── Adverb dialogue tag ──────────────────────────────────────────────────────

describe('ProseAnalyzer — adverb dialogue tag detection', () => {
  it('finds "said quietly"', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('"Come here," she said quietly.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'adverb_tag');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].text.toLowerCase()).toContain('said quietly');
  });

  it('does NOT flag "said hello" (hello does not end in -ly)', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('"Good morning," he said hello everyone.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'adverb_tag');
    // "said hello" must not appear as an adverb tag match
    expect(matches.every((c) => !c.text.toLowerCase().includes('said hello'))).toBe(true);
  });
});

// ─── Passive voice ────────────────────────────────────────────────────────────

describe('ProseAnalyzer — passive voice detection', () => {
  it('finds "was carried" (regular past participle)', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('The box was carried to the van.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'passive_voice');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].text.toLowerCase()).toContain('was carried');
  });

  it('does NOT flag bare "was" (no past participle follows)', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('She was there. He was happy.', 'ch.md');
    const passiveMatches = result.checks.filter((c) => c.type === 'passive_voice');
    // "was happy" — happy does not end in -ed, so no match
    // "was there" — there is not -ed, so no match
    for (const m of passiveMatches) {
      // Any actual passive match must contain "ed" at the end
      expect(m.text.toLowerCase()).toMatch(/\w+ed$/);
    }
  });
});

// ─── Doubled words ────────────────────────────────────────────────────────────

describe('ProseAnalyzer — doubled word detection', () => {
  it('finds "end result" (lowercase)', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('The end result was disappointing.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'doubled_word');
    expect(matches.some((c) => c.text.toLowerCase() === 'end result')).toBe(true);
  });

  it('finds "END RESULT" (uppercase — case-insensitive)', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('THE END RESULT WAS CLEAR.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'doubled_word');
    expect(matches.some((c) => c.text.toLowerCase() === 'end result')).toBe(true);
  });

  it('doubled words carry severity "error"', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText('It was a free gift for everyone.', 'ch.md');
    const matches = result.checks.filter((c) => c.type === 'doubled_word');
    for (const m of matches) {
      expect(m.severity).toBe('error');
    }
  });
});

// ─── Sentence monotony ────────────────────────────────────────────────────────

describe('ProseAnalyzer — sentence monotony detection', () => {
  it('flags a paragraph where all sentences are ~10 words (stddev < 3)', () => {
    const analyzer = new ProseAnalyzer('/fake');
    // 4 sentences, each exactly 10 words → stddev ≈ 0
    const text = [
      'The cat sat on the mat in the sun.',   // 10 words
      'The dog ran across the field to the barn.',  // 10 words (approx)
      'She walked down the path through the old gate.',  // 10 words (approx)
      'He closed his eyes and heard the distant bells.',  // 10 words (approx)
    ].join(' ');
    const result = analyzer._analyzeText(text, 'ch.md');
    const monotony = result.checks.filter((c) => c.type === 'sentence_monotony');
    expect(monotony.length).toBeGreaterThan(0);
  });

  it('does NOT flag a paragraph with varied sentence lengths', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const text = [
      'Run.',
      'She sprinted.',
      'Her lungs burned with every desperate, gasping, aching breath she took.',
      'She collapsed.',
      'Nothing moved.',
    ].join(' ');
    const result = analyzer._analyzeText(text, 'ch.md');
    const monotony = result.checks.filter((c) => c.type === 'sentence_monotony');
    expect(monotony.length).toBe(0);
  });
});

// ─── Word repetition ──────────────────────────────────────────────────────────

describe('ProseAnalyzer — word repetition detection', () => {
  it('flags "decided" used 4× in a 300-word window', () => {
    const analyzer = new ProseAnalyzer('/fake');
    // Build a short paragraph that includes "decided" four times
    const filler = 'He walked to the corner and paused for a moment. ';
    const sentences =
      filler.repeat(10) +
      'He decided to leave. ' +
      filler.repeat(5) +
      'She decided to stay. ' +
      filler.repeat(5) +
      'They decided together. ' +
      filler.repeat(5) +
      'Finally, he decided against it.';

    const result = analyzer._analyzeText(sentences, 'ch.md');
    const repetitions = result.checks.filter((c) => c.type === 'word_repetition');
    expect(repetitions.some((c) => c.text === 'decided')).toBe(true);
  });

  it('does NOT flag words in the stop list', () => {
    const analyzer = new ProseAnalyzer('/fake');
    // "which" is in stop list; repeat it many times
    const text = Array(20).fill('This is the thing which matters, which stands, which calls, which builds, which grows.').join(' ');
    const result = analyzer._analyzeText(text, 'ch.md');
    const repetitions = result.checks.filter(
      (c) => c.type === 'word_repetition' && c.text === 'which'
    );
    expect(repetitions.length).toBe(0);
  });
});

// ─── Economy score ────────────────────────────────────────────────────────────

describe('ProseAnalyzer — economy score', () => {
  it('returns 100 for clean text with no intensifiers or filter words', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText(
      'The door swung open. She stepped inside. Cold air swept past her.',
      'ch.md'
    );
    expect(result.economyScore).toBe(100);
  });

  it('returns < 100 for text containing intensifiers', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText(
      'It was very very very bad and really quite awful indeed.',
      'ch.md'
    );
    expect(result.economyScore).toBeLessThan(100);
  });

  it('economy score is clamped to [0, 100]', () => {
    const analyzer = new ProseAnalyzer('/fake');
    // Extreme case: one word that is itself an intensifier
    const result = analyzer._analyzeText('very', 'ch.md');
    expect(result.economyScore).toBeGreaterThanOrEqual(0);
    expect(result.economyScore).toBeLessThanOrEqual(100);
  });
});

// ─── Code fence skipping ──────────────────────────────────────────────────────

describe('ProseAnalyzer — code fence skipping', () => {
  it('does not fire intensifier checks inside a triple-backtick fence', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const text = [
      'Normal prose here.',
      '```',
      'very really quite extremely absolutely',
      '```',
      'More normal prose.',
    ].join('\n');

    const result = analyzer._analyzeText(text, 'ch.md');
    const intensifiers = result.checks.filter((c) => c.type === 'intensifier');
    // There should be zero — all intensifiers are inside the fence
    expect(intensifiers.length).toBe(0);
  });

  it('does not fire filter-word checks inside a tilde fence', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const text = [
      '~~~',
      'He felt noticed and heard everything.',
      '~~~',
    ].join('\n');

    const result = analyzer._analyzeText(text, 'ch.md');
    const filterWords = result.checks.filter((c) => c.type === 'filter_word');
    expect(filterWords.length).toBe(0);
  });
});

// ─── analyzeChapter with a real file ─────────────────────────────────────────

describe('ProseAnalyzer.analyzeChapter()', () => {
  let tmpDir: string;
  let chapterFile: string;

  beforeEach(async () => {
    const setup = await createTempChapter(
      'The hero walked quickly. She felt a cold wind. The end result was clear.\n'
    );
    tmpDir = setup.dir;
    chapterFile = path.join(tmpDir, 'chapters', setup.file);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns a ProseAnalysisResult with a correct wordCount', async () => {
    const analyzer = new ProseAnalyzer(tmpDir);
    const result = await analyzer.analyzeChapter(chapterFile);

    expect(result).toMatchObject({
      chapterFile: expect.any(String),
      wordCount: expect.any(Number),
      economyScore: expect.any(Number),
      dialoguePercent: expect.any(Number),
      checks: expect.any(Array),
    });

    // "The hero walked quickly. She felt a cold wind. The end result was clear."
    // = 14 words
    expect(result.wordCount).toBe(14);
  });

  it('detects filter_word "felt" in the temp file', async () => {
    const analyzer = new ProseAnalyzer(tmpDir);
    const result = await analyzer.analyzeChapter(chapterFile);
    const filterWords = result.checks.filter((c) => c.type === 'filter_word');
    expect(filterWords.some((c) => c.text.toLowerCase() === 'felt')).toBe(true);
  });

  it('detects doubled_word "end result" in the temp file', async () => {
    const analyzer = new ProseAnalyzer(tmpDir);
    const result = await analyzer.analyzeChapter(chapterFile);
    const doubled = result.checks.filter((c) => c.type === 'doubled_word');
    expect(doubled.some((c) => c.text.toLowerCase() === 'end result')).toBe(true);
  });

  it('chapterNumber is inferred from "chapter-01.md"', async () => {
    const analyzer = new ProseAnalyzer(tmpDir);
    const result = await analyzer.analyzeChapter(chapterFile);
    expect(result.chapterNumber).toBe(1);
  });
});

// ─── On-the-nose dialogue ─────────────────────────────────────────────────────

describe('ProseAnalyzer — on-the-nose dialogue detection', () => {
  it('flags "As you know, Bob" pattern', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText(
      '"As you know, the treaty was signed in 1845," she said.',
      'ch.md'
    );
    const matches = result.checks.filter((c) => c.type === 'on_the_nose_dialogue');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('flags "Remember when" opener', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText(
      '"Remember when we used to play here?" he asked.',
      'ch.md'
    );
    const matches = result.checks.filter((c) => c.type === 'on_the_nose_dialogue');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('flags "You know that" opener', () => {
    const analyzer = new ProseAnalyzer('/fake');
    const result = analyzer._analyzeText(
      '"You know that the law forbids it," she whispered.',
      'ch.md'
    );
    const matches = result.checks.filter((c) => c.type === 'on_the_nose_dialogue');
    expect(matches.length).toBeGreaterThan(0);
  });
});
