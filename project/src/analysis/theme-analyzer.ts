/**
 * ThemeAnalyzer — deterministic theme / motif-density scanner
 *
 * A theme (e.g. "isolation") is registered with a set of motif words/phrases
 * (e.g. "cold", "mirror", "silence", "locked"). This analyser scans every
 * chapter's prose and reports, per theme, how densely those motifs appear in
 * each chapter — so an author can SEE where a theme lives, where it goes silent
 * (gaps), and where it spikes.
 *
 * Purely deterministic and heuristic — there is NO LLM call. Matching is
 * whole-word and case-insensitive, and chapter markup/frontmatter is stripped
 * first via {@link EntityExtractor.stripMarkup} so only narrative prose counts.
 */

import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import YAML from 'yaml';
import { EntityExtractor } from './entity-extractor.js';

// ─── Public interfaces ────────────────────────────────────────────────────────

/** On-disk YAML schema for a registered theme (`themes/<slug>.yml`). */
export interface ThemeYAML {
  /** Display name, e.g. "isolation". */
  name: string;
  /** Motif words / phrases associated with the theme. */
  motifs: string[];
  /** Optional free-text note about the theme. */
  description?: string;
}

/** A loaded theme definition with its source slug/file resolved. */
export interface ThemeDefinition {
  name: string;
  slug: string;
  motifs: string[];
  description?: string;
  /** Absolute path of the YAML file it was loaded from. */
  file: string;
}

/** Per-chapter motif statistics for one theme. */
export interface ChapterMotifStat {
  /** Display label (chapter filename without extension). */
  chapter: string;
  /** Chapter filename (with extension). */
  file: string;
  /** Number of prose words in the chapter (after stripping markup). */
  wordCount: number;
  /** Total motif occurrences in the chapter. */
  hits: number;
  /** Motif occurrences per 1000 prose words. */
  density: number;
  /** Per-motif occurrence breakdown. */
  byMotif: Record<string, number>;
  /** True when the theme is entirely ABSENT from this chapter (`hits === 0`). */
  isGap: boolean;
  /** True when the theme density spikes well above the manuscript mean. */
  isSpike: boolean;
}

/** Result of tracing a single theme across all chapters. */
export interface ThemeTrace {
  theme: ThemeDefinition;
  chapters: ChapterMotifStat[];
  /** Total motif occurrences across every chapter. */
  totalHits: number;
  /** Mean density (per 1000 words) across all chapters. */
  meanDensity: number;
  /** Maximum chapter density (per 1000 words). */
  maxDensity: number;
  /** Labels of chapters where the theme is absent. */
  gaps: string[];
  /** Labels of chapters where the theme spikes. */
  spikes: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Density is reported as motif occurrences per this many prose words. */
const DENSITY_SCALE = 1000;

/**
 * A chapter is flagged as a "spike" when its density is at least this multiple
 * of the manuscript-wide mean density (and the chapter has at least one hit).
 * Conservative on purpose — only genuinely dense chapters are flagged.
 */
const SPIKE_FACTOR = 2;

/** Sparkline ramp from lightest to heaviest. */
const SPARK_BARS = '▁▂▃▄▅▆▇█';

/** Marker used in a sparkline for a chapter with zero motif hits (a gap). */
const SPARK_GAP = '·';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a theme name into a filesystem-safe slug (mirrors the builders). */
export function slugifyTheme(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse a comma-separated motif list into a trimmed, de-duplicated array.
 * Empty entries are dropped; duplicates are removed case-insensitively while
 * preserving the first-seen spelling.
 */
export function parseMotifs(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const motif = part.trim();
    if (!motif) continue;
    const key = motif.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(motif);
  }
  return out;
}

/**
 * Render a unicode sparkline for a series of non-negative values. Zero values
 * render as a gap marker so absent chapters are visually distinct; positive
 * values are scaled against the series maximum.
 */
export function renderSparkline(values: number[]): string {
  if (values.length === 0) return '';
  const max = Math.max(...values);
  if (max <= 0) return SPARK_GAP.repeat(values.length);

  return values
    .map((v) => {
      if (v <= 0) return SPARK_GAP;
      const idx = Math.min(
        SPARK_BARS.length - 1,
        Math.max(0, Math.round((v / max) * (SPARK_BARS.length - 1)))
      );
      return SPARK_BARS[idx];
    })
    .join('');
}

/** Count whole-word, case-insensitive occurrences of `term` in `text`. */
function countOccurrences(text: string, term: string): number {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // \b only anchors at word characters; for terms whose edge is non-word
  // (rare for motifs) fall back to a loose boundary so nothing is missed.
  const re = new RegExp(`\\b${escaped}\\b`, 'gi');
  return (text.match(re) ?? []).length;
}

// ─── ThemeAnalyzer ────────────────────────────────────────────────────────────

export class ThemeAnalyzer {
  constructor(private readonly projectPath: string) {}

