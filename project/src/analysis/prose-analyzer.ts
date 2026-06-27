/**
 * ProseAnalyzer — SPEC-05 Prose Analysis System
 *
 * Runs multiple categories of text analysis on chapter Markdown files:
 *   Group A – Word-level checks (intensifiers, filter words, adverb tags, passive voice, doubled words)
 *   Group B – Sentence rhythm (monotony detection per paragraph)
 *   Group C – Word repetition (sliding 300-word window)
 *   Group D – Dialogue checks (on-the-nose, purple prose)
 *
 * Code-fence content (``` or ~~~) is always skipped.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ProseAnalysisResult, ProseCheck } from '../types/novel.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const INTENSIFIER_RE = /\b(very|really|quite|just|rather|extremely|incredibly|absolutely)\b/gi;
const FILTER_WORD_RE = /\b(saw|heard|felt|noticed|wondered|realized|thought|knew|seemed|appeared)\b/gi;
const ADVERB_TAG_RE = /\b(said|asked|replied|whispered|shouted|answered)\s+\w+ly\b/gi;
const PASSIVE_VOICE_RE = /\b(was|were|been|being)\s+\w+ed\b/gi;

/** Doubled-word redundancies (case-insensitive phrase match) */
const DOUBLED_WORDS: ReadonlyArray<string> = [
  'end result',
  'past history',
  'added bonus',
  'free gift',
  'completely finished',
  'future plans',
  'actual fact',
];

/** On-the-nose dialogue openers */
const ON_THE_NOSE_RE = /^["'“‘]?(As you know[,\s]|Remember when[,\s]|You know that[,\s])/i;

/** Stop list for word-repetition window */
const REPETITION_STOP_LIST = new Set([
  'about', 'after', 'again', 'against', 'before', 'between',
  'could', 'every', 'first', 'never', 'other', 'still',
  'their', 'there', 'these', 'those', 'under', 'where',
  'which', 'while', 'would',
]);

/** Common adjective suffixes for purple-prose detection */
const ADJ_SUFFIX_RE = /\w+(ful|ous|ish|ic|ive|al|ary)\b/gi;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Split text into tokens that carry per-token line/column info.
 * Returns { word, line, col } for every non-whitespace run.
 */
interface Token {
  word: string;
  line: number;
  col: number;
}

function tokenise(text: string): Token[] {
  const tokens: Token[] = [];
  const lineTexts = text.split('\n');
  for (let li = 0; li < lineTexts.length; li++) {
    const lineText = lineTexts[li];
    const wordRe = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = wordRe.exec(lineText)) !== null) {
      tokens.push({ word: m[0], line: li + 1, col: m.index + 1 });
    }
  }
  return tokens;
}

/**
 * Count words (whitespace-delimited) in a string.
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Standard deviation of a numeric array. Returns 0 for arrays with < 2 items.
 */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Split a paragraph body into sentences (naive: split on ". ", "! ", "? ", or end-of-string).
 */
function splitSentences(para: string): string[] {
  return para
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Determine whether a line is inside a dialogue quote.
 * This is a simplified check — used for per-line guard only.
 */
function isInsideQuote(line: string): boolean {
  const trimmed = line.trim();
  return (
    (trimmed.startsWith('"') || trimmed.startsWith('“') || trimmed.startsWith("'"))
    && (trimmed.endsWith('"') || trimmed.endsWith('”') || trimmed.endsWith("'"))
  );
}

/**
 * Count words inside "…" pairs for dialogue-percent calculation.
 */
function countDialogueWords(text: string): number {
  let total = 0;
  // Match "…" (straight and curly quotes)
  const re = /"([^""]*)"|"([^""]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1] ?? m[2] ?? '';
    total += countWords(inner);
  }
  // Also straight double-quotes
  const straightRe = /"([^"]*)"/g;
  while ((m = straightRe.exec(text)) !== null) {
    total += countWords(m[1]);
  }
  return total;
}

// ─── Sensory word lists ───────────────────────────────────────────────────────

