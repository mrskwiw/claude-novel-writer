/**
 * StyleTargetAnalyzer — measures a chapter's quantitative prose metrics and
 * compares them against the project's declared `style-targets.yml` (or the
 * built-in defaults). This is the deterministic counterpart to the qualitative
 * prose STYLE_GUIDE.md files: it turns the guide's numbers ("adverbs 3-5 per
 * 1000 words", "passive < 8%") into measured-vs-target verdicts.
 *
 * Reuses ProseAnalyzer for show/tell and sensory balance; everything else is
 * computed here with the same regex/heuristic style as the rest of the
 * analysis layer. Pure deterministic — no LLM.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { stripFrontmatter } from './copy-editor.js';
import { ProseAnalyzer } from './prose-analyzer.js';
import { loadStyleTargets, type Range } from './style-targets.js';

// Local regexes mirroring prose-analyzer.ts (kept in sync intentionally).
const ADJ_SUFFIX_RE = /\b\w+(ful|ous|ish|ic|ive|al|ary)\b/gi;
const ADVERB_RE = /\b\w{3,}ly\b/gi;
const PASSIVE_VOICE_RE = /\b(was|were|been|being)\s+\w+ed\b/gi;
const FILTER_WORD_RE = /\b(saw|heard|felt|noticed|wondered|realized|thought|knew|seemed|appeared)\b/gi;

/** -ly words that are not adverbs (heuristic exclusions). */
const ADVERB_FALSE_POSITIVES = new Set([
  'only', 'family', 'reply', 'supply', 'apply', 'holy', 'ally', 'rally',
  'ugly', 'early', 'italy', 'jelly', 'belly', 'lily', 'bully', 'silly',
  'lonely', 'lovely', 'fly', 'rely', 'imply', 'comply', 'multiply',
]);

/** Verb-ish tokens used to decide whether a "sentence" has a verb (fragment heuristic). */
const VERB_HINT_RE =
  /\b(is|are|was|were|be|been|am|do|does|did|has|have|had|will|would|can|could|may|might|must|shall|should|\w+ed|\w+ing)\b/i;

export type MetricStatus = 'ok' | 'low' | 'high' | 'na';

export interface MetricResult {
  key: string;
  label: string;
  /** Measured value, or null when not computable (e.g. no show/tell cues). */
  measured: number | null;
  unit: string;
  min?: number;
  max?: number;
  status: MetricStatus;
  /** Optional caveat, e.g. "heuristic" or "no cues". */
  note?: string;
}

export interface StyleTargetReport {
  chapter: string;
  wordCount: number;
  sentenceCount: number;
  source: 'file' | 'defaults';
  metrics: MetricResult[];
  /** Number of metrics outside their target band. */
  warnings: number;
}

export class StyleTargetAnalyzer {
  private readonly prose: ProseAnalyzer;

  constructor(private readonly projectPath: string) {
    this.prose = new ProseAnalyzer(projectPath);
  }

  /** Analyze a single chapter file against the project's style targets. */
  async analyzeChapter(chapterFile: string): Promise<StyleTargetReport> {
    const filePath = path.isAbsolute(chapterFile)
      ? chapterFile
      : path.join(this.projectPath, 'chapters', chapterFile);
    const raw = await fs.readFile(filePath, 'utf-8');
    return this.analyzeText(raw, path.basename(chapterFile));
  }

  /** Analyze every `.md` file in `chapters/`. */
  async analyzeAll(): Promise<StyleTargetReport[]> {
    const chaptersDir = path.join(this.projectPath, 'chapters');
    let entries: string[];
    try {
      entries = (await fs.readdir(chaptersDir)).filter((f) => f.endsWith('.md'));
    } catch {
      return [];
    }
    return Promise.all(
      entries.map((f) => this.analyzeChapter(path.join(chaptersDir, f))),
    );
  }

