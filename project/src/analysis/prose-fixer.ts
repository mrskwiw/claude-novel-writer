/**
 * ProseFixer — `revise` command engine (mechanical prose fixes)
 *
 * Deterministic, opt-in, reversible copy-edit fixes for chapter Markdown files.
 * There is NO LLM here: every transformation is a pure, line-based string
 * operation so the same input always produces the same output.
 *
 * Categories:
 *   - `doubled-words`          collapse accidental word repeats ("the the")
 *   - `trailing-whitespace`    strip trailing spaces/tabs at end of line
 *   - `multiple-spaces`        collapse runs of 2+ spaces between words
 *   - `redundant-intensifiers` drop "very/really/quite" before a weak adjective
 *   - `adverb-dialogue-tags`   strip an -ly adverb after a dialogue tag verb
 *   - `straight-to-curly-quotes` convert " and ' to typographic quotes
 *
 * Safety rules that apply to ALL categories:
 *   - YAML frontmatter (a leading `---` … `---` block) is never modified.
 *   - Lines inside fenced code blocks (``` or ~~~) are never modified.
 *   - Original end-of-line style (LF vs CRLF) is preserved.
 *   - Line numbers in the change list are 1-based across the whole file.
 *
 * File I/O lives in {@link ProseFixer}; the core transformation
 * ({@link ProseFixer._fixText}) is a pure static method exposed for unit tests.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ─── Public types ─────────────────────────────────────────────────────────────

export type ReviseCategory =
  | 'doubled-words'
  | 'trailing-whitespace'
  | 'multiple-spaces'
  | 'redundant-intensifiers'
  | 'adverb-dialogue-tags'
  | 'straight-to-curly-quotes';

/**
 * Canonical order in which fixers are applied to a line. Order is fixed and
 * independent of the order categories are requested in, so results are
 * deterministic.
 */
export const ALL_CATEGORIES: readonly ReviseCategory[] = [
  'doubled-words',
  'redundant-intensifiers',
  'adverb-dialogue-tags',
  'straight-to-curly-quotes',
  'multiple-spaces',
  'trailing-whitespace',
];

/** A single line that was changed by one or more fixers. */
export interface ReviseChange {
  /** 1-based line number within the whole file. */
  line: number;
  /** The verbatim line before any fix was applied. */
  before: string;
  /** The line after all enabled fixes were applied. */
  after: string;
  /** Which categories actually changed this line, in canonical order. */
  categories: ReviseCategory[];
}

/** Per-category and aggregate counts plus the rewritten text. */
export interface ReviseResult {
  /** Number of individual fixes per category (0 for untouched categories). */
  counts: Record<ReviseCategory, number>;
  /** Sum of all per-category counts. */
  totalFixes: number;
  /** Number of distinct lines that changed. */
  changedLines: number;
  /** The change list, in ascending line order. */
  changes: ReviseChange[];
  /** The fully rewritten file text (frontmatter + body, original EOL). */
  output: string;
}

// ─── Category dictionaries ────────────────────────────────────────────────────

/**
 * Words that legitimately double in English and must NOT be collapsed by the
 * `doubled-words` fixer (e.g. "I had had a dream", "the book that that man wrote").
 */
const DOUBLE_WORD_DENYLIST = new Set(['had', 'that']);

/** Intensifiers removed before a weak adjective. Deliberately conservative. */
const INTENSIFIER_RE = /\b(very|really|quite)\s+([A-Za-z]+)\b/gi;

/** Weak adjectives whose preceding intensifier adds little. */
const WEAK_ADJECTIVES = new Set([
  'good', 'bad', 'nice', 'big', 'small', 'large', 'happy', 'sad', 'tired',
  'angry', 'pretty', 'ugly', 'hot', 'cold', 'fast', 'slow', 'old', 'young',
  'hard', 'easy', 'tall', 'short', 'rich', 'poor', 'clean', 'dirty', 'loud',
  'quiet', 'strong', 'weak', 'smart', 'funny', 'boring', 'scary', 'important',
  'difficult', 'simple', 'special', 'different', 'real', 'sure', 'glad',
  'fine', 'great', 'tiny', 'huge', 'nervous', 'calm', 'busy', 'lucky',
]);

/** Dialogue-tag verbs that may be followed by a manner adverb. */
const DIALOGUE_TAG_RE =
  /\b(said|asked|replied|whispered|shouted|murmured|added|answered|exclaimed|muttered|continued|responded|cried|snapped|hissed|growled|breathed)\s+([A-Za-z]+ly)\b/gi;

