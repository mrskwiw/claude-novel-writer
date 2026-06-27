/**
 * Unit tests for ReadAloudPreparer (CRAFT-05)
 */

import { describe, it, expect } from 'vitest';
import { ReadAloudPreparer } from '../../../project/src/analysis/read-aloud.js';

// ─── stripMarkup ─────────────────────────────────────────────────────────────

describe('ReadAloudPreparer.stripMarkup()', () => {
  it('removes YAML frontmatter between --- markers', () => {
    const raw = `---
title: My Novel
chapter: 1
---
This is the prose text.`;
    const result = ReadAloudPreparer.stripMarkup(raw);
    expect(result).not.toContain('title:');
    expect(result).not.toContain('chapter:');
    expect(result).toContain('This is the prose text.');
  });

  it('keeps prose text intact when no frontmatter is present', () => {
    const raw = 'She walked into the room and paused.';
    const result = ReadAloudPreparer.stripMarkup(raw);
    expect(result).toBe('She walked into the room and paused.');
  });

  it('removes <!-- comment --> patterns', () => {
    const raw = `The rain fell hard.
<!-- This is a comment that should be removed -->
She ran for cover.`;
    const result = ReadAloudPreparer.stripMarkup(raw);
    expect(result).not.toContain('<!--');
    expect(result).not.toContain('-->');
    expect(result).not.toContain('This is a comment');
    expect(result).toContain('The rain fell hard.');
    expect(result).toContain('She ran for cover.');
  });

  it('removes multi-line <!-- ... --> comments', () => {
    const raw = `First sentence.
<!-- This is
a multi-line
comment -->
Second sentence.`;
    const result = ReadAloudPreparer.stripMarkup(raw);
    expect(result).not.toContain('multi-line');
    expect(result).toContain('First sentence.');
    expect(result).toContain('Second sentence.');
  });

  it('removes [TK: ...] markers', () => {
    const raw = 'He reached into his pocket [TK: add detail here] and pulled out the key.';
    const result = ReadAloudPreparer.stripMarkup(raw);
    expect(result).not.toContain('[TK:');
    expect(result).not.toContain('add detail here');
    expect(result).toContain('He reached into his pocket');
    expect(result).toContain('and pulled out the key.');
  });

  it('removes [TODO: ...] markers', () => {
    const raw = 'The battle began [TODO: expand this scene] with a single shot.';
    const result = ReadAloudPreparer.stripMarkup(raw);
    expect(result).not.toContain('[TODO:');
    expect(result).not.toContain('expand this scene');
    expect(result).toContain('The battle began');
    expect(result).toContain('with a single shot.');
  });

  it('removes [VERIFY: ...] and other ALL-CAPS bracket markers', () => {
    const raw = 'The year was 1943 [VERIFY: check historical date] when the war ended.';
    const result = ReadAloudPreparer.stripMarkup(raw);
    expect(result).not.toContain('[VERIFY:');
    expect(result).toContain('The year was 1943');
  });

  it('keeps plain prose text intact', () => {
    const prose = [
      'She stood at the window, watching the storm approach.',
      '',
      'The lightning split the sky. Thunder followed three seconds later.',
      'She counted it out of habit, a trick her father had taught her.',
    ].join('\n');
    const result = ReadAloudPreparer.stripMarkup(prose);
    expect(result).toContain('She stood at the window');
    expect(result).toContain('The lightning split the sky.');
    expect(result).toContain('a trick her father had taught her.');
  });

  it('removes scene delimiter lines', () => {
    const raw = `She opened the door.

--- Scene 2 ---

The room was empty.`;
    const result = ReadAloudPreparer.stripMarkup(raw);
    expect(result).not.toContain('--- Scene 2 ---');
    expect(result).toContain('She opened the door.');
    expect(result).toContain('The room was empty.');
  });
});

// ─── Rhythm detection ────────────────────────────────────────────────────────

describe('ReadAloudPreparer — rhythm flag detection', () => {
  it('fires a rhythm flag when 4+ sentences are all the same length (stddev < 2)', () => {
    // 4 sentences each exactly 10 words (stddev = 0)
    const para = [
      'The cat sat on the mat and looked around.',    // 9 words → adjust
      'She walked down the long and winding river road.',  // 10 words
      'He ran across the field with speed and grace.',     // 9 words → adjust
      'They stood beneath the old and heavy oak tree.',    // 9 words → adjust
    ].join(' ');

    // Build exactly 4 sentences of 10 words each
    const sentences = [
      'The cat sat on the mat today here.',        // 9 words
      'She walked down the long winding river.',    // 7 words
    ];
    // Use a carefully constructed paragraph where all sentences are 10 words
    const tenWordSentences = [
      'The old man walked slowly down the narrow street.',        // 10
      'She looked up and saw the storm approaching from above.',  // 10
      'He reached into his coat and felt the cold key.',         // 11 → use different
      'They ran across the field and hid behind the barn.',      // 10
    ];
    // Simpler: construct with exactly equal lengths
    const uniform = [
      'One two three four five six seven eight nine ten.',   // 10 words
      'The quick brown fox jumped over the lazy white dog.', // 10 words
      'She saw the man standing still across the dark room.', // 10 words
      'He ran back home through rain and fog and wind.',      // 10 words
    ].join(' ');

    const result = ReadAloudPreparer.analyzeText(uniform);
    expect(result.rhythmFlags.length).toBeGreaterThan(0);
    expect(result.rhythmFlags[0].note).toMatch(/sentence/i);
  });

  it('does NOT fire a rhythm flag for only 2 sentences (minimum 4 required)', () => {
    const twoSentences = 'She walked into the room. He turned around.';
    const result = ReadAloudPreparer.analyzeText(twoSentences);
    expect(result.rhythmFlags.length).toBe(0);
  });

  it('does NOT fire a rhythm flag when sentence lengths vary significantly', () => {
    const varied = [
      'She walked.',                                                          // 2 words
      'He ran across the empty field toward the distant horizon of trees.',   // 12 words
      'Yes.',                                                                 // 1 word
      'The storm came quickly and without any warning from the forecast.',    // 11 words
    ].join(' ');

    const result = ReadAloudPreparer.analyzeText(varied);
    expect(result.rhythmFlags.length).toBe(0);
  });
});