  /** Core: measure metrics on raw chapter text and grade against targets. */
  analyzeText(raw: string, chapter: string): StyleTargetReport {
    const { targets, source } = loadStyleTargets(this.projectPath);
    const body = stripCodeFences(stripFrontmatter(raw));

    const words = body.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const sentences = splitSentences(body);
    const sentenceCount = sentences.length;
    const per1000 = (n: number): number =>
      wordCount === 0 ? 0 : round1((n / wordCount) * 1000);

    // ── Measurements ────────────────────────────────────────────────────────
    const meanSentenceWords =
      sentenceCount === 0 ? 0 : round1(wordCount / sentenceCount);

    const adjCount = countMatches(body, ADJ_SUFFIX_RE);
    const adverbCount = countAdverbs(body);
    const passiveSentences = sentences.filter((s) =>
      new RegExp(PASSIVE_VOICE_RE.source, 'i').test(s),
    ).length;
    const passivePercent =
      sentenceCount === 0 ? 0 : round1((passiveSentences / sentenceCount) * 100);
    const filterCount = countMatches(body, FILTER_WORD_RE);

    const showTell = this.prose.analyzeShowVsTell(body);
    const hasCues = showTell.showScore + showTell.tellScore > 0;
    const showingPercent = hasCues ? round1(showTell.ratio * 100) : null;

    const sensory = this.prose.analyzeSensoryBalance(body);
    const sensesPresent = [
      sensory.visual,
      sensory.auditory,
      sensory.tactile,
      sensory.olfactory,
      sensory.gustatory,
    ].filter((c) => c > 0).length;

    const emDashes = (body.match(/—|--/g) ?? []).length;
    const semicolons = (body.match(/;/g) ?? []).length;
    const ellipses = (body.match(/…|\.\.\./g) ?? []).length;

    const paragraphs = splitParagraphs(body);
    const singleSentenceParas = paragraphs.filter(
      (p) => splitSentences(p).length === 1,
    ).length;
    const fragments = sentences.filter(
      (s) => s.split(/\s+/).filter(Boolean).length > 0 && !VERB_HINT_RE.test(s),
    ).length;

    // ── Grade each metric against its target ────────────────────────────────
    const metrics: MetricResult[] = [
      metric('meanSentenceWords', 'Mean sentence length', meanSentenceWords, 'words', targets.meanSentenceWords),
      metric('adjectivesPer1000', 'Adjective density', per1000(adjCount), '/1k words', targets.adjectivesPer1000, 'heuristic'),
      metric('adverbsPer1000', 'Adverb density', per1000(adverbCount), '/1k words', targets.adverbsPer1000, 'heuristic'),
      metric('passivePercent', 'Passive voice', passivePercent, '% of sentences', targets.passivePercent),
      metric('filterWordsPer1000', 'Filter words', per1000(filterCount), '/1k words', targets.filterWordsPer1000),
      metric('showingPercent', 'Showing (of show+tell)', showingPercent, '%', targets.showingPercent, hasCues ? undefined : 'no cues'),
      metric('sensesPerChapter', 'Senses present', sensesPresent, 'of 5', targets.sensesPerChapter),
      metric('emDashesPerChapter', 'Em dashes', emDashes, '/chapter', targets.emDashesPerChapter),
      metric('semicolonsPerChapter', 'Semicolons', semicolons, '/chapter', targets.semicolonsPerChapter),
      metric('ellipsesPerChapter', 'Ellipses', ellipses, '/chapter', targets.ellipsesPerChapter),
      metric('fragmentsPerChapter', 'Fragments', fragments, '/chapter', targets.fragmentsPerChapter, 'heuristic'),
      metric('singleSentenceParagraphsPerChapter', 'Single-sentence paragraphs', singleSentenceParas, '/chapter', targets.singleSentenceParagraphsPerChapter),
    ];

    const warnings = metrics.filter((m) => m.status === 'low' || m.status === 'high').length;

    return { chapter, wordCount, sentenceCount, source, metrics, warnings };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length;
}

function countAdverbs(text: string): number {
  const matches = text.match(new RegExp(ADVERB_RE.source, 'gi')) ?? [];
  return matches.filter((w) => !ADVERB_FALSE_POSITIVES.has(w.toLowerCase())).length;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    // Drop markdown structural lines (headings, dividers, comments).
    .filter((p) => p && !/^(#{1,6}\s|---|<!--)/.test(p));
}

function stripCodeFences(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('```') || t.startsWith('~~~')) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(line);
  }
  return out.join('\n');
}

/** Build a graded metric result. */
function metric(
  key: string,
  label: string,
  measured: number | null,
  unit: string,
  range: Range | null | undefined,
  note?: string,
): MetricResult {
  const base: MetricResult = { key, label, measured, unit, status: 'na', note };
  if (!range || measured === null) return base;
  base.min = range.min;
  base.max = range.max;
  if (range.min !== undefined && measured < range.min) base.status = 'low';
  else if (range.max !== undefined && measured > range.max) base.status = 'high';
  else base.status = 'ok';
  return base;
}
