/**
 * VoiceAnalyzer — manuscript-level character VOICE analysis.
 *
 * Where {@link ProseAnalyzer.analyzeCharacterVoices} answers "what does this
 * character sound like *in this chapter*?", VoiceAnalyzer answers two
 * manuscript-wide questions:
 *
 *   1. SIMILARITY — "do two characters sound too alike?" Two characters whose
 *      voice fingerprints sit closer than {@link SIMILAR_VOICE_THRESHOLD} are
 *      flagged as a `similarPair` (their voices are not distinct).
 *   2. DRIFT — "does a character's voice wander across chapters?" A character
 *      whose per-chapter fingerprint strays from its own aggregate centroid by
 *      more than {@link DRIFT_THRESHOLD} is flagged as `drifting`.
 *
 * The fingerprint is built from the existing prose-analyzer primitives
 * (`extractDialogueByCharacter` + `analyzeCharacterVoices`), so the heuristics
 * stay consistent with the per-chapter tooling. Pure deterministic — no LLM.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { stripFrontmatter } from './copy-editor.js';
import { ProseAnalyzer } from './prose-analyzer.js';

// ─── Tunable constants ────────────────────────────────────────────────────────

/**
 * Feature-normalisation scales. Each numeric feature is divided by its scale so
 * that a "1.0 scale unit" difference contributes equally to the Euclidean
 * distance regardless of the feature's natural magnitude.
 */
const SENTENCE_LENGTH_SCALE = 20; // words per dialogue line (typical 3–25)
const WORD_LENGTH_SCALE = 4; // characters per word (typical 3–7)
const TYPE_TOKEN_RATIO_SCALE = 1; // already 0–1

/** Two characters closer than this normalised distance count as "too alike". */
export const SIMILAR_VOICE_THRESHOLD = 0.15;

/**
 * A character whose worst per-chapter fingerprint sits farther than this from
 * its own aggregate centroid is flagged as having a drifting (inconsistent)
 * voice.
 */
export const DRIFT_THRESHOLD = 0.25;

/** Minimum dialogue lines a character needs before its voice is measured. */
export const MIN_LINES_FOR_VOICE = 3;

/** Number of distinctive bigrams retained per aggregate fingerprint. */
const TOP_BIGRAMS = 5;

// ─── Public types ─────────────────────────────────────────────────────────────

/** The numeric + lexical signature of a character's dialogue. */
export interface VoiceFingerprint {
  /** Mean words per dialogue line. */
  avgSentenceLength: number;
  /** Mean characters per word. */
  avgWordLength: number;
  /** Unique words / total words (lexical variety, 0–1). */
  typeTokenRatio: number;
  /** Most distinctive repeated 2-word phrases. */
  topBigrams: string[];
}

/** A character's fingerprint as measured within a single chapter. */
export interface ChapterFingerprint extends VoiceFingerprint {
  chapter: string;
  lineCount: number;
}

/** Aggregate per-character voice across the whole manuscript. */
export interface CharacterVoice {
  character: string;
  /** Total dialogue lines across all chapters. */
  lineCount: number;
  /** Number of chapters the character speaks in. */
  chapterCount: number;
  /** Aggregate fingerprint over all the character's dialogue. */
  fingerprint: VoiceFingerprint;
  /** Per-chapter fingerprints, in chapter order. */
  perChapter: ChapterFingerprint[];
}

/** A pair of characters whose voices are too similar. */
export interface SimilarPair {
  a: string;
  b: string;
  /** Normalised Euclidean distance between their aggregate fingerprints. */
  distance: number;
}

/** A character whose voice drifts across chapters. */
export interface DriftingCharacter {
  character: string;
  /** Largest distance from any chapter fingerprint to the aggregate centroid. */
  maxDistance: number;
  /** Chapters whose fingerprint exceeds {@link DRIFT_THRESHOLD}. */
  outlierChapters: string[];
}

/** Full manuscript voice report. */
export interface VoiceReport {
  characters: CharacterVoice[];
  similarPairs: SimilarPair[];
  drifting: DriftingCharacter[];
}

// ─── VoiceAnalyzer ─────────────────────────────────────────────────────────────

export class VoiceAnalyzer {
  private readonly prose: ProseAnalyzer;

  constructor(private readonly projectPath: string) {
    this.prose = new ProseAnalyzer(projectPath);
  }