/**
 * `-ly` words that are not manner adverbs and must not be stripped from a
 * dialogue tag (e.g. "she said only that…").
 */
const ADVERB_DENYLIST = new Set([
  'only', 'likely', 'early', 'family', 'reply', 'supply', 'apply', 'holy',
]);

// ─── Per-line fixers ──────────────────────────────────────────────────────────

interface LineFix {
  line: string;
  count: number;
}

/** Capitalise the first character of a word. */
function capitaliseFirst(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

/**
 * Collapse accidental consecutive duplicate words (case-insensitive), keeping
 * the FIRST occurrence and its casing. Skips words in {@link DOUBLE_WORD_DENYLIST}.
 *
 * Two words are "duplicates" only when separated solely by spaces/tabs (so
 * `the, the` across a comma and `the\nthe` across a line break are left alone).
 * Chains such as "the the the" collapse fully because each later word is removed
 * relative to its immediate predecessor.
 */
function fixDoubledWords(line: string): LineFix {
  const wordRe = /[A-Za-z]+/g;
  const words: Array<{ word: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(line)) !== null) {
    words.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }

  // Removal spans cover "(separator before the duplicate) + (the duplicate)",
  // so the earlier word and its casing survive.
  const removals: Array<{ start: number; end: number }> = [];
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const cur = words[i];
    const gap = line.slice(prev.end, cur.start);
    if (
      prev.word.toLowerCase() === cur.word.toLowerCase() &&
      /^[ \t]+$/.test(gap) &&
      !DOUBLE_WORD_DENYLIST.has(prev.word.toLowerCase())
    ) {
      removals.push({ start: prev.end, end: cur.end });
    }
  }

  if (removals.length === 0) return { line, count: 0 };

  let out = line;
  for (let j = removals.length - 1; j >= 0; j--) {
    out = out.slice(0, removals[j].start) + out.slice(removals[j].end);
  }
  return { line: out, count: removals.length };
}

/** Remove a redundant intensifier directly before a weak adjective. */
function fixRedundantIntensifiers(line: string): LineFix {
  let count = 0;
  const out = line.replace(
    INTENSIFIER_RE,
    (match, intensifier: string, adjective: string) => {
      if (!WEAK_ADJECTIVES.has(adjective.toLowerCase())) return match;
      count++;
      // Preserve sentence-start capitalisation by promoting it to the adjective.
      const intensifierIsCapitalised = intensifier[0] === intensifier[0].toUpperCase();
      return intensifierIsCapitalised ? capitaliseFirst(adjective) : adjective;
    }
  );
  return { line: out, count };
}

/** Strip an -ly manner adverb that immediately follows a dialogue-tag verb. */
function fixAdverbDialogueTags(line: string): LineFix {
  let count = 0;
  const out = line.replace(
    DIALOGUE_TAG_RE,
    (match, verb: string, adverb: string) => {
      if (ADVERB_DENYLIST.has(adverb.toLowerCase())) return match;
      count++;
      return verb;
    }
  );
  return { line: out, count };
}

/**
 * Convert straight quotes to typographic ("curly") quotes using context
 * heuristics. An opening quote follows start-of-line, whitespace, or an
 * opening bracket / dash; everything else closes.
 */
