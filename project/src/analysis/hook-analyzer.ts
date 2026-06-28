/**
 * HookAnalyzer — deterministic opening-line "hook strength" scorer.
 *
 * Scores the opening line(s) of a chapter against signals that craft guides
 * associate with a strong opening, and against the throat-clearing clichés they
 * warn about. Pure deterministic (no LLM): every signal is a regex/word-list
 * test over the opening text, so the same chapter always scores the same.
 *
 * The score is advisory, not a verdict — the per-signal breakdown and the
 * suggestions are the useful output. "Suggest, don't dictate."
 *
 * Signals (max 100):
 *   - Poses a question (20)      — a literal "?" or an interrogative opener that
 *                                  plants a question in the reader's mind.
 *   - Introduces a character (20)— a proper noun or a stake-bearing pronoun.
 *   - Place / atmosphere (15)    — sensory words that ground the reader.
 *   - In medias res (20)         — an action verb early in the opening.
 *   - Tension / conflict (15)    — words that signal stakes or danger.
 *   - Avoids throat-clearing (10)— no weather-only / waking-up cliché opening.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { stripFrontmatter } from './copy-editor.js';

/** A single scored signal in the hook breakdown. */
export interface HookSignal {
  key: string;
  label: string;
  /** Points awarded (0..max). */
  points: number;
  /** Maximum points this signal can contribute. */
  max: number;
  /** Human-readable note on what was (or was not) found. */
  detail: string;
}

/** The full hook-strength result for one chapter's opening. */
export interface HookScore {
  /** Display name of the analyzed chapter (basename). */
  chapter: string;
  /** The first sentence of the opening. */
  openingLine: string;
  /** The leading slice of prose that was scored (first ~40 words). */
  openingText: string;
  /** Total score, 0..100. */
  score: number;
  signals: HookSignal[];
  /** Concrete, advisory suggestions for the weakest signals. */
  suggestions: string[];
}

// ─── Word lists / patterns ────────────────────────────────────────────────────

/**
 * Interrogative words that, *as the first word*, plant a question even without
 * a "?". Restricted to the opening word so a declarative "It was…" / "She is…"
 * is not mistaken for a question.
 */
const INTERROGATIVE_FIRST = new Set([
  'who', 'what', 'why', 'how', 'where', 'when', 'which', 'whether',
  'did', 'do', 'does', 'was', 'were', 'could', 'would', 'should',
  'is', 'are', 'will', 'can', 'has', 'have', 'had',
]);