const SENSORY_VISUAL_RE = /\b(saw|looked|watched|glimpsed|spotted|glanced|stared|viewed|noticed|appeared|visible|bright|dark|color|shadow|light)\b/gi;
const SENSORY_AUDITORY_RE = /\b(heard|listened|sounded|rang|echoed|whispered|shouted|cried|murmured|silence|quiet|loud|noise|voice)\b/gi;
const SENSORY_TACTILE_RE = /\b(felt|touched|grabbed|held|rough|smooth|cold|warm|sharp|soft|texture|weight|pressure)\b/gi;
const SENSORY_OLFACTORY_RE = /\b(smelled|scent|odor|fragrance|stench|aroma|whiff|reek)\b/gi;
const SENSORY_GUSTATORY_RE = /\b(tasted|flavor|bitter|sweet|sour|salty|chewed|swallowed|savored)\b/gi;

// ─── Show vs Tell ─────────────────────────────────────────────────────────────

const TELL_RE = /\b(was|were|is|are|felt|seemed|appeared|looked)\s+(happy|sad|angry|afraid|excited|nervous|calm|confused|tired)\b/gi;
const SHOW_RE = /\b(ran|walked|slammed|grabbed|laughed|cried|shook|trembled|froze|leaned|stepped|jumped)\b/gi;

// ─── Dialogue attribution ─────────────────────────────────────────────────────

/** Attribution verbs used to identify speaker */
const ATTRIBUTION_VERBS = 'said|asked|replied|whispered|shouted|answered|called|muttered|murmured|cried|exclaimed|snapped|breathed|hissed';
const ATTR_AFTER_RE = new RegExp(`"[^"]*"\\s*,?\\s+(?:${ATTRIBUTION_VERBS})\\s+([A-Z][a-zA-Z]+)`, 'g');
const ATTR_BEFORE_RE = new RegExp(`([A-Z][a-zA-Z]+)\\s+(?:${ATTRIBUTION_VERBS})\\s+"([^"]*)"`, 'g');

// ─── ProseAnalyzer ────────────────────────────────────────────────────────────

export class ProseAnalyzer {
  constructor(private readonly projectPath: string) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Run all prose checks on a single chapter file.
   *
   * @param chapterFile - Absolute path or path relative to `projectPath/chapters/`
   */
  async analyzeChapter(chapterFile: string): Promise<ProseAnalysisResult> {
    const filePath = path.isAbsolute(chapterFile)
      ? chapterFile
      : path.join(this.projectPath, 'chapters', chapterFile);

    const raw = await fs.readFile(filePath, 'utf-8');
    return this._analyzeText(raw, chapterFile);
  }

  /**
   * Run all prose checks on every `.md` file in `projectPath/chapters/`.
   */
  async analyzeAll(): Promise<ProseAnalysisResult[]> {
    const chaptersDir = path.join(this.projectPath, 'chapters');
    let entries: string[];
    try {
      entries = (await fs.readdir(chaptersDir)).filter((f) => f.endsWith('.md'));
    } catch {
      return [];
    }
    const results = await Promise.all(
      entries.map((f) => this.analyzeChapter(path.join(chaptersDir, f)))
    );
    return results;
  }

  /**
   * Run only dialogue checks (Group D) on a single chapter file.
   */
  async analyzeDialogue(chapterFile: string): Promise<ProseAnalysisResult> {
    const filePath = path.isAbsolute(chapterFile)
      ? chapterFile
      : path.join(this.projectPath, 'chapters', chapterFile);

    const raw = await fs.readFile(filePath, 'utf-8');
    const full = this._analyzeText(raw, chapterFile);
    return {
      ...full,
      checks: full.checks.filter(
        (c) => c.type === 'on_the_nose_dialogue' || c.type === 'purple_prose'
      ),
    };
  }

  // ─── Core analysis ──────────────────────────────────────────────────────────

