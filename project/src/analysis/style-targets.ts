/**
 * Style Targets — machine-readable quantitative prose targets.
 *
 * A project may ship a `style-targets.yml` at its root declaring the numeric
 * style targets that the deterministic analyzers compare against (sentence
 * length, modifier density, passive voice %, punctuation cadence, etc.). This
 * is the structured counterpart to the prose STYLE_GUIDE.md files: the .md
 * guides hold qualitative voice guidance for the LLM editors, while this file
 * holds the numbers the deterministic tools can actually measure against.
 *
 * Missing file → sensible general-fiction defaults are used. Any field omitted
 * from the file falls back to its default; a field set to `null` disables that
 * check entirely.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

/** An inclusive target band. `min`/`max` are each optional. */
export interface Range {
  min?: number;
  max?: number;
}

/**
 * Quantitative style targets. Every metric is optional; omit (or set null in
 * YAML) to skip that check. Densities are per 1000 words; per-chapter counts
 * are evaluated against a single chapter file.
 */
export interface StyleTargets {
  /** Mean sentence length, in words. */
  meanSentenceWords?: Range | null;
  /** Adjectives per 1000 words (suffix heuristic). */
  adjectivesPer1000?: Range | null;
  /** Adverbs per 1000 words (-ly heuristic). */
  adverbsPer1000?: Range | null;
  /** Passive-voice sentences as a percentage of all sentences. */
  passivePercent?: Range | null;
  /** Filter words ("saw", "felt", "noticed"…) per 1000 words. */
  filterWordsPer1000?: Range | null;
  /** Showing as a percentage of show+tell indicators (min = floor on showing). */
  showingPercent?: Range | null;
  /** Distinct senses (of 5) that appear in the chapter. */
  sensesPerChapter?: Range | null;
  /** Em dashes per chapter. */
  emDashesPerChapter?: Range | null;
  /** Semicolons per chapter. */
  semicolonsPerChapter?: Range | null;
  /** Ellipses per chapter. */
  ellipsesPerChapter?: Range | null;
  /** Sentence fragments per chapter (heuristic). */
  fragmentsPerChapter?: Range | null;
  /** Single-sentence paragraphs per chapter. */
  singleSentenceParagraphsPerChapter?: Range | null;
  /** Expected narrative tense (informational; consumed by the copy editor). */
  tense?: 'past' | 'present' | null;
}

/** General-fiction defaults — deliberately loose so they don't nag untuned projects. */
export const DEFAULT_STYLE_TARGETS: StyleTargets = {
  meanSentenceWords: { min: 12, max: 25 },
  adjectivesPer1000: { min: 8, max: 25 },
  adverbsPer1000: { max: 10 },
  passivePercent: { max: 10 },
  filterWordsPer1000: { max: 12 },
  showingPercent: { min: 70 },
  sensesPerChapter: { min: 3 },
  emDashesPerChapter: { max: 20 },
  semicolonsPerChapter: { max: 15 },
  ellipsesPerChapter: { max: 8 },
  fragmentsPerChapter: { max: 6 },
  singleSentenceParagraphsPerChapter: { max: 10 },
  tense: 'past',
};

export const STYLE_TARGETS_FILENAME = 'style-targets.yml';

/** Keys that carry a {min,max} Range (everything except `tense`). */
type RangeKey = Exclude<keyof StyleTargets, 'tense'>;

const RANGE_KEYS: RangeKey[] = [
  'meanSentenceWords',
  'adjectivesPer1000',
  'adverbsPer1000',
  'passivePercent',
  'filterWordsPer1000',
  'showingPercent',
  'sensesPerChapter',
  'emDashesPerChapter',
  'semicolonsPerChapter',
  'ellipsesPerChapter',
  'fragmentsPerChapter',
  'singleSentenceParagraphsPerChapter',
];

/**
 * Merge a user-supplied (partial) target set over the defaults. A key present
 * but explicitly `null` disables that metric; an absent key keeps the default.
 */
function mergeTargets(base: StyleTargets, override: Partial<StyleTargets>): StyleTargets {
  const merged: StyleTargets = { ...base };
  for (const key of RANGE_KEYS) {
    if (key in override) {
      const value = override[key];
      // null → disable; object → use as-is; anything else → keep default
      merged[key] = value === null ? null : value ?? base[key] ?? undefined;
    }
  }
  if ('tense' in override) {
    merged.tense = override.tense ?? null;
  }
  return merged;
}

export interface LoadedStyleTargets {
  targets: StyleTargets;
  /** Whether the targets came from a project file or the built-in defaults. */
  source: 'file' | 'defaults';
}

/**
 * Load `style-targets.yml` from a project directory, merged over the defaults.
 * Never throws — a missing or malformed file falls back to defaults.
 */
export function loadStyleTargets(projectPath: string): LoadedStyleTargets {
  const file = join(projectPath, STYLE_TARGETS_FILENAME);
  if (!existsSync(file)) {
    return { targets: DEFAULT_STYLE_TARGETS, source: 'defaults' };
  }
  try {
    const raw = readFileSync(file, 'utf-8');
    const parsed = YAML.parse(raw) as Partial<StyleTargets> | null;
    if (!parsed || typeof parsed !== 'object') {
      return { targets: DEFAULT_STYLE_TARGETS, source: 'defaults' };
    }
    return { targets: mergeTargets(DEFAULT_STYLE_TARGETS, parsed), source: 'file' };
  } catch {
    return { targets: DEFAULT_STYLE_TARGETS, source: 'defaults' };
  }
}