function fixCurlyQuotes(line: string): LineFix {
  let count = 0;
  const isOpenContext = (prev: string): boolean =>
    prev === '' || /[\s([{—–-]/.test(prev);

  // Double quotes first.
  let out = line.replace(/"/g, (_m, offset: number, str: string) => {
    count++;
    return isOpenContext(offset > 0 ? str[offset - 1] : '') ? '“' : '”';
  });

  // Single quotes / apostrophes (operate on the already-updated string).
  out = out.replace(/'/g, (_m, offset: number, str: string) => {
    count++;
    const prev = offset > 0 ? str[offset - 1] : '';
    // Apostrophe inside / after a word (contraction or possessive) → ’.
    if (/[A-Za-z0-9]/.test(prev)) return '’';
    return isOpenContext(prev) ? '‘' : '’';
  });

  return { line: out, count };
}

/** Collapse runs of 2+ spaces that sit between two non-space characters. */
function fixMultipleSpaces(line: string): LineFix {
  let count = 0;
  const out = line.replace(/(?<=\S) {2,}(?=\S)/g, () => {
    count++;
    return ' ';
  });
  return { line: out, count };
}

/** Strip trailing spaces / tabs at the end of a line. */
function fixTrailingWhitespace(line: string): LineFix {
  let count = 0;
  const out = line.replace(/[ \t]+$/, () => {
    count = 1;
    return '';
  });
  return { line: out, count };
}

const FIXERS: Record<ReviseCategory, (line: string) => LineFix> = {
  'doubled-words': fixDoubledWords,
  'redundant-intensifiers': fixRedundantIntensifiers,
  'adverb-dialogue-tags': fixAdverbDialogueTags,
  'straight-to-curly-quotes': fixCurlyQuotes,
  'multiple-spaces': fixMultipleSpaces,
  'trailing-whitespace': fixTrailingWhitespace,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Empty per-category count map. */
function zeroCounts(): Record<ReviseCategory, number> {
  return {
    'doubled-words': 0,
    'redundant-intensifiers': 0,
    'adverb-dialogue-tags': 0,
    'straight-to-curly-quotes': 0,
    'multiple-spaces': 0,
    'trailing-whitespace': 0,
  };
}

/**
 * Index (inclusive) of the closing `---` of a leading YAML frontmatter block,
 * or -1 when the file has no frontmatter.
 */
function frontmatterEndIndex(lines: string[]): number {
  if (lines.length === 0 || lines[0].trim() !== '---') return -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return i;
  }
  return -1; // unterminated → treat as body
}

/** Type guard: is `value` a known revise category? */
export function isReviseCategory(value: string): value is ReviseCategory {
  return (ALL_CATEGORIES as readonly string[]).includes(value);
}

// ─── ProseFixer ───────────────────────────────────────────────────────────────

export class ProseFixer {
  constructor(private readonly projectPath: string) {}

  /**
   * Apply the requested mechanical fixes to a chapter file's text and,
   * optionally, write the result back to disk.
   *
   * @param chapterFile - Absolute path, or a basename resolved relative to
   *                       `projectPath/chapters/`.
   * @param categories  - Categories to apply.
   * @param options.apply - When true, the rewritten file is written to disk.
   *                        When false (default) it is a dry run.
   */
  async reviseChapter(
    chapterFile: string,
    categories: ReviseCategory[],
    options: { apply?: boolean } = {}
  ): Promise<ReviseResult & { filePath: string }> {
    const filePath = path.isAbsolute(chapterFile)
      ? chapterFile
      : path.join(this.projectPath, 'chapters', chapterFile);

    const raw = await fs.readFile(filePath, 'utf-8');
    const result = ProseFixer._fixText(raw, categories);

    if (options.apply && result.totalFixes > 0) {
      await fs.writeFile(filePath, result.output, 'utf-8');
    }

    return { ...result, filePath };
  }

  /**
   * Pure transformation core. Applies the enabled categories (always in
   * {@link ALL_CATEGORIES} order) to every eligible body line.
   *
   * Exposed as a static method so unit tests can run it without file I/O.
   */
  static _fixText(raw: string, categories: ReviseCategory[]): ReviseResult {
    const counts = zeroCounts();
    const changes: ReviseChange[] = [];

    // De-duplicate and order the requested categories canonically.
    const enabled = ALL_CATEGORIES.filter((c) => categories.includes(c));

    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.split(/\r?\n/);
    const fmEnd = frontmatterEndIndex(lines);

    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
      const original = lines[i];

      // Never touch frontmatter lines (0..fmEnd inclusive).
      if (fmEnd !== -1 && i <= fmEnd) continue;

      const trimmed = original.trim();

      // Track fenced code blocks; never touch fenced lines or the fence markers.
      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      // Apply each enabled fixer in canonical order.
      let current = original;
      const touched: ReviseCategory[] = [];
      for (const category of enabled) {
        const { line: fixed, count } = FIXERS[category](current);
        if (count > 0) {
          counts[category] += count;
          touched.push(category);
          current = fixed;
        }
      }

      if (current !== original) {
        changes.push({
          line: i + 1,
          before: original,
          after: current,
          categories: touched,
        });
        lines[i] = current;
      }
    }

    const totalFixes = ALL_CATEGORIES.reduce((sum, c) => sum + counts[c], 0);

    return {
      counts,
      totalFixes,
      changedLines: changes.length,
      changes,
      output: lines.join(eol),
    };
  }
}