  /**
   * Analyse every `chapters/*.md` file and produce a manuscript-wide voice
   * report: aggregate fingerprints, too-similar pairs, and drifting voices.
   */
  async analyzeManuscript(): Promise<VoiceReport> {
    const chaptersDir = path.join(this.projectPath, 'chapters');
    let entries: string[];
    try {
      entries = (await fs.readdir(chaptersDir))
        .filter((f) => f.endsWith('.md'))
        .sort();
    } catch {
      return { characters: [], similarPairs: [], drifting: [] };
    }

    // Accumulate per-character data across chapters.
    interface Acc {
      perChapter: ChapterFingerprint[];
      allLines: string[];
      bigramVotes: Map<string, number>;
    }
    const byCharacter = new Map<string, Acc>();

    for (const file of entries) {
      const raw = await fs.readFile(path.join(chaptersDir, file), 'utf-8');
      const text = this.prepareText(raw);
      const chapterName = file;

      // Primitive #1: numeric voice stats per speaker for this chapter.
      const voices = this.prose.analyzeCharacterVoices(text);
      // Primitive #2: raw dialogue lines per speaker (for TTR + line storage).
      const byChar = this.prose.extractDialogueByCharacter(text);

      for (const v of voices) {
        if (v.speaker === 'Unknown') continue;
        const lines = byChar.get(v.speaker) ?? [];
        const acc =
          byCharacter.get(v.speaker) ??
          ({ perChapter: [], allLines: [], bigramVotes: new Map() } as Acc);

        const fingerprint: ChapterFingerprint = {
          chapter: chapterName,
          lineCount: v.lineCount,
          avgSentenceLength: v.avgSentenceLength,
          avgWordLength: v.avgWordLength,
          typeTokenRatio: round2(typeTokenRatio(lines)),
          topBigrams: v.distinctivePhrases,
        };

        acc.perChapter.push(fingerprint);
        acc.allLines.push(...lines);
        for (const bg of v.distinctivePhrases) {
          acc.bigramVotes.set(bg, (acc.bigramVotes.get(bg) ?? 0) + 1);
        }
        byCharacter.set(v.speaker, acc);
      }
    }

    // Build aggregate per-character voices (only those with enough dialogue).
    const characters: CharacterVoice[] = [];
    for (const [character, acc] of byCharacter) {
      const lineCount = acc.allLines.length;
      if (lineCount < MIN_LINES_FOR_VOICE) continue;

      const aggregate: VoiceFingerprint = {
        avgSentenceLength: round2(
          weightedMean(acc.perChapter, (f) => f.avgSentenceLength)
        ),
        avgWordLength: round2(
          weightedMean(acc.perChapter, (f) => f.avgWordLength)
        ),
        typeTokenRatio: round2(typeTokenRatio(acc.allLines)),
        topBigrams: topVoted(acc.bigramVotes, TOP_BIGRAMS),
      };

      characters.push({
        character,
        lineCount,
        chapterCount: acc.perChapter.length,
        fingerprint: aggregate,
        perChapter: acc.perChapter,
      });
    }

    characters.sort((a, b) => b.lineCount - a.lineCount);

    return {
      characters,
      similarPairs: this.findSimilarPairs(characters),
      drifting: this.findDrifting(characters),
    };
  }

  // ─── Flag detection ─────────────────────────────────────────────────────────

  /** All character pairs whose aggregate fingerprints are too close. */
  private findSimilarPairs(characters: CharacterVoice[]): SimilarPair[] {
    const pairs: SimilarPair[] = [];
    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        const distance = fingerprintDistance(
          characters[i].fingerprint,
          characters[j].fingerprint
        );
        if (distance < SIMILAR_VOICE_THRESHOLD) {
          pairs.push({
            a: characters[i].character,
            b: characters[j].character,
            distance: round2(distance),
          });
        }
      }
    }
    return pairs.sort((a, b) => a.distance - b.distance);
  }

  /** Characters whose per-chapter voice strays from their own centroid. */
  private findDrifting(characters: CharacterVoice[]): DriftingCharacter[] {
    const drifting: DriftingCharacter[] = [];
    for (const c of characters) {
      if (c.perChapter.length < 2) continue; // need ≥2 chapters to drift

      let maxDistance = 0;
      const outlierChapters: string[] = [];
      for (const ch of c.perChapter) {
        const d = fingerprintDistance(ch, c.fingerprint);
        if (d > maxDistance) maxDistance = d;
        if (d > DRIFT_THRESHOLD) outlierChapters.push(ch.chapter);
      }

      if (maxDistance > DRIFT_THRESHOLD) {
        drifting.push({
          character: c.character,
          maxDistance: round2(maxDistance),
          outlierChapters,
        });
      }
    }
    return drifting.sort((a, b) => b.maxDistance - a.maxDistance);
  }

  // ─── Text preparation ───────────────────────────────────────────────────────

  /** Strip YAML frontmatter and fenced code blocks before voice extraction. */
  private prepareText(raw: string): string {
    const withoutFrontmatter = stripFrontmatter(raw);
    const lines = withoutFrontmatter.split('\n');
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
}

// ─── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Normalised Euclidean distance between two fingerprints over the three numeric
 * features. Each feature delta is divided by its scale so the axes are
 * comparable; the result is a small unit-less number (0 = identical voices).
 */
export function fingerprintDistance(
  a: VoiceFingerprint,
  b: VoiceFingerprint
): number {
  const ds = (a.avgSentenceLength - b.avgSentenceLength) / SENTENCE_LENGTH_SCALE;
  const dw = (a.avgWordLength - b.avgWordLength) / WORD_LENGTH_SCALE;
  const dt = (a.typeTokenRatio - b.typeTokenRatio) / TYPE_TOKEN_RATIO_SCALE;
  return Math.sqrt(ds * ds + dw * dw + dt * dt);
}

/** Unique-word / total-word ratio over a set of dialogue lines (0 when empty). */
function typeTokenRatio(lines: string[]): number {
  const words: string[] = [];
  for (const line of lines) {
    for (const w of line.toLowerCase().split(/\s+/)) {
      const clean = w.replace(/[^a-z']/g, '');
      if (clean.length > 0) words.push(clean);
    }
  }
  if (words.length === 0) return 0;
  return new Set(words).size / words.length;
}

/** Line-count-weighted mean of a per-chapter numeric feature. */
function weightedMean(
  fingerprints: ChapterFingerprint[],
  pick: (f: ChapterFingerprint) => number
): number {
  let num = 0;
  let den = 0;
  for (const f of fingerprints) {
    num += pick(f) * f.lineCount;
    den += f.lineCount;
  }
  return den === 0 ? 0 : num / den;
}

/** Top-N keys from a vote map, ranked by votes then alphabetically. */
function topVoted(votes: Map<string, number>, n: number): string[] {
  return [...votes.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([phrase]) => phrase);
}

/** Round to two decimal places. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