  /**
   * Load every registered theme from `<projectPath>/themes/*.yml`. Missing
   * directory or malformed/empty files are skipped rather than throwing.
   */
  async loadThemes(): Promise<ThemeDefinition[]> {
    const dir = join(this.projectPath, 'themes');

    let files: string[];
    try {
      files = (await readdir(dir)).filter(
        (f) => f.endsWith('.yml') || f.endsWith('.yaml')
      );
    } catch {
      return []; // themes/ does not exist yet
    }

    const themes: ThemeDefinition[] = [];
    for (const file of files.sort()) {
      try {
        const data = YAML.parse(await readFile(join(dir, file), 'utf-8')) as
          | ThemeYAML
          | null;
        if (!data || !data.name) continue;
        const motifs = Array.isArray(data.motifs)
          ? data.motifs.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
          : [];
        themes.push({
          name: data.name,
          slug: file.replace(/\.ya?ml$/, ''),
          motifs,
          description: data.description,
          file: join(dir, file),
        });
      } catch {
        // Skip unreadable / malformed YAML — loading is best-effort.
      }
    }

    return themes.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Trace one or all themes across every chapter. When `themeName` is given,
   * only the matching theme (case-insensitive name OR slug) is traced.
   *
   * Returns one {@link ThemeTrace} per matched theme. An empty array means
   * either no themes are registered or the named theme was not found — callers
   * disambiguate via {@link loadThemes}.
   */
  async trace(themeName?: string): Promise<ThemeTrace[]> {
    let themes = await this.loadThemes();
    if (themeName) {
      const needle = themeName.toLowerCase();
      themes = themes.filter(
        (t) => t.name.toLowerCase() === needle || t.slug === slugifyTheme(themeName)
      );
    }
    if (themes.length === 0) return [];

    const chapters = await this._loadChapters();

    return themes.map((theme) => this._traceTheme(theme, chapters));
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  /** Read and strip every `chapters/*.md` file once, sorted by filename. */
  private async _loadChapters(): Promise<
    Array<{ file: string; label: string; text: string; wordCount: number }>
  > {
    const dir = join(this.projectPath, 'chapters');

    let files: string[];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
    } catch {
      return []; // chapters/ does not exist yet
    }

    const out: Array<{ file: string; label: string; text: string; wordCount: number }> = [];
    for (const file of files.sort()) {
      let text: string;
      try {
        text = EntityExtractor.stripMarkup(await readFile(join(dir, file), 'utf-8'));
      } catch {
        continue; // unreadable chapter — skip
      }
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      out.push({ file, label: file.replace(/\.md$/, ''), text, wordCount });
    }

    return out;
  }

  /** Compute per-chapter motif stats and gap/spike flags for one theme. */
  private _traceTheme(
    theme: ThemeDefinition,
    chapters: Array<{ file: string; label: string; text: string; wordCount: number }>
  ): ThemeTrace {
    const stats: ChapterMotifStat[] = chapters.map((ch) => {
      const byMotif: Record<string, number> = {};
      let hits = 0;
      for (const motif of theme.motifs) {
        const n = countOccurrences(ch.text, motif);
        byMotif[motif] = n;
        hits += n;
      }
      const density =
        ch.wordCount > 0 ? (hits / ch.wordCount) * DENSITY_SCALE : 0;
      return {
        chapter: ch.label,
        file: ch.file,
        wordCount: ch.wordCount,
        hits,
        density,
        byMotif,
        isGap: hits === 0,
        isSpike: false, // filled in below once the mean is known
      };
    });

    const totalHits = stats.reduce((sum, s) => sum + s.hits, 0);
    const meanDensity =
      stats.length > 0
        ? stats.reduce((sum, s) => sum + s.density, 0) / stats.length
        : 0;
    const maxDensity = stats.reduce((m, s) => Math.max(m, s.density), 0);

    for (const s of stats) {
      s.isSpike =
        s.hits > 0 && meanDensity > 0 && s.density >= SPIKE_FACTOR * meanDensity;
    }

    return {
      theme,
      chapters: stats,
      totalHits,
      meanDensity,
      maxDensity,
      gaps: stats.filter((s) => s.isGap).map((s) => s.chapter),
      spikes: stats.filter((s) => s.isSpike).map((s) => s.chapter),
    };
  }
}
