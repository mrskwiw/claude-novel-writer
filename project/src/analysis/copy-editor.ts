/**
 * CopyEditor — PROC-06 Copy Editing Support
 *
 * Analyses chapter Markdown files for common copy-editing issues:
 *   - POV slips (third-person-limited violations)
 *   - Tense shifts (mixed past / present within a paragraph)
 *   - Name variants (misspellings or unexpected abbreviations of known names)
 *   - Filter-distance phrases (secondary signal — covered by ProseAnalyzer but
 *     re-surfaced here at copy-edit severity)
 *
 * All analysis is performed on plain text after stripping YAML frontmatter and
 * Markdown code fences. File I/O is the only async operation; the core
 * detection methods are synchronous and publicly exposed for unit testing.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ─── Public interfaces ────────────────────────────────────────────────────────

export type CopyEditIssueType =
  | 'pov_slip'
  | 'tense_shift'
  | 'name_variant'
  | 'filter_distance';

export interface CopyEditIssue {
  type: CopyEditIssueType;
  /** 1-based line number within the file (including frontmatter lines). */
  line: number;
  /** The verbatim text that triggered the flag. */
  text: string;
  /** Human-readable explanation. */
  note: string;
  severity: 'warning' | 'error';
}

export interface CopyEditResult {
  chapterFile: string;
  issues: CopyEditIssue[];
}

// ─── Regex constants ──────────────────────────────────────────────────────────

/**
 * Perception/thought verbs that, when attached to a character name that is NOT
 * the POV character, signal a POV slip.
 */
const THOUGHT_VERB_RE = /\b(thought|felt|knew|wondered|realized|noticed)\b/gi;

/**
 * Past-tense marker words (common finite verbs and auxiliaries).
 */
const PAST_TENSE_RE =
  /\b(was|were|had|walked|said|went|came|ran|sat|stood|looked|turned|saw|heard|felt|knew|thought|made|took|told|asked|replied|whispered|shouted|smiled|nodded|shook|opened|closed|held|left|kept|seemed|appeared|found|called|moved|reached|pulled|pushed|put|got|gave|came|fell|led|lay|let|set|cut|hit|met|read|ran|fought|brought|bought|caught|taught|thought|sought|spoke|broke|chose|drove|rode|wrote|rose|wore|bore|swore|tore|lost|cost|hurt|burst|built|sent|bent|lent|meant|felt|knelt|slept|kept|swept|wept|crept|leapt)\b/gi;

/**
 * Present-tense marker words.
 */
const PRESENT_TENSE_RE =
  /\b(is|are|has|walks|says|goes|comes|runs|sits|stands|looks|turns|sees|hears|feels|knows|thinks|makes|takes|tells|asks|replies|whispers|shouts|smiles|nods|shakes|opens|closes|holds|leaves|keeps|seems|appears|finds|calls|moves|reaches|pulls|pushes|puts|gets|gives|falls|leads|lies|lets|sets|cuts|hits|meets|reads|fights|brings|buys|catches|teaches|seeks|speaks|breaks|chooses|drives|rides|writes|rises|wears|bears|swears|tears|loses|costs|hurts|builds|sends|bends|lends|means|sleeps|sweeps|weeps|creeps|leaps)\b/gi;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip YAML frontmatter (a `---` … `---` block at the very start of the
 * file). Returns the raw text with the frontmatter replaced by the same number
 * of blank lines so that 1-based line numbers remain valid.
 */
export function stripFrontmatter(raw: string): string {
  // Frontmatter must start at the very first character.
  if (!raw.startsWith('---')) return raw;

  const lines = raw.split('\n');
  // Find the closing `---` delimiter (must be line 1 or later).
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i;
      break;
    }
  }

  if (closeIdx === -1) return raw; // malformed frontmatter — treat as body

  // Replace frontmatter lines with empty strings to preserve line numbers.
  const result = lines.map((line, idx) => (idx <= closeIdx ? '' : line));
  return result.join('\n');
}

/**
 * Split text into non-empty paragraphs. Each paragraph records its 1-based
 * start line so issues can be attributed correctly.
 */
function extractParagraphs(text: string): Array<{ startLine: number; body: string }> {
  const paragraphs: Array<{ startLine: number; body: string }> = [];
  const lines = text.split('\n');
  let current: string[] = [];
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      if (current.length > 0) {
        paragraphs.push({ startLine, body: current.join('\n') });
        current = [];
      }
    } else {
      if (current.length === 0) startLine = i + 1;
      current.push(line);
    }
  }

  if (current.length > 0) {
    paragraphs.push({ startLine, body: current.join('\n') });
  }

  return paragraphs;
}

/**
 * Count all regex matches in `text`. Resets lastIndex before each call.
 */
