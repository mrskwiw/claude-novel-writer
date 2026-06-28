/**
 * Severity grading for prose/style flags (advisory mode).
 *
 * The deterministic analyzers (ProseAnalyzer & friends) emit per-occurrence
 * `ProseCheck`s with a blunt fixed `severity` ('info' | 'warning' | 'error').
 * That treats every flag as pass/fail. This module re-grades those flags into a
 * softer, *advisory*, *density-relative* model that respects the author's voice
 * (Le Guin: don't condemn all telling — flag, don't forbid):
 *
 *   - Flags are graded 'info' | 'suggestion' | 'warning' by how far the *density*
 *     of that flag type exceeds the tolerance the project declares in
 *     `style-targets.yml` (falling back to general-fiction tolerances).
 *   - Wording is softened and non-imperative ("a stronger verb may carry the
 *     weight" rather than "Remove this word").
 *   - A per-project `allow:` list in `style-targets.yml` suppresses any flag
 *     whose flagged text the author has chosen to keep.
 *
 * This module never rewrites the analyzers; it post-processes their output. The
 * CLI opts back into hard, blunt flagging with `--strict`, which bypasses this
 * module entirely.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import type { ProseCheck } from '../types/novel.js';
import { STYLE_TARGETS_FILENAME, type StyleTargets } from './style-targets.js';

/** Advisory severity ladder — softer than the analyzers' raw severities. */
export type AdvisorySeverity = 'info' | 'suggestion' | 'warning';

/** A re-graded, advisory view of a single prose check. */
export interface GradedCheck {
  type: ProseCheck['type'];
  line: number;
  column?: number;
  /** The exact text the analyzer flagged. */
  text: string;
  /** Re-graded advisory severity. */
  severity: AdvisorySeverity;
  /** Softened, non-imperative guidance (no leading verb). */
  message: string;
}

/**
 * Per-type tolerance, expressed as a flag density per 1000 words. A flag type's
 * density at or below `per1000Max` is a gentle 'info'; up to 2× is a
 * 'suggestion'; beyond 2× is a 'warning'. `targetKey`, when set, lets the
 * project's `style-targets.yml` band (its `max`) override the built-in number,
 * so the grading scales to the project's declared style.
 */
interface TypeTolerance {
  per1000Max: number;
  targetKey?: 'filterWordsPer1000' | 'adverbsPer1000';
}

const TYPE_TOLERANCE: Record<string, TypeTolerance> = {
  intensifier: { per1000Max: 8 },
  filter_word: { per1000Max: 12, targetKey: 'filterWordsPer1000' },
  adverb_tag: { per1000Max: 6, targetKey: 'adverbsPer1000' },
  passive_voice: { per1000Max: 10 },
  word_repetition: { per1000Max: 6 },
  sentence_monotony: { per1000Max: 4 },
  on_the_nose_dialogue: { per1000Max: 1 },
  purple_prose: { per1000Max: 2 },
  // Redundant doublings are objective; any occurrence earns a soft note.
  doubled_word: { per1000Max: 0 },
};

/** Default tolerance for any flag type not listed above. */
const FALLBACK_TOLERANCE: TypeTolerance = { per1000Max: 5 };

/**
 * Softened, non-imperative guidance per flag type. These read as observations
 * the author may act on, not commands — deliberately avoiding "Remove…",
 * "Don't…", "Always…".
 */
const SOFT_MESSAGE: Record<string, string> = {
  intensifier: 'an intensifier — a stronger verb or noun may carry the weight without it',
  filter_word:
    'filters the moment through perception — rendering it directly can pull the reader closer, though a little distance is sometimes the point',
  adverb_tag: 'an adverb on a dialogue tag — an action beat can often do the same work',
  passive_voice:
    'a passive construction — active phrasing tends to feel livelier, where it suits the moment',
  doubled_word: 'reads as redundant — one of the two words usually carries the meaning',
  sentence_monotony:
    'these sentences run to a similar length — varying the rhythm can wake the ear',
  word_repetition:
    'repeats within a short span — a touch of variety can help, unless the echo is deliberate',
  on_the_nose_dialogue:
    'reads as on-the-nose — trusting subtext can land harder, where the scene allows',
  purple_prose:
    'dense with modifiers — trimming can sharpen the image, if that is the effect you want',
};