  /**
   * Analyse a raw text string and return a ProseAnalysisResult.
   *
   * @param raw        - Full file contents
   * @param chapterFile - Filename stored in result
   */
  _analyzeText(raw: string, chapterFile: string): ProseAnalysisResult {
    const checks: ProseCheck[] = [];

    const lines = raw.split('\n');
    const { contentLines, insideCodeFence } = this._classifyLines(lines);

    // ── Group A: Word-level checks (non-code-fence lines) ─────────────────────
    for (let li = 0; li < lines.length; li++) {
      if (insideCodeFence[li]) continue;
      const lineText = lines[li];
      const lineNo = li + 1;

      // 1. Intensifiers
      for (const m of lineText.matchAll(new RegExp(INTENSIFIER_RE.source, 'gi'))) {
        checks.push({
          type: 'intensifier',
          line: lineNo,
          column: (m.index ?? 0) + 1,
          text: m[0],
          suggestion: 'Remove or replace with a stronger word',
          severity: 'info',
        });
      }

      // 2. Filter words
      for (const m of lineText.matchAll(new RegExp(FILTER_WORD_RE.source, 'gi'))) {
        checks.push({
          type: 'filter_word',
          line: lineNo,
          column: (m.index ?? 0) + 1,
          text: m[0],
          suggestion: 'Show directly instead of filtering through character perception',
          severity: 'warning',
        });
      }

      // 3. Adverb dialogue tags
      for (const m of lineText.matchAll(new RegExp(ADVERB_TAG_RE.source, 'gi'))) {
        checks.push({
          type: 'adverb_tag',
          line: lineNo,
          column: (m.index ?? 0) + 1,
          text: m[0],
          suggestion: 'Use action beat instead of dialogue tag adverb',
          severity: 'warning',
        });
      }

      // 4. Passive voice
      for (const m of lineText.matchAll(new RegExp(PASSIVE_VOICE_RE.source, 'gi'))) {
        checks.push({
          type: 'passive_voice',
          line: lineNo,
          column: (m.index ?? 0) + 1,
          text: m[0],
          severity: 'info',
        });
      }

      // 5. Doubled words
      const lower = lineText.toLowerCase();
      for (const phrase of DOUBLED_WORDS) {
        let pos = lower.indexOf(phrase);
        while (pos !== -1) {
          checks.push({
            type: 'doubled_word',
            line: lineNo,
            column: pos + 1,
            text: lineText.slice(pos, pos + phrase.length),
            suggestion: `"${phrase}" is redundant; simplify`,
            severity: 'error',
          });
          pos = lower.indexOf(phrase, pos + 1);
        }
      }
    }

    // ── Group B: Sentence monotony (paragraph-level) ──────────────────────────
    const paragraphs = this._extractParagraphs(lines, insideCodeFence);
    for (const { startLine, text: paraText } of paragraphs) {
      const sentences = splitSentences(paraText);
      if (sentences.length < 3) continue;
      const lengths = sentences.map((s) => countWords(s));
      if (stddev(lengths) < 3) {
        checks.push({
          type: 'sentence_monotony',
          line: startLine,
          text: paraText.slice(0, 80) + (paraText.length > 80 ? '…' : ''),
          suggestion: 'Vary sentence length to improve rhythm',
          severity: 'info',
        });
      }
    }

    // ── Group C: Word repetition (sliding 300-word window) ────────────────────
    const tokens = tokenise(
      contentLines.join('\n')
    );
    const repetitionChecks = this._checkRepetition(tokens);
    checks.push(...repetitionChecks);

    // ── Group D: Dialogue checks ──────────────────────────────────────────────
    for (let li = 0; li < lines.length; li++) {
      if (insideCodeFence[li]) continue;
      const lineText = lines[li];
      const lineNo = li + 1;

      // 8. On-the-nose dialogue
      if (ON_THE_NOSE_RE.test(lineText)) {
        checks.push({
          type: 'on_the_nose_dialogue',
          line: lineNo,
          text: lineText.slice(0, 80).trim(),
          suggestion: 'Avoid expository dialogue; trust subtext',
          severity: 'warning',
        });
      }

      // 9. Purple prose (sentences > 40 words with > 3 adjectives)
      const sentences = splitSentences(lineText);
      for (const sent of sentences) {
        const wc = countWords(sent);
        if (wc > 40) {
          const adjMatches = sent.matchAll(new RegExp(ADJ_SUFFIX_RE.source, 'gi'));
          const adjCount = [...adjMatches].length;
          if (adjCount > 3) {
            checks.push({
              type: 'purple_prose',
              line: lineNo,
              text: sent.slice(0, 80) + (sent.length > 80 ? '…' : ''),
              suggestion: 'Trim adjectives and shorten sentence',
              severity: 'info',
            });
          }
        }
      }
    }

    // ── Metrics ───────────────────────────────────────────────────────────────
    const fullText = raw;
    const wordCount = countWords(fullText);
    const dialogueWords = countDialogueWords(fullText);
    const dialoguePercent = wordCount > 0 ? (dialogueWords / wordCount) * 100 : 0;

    const intensifierCount = checks.filter((c) => c.type === 'intensifier').length;
    const filterWordCount = checks.filter((c) => c.type === 'filter_word').length;
    const rawScore = 100 * (1 - (intensifierCount + filterWordCount) / Math.max(wordCount, 1)) * 100;
    const economyScore = Math.round(Math.min(100, Math.max(0, rawScore / 100)) * 100) / 100;

    // Extract chapter number from filename (e.g. chapter-01.md → 1)
    const numMatch = path.basename(chapterFile).match(/(\d+)/);
    const chapterNumber = numMatch ? parseInt(numMatch[1], 10) : undefined;

    return {
      chapterFile,
      chapterNumber,
      checks,
      economyScore,
      wordCount,
      dialoguePercent,
    };
  }

