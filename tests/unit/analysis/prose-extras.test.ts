/**
 * Unit tests for ProseAnalyzer extras (CRAFT-03 / PROC-05) and
 * ManuscriptAssembler.generateExportHeader (PROC-09).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ProseAnalyzer } from '../../../project/src/analysis/prose-analyzer.js';
import { ManuscriptAssembler } from '../../../project/src/builders/manuscript-assembler.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

interface TempProject {
  dir: string;
}

/**
 * Create a temp project directory with a `chapters/` subdir and write
 * one chapter file (chapter-01.md) with the given body.
 */
async function createTempProject(chapterContent: string): Promise<TempProject> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prose-extras-test-'));
  const chaptersDir = path.join(dir, 'chapters');
  await fs.mkdir(chaptersDir);
  await fs.writeFile(
    path.join(chaptersDir, 'chapter-01.md'),
    chapterContent,
    'utf-8'
  );
  return { dir };
}

async function cleanupTempProject(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

// ─── extractDialogueByCharacter ──────────────────────────────────────────────

describe('ProseAnalyzer.extractDialogueByCharacter', () => {
  const analyzer = new ProseAnalyzer('/fake');

  it('groups attributed dialogue under the speaker name — "text," said Name', () => {
    const text = `She smiled at him. "Hello, how are you," said Sarah and walked away.`;
    const result = analyzer.extractDialogueByCharacter(text);
    expect(result.has('Sarah')).toBe(true);
    const lines = result.get('Sarah')!;
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('Hello');
  });

  it('groups attributed dialogue under the speaker name — Name said "text"', () => {
    const text = `John said "I cannot believe this happened."`;
    const result = analyzer.extractDialogueByCharacter(text);
    expect(result.has('John')).toBe(true);
  });

  it('groups unattributed dialogue under "Unknown"', () => {
    const text = `"Get out of here!" The door slammed shut.`;
    const result = analyzer.extractDialogueByCharacter(text);
    expect(result.has('Unknown')).toBe(true);
    const lines = result.get('Unknown')!;
    expect(lines.some((l) => l.includes('Get out'))).toBe(true);
  });

  it('handles multiple speakers', () => {
    const text = [
      `"Ready?" asked Sarah.`,
      `Tom replied "Almost."`,
      `"Now!"`,
    ].join(' ');
    const result = analyzer.extractDialogueByCharacter(text);
    expect(result.has('Sarah')).toBe(true);
    expect(result.has('Tom')).toBe(true);
    expect(result.has('Unknown')).toBe(true);
  });

  it('returns empty map for text with no dialogue', () => {
    const text = 'The sun rose over the mountains. Birds sang in the trees.';
    const result = analyzer.extractDialogueByCharacter(text);
    expect(result.size).toBe(0);
  });
});

// ─── analyzeCharacterVoices ───────────────────────────────────────────────────

describe('ProseAnalyzer.analyzeCharacterVoices', () => {
  const analyzer = new ProseAnalyzer('/fake');

  it('returns an entry for each speaker', () => {
    const text = [
      `Sarah said "I want to go home. I miss my family. I hate it here."`,
      `Tom replied "Sure thing."`,
      `"Help!"`,
    ].join(' ');
    const voices = analyzer.analyzeCharacterVoices(text);
    const speakers = voices.map((v) => v.speaker);
    expect(speakers).toContain('Sarah');
    expect(speakers).toContain('Tom');
    expect(speakers).toContain('Unknown');
  });

  it('counts dialogue lines correctly', () => {
    const text = [
      `Sarah said "Line one."`,
      `Sarah asked "Line two?"`,
    ].join(' ');
    const voices = analyzer.analyzeCharacterVoices(text);
    const sarah = voices.find((v) => v.speaker === 'Sarah');
    expect(sarah).toBeDefined();
    expect(sarah!.lineCount).toBe(2);
  });

  it('computes avgSentenceLength > 0 for non-empty dialogue', () => {
    const text = `Sarah said "I am going to the market today."`;
    const voices = analyzer.analyzeCharacterVoices(text);
    const sarah = voices.find((v) => v.speaker === 'Sarah');
    expect(sarah!.avgSentenceLength).toBeGreaterThan(0);
  });
});

// ─── analyzeSensoryBalance ────────────────────────────────────────────────────

describe('ProseAnalyzer.analyzeSensoryBalance', () => {
  const analyzer = new ProseAnalyzer('/fake');

  it('flags text with only visual words (> 10 total, > 80% visual)', () => {
    // 11 visual words, 0 of any other sense
    const text = [
      'She saw the bright light and watched the dark shadow.',
      'He looked at the visible color and glimpsed the glow.',
      'They stared at the scene and noticed the glare.',
    ].join(' ');
    const result = analyzer.analyzeSensoryBalance(text);
    expect(result.visual).toBeGreaterThan(10);
    expect(result.flag).toBe(true);
  });

  it('does not flag text with mixed sensory words', () => {
    const text = [
      'She saw the bright light.',  // visual
      'She heard the loud voice.',  // auditory
      'She felt the rough texture.', // tactile
      'She smelled the aroma.',      // olfactory
      'She tasted the bitter flavor.', // gustatory
      // add more visuals to reach > 10 total but keep visual < 80%
      'He noticed the dark shadow and spotted the glimmer.',
      'The looked at the scene and glimpsed the color.',
    ].join(' ');
    const result = analyzer.analyzeSensoryBalance(text);
    expect(result.flag).toBe(false);
  });

  it('does not flag text with < 10 total sensory words even if all visual', () => {
    const text = 'She saw the light and noticed the shadow.'; // ~4 visual words
    const result = analyzer.analyzeSensoryBalance(text);
    expect(result.flag).toBe(false);
  });

  it('counts auditory words correctly', () => {
    const text = 'She heard the noise. The silence was loud. A voice echoed.';
    const result = analyzer.analyzeSensoryBalance(text);
    expect(result.auditory).toBeGreaterThan(0);
  });
});

// ─── analyzeShowVsTell ────────────────────────────────────────────────────────

describe('ProseAnalyzer.analyzeShowVsTell', () => {
  const analyzer = new ProseAnalyzer('/fake');

  it('identifies "she slammed the door" as a show indicator', () => {
    const text = 'She slammed the door and ran down the hallway.';
    const result = analyzer.analyzeShowVsTell(text);
    expect(result.showScore).toBeGreaterThan(0);
    const showEx = result.examples.filter((e) => e.type === 'show');
    expect(showEx.length).toBeGreaterThan(0);
  });

  it('identifies "she was angry" as a tell indicator', () => {
    const text = 'She was angry at him for what he had done.';
    const result = analyzer.analyzeShowVsTell(text);
    expect(result.tellScore).toBeGreaterThan(0);
    const tellEx = result.examples.filter((e) => e.type === 'tell');
    expect(tellEx.length).toBeGreaterThan(0);
  });

  it('returns ratio > 0.5 for action-heavy text', () => {
    const text = [
      'She ran to the window.',
      'He jumped over the fence.',
      'She slammed her fist on the table.',
      'He grabbed the handle and pulled.',
      'She stepped back and shook her head.',
      'He froze at the sight.',
      'She trembled and leaned against the wall.',
    ].join(' ');
    const result = analyzer.analyzeShowVsTell(text);
    expect(result.ratio).toBeGreaterThan(0.5);
  });

  it('returns ratio = 0 when only tell indicators present', () => {
    const text = [
      'She was sad.',
      'He was afraid.',
      'They were excited about the news.',
    ].join(' ');
    const result = analyzer.analyzeShowVsTell(text);
    expect(result.ratio).toBe(0);
    expect(result.tellScore).toBeGreaterThan(0);
  });

  it('limits examples to 3 of each type', () => {
    const text = [
      'She was angry. He was sad. They were afraid.',
      'She was excited. He was nervous. They were calm.',
      'She ran. He walked. They jumped.',
      'She slammed. He grabbed. They froze.',
    ].join(' ');
    const result = analyzer.analyzeShowVsTell(text);
    const showExamples = result.examples.filter((e) => e.type === 'show');
    const tellExamples = result.examples.filter((e) => e.type === 'tell');
    expect(showExamples.length).toBeLessThanOrEqual(3);
    expect(tellExamples.length).toBeLessThanOrEqual(3);
  });
});

// ─── ManuscriptAssembler.generateExportHeader ─────────────────────────────────

describe('ManuscriptAssembler.generateExportHeader', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'export-header-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * Create a chapter file with YAML frontmatter and body content.
   */
  async function addChapter(
    dir: string,
    num: number,
    title: string,
    wordCount: number
  ): Promise<void> {
    const chaptersDir = path.join(dir, 'chapters');
    await fs.mkdir(chaptersDir, { recursive: true });
    const body = Array.from({ length: wordCount }, (_, i) => `word${i}`).join(' ');
    const content = `---\ntitle: ${title}\nnumber: ${num}\nstatus: drafted\n---\n${body}`;
    await fs.writeFile(
      path.join(chaptersDir, `chapter-0${num}.md`),
      content,
      'utf-8'
    );
  }

  it('contains "WORD COUNT" in the header', async () => {
    await addChapter(tmpDir, 1, 'The Beginning', 500);
    const assembler = new ManuscriptAssembler(tmpDir);
    const header = await assembler.generateExportHeader(
      { title: 'My Novel', author: 'Jane Doe', genre: 'Fantasy' }
    );
    expect(header).toContain('WORD COUNT');
  });

  it('contains "TABLE OF CONTENTS" in the header', async () => {
    await addChapter(tmpDir, 1, 'The Beginning', 500);
    const assembler = new ManuscriptAssembler(tmpDir);
    const header = await assembler.generateExportHeader(
      { title: 'My Novel', author: 'Jane Doe' }
    );
    expect(header).toContain('TABLE OF CONTENTS');
  });

  it('includes the project title', async () => {
    await addChapter(tmpDir, 1, 'First Chapter', 100);
    const assembler = new ManuscriptAssembler(tmpDir);
    const header = await assembler.generateExportHeader(
      { title: 'Epic Journey', author: 'Author Name' }
    );
    expect(header).toContain('Epic Journey');
  });

  it('lists chapter titles in the TOC', async () => {
    await addChapter(tmpDir, 1, 'The Beginning', 300);
    await addChapter(tmpDir, 2, 'The Middle', 300);
    const assembler = new ManuscriptAssembler(tmpDir);
    const header = await assembler.generateExportHeader(
      { title: 'My Novel', author: 'Author Name' }
    );
    expect(header).toContain('The Beginning');
    expect(header).toContain('The Middle');
  });

  it('shows CHAPTERS count', async () => {
    await addChapter(tmpDir, 1, 'One', 200);
    await addChapter(tmpDir, 2, 'Two', 200);
    const assembler = new ManuscriptAssembler(tmpDir);
    const header = await assembler.generateExportHeader(
      { title: 'Test', author: 'Author' }
    );
    expect(header).toContain('CHAPTERS: 2');
  });

  it('returns empty header when no chapters exist', async () => {
    // Create chapters dir but no files
    await fs.mkdir(path.join(tmpDir, 'chapters'));
    const assembler = new ManuscriptAssembler(tmpDir);
    const header = await assembler.generateExportHeader(
      { title: 'Empty', author: 'Nobody' }
    );
    expect(header).toContain('WORD COUNT: 0 words');
    expect(header).toContain('CHAPTERS: 0');
  });
});