/** Phrases that imply an unanswered question / mystery. */
const QUESTION_IMPLIED_RE =
  /\b(no one knew|nobody knew|no one could|the question|the truth|the secret|wondered|nobody could|never understood|could not explain|couldn't explain)\b/i;

/** Sensory words that ground the reader in place / atmosphere. */
const SENSORY_RE =
  /\b(saw|looked|watched|bright|dark|shadow|light|cold|warm|heat|rough|smooth|smell|scent|stench|taste|bitter|sweet|sound|loud|silence|quiet|echoed|rain|snow|wind|dust|smoke|salt|damp|fog|glare)\b/i;

/** Action verbs that signal an in-medias-res opening when they appear early. */
const ACTION_VERB_RE =
  /\b(ran|run|running|slammed|grabbed|seized|threw|hurled|leapt|jumped|burst|crashed|kicked|struck|shoved|sprinted|dove|dived|fled|swung|fired|shot|screamed|smashed|tore|broke|charged|lunged|snatched|hauled|wrenched)\b/i;

/** Stakes / danger vocabulary. */
const TENSION_RE =
  /\b(blood|bleeding|death|dead|dying|die|kill|killed|killer|gun|knife|blade|fire|burn|scream|screamed|fear|afraid|terror|danger|dangerous|fight|fought|war|wound|pain|threat|enemy|chase|hunt|trapped|escape|panic|corpse|murder|weapon)\b/i;

/** Weather-only opening cliché (the storied "it was a dark and stormy night"). */
const WEATHER_CLICHE_RE =
  /^\s*(it was a|the)\b[^.?!]*\b(morning|afternoon|evening|night|day|sky|sun|rain|snow|wind|weather|clouds?)\b/i;

/** Waking-up / alarm-clock opening cliché. */
const WAKING_CLICHE_RE =
  /\b(woke up|awoke|opened (?:her|his|their|my) eyes|eyes (?:fluttered|snapped) open|the alarm|alarm clock|rolled out of bed|sat up in bed|blinked awake)\b/i;

/**
 * Capitalized words that are common sentence-starters / function words rather
 * than names. Used to avoid mistaking "The", "She", "When"… for a character.
 */
const SENTENCE_STARTERS = new Set([
  'the', 'a', 'an', 'it', 'he', 'she', 'they', 'we', 'i', 'there', 'here',
  'when', 'then', 'as', 'but', 'and', 'his', 'her', 'their', 'that', 'this',
  'in', 'on', 'at', 'for', 'with', 'to', 'no', 'not', 'of', 'from', 'by',
  'was', 'were', 'once', 'after', 'before', 'outside', 'inside', 'later',
  'now', 'today', 'tonight', 'yesterday', 'somewhere', 'nothing', 'everything',
  'something', 'everyone', 'someone', 'nobody', 'if', 'so', 'yet', 'still',
]);

/** Stake-bearing first-person / close pronoun openers. */
const STAKES_PRONOUN_RE = /\b(I|we|my|me)\b/;

/**
 * Find the first plausible proper noun (a character name) in the opening: a
 * capitalized, otherwise-lowercase word that is not a common sentence-starter.
 * Considers the very first word too, since strong openings often name the
 * protagonist up front.
 */
function findProperNoun(text: string): string | undefined {
  for (const rawWord of text.split(/\s+/)) {
    const w = rawWord.replace(/[^A-Za-z']/g, '');
    if (w.length < 2) continue;
    if (!/^[A-Z][a-z]+$/.test(w)) continue;
    if (SENTENCE_STARTERS.has(w.toLowerCase())) continue;
    return w;
  }
  return undefined;
}

// ─── Analyzer ─────────────────────────────────────────────────────────────────

export class HookAnalyzer {
  constructor(private readonly projectPath: string) {}

  /**
   * Score the opening of a chapter file.
   *
   * @param chapterFile Absolute path, or path relative to `projectPath/chapters/`.
   */
  async analyzeChapter(chapterFile: string): Promise<HookScore> {
    const filePath = path.isAbsolute(chapterFile)
      ? chapterFile
      : path.join(this.projectPath, 'chapters', chapterFile);
    const raw = await fs.readFile(filePath, 'utf-8');
    return this.analyzeText(raw, path.basename(chapterFile));
  }

  /**
   * Core deterministic scorer over raw chapter text.
   *
   * @param raw     Full chapter contents (frontmatter/markup tolerated).
   * @param chapter Display name for the result.
   */
  analyzeText(raw: string, chapter: string): HookScore {
    const opening = extractOpening(raw);
    const openingText = opening.text;
    const words = openingText.split(/\s+/).filter(Boolean);

    const signals: HookSignal[] = [];
    const suggestions: string[] = [];

    // 1. Poses / creates a question.
    const firstWord = (words[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
    const hasQuestionMark = openingText.includes('?');
    const hasQuestionOpener = INTERROGATIVE_FIRST.has(firstWord);
    const hasImpliedQuestion = QUESTION_IMPLIED_RE.test(openingText);
    if (hasQuestionMark || hasQuestionOpener || hasImpliedQuestion) {
      signals.push(sig('question', 'Poses a question', 20, 20,
        hasQuestionMark ? 'opens on a direct question'
          : hasImpliedQuestion ? 'plants an unanswered question'
          : 'opens with an interrogative beat'));
    } else {
      signals.push(sig('question', 'Poses a question', 0, 20, 'no question pulls the reader in'));
      suggestions.push('Consider raising a question the reader needs answered — a mystery, a contradiction, or an unexplained image.');
    }

    // 2. Introduces a character.
    const properNoun = findProperNoun(openingText);
    const hasStakesPronoun = STAKES_PRONOUN_RE.test(openingText);
    if (properNoun) {
      signals.push(sig('character', 'Introduces a character', 20, 20, `names "${properNoun}" early`));
    } else if (hasStakesPronoun) {
      signals.push(sig('character', 'Introduces a character', 14, 20, 'a first-person voice is present, though no one is named'));
      suggestions.push('A named character lands faster than a bare pronoun — consider naming who we are with.');
    } else {
      signals.push(sig('character', 'Introduces a character', 0, 20, 'no character is present yet'));
      suggestions.push('Consider putting a person on the page in the first line — readers bond with people, not scenery.');
    }

    // 3. Place / atmosphere via sensory grounding.
    if (SENSORY_RE.test(openingText)) {
      signals.push(sig('atmosphere', 'Place / atmosphere', 15, 15, 'sensory detail grounds the scene'));
    } else {
      signals.push(sig('atmosphere', 'Place / atmosphere', 0, 15, 'little sensory grounding'));
      suggestions.push('A concrete sensory detail (a sound, a smell, the quality of light) can root the reader in the scene.');
    }

    // 4. In medias res — action verb early.
    const earlyWindow = openingText.split(/\s+/).filter(Boolean).slice(0, 12).join(' ');
    if (ACTION_VERB_RE.test(earlyWindow)) {
      signals.push(sig('action', 'In medias res', 20, 20, 'an action verb drives the opening'));
    } else if (ACTION_VERB_RE.test(openingText)) {
      signals.push(sig('action', 'In medias res', 12, 20, 'action arrives, but not in the first beat'));
      suggestions.push('Bringing the action forward — into the very first clause — can sharpen the opening.');
    } else {
      signals.push(sig('action', 'In medias res', 0, 20, 'the opening is static'));
      suggestions.push('Consider opening mid-motion: a verb of action up front drops the reader straight into events.');
    }

    // 5. Tension / conflict vocabulary.
    if (TENSION_RE.test(openingText)) {
      signals.push(sig('tension', 'Tension / conflict', 15, 15, 'stakes are signalled early'));
    } else {
      signals.push(sig('tension', 'Tension / conflict', 0, 15, 'no stakes are visible yet'));
      suggestions.push('A hint of stakes — danger, conflict, something to lose — gives the reader a reason to read on.');
    }

    // 6. Avoids throat-clearing (weather-only / waking-up clichés).
    const weather = WEATHER_CLICHE_RE.test(openingText);
    const waking = WAKING_CLICHE_RE.test(openingText);
    if (!weather && !waking) {
      signals.push(sig('throat_clearing', 'Avoids throat-clearing', 10, 10, 'no clichéd opening detected'));
    } else {
      const which = waking ? 'a waking-up opening' : 'a weather-only opening';
      signals.push(sig('throat_clearing', 'Avoids throat-clearing', 0, 10, `${which} is a common throat-clearing cliché`));
      suggestions.push(
        waking
          ? 'Waking-up openings are a well-worn cliché — consider starting after the character is already in motion.'
          : 'Weather-only openings rarely hook — consider leading with a person or an event, and letting the weather colour it.',
      );
    }

    const score = signals.reduce((sum, s) => sum + s.points, 0);

    return {
      chapter,
      openingLine: opening.firstSentence,
      openingText,
      score,
      signals,
      suggestions,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sig(key: string, label: string, points: number, max: number, detail: string): HookSignal {
  return { key, label, points, max, detail };
}

/**
 * Extract the opening prose of a chapter: strip frontmatter, HTML comments,
 * markdown headings and code fences, then take the first sentence and a leading
 * ~40-word window for scoring.
 */
function extractOpening(raw: string): { text: string; firstSentence: string } {
  const body = stripFrontmatter(raw);
  const lines = body.split('\n');
  const prose: string[] = [];
  let inFence = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('```') || t.startsWith('~~~')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (t === '') continue;
    if (/^#{1,6}\s/.test(t)) continue; // markdown heading
    if (/^<!--.*-->$/.test(t)) continue; // single-line HTML comment (scene markers)
    if (t.startsWith('<!--') || t.startsWith('-->')) continue; // stray comment delimiters
    prose.push(t);
    // First two non-empty prose lines are plenty to find the opening.
    if (prose.length >= 2) break;
  }

  const joined = prose.join(' ').replace(/\s+/g, ' ').trim();
  const words = joined.split(/\s+/).filter(Boolean);
  const openingText = words.slice(0, 40).join(' ');
  const firstSentence = (openingText.match(/^[^.?!]*[.?!]?/)?.[0] ?? openingText).trim();
  return { text: openingText, firstSentence };
}