  // ─── CRAFT-03: Dialogue extraction ──────────────────────────────────────────

  /**
   * Extract all dialogue from the text and group it by speaker name.
   *
   * Speaker is identified via patterns like:
   *   - `"text," said Name` or `"text" said Name`
   *   - `Name said "text"`
   * Unattributed dialogue is grouped under 'Unknown'.
   *
   * @param text - Raw chapter text
   * @returns Map from speaker name to their dialogue lines
   */
  extractDialogueByCharacter(text: string): Map<string, string[]> {
    const result = new Map<string, string[]>();

    const addLine = (speaker: string, line: string) => {
      const existing = result.get(speaker) ?? [];
      existing.push(line);
      result.set(speaker, existing);
    };

    // Collect all dialogue segments with their positions in the text
    // so we can attempt attribution on each one.
    const dialogueRe = /"([^"]+)"/g;
    let m: RegExpExecArray | null;
    const allDialogue: Array<{ start: number; end: number; text: string }> = [];
    while ((m = dialogueRe.exec(text)) !== null) {
      allDialogue.push({ start: m.index, end: m.index + m[0].length, text: m[1] });
    }

    // Build a set of attributed ranges so we can mark them
    const attributed = new Set<number>();

    // Pattern 1: "text" [,]? said/asked/... Name
    const attrAfterRe = new RegExp(
      `"([^"]+)"\\s*,?\\s+(?:${ATTRIBUTION_VERBS})\\s+([A-Z][a-zA-Z]+)`,
      'g'
    );
    while ((m = attrAfterRe.exec(text)) !== null) {
      const dialogueText = m[1];
      const speaker = m[2];
      addLine(speaker, dialogueText);
      // Mark the start position as attributed
      const idx = allDialogue.findIndex((d) => d.text === dialogueText && d.start === m!.index);
      if (idx !== -1) attributed.add(idx);
    }

    // Pattern 2: Name said/asked/... "text"
    const attrBeforeRe = new RegExp(
      `([A-Z][a-zA-Z]+)\\s+(?:${ATTRIBUTION_VERBS})\\s+"([^"]+)"`,
      'g'
    );
    while ((m = attrBeforeRe.exec(text)) !== null) {
      const speaker = m[1];
      const dialogueText = m[2];
      addLine(speaker, dialogueText);
      const idx = allDialogue.findIndex((d) => d.text === dialogueText);
      if (idx !== -1) attributed.add(idx);
    }

    // Remaining unattributed dialogue → 'Unknown'
    allDialogue.forEach((d, idx) => {
      if (!attributed.has(idx)) {
        addLine('Unknown', d.text);
      }
    });

    return result;
  }

  /**
   * Analyze each character's dialogue voice.
   *
   * For each speaker (from extractDialogueByCharacter), computes:
   *   - lineCount: number of dialogue lines
   *   - avgWordLength: average character-count per word (vocabulary sophistication proxy)
   *   - avgSentenceLength: average word count per dialogue line
   *   - distinctivePhrases: most-repeated 2-word bigrams in that character's dialogue
   *
   * @param text - Raw chapter text
   */
  analyzeCharacterVoices(
    text: string
  ): Array<{
    speaker: string;
    lineCount: number;
    avgWordLength: number;
    avgSentenceLength: number;
    distinctivePhrases: string[];
  }> {
    const byChar = this.extractDialogueByCharacter(text);
    const out: ReturnType<typeof this.analyzeCharacterVoices> = [];

    for (const [speaker, lines] of byChar) {
      const allWords = lines.flatMap((l) =>
        l
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => w.replace(/[^a-zA-Z']/g, ''))
          .filter((w) => w.length > 0)
      );

      const avgWordLength =
        allWords.length > 0
          ? allWords.reduce((sum, w) => sum + w.length, 0) / allWords.length
          : 0;

      const sentenceLengths = lines.map(
        (l) => l.trim().split(/\s+/).filter(Boolean).length
      );
      const avgSentenceLength =
        sentenceLengths.length > 0
          ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
          : 0;

      // 2-gram bigram frequency
      const bigrams = new Map<string, number>();
      for (const line of lines) {
        const words = line
          .toLowerCase()
          .split(/\s+/)
          .map((w) => w.replace(/[^a-z']/g, ''))
          .filter((w) => w.length > 0);
        for (let i = 0; i < words.length - 1; i++) {
          const bg = `${words[i]} ${words[i + 1]}`;
          bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
        }
      }

      const distinctivePhrases = [...bigrams.entries()]
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([phrase]) => phrase);

      out.push({
        speaker,
        lineCount: lines.length,
        avgWordLength: Math.round(avgWordLength * 100) / 100,
        avgSentenceLength: Math.round(avgSentenceLength * 100) / 100,
        distinctivePhrases,
      });
    }

    return out;
  }

  // ─── PROC-05: Sensory balance ────────────────────────────────────────────────

  /**
   * Count sensory words by sense category and flag visually-dominant text.
   *
   * Flag condition: visual > 80% of all sensory words AND total > 10.
   *
   * @param text - Raw chapter text
   */
  analyzeSensoryBalance(text: string): {
    visual: number;
    auditory: number;
    tactile: number;
    olfactory: number;
    gustatory: number;
    flag: boolean;
  } {
    const count = (re: RegExp): number => (text.match(re) ?? []).length;

    const visual = count(new RegExp(SENSORY_VISUAL_RE.source, 'gi'));
    const auditory = count(new RegExp(SENSORY_AUDITORY_RE.source, 'gi'));
    const tactile = count(new RegExp(SENSORY_TACTILE_RE.source, 'gi'));
    const olfactory = count(new RegExp(SENSORY_OLFACTORY_RE.source, 'gi'));
    const gustatory = count(new RegExp(SENSORY_GUSTATORY_RE.source, 'gi'));

    const total = visual + auditory + tactile + olfactory + gustatory;
    const flag = total > 10 && visual / total > 0.8;

    return { visual, auditory, tactile, olfactory, gustatory, flag };
  }

  // ─── PROC-05: Show vs Tell ────────────────────────────────────────────────────

  /**
   * Detect show vs tell balance in the text.
   *
   * - "Tell" indicators: state-of-being + emotion adjective patterns
   * - "Show" indicators: concrete action verbs
   *
   * `ratio` = show / (show + tell); undefined when both are 0.
   *
   * @param text - Raw chapter text
   */
  analyzeShowVsTell(text: string): {
    showScore: number;
    tellScore: number;
    ratio: number;
    examples: Array<{ type: 'show' | 'tell'; text: string }>;
  } {
    const examples: Array<{ type: 'show' | 'tell'; text: string }> = [];

    let m: RegExpExecArray | null;

    // Collect tell examples (first 3)
    const tellRe = new RegExp(TELL_RE.source, 'gi');
    let tellScore = 0;
    while ((m = tellRe.exec(text)) !== null) {
      tellScore++;
      if (examples.filter((e) => e.type === 'tell').length < 3) {
        examples.push({ type: 'tell', text: m[0] });
      }
    }

    // Collect show examples (first 3)
    const showRe = new RegExp(SHOW_RE.source, 'gi');
    let showScore = 0;
    while ((m = showRe.exec(text)) !== null) {
      showScore++;
      if (examples.filter((e) => e.type === 'show').length < 3) {
        examples.push({ type: 'show', text: m[0] });
      }
    }

    const total = showScore + tellScore;
    const ratio = total > 0 ? showScore / total : 0;

    return { showScore, tellScore, ratio, examples };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Build two parallel arrays:
   *   - `contentLines[i]` — the line text (empty string when in a code fence)
   *   - `insideCodeFence[i]` — true when line i is inside a ``` or ~~~ block
   */
  private _classifyLines(
    lines: string[]
  ): { contentLines: string[]; insideCodeFence: boolean[] } {
    const contentLines: string[] = [];
    const insideCodeFence: boolean[] = [];
    let inFence = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        inFence = !inFence;
        insideCodeFence.push(true);
        contentLines.push('');
      } else if (inFence) {
        insideCodeFence.push(true);
        contentLines.push('');
      } else {
        insideCodeFence.push(false);
        contentLines.push(line);
      }
    }

    return { contentLines, insideCodeFence };
  }

  /**
   * Extract blank-line-delimited paragraphs from non-fence lines.
   * Returns objects with the 1-based start line and paragraph text.
   */
  private _extractParagraphs(
    lines: string[],
    insideCodeFence: boolean[]
  ): Array<{ startLine: number; text: string }> {
    const paragraphs: Array<{ startLine: number; text: string }> = [];
    let current: string[] = [];
    let startLine = 1;

    for (let li = 0; li < lines.length; li++) {
      if (insideCodeFence[li]) {
        if (current.length > 0) {
          paragraphs.push({ startLine, text: current.join(' ') });
          current = [];
        }
        continue;
      }
      const line = lines[li].trim();
      if (line === '') {
        if (current.length > 0) {
          paragraphs.push({ startLine, text: current.join(' ') });
          current = [];
        }
      } else {
        if (current.length === 0) startLine = li + 1;
        current.push(line);
      }
    }

    if (current.length > 0) {
      paragraphs.push({ startLine, text: current.join(' ') });
    }

    return paragraphs;
  }

  /**
   * Sliding 300-word window: flag content words (> 5 chars, not in stop list)
   * used more than 3 times within any window.
   */
  private _checkRepetition(tokens: Token[]): ProseCheck[] {
    const WINDOW = 300;
    const THRESHOLD = 3;
    const checks: ProseCheck[] = [];
    const flagged = new Set<string>(); // avoid duplicate reports

    for (let i = 0; i < tokens.length; i++) {
      const windowTokens = tokens.slice(i, i + WINDOW);
      const freq = new Map<string, { count: number; firstIdx: number }>();

      for (let j = 0; j < windowTokens.length; j++) {
        const raw = windowTokens[j].word.toLowerCase().replace(/[^a-z]/g, '');
        if (raw.length <= 5) continue;
        if (REPETITION_STOP_LIST.has(raw)) continue;

        const existing = freq.get(raw);
        if (existing) {
          existing.count++;
        } else {
          freq.set(raw, { count: 1, firstIdx: i + j });
        }
      }

      for (const [word, { count, firstIdx }] of freq) {
        if (count > THRESHOLD) {
          const key = `${word}:${firstIdx}`;
          if (!flagged.has(key)) {
            flagged.add(key);
            const tok = tokens[firstIdx];
            checks.push({
              type: 'word_repetition',
              line: tok.line,
              column: tok.col,
              text: word,
              suggestion: `"${word}" appears ${count}× within 300 words; vary your vocabulary`,
              severity: 'warning',
            });
          }
        }
      }
    }

    return checks;
  }
}