// ─── Rhyme detection ─────────────────────────────────────────────────────────

describe('ReadAloudPreparer — rhyme flag detection', () => {
  it('catches rhymes like "nation" / "station" within 3 lines', () => {
    const text = [
      'She arrived at the nation.',
      'The train pulled into the station.',
    ].join('\n');

    const result = ReadAloudPreparer.analyzeText(text);
    const rhyming = result.rhymeFlags.filter(
      (f) =>
        (f.words[0] === 'nation' && f.words[1] === 'station') ||
        (f.words[0] === 'station' && f.words[1] === 'nation')
    );
    expect(rhyming.length).toBeGreaterThan(0);
  });

  it('does not flag short words like "the" / "she" (suffix < 3 chars)', () => {
    // "the" and "she" share suffix "he" (2 chars) — below RHYME_SUFFIX_LENGTH of 3
    const text = 'He gave it to the.\nThen came she.';
    const result = ReadAloudPreparer.analyzeText(text);
    const shortRhymes = result.rhymeFlags.filter(
      (f) =>
        (f.words.includes('the') && f.words.includes('she')) ||
        f.words.some((w) => w.length < 3)
    );
    expect(shortRhymes.length).toBe(0);
  });

  it('does not flag the same word repeated (not a rhyme)', () => {
    const text = 'He stood at the door.\nShe knocked on the door.';
    const result = ReadAloudPreparer.analyzeText(text);
    const sameWordFlags = result.rhymeFlags.filter(
      (f) => f.words[0] === f.words[1]
    );
    expect(sameWordFlags.length).toBe(0);
  });

  it('catches "light" / "night" within 3 lines', () => {
    const text = [
      'The lantern cast its pale and trembling light.',
      'The village fell silent in the cold dark night.',
    ].join('\n');

    const result = ReadAloudPreparer.analyzeText(text);
    const rhyming = result.rhymeFlags.filter(
      (f) =>
        (f.words.includes('light') && f.words.includes('night'))
    );
    expect(rhyming.length).toBeGreaterThan(0);
  });

  it('does not flag rhymes more than 3 sentences apart', () => {
    // Place two rhyming words 5 sentences apart so they exceed the RHYME_WINDOW
    const text = [
      'She walked toward the light.',   // sentence 1 — "light"
      'The path was wide and clear.',   // sentence 2
      'He called out from behind.',     // sentence 3
      'The answer never came at all.',  // sentence 4
      'She found the darkness of night.', // sentence 5 — "night" (5 away from "light")
    ].join(' ');

    const result = ReadAloudPreparer.analyzeText(text);
    // "light" and "night" share suffix "ight" — but they're 4 sentences apart
    // With RHYME_WINDOW=3, sentence 5 compares against 2, 3, 4 — NOT sentence 1
    const lightNight = result.rhymeFlags.filter(
      (f) => f.words.includes('light') && f.words.includes('night')
    );
    expect(lightNight.length).toBe(0);
  });
});

// ─── estimatedMinutes ────────────────────────────────────────────────────────

describe('ReadAloudPreparer — estimatedMinutes', () => {
  it('calculates estimatedMinutes as wordCount / 150, rounded to 1 decimal', () => {
    // 150 words → exactly 1.0 minute
    const words150 = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
    const result = ReadAloudPreparer.analyzeText(words150);
    expect(result.wordCount).toBe(150);
    expect(result.estimatedMinutes).toBe(1.0);
  });

  it('rounds to 1 decimal place', () => {
    // 300 words → 2.0 min
    const words300 = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
    const result = ReadAloudPreparer.analyzeText(words300);
    expect(result.estimatedMinutes).toBe(2.0);
  });

  it('returns 0.0 for empty text', () => {
    const result = ReadAloudPreparer.analyzeText('');
    expect(result.wordCount).toBe(0);
    expect(result.estimatedMinutes).toBe(0);
  });

  it('calculates correctly for non-round word counts', () => {
    // 75 words → 0.5 min (75/150 = 0.5)
    const words75 = Array.from({ length: 75 }, (_, i) => `word${i}`).join(' ');
    const result = ReadAloudPreparer.analyzeText(words75);
    expect(result.estimatedMinutes).toBe(0.5);
  });
});

// ─── wordCount ───────────────────────────────────────────────────────────────

describe('ReadAloudPreparer — wordCount', () => {
  it('counts words in clean prose', () => {
    const result = ReadAloudPreparer.analyzeText('one two three four five');
    expect(result.wordCount).toBe(5);
  });

  it('does not count stripped markup in word count', () => {
    const raw = `---
title: Test
---
One two three.`;
    const result = ReadAloudPreparer.analyzeText(raw);
    expect(result.wordCount).toBe(3);
  });
});
