/**
 * Unit tests: VoiceAnalyzer — manuscript-level character voice analysis.
 *
 * Builds a sample multi-chapter manuscript in a temp dir with:
 *   - Alice & Bob: short, plain, common-word dialogue → voices too alike.
 *   - Victoria:    long, elaborate, sophisticated dialogue → distinct.
 *   - Sam:         plain in ch1, elaborate in ch2 → drifting voice.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  VoiceAnalyzer,
  fingerprintDistance,
  SIMILAR_VOICE_THRESHOLD,
} from '../../../project/src/analysis/voice-analyzer.js';

let dir: string;
let chaptersDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'voice-analyzer-'));
  chaptersDir = join(dir, 'chapters');
  mkdirSync(chaptersDir, { recursive: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ─── Sample manuscript ────────────────────────────────────────────────────────

const CHAPTER_01 = `---
title: Chapter One
---

"I want to go home now," said Alice.
"We can eat the food here," said Alice.
"He is a good kind man," said Alice.

"You must go to the door," said Bob.
"They will see the new car," said Bob.
"She had a long good day," said Bob.

"Consequently, the extraordinary circumstances surrounding our predicament necessitate considerable deliberation," said Victoria.
"Furthermore, the philosophical implications underlying revolutionary discoveries fundamentally transform contemporary understanding," said Victoria.
"Nevertheless, the magnificent architecture demonstrates remarkable craftsmanship throughout subsequent generations," said Victoria.

"I see the big red sun," said Sam.
"We run to the old barn," said Sam.
"It was a fun warm day," said Sam.
`;

const CHAPTER_02 = `---
title: Chapter Two
---

"Let us walk by the sea," said Alice.
"The cat sat on the mat," said Alice.
"I like to read good books," said Alice.

"He ran to the big tree," said Bob.
"We sat near the warm fire," said Bob.
"They had a fine long meal," said Bob.

"Theoretically, the unprecedented technological advancements inevitably revolutionize conventional methodologies governing production," said Victoria.
"Additionally, the intricate psychological complexities characterizing human relationships perpetually fascinate discerning observers," said Victoria.
"Conversely, the controversial governmental regulations substantially undermine entrepreneurial innovation nationwide," said Victoria.

"Consequently, the remarkable philosophical observations fundamentally transform our collective understanding regarding existence," said Sam.
"Furthermore, the extraordinary revelations undeniably necessitate considerable intellectual reconsideration throughout society," said Sam.
"Nevertheless, the magnificent achievements demonstrate unprecedented creative brilliance spanning numerous disciplines," said Sam.
`;

function writeManuscript(): void {
  writeFileSync(join(chaptersDir, 'chapter-01.md'), CHAPTER_01, 'utf-8');
  writeFileSync(join(chaptersDir, 'chapter-02.md'), CHAPTER_02, 'utf-8');
}

/** True if the similar-pairs list contains the unordered pair {x, y}. */
function hasPair(
  pairs: { a: string; b: string }[],
  x: string,
  y: string
): boolean {
  return pairs.some(
    (p) => (p.a === x && p.b === y) || (p.a === y && p.b === x)
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('VoiceAnalyzer.analyzeManuscript', () => {
  it('returns an empty report when there are no chapters', async () => {
    const report = await new VoiceAnalyzer(dir).analyzeManuscript();
    // chapters/ exists but is empty.
    expect(report.characters).toEqual([]);
    expect(report.similarPairs).toEqual([]);
    expect(report.drifting).toEqual([]);
  });

  it('aggregates a fingerprint per character across chapters', async () => {
    writeManuscript();
    const report = await new VoiceAnalyzer(dir).analyzeManuscript();

    const names = report.characters.map((c) => c.character).sort();
    expect(names).toEqual(['Alice', 'Bob', 'Sam', 'Victoria']);

    const alice = report.characters.find((c) => c.character === 'Alice')!;
    expect(alice.lineCount).toBe(6);
    expect(alice.chapterCount).toBe(2);
    expect(alice.perChapter).toHaveLength(2);
    expect(alice.fingerprint.typeTokenRatio).toBeGreaterThan(0);
    expect(alice.fingerprint.avgSentenceLength).toBeGreaterThan(0);

    // 'Unknown' speakers are never reported.
    expect(names).not.toContain('Unknown');
  });

  it('flags characters whose voices are too similar', async () => {
    writeManuscript();
    const report = await new VoiceAnalyzer(dir).analyzeManuscript();

    // Alice and Bob share the same plain, short-word style → flagged.
    expect(hasPair(report.similarPairs, 'Alice', 'Bob')).toBe(true);
  });

  it('does NOT flag a distinct voice as similar to others', async () => {
    writeManuscript();
    const report = await new VoiceAnalyzer(dir).analyzeManuscript();

    // Victoria's elaborate voice must not be paired with anyone.
    const victoriaPairs = report.similarPairs.filter(
      (p) => p.a === 'Victoria' || p.b === 'Victoria'
    );
    expect(victoriaPairs).toEqual([]);
  });

  it('flags a character whose voice drifts across chapters', async () => {
    writeManuscript();
    const report = await new VoiceAnalyzer(dir).analyzeManuscript();

    // Sam goes from plain (ch1) to elaborate (ch2) → drift.
    const sam = report.drifting.find((d) => d.character === 'Sam');
    expect(sam).toBeDefined();
    expect(sam!.outlierChapters.length).toBeGreaterThan(0);

    // Victoria is consistent across chapters → not drifting.
    expect(report.drifting.some((d) => d.character === 'Victoria')).toBe(false);
  });
});

describe('fingerprintDistance', () => {
  it('returns 0 for identical fingerprints', () => {
    const fp = {
      avgSentenceLength: 6,
      avgWordLength: 4,
      typeTokenRatio: 0.8,
      topBigrams: [],
    };
    expect(fingerprintDistance(fp, fp)).toBe(0);
  });

  it('grows with feature divergence and crosses the similarity threshold', () => {
    const plain = {
      avgSentenceLength: 6,
      avgWordLength: 4,
      typeTokenRatio: 0.8,
      topBigrams: [],
    };
    const elaborate = {
      avgSentenceLength: 18,
      avgWordLength: 8,
      typeTokenRatio: 0.95,
      topBigrams: [],
    };
    expect(fingerprintDistance(plain, elaborate)).toBeGreaterThan(
      SIMILAR_VOICE_THRESHOLD
    );
  });
});