const GENERIC_MESSAGE = 'worth a second look, if it does not serve the moment';

/**
 * Load the optional `allow:` list from a project's `style-targets.yml`. Entries
 * are words or phrases the author has chosen to keep; any flag whose text
 * matches one is suppressed. Returns lowercased, trimmed, non-empty entries.
 * Never throws — a missing or malformed file yields an empty list.
 */
export function loadAllowList(projectPath: string): string[] {
  const file = join(projectPath, STYLE_TARGETS_FILENAME);
  if (!existsSync(file)) return [];
  try {
    const parsed = YAML.parse(readFileSync(file, 'utf-8')) as { allow?: unknown } | null;
    const raw = parsed?.allow;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length > 0);
  } catch {
    return [];
  }
}

/**
 * True when the flagged `text` is covered by the author's allow-list. Matching
 * is case-insensitive and substring-symmetric: an allow entry "old man" covers
 * a flag on "old man", and an allow entry "darkly" covers a flag on
 * "said darkly".
 */
export function isAllowed(text: string, allow: string[]): boolean {
  if (allow.length === 0) return false;
  const t = text.trim().toLowerCase();
  if (t.length === 0) return false;
  return allow.some((a) => t.includes(a) || a.includes(t));
}

/** Resolve the per-1000-words tolerance for a flag type, honouring style targets. */
function toleranceFor(type: string, targets: StyleTargets): number {
  const rule = TYPE_TOLERANCE[type] ?? FALLBACK_TOLERANCE;
  if (rule.targetKey) {
    const band = targets[rule.targetKey];
    if (band && typeof band.max === 'number') return band.max;
  }
  return rule.per1000Max;
}

/**
 * Grade a flag's advisory severity from its type's density (per 1000 words)
 * relative to the tolerance:
 *   density ≤ tolerance        → 'info'
 *   tolerance < density ≤ 2×   → 'suggestion'
 *   density > 2× tolerance     → 'warning'
 * When tolerance is 0 (e.g. redundant doublings), any occurrence → 'suggestion'.
 */
function gradeSeverity(density: number, tolerance: number): AdvisorySeverity {
  if (tolerance <= 0) return 'suggestion';
  if (density <= tolerance) return 'info';
  if (density <= tolerance * 2) return 'suggestion';
  return 'warning';
}

/**
 * Re-grade a set of analyzer `ProseCheck`s into advisory `GradedCheck`s.
 *
 * @param checks    Raw checks from an analyzer.
 * @param wordCount Word count of the analyzed text (drives density).
 * @param targets   Project style targets (scales the per-type tolerances).
 * @param allow     Allow-list of words/phrases to suppress.
 * @returns Graded checks, allow-listed flags removed, ordered as input.
 */
export function gradeChecks(
  checks: ProseCheck[],
  wordCount: number,
  targets: StyleTargets,
  allow: string[],
): GradedCheck[] {
  // Density is per flag *type*, so count each type once over the whole text.
  const counts = new Map<string, number>();
  for (const c of checks) {
    if (isAllowed(c.text, allow)) continue;
    counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  }

  const per1000 = (n: number): number => (wordCount > 0 ? (n / wordCount) * 1000 : n);

  const graded: GradedCheck[] = [];
  for (const c of checks) {
    if (isAllowed(c.text, allow)) continue;
    const tolerance = toleranceFor(c.type, targets);
    const density = per1000(counts.get(c.type) ?? 1);
    graded.push({
      type: c.type,
      line: c.line,
      column: c.column,
      text: c.text,
      severity: gradeSeverity(density, tolerance),
      message: SOFT_MESSAGE[c.type] ?? GENERIC_MESSAGE,
    });
  }
  return graded;
}
