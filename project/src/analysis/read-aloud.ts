/**
 * ReadAloudPreparer — CRAFT-05 Text-to-Speech / Read-Aloud Support
 *
 * Strips manuscript markup, measures rhythm, and detects unintentional rhymes.
 *
 * Philosophy: "Reading aloud reveals weak parts." — Hemingway / Harrison
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface RhythmFlag {
  /** 1-based line number of the first line in the paragraph */
  paragraphStart: number;
  /** Human-readable note, e.g. "All 5 sentences within 2 words of same length" */
  note: string;
}

export interface RhymeFlag {
  /** 1-based line number of the earlier sentence */
  lineA: number;
  /** 1-based line number of the later sentence */
  lineB: number;
  /** The two rhyming words */
  words: [string, string];
}

export interface ReadAloudResult {
  /** Prose text with all markup stripped, ready for TTS or display */
  cleanText: string;
  /** Total word count of the clean text */
  wordCount: number;
  /** Estimated reading time in minutes (wordCount / 150, 1 decimal place) */
  estimatedMinutes: number;
  /** Paragraphs whose sentence lengths are suspiciously uniform */
  rhythmFlags: RhythmFlag[];
  /** Sentence-end word pairs that unintentionally rhyme within 3 lines */
  rhymeFlags: RhymeFlag[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Average spoken reading speed (words per minute) */
const READING_WPM = 150;

/** Minimum number of sentences in a paragraph to trigger a rhythm check */
const MIN_SENTENCES_FOR_RHYTHM = 4;

/** Maximum standard deviation of sentence lengths to fire a rhythm flag */
const RHYTHM_STDDEV_THRESHOLD = 2;

/** Minimum suffix length for rhyme detection */
const RHYME_SUFFIX_LENGTH = 3;

/** How many preceding sentences to compare for rhyme detection */
const RHYME_WINDOW = 3;

// ─── Main class ───────────────────────────────────────────────────────────────

/**
 * Prepares a chapter file for reading aloud.
 *
 * Usage:
 * ```ts
 * const preparer = new ReadAloudPreparer('/path/to/novel');
 * const result = await preparer.prepareChapter('chapters/chapter-01.md');
 * ```
 */
export class ReadAloudPreparer {
  constructor(private readonly projectPath: string) {}

  /**
   * Read and prepare a chapter file for read-aloud / TTS.
   *
   * Steps:
   * 1. Read the file from `<projectPath>/<chapterFile>`
   * 2. Strip markup via `ReadAloudPreparer.stripMarkup()`
   * 3. Run rhythm analysis on each paragraph
   * 4. Detect unintentional rhymes across sentence endings
   * 5. Compute word count and estimated reading time
   *
   * @param chapterFile - Relative path from projectPath, e.g. `chapters/chapter-01.md`
   */
  async prepareChapter(chapterFile: string): Promise<ReadAloudResult> {
    const filePath = join(this.projectPath, chapterFile);
    const raw = await readFile(filePath, 'utf-8');
    return ReadAloudPreparer.analyzeText(raw);
  }

  /**
   * Analyse already-loaded text (useful for testing without a real file).
   * Exposed as a static so tests and handlers can call it directly.
   *
   * @param raw - Raw file content (may include frontmatter, comments, etc.)
   */
  static analyzeText(raw: string): ReadAloudResult {
    const cleanText = ReadAloudPreparer.stripMarkup(raw);
    const wordCount = ReadAloudPreparer._countWords(cleanText);
    const estimatedMinutes =
      Math.round((wordCount / READING_WPM) * 10) / 10;

    const { rhythmFlags, rhymeFlags } = ReadAloudPreparer._analyze(cleanText);

    return { cleanText, wordCount, estimatedMinutes, rhythmFlags, rhymeFlags };
  }

  // ─── Markup stripping ─────────────────────────────────────────────────────

  /**
   * Remove all non-prose markup from a Markdown chapter file:
   * - YAML frontmatter (lines between opening `---` and closing `---`)
   * - HTML comments (`<!-- ... -->`, potentially multi-line)
   * - `[MARKER: ...]` patterns such as `[TK: note]`, `[TODO: note]`
   * - Scene delimiter lines (`--- Scene N ---`)
   * - Trailing whitespace and blank lines are normalised
   *
   * Plain prose text is preserved exactly.
   *
   * @param raw - Raw chapter file content
   * @returns Clean prose-only text
   */
  static stripMarkup(raw: string): string {
    let text = raw;

    // 1. Strip YAML frontmatter: opening `---` on first line, up to closing `---`
    text = text.replace(/^---[\r\n][\s\S]*?[\r\n]---[\r\n]?/, '');

    // 2. Strip HTML comments (may span multiple lines)
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // 3. Strip [MARKER: content] patterns (TK, TODO, NOTE, VERIFY, etc.)
    text = text.replace(/\[[A-Z][A-Za-z0-9_-]*:[^\]]*\]/g, '');

    // 4. Strip scene delimiter lines: lines matching `--- Scene N ---` pattern
    text = text.replace(/^---\s*Scene\s+\S+\s*---\s*$/gim, '');

    // 5. Strip remaining bare `---` horizontal rules (not inside prose)
    text = text.replace(/^---\s*$/gim, '');

    // 6. Normalise: collapse 3+ blank lines to 2, trim trailing spaces
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/[ \t]+$/gm, '');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();

    return text;
  }