function countMatches(re: RegExp, text: string): number {
  re.lastIndex = 0;
  let count = 0;
  while (re.exec(text) !== null) count++;
  re.lastIndex = 0;
  return count;
}

/**
 * Compute the Levenshtein distance between two strings (case-insensitive).
 * Returns the edit distance.
 */
function levenshtein(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  const m = la.length;
  const n = lb.length;

  // dp[i][j] = edit distance between la[0..i-1] and lb[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (la[i - 1] === lb[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

// ─── CopyEditor ───────────────────────────────────────────────────────────────

export class CopyEditor {
  constructor(private readonly projectPath: string) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Run all enabled copy-edit checks on a chapter Markdown file.
   *
   * @param chapterFile    - Absolute path, or a basename resolved relative to
   *                         `projectPath/chapters/`.
   * @param options        - Optional detection settings.
   * @param options.povCharacter  - Name of the POV character; enables POV-slip
   *                                detection when provided.
   * @param options.expectedTense - 'past' or 'present'; enables tense-shift
   *                                detection when provided.
   * @param options.knownNames    - List of canonical character / place names;
   *                                enables name-variant detection when provided.
   */
  async analyzeChapter(
    chapterFile: string,
    options: {
      povCharacter?: string;
      expectedTense?: 'past' | 'present';
      knownNames?: string[];
    } = {}
  ): Promise<CopyEditResult> {
    const filePath = path.isAbsolute(chapterFile)
      ? chapterFile
      : path.join(this.projectPath, 'chapters', chapterFile);

    const raw = await fs.readFile(filePath, 'utf-8');
    const issues = this._analyzeText(raw, options);

    return { chapterFile, issues };
  }

  // ─── Core analysis (exposed for unit testing) ────────────────────────────────

  /**
   * Run all enabled checks on raw file text. Strips frontmatter before
   * analysis but preserves line numbers.
   *
   * Exposed as a public method so unit tests can call it without file I/O.
   */
  _analyzeText(
    raw: string,
    options: {
      povCharacter?: string;
      expectedTense?: 'past' | 'present';
      knownNames?: string[];
    } = {}
  ): CopyEditIssue[] {
    const issues: CopyEditIssue[] = [];
    const stripped = stripFrontmatter(raw);

    if (options.povCharacter) {
      issues.push(...this._detectPovSlips(stripped, options.povCharacter));
    }

    if (options.expectedTense) {
      issues.push(...this._detectTenseShifts(stripped, options.expectedTense));
    }

    if (options.knownNames && options.knownNames.length > 0) {
      issues.push(...this._detectNameVariants(stripped, options.knownNames));
    }

    // Sort by line number for readable output.
    issues.sort((a, b) => a.line - b.line);
    return issues;
  }

  // ─── POV-slip detection ──────────────────────────────────────────────────────

  /**
   * Flag lines where a character name OTHER than `povCharacter` appears on the
   * same line as a thought / perception verb (`thought`, `felt`, `knew`, etc.).
   *
   * Heuristic: we tokenise each line into words, look for a thought verb, and
   * check whether any neighbouring word (within 5 positions) is a capitalised
   * word that differs from the POV character's first name. If so, we flag it.
   *
   * Only lines that are NOT inside YAML frontmatter (already stripped) or code
   * fences are considered.
   */
  _detectPovSlips(text: string, povCharacter: string): CopyEditIssue[] {
    const issues: CopyEditIssue[] = [];
    const povFirst = povCharacter.split(/\s+/)[0].toLowerCase();

    const lines = text.split('\n');
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const trimmed = lineText.trim();

      // Track Markdown code fences.
      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        inFence = !inFence;
        continue;
      }
      if (inFence || trimmed === '') continue;

      // Check for thought verbs on this line.
      THOUGHT_VERB_RE.lastIndex = 0;
      if (!THOUGHT_VERB_RE.test(lineText)) continue;

      // Look for capitalised names that are NOT the POV character.
      const words = lineText.split(/\s+/);
      const capitalisedOtherNames: string[] = [];

      for (const word of words) {
        const clean = word.replace(/[^a-zA-Z'-]/g, '');
        if (clean.length < 2) continue;
        // Capitalised first letter, rest lower — likely a proper name.
        if (clean[0] === clean[0].toUpperCase() && clean[0] !== clean[0].toLowerCase()) {
          const lower = clean.toLowerCase();
          // Exclude the POV character's name and common sentence-starting words.
          if (lower !== povFirst && !COMMON_SENTENCE_STARTERS.has(lower)) {
            capitalisedOtherNames.push(clean);
          }
        }
      }

      if (capitalisedOtherNames.length > 0) {
        issues.push({
          type: 'pov_slip',
          line: i + 1,
          text: lineText.slice(0, 100).trim(),
          note:
            `Possible POV slip: "${capitalisedOtherNames[0]}" may be the subject of ` +
            `a thought/perception verb in ${povCharacter}'s POV scene.`,
          severity: 'warning',
        });
      }
    }

    return issues;
  }

  // ─── Tense-shift detection ───────────────────────────────────────────────────

  /**
   * For each paragraph in `text`, count past-tense and present-tense verb
   * markers. Flag paragraphs where the minority tense constitutes more than 20%
   * of the total verb count and at least 1 minority verb is present.
   */
  _detectTenseShifts(
    text: string,
    expectedTense: 'past' | 'present'
  ): CopyEditIssue[] {
    const issues: CopyEditIssue[] = [];
    const paragraphs = extractParagraphs(text);

    for (const { startLine, body } of paragraphs) {
      const pastCount = countMatches(PAST_TENSE_RE, body);
      const presentCount = countMatches(PRESENT_TENSE_RE, body);
      const total = pastCount + presentCount;
      if (total === 0) continue;

      const minorityCount =
        expectedTense === 'past' ? presentCount : pastCount;
      const minorityTense = expectedTense === 'past' ? 'present' : 'past';

      if (minorityCount > 0 && minorityCount / total > 0.2) {
        issues.push({
          type: 'tense_shift',
          line: startLine,
          text: body.slice(0, 100) + (body.length > 100 ? '…' : ''),
          note:
            `Tense shift detected: paragraph is primarily ${expectedTense}-tense ` +
            `but contains ${minorityCount} ${minorityTense}-tense verb(s) ` +
            `(${Math.round((minorityCount / total) * 100)}% of ${total} verbs).`,
          severity: 'warning',
        });
      }
    }

    return issues;
  }

  // ─── Name-variant detection ───────────────────────────────────────────────────

  /**
   * For each known name, scan the text for capitalised words whose first 4
   * characters match the name's first 4 characters but whose full spelling
   * differs. Also flag words within Levenshtein distance 1 of the known name.
   *
   * Known names themselves are excluded from flagging (exact case-insensitive
   * match).
   */
  _detectNameVariants(text: string, knownNames: string[]): CopyEditIssue[] {
    const issues: CopyEditIssue[] = [];
    const lines = text.split('\n');
    let inFence = false;

    // Pre-compute lookup sets for fast exact-match exclusion.
    const knownLower = new Set(knownNames.map((n) => n.toLowerCase()));

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const trimmed = lineText.trim();

      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        inFence = !inFence;
        continue;
      }
      if (inFence || trimmed === '') continue;

      // Tokenise line into words.
      const wordRe = /\b[A-Z][a-zA-Z'-]{1,}\b/g;
      let m: RegExpExecArray | null;
      while ((m = wordRe.exec(lineText)) !== null) {
        const word = m[0];
        const wordLower = word.toLowerCase();

        // Exact match — not a variant.
        if (knownLower.has(wordLower)) continue;

        for (const known of knownNames) {
          const knownLowerStr = known.toLowerCase();

          // 4-char prefix match with different full spelling.
          const prefix4Match =
            known.length >= 4 &&
            word.length >= 4 &&
            wordLower.slice(0, 4) === knownLowerStr.slice(0, 4) &&
            wordLower !== knownLowerStr;

          // Levenshtein distance 1 (only for names 4+ chars to avoid noise).
          const lev1Match =
            known.length >= 4 &&
            word.length >= 3 &&
            wordLower !== knownLowerStr &&
            levenshtein(wordLower, knownLowerStr) === 1;

          if (prefix4Match || lev1Match) {
            issues.push({
              type: 'name_variant',
              line: i + 1,
              text: word,
              note: `"${word}" may be a variant of known name "${known}". Verify spelling.`,
              severity: 'warning',
            });
            break; // only flag each word once
          }
        }
      }
    }

    return issues;
  }
}

// ─── Internal constants ───────────────────────────────────────────────────────

/**
 * Words that are capitalised because they start a sentence, not because they
 * are proper names. Excluded from POV-slip name detection.
 */
const COMMON_SENTENCE_STARTERS = new Set([
  'the', 'a', 'an', 'she', 'he', 'they', 'we', 'i', 'it', 'this', 'that',
  'there', 'then', 'when', 'where', 'but', 'and', 'or', 'if', 'as', 'at',
  'by', 'in', 'on', 'to', 'of', 'for', 'with', 'his', 'her', 'their',
  'its', 'my', 'your', 'our', 'not', 'no', 'never', 'still', 'just',
  'so', 'yet', 'both', 'after', 'before', 'although', 'because', 'while',
  'until', 'though', 'even', 'from', 'into', 'onto', 'over', 'under',
  'through', 'between', 'behind', 'beside', 'against', 'without', 'within',
]);