  // ─── Private analysis helpers ─────────────────────────────────────────────

  /** Count words in a clean-text string */
  static _countWords(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }

  /**
   * Run rhythm and rhyme analysis on clean prose text.
   * Returns arrays of flags.
   */
  static _analyze(
    cleanText: string
  ): { rhythmFlags: RhythmFlag[]; rhymeFlags: RhymeFlag[] } {
    const rhythmFlags: RhythmFlag[] = [];
    const rhymeFlags: RhymeFlag[] = [];

    // Split into lines for line-number tracking
    const lines = cleanText.split('\n');

    // ── Rhythm analysis: per paragraph ──────────────────────────────────────
    // A paragraph is a group of non-empty lines separated by blank lines.
    const paragraphs = ReadAloudPreparer._extractParagraphs(lines);

    for (const para of paragraphs) {
      const sentences = ReadAloudPreparer._splitSentences(para.text);
      if (sentences.length < MIN_SENTENCES_FOR_RHYTHM) continue;

      const lengths = sentences.map((s) => ReadAloudPreparer._wordCount(s));
      const stddev = ReadAloudPreparer._stddev(lengths);

      if (stddev < RHYTHM_STDDEV_THRESHOLD) {
        const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
        rhythmFlags.push({
          paragraphStart: para.startLine,
          note: `All ${sentences.length} sentences within 2 words of same length (avg ${avg} words, stddev ${stddev.toFixed(1)})`,
        });
      }
    }

    // ── Rhyme detection: across sentence endings ─────────────────────────────
    // Collect (line number, last word) for every sentence across the full text
    interface SentenceEnd {
      line: number;
      word: string;
    }

    const sentenceEnds: SentenceEnd[] = [];

    let currentLine = 1;
    for (const line of lines) {
      if (line.trim() === '') {
        currentLine++;
        continue;
      }
      const sentences = ReadAloudPreparer._splitSentences(line);
      for (const sentence of sentences) {
        const lastWord = ReadAloudPreparer._lastWord(sentence);
        if (lastWord) {
          sentenceEnds.push({ line: currentLine, word: lastWord });
        }
      }
      currentLine++;
    }

    // Compare each sentence against the previous RHYME_WINDOW sentences
    for (let i = 1; i < sentenceEnds.length; i++) {
      const current = sentenceEnds[i];
      const start = Math.max(0, i - RHYME_WINDOW);
      for (let j = start; j < i; j++) {
        const earlier = sentenceEnds[j];
        if (ReadAloudPreparer._rhymes(earlier.word, current.word)) {
          rhymeFlags.push({
            lineA: earlier.line,
            lineB: current.line,
            words: [earlier.word, current.word],
          });
        }
      }
    }

    return { rhythmFlags, rhymeFlags };
  }

  // ─── Low-level text utilities ─────────────────────────────────────────────

  /**
   * Extract paragraphs (groups of non-blank lines) with their 1-based
   * start-line numbers.
   */
  private static _extractParagraphs(
    lines: string[]
  ): Array<{ startLine: number; text: string }> {
    const paragraphs: Array<{ startLine: number; text: string }> = [];
    let start: number | null = null;
    let acc: string[] = [];

    const flush = () => {
      if (acc.length > 0 && start !== null) {
        paragraphs.push({ startLine: start, text: acc.join(' ') });
        acc = [];
        start = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') {
        flush();
      } else {
        if (start === null) start = i + 1; // 1-based
        acc.push(line);
      }
    }
    flush();
    return paragraphs;
  }

  /**
   * Split a block of text into sentences using sentence-ending punctuation.
   * Sentence boundary: one or more `.!?` followed by whitespace.
   */
  static _splitSentences(text: string): string[] {
    return text
      .split(/[.!?]+\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /** Count words in a single sentence */
  private static _wordCount(sentence: string): number {
    return sentence.trim().split(/\s+/).filter(Boolean).length;
  }

  /** Standard deviation of an array of numbers */
  private static _stddev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Extract the last "real" word from a sentence.
   * Strips trailing punctuation and returns lowercase.
   */
  static _lastWord(sentence: string): string | null {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    // Remove trailing punctuation
    const last = words[words.length - 1].replace(/[^a-zA-Z']/g, '').toLowerCase();
    return last || null;
  }

  /**
   * Return true if two words rhyme based on a shared suffix of at least
   * RHYME_SUFFIX_LENGTH characters.
   * Short words (suffix too short) are never flagged.
   *
   * @param a - First word (lowercase, no punctuation)
   * @param b - Second word (lowercase, no punctuation)
   */
  static _rhymes(a: string, b: string): boolean {
    if (a === b) return false; // Same word is not a rhyme
    if (a.length < RHYME_SUFFIX_LENGTH || b.length < RHYME_SUFFIX_LENGTH) return false;
    const suffixA = a.slice(-RHYME_SUFFIX_LENGTH);
    const suffixB = b.slice(-RHYME_SUFFIX_LENGTH);
    return suffixA === suffixB;
  }
}
