/**
 * EntityExtractor — "discovery writer" (pantser) support
 *
 * Scans ALREADY-DRAFTED chapter prose and proposes NEW story entities
 * (characters and locations) that are not yet recorded in the project's
 * `characters/*.yml` / `locations/*.yml` files.
 *
 * This is a purely deterministic, heuristic analyser — there is NO LLM call.
 * The goal is to give a writer who "just writes" some structured value without
 * forcing them to define every entity up-front.
 *
 * Philosophy: under-propose rather than flood. Every threshold below is a
 * named constant and deliberately conservative — a missed candidate is cheap
 * (the writer can `create` it manually), whereas a wall of false positives
 * erodes trust in the command.
 */

import { readFile, readdir } from 'fs/promises';
import { join, isAbsolute } from 'path';
import YAML from 'yaml';

// ─── Public interfaces ────────────────────────────────────────────────────────

/** A single proposed entity with how many times it appears in the chapter. */
export interface EntityCandidate {
  /** Canonical (capitalised) name as it appears in the prose. */
  name: string;
  /** Number of whole-word occurrences of `name` in the cleaned chapter text. */
  mentions: number;
}

/** Result of scanning one chapter for new entities. */
export interface ExtractionResult {
  /** Proposed NEW characters, sorted by mention count (descending). */
  characters: EntityCandidate[];
  /** Proposed NEW locations, sorted by mention count (descending). */
  locations: EntityCandidate[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Attribution verbs used to identify a dialogue speaker.
 * Mirrors `ATTRIBUTION_VERBS` in `src/analysis/prose-analyzer.ts`.
 */
const ATTRIBUTION_VERBS =
  'said|asked|replied|whispered|shouted|answered|called|muttered|murmured|cried|exclaimed|snapped|breathed|hissed';

/** `"…" said Name` / `"…", asked Name` — speaker AFTER the dialogue. */
const ATTR_AFTER_RE = new RegExp(
  `["“][^"”]*["”]\\s*,?\\s+(?:${ATTRIBUTION_VERBS})\\s+([A-Z][a-zA-Z]+)`,
  'g'
);

/** `Name said "…"` — speaker BEFORE the dialogue. */
const ATTR_BEFORE_RE = new RegExp(
  `([A-Z][a-zA-Z]+)\\s+(?:${ATTRIBUTION_VERBS})\\s+["“][^"”]*["”]`,
  'g'
);

/**
 * A capitalised token must appear this many times in a NON-sentence-start
 * position before it is treated as a proper-noun character candidate.
 * Dialogue speakers bypass this (an attributed name is a much stronger signal).
 */
const MIN_CHARACTER_MENTIONS = 2;

/**
 * A location candidate must appear at least this many times. Kept at 1 because
 * the locational-preposition pattern is already restrictive; multi-word /
 * place-suffix matches are a strong signal on their own.
 */
const MIN_LOCATION_MENTIONS = 1;

/**
 * Lower-cased words that frequently START a sentence and would otherwise be
 * capitalised purely by position, not because they are proper nouns.
 * Mirrors `COMMON_SENTENCE_STARTERS` in `src/analysis/copy-editor.ts`, with a
 * few extra interjections/titles a narrator commonly uses.
 */
const COMMON_SENTENCE_STARTERS = new Set([
  'the', 'a', 'an', 'she', 'he', 'they', 'we', 'i', 'it', 'this', 'that',
  'there', 'then', 'when', 'where', 'but', 'and', 'or', 'if', 'as', 'at',
  'by', 'in', 'on', 'to', 'of', 'for', 'with', 'his', 'her', 'their',
  'its', 'my', 'your', 'our', 'not', 'no', 'never', 'still', 'just',
  'so', 'yet', 'both', 'after', 'before', 'although', 'because', 'while',
  'until', 'though', 'even', 'from', 'into', 'onto', 'over', 'under',
  'through', 'between', 'behind', 'beside', 'against', 'without', 'within',
  // Common non-name capitalised openers / interjections.
  'yes', 'no', 'oh', 'well', 'okay', 'ok', 'maybe', 'perhaps', 'now', 'here',
  'how', 'why', 'what', 'who', 'which', 'whose', 'every', 'some', 'any', 'all',
  'one', 'two', 'three', 'first', 'last', 'finally', 'suddenly', 'later',
  'today', 'tomorrow', 'yesterday', 'mr', 'mrs', 'ms', 'dr', 'god',
]);

/**
 * Prepositions that introduce a place. A capitalised phrase that follows one of
 * these is a strong location candidate.
 */
const LOCATION_PREPS =
  'at|in|into|inside|outside|near|toward|towards|to|from|through|across|beyond|atop|onto|upon|past|beside';

const LOCATION_RE = new RegExp(
  `\\b(?:${LOCATION_PREPS})\\s+(?:the\\s+)?([A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]+)*)`,
  'g'
);

/**
 * Suffix nouns that strongly mark a phrase as a place (e.g. "Ironhold Keep",
 * "Baker Street"). A single capitalised word ending in one of these is treated
 * as a location even without a multi-word phrase.
 */
const PLACE_SUFFIXES = new Set([
  'house', 'hall', 'street', 'road', 'avenue', 'lane', 'drive', 'way',
  'tower', 'castle', 'keep', 'bridge', 'gate', 'gates', 'square', 'manor',
  'inn', 'tavern', 'forest', 'woods', 'river', 'lake', 'sea', 'ocean',
  'mountain', 'mountains', 'valley', 'hill', 'hills', 'city', 'town',
  'village', 'harbor', 'harbour', 'bay', 'isle', 'island', 'temple',
  'palace', 'fortress', 'citadel', 'market', 'district', 'court', 'quarter',
  'plaza', 'park', 'garden', 'gardens', 'cathedral', 'chapel', 'abbey',
  'station', 'port', 'docks', 'wharf', 'academy', 'school', 'college',
  'university', 'hospital', 'prison', 'tomb', 'crypt', 'cave', 'caverns',
  'plains', 'desert', 'wastes', 'peak', 'pass', 'ridge', 'shore', 'coast',
]);

// ─── EntityExtractor ──────────────────────────────────────────────────────────

export class EntityExtractor {
  constructor(private readonly projectPath: string) {}

  /**
   * Scan a single chapter file and propose NEW characters and locations.
   *
   * @param chapterFile - Absolute path, or a path relative to
   *                       `<projectPath>/chapters/`.
   */
  async extractFromChapter(chapterFile: string): Promise<ExtractionResult> {
    const filePath =
      chapterFile.includes('/') || chapterFile.includes('\\')
        ? chapterFile
        : join(this.projectPath, 'chapters', chapterFile);

    const raw = await readFile(filePath, 'utf-8');
    return this.extractFromText(raw);
  }

  /**
   * Scan an arbitrary prose file — typically a freeform outline or treatment the
   * author wrote before populating `characters/` / `plots/`. Use this to
   * bootstrap structured entities from an existing plan.
   *
   * @param file - Absolute path, or a path relative to `projectPath`.
   */
  async extractFromFile(file: string): Promise<ExtractionResult> {
    const filePath = isAbsolute(file) ? file : join(this.projectPath, file);
    const raw = await readFile(filePath, 'utf-8');
    return this.extractFromText(raw);
  }

  /**
   * Core extraction over raw text (markup is stripped internally). Cross-checks
   * against the names already recorded under `characters/` and `locations/`.
   */
  async extractFromText(raw: string): Promise<ExtractionResult> {
    const text = EntityExtractor.stripMarkup(raw);

    const [knownCharacters, knownLocations] = await Promise.all([
      this._loadKnownNames('characters'),
      this._loadKnownNames('locations'),
    ]);

    const characters = this._extractCharacters(text, knownCharacters);

    // Character names take priority — never re-propose them as a location.
    const characterNameSet = new Set(characters.map((c) => c.name.toLowerCase()));
    const locations = this._extractLocations(
      text,
      knownLocations,
      characterNameSet
    );

    return { characters, locations };
  }

  // ─── Character extraction ───────────────────────────────────────────────────

  /**
   * Build the character candidate list from two signals:
   *   1. Dialogue speakers identified via attribution patterns (strong signal —
   *      always proposed).
   *   2. Capitalised tokens that recur in non-sentence-start positions at least
   *      `MIN_CHARACTER_MENTIONS` times (proper-noun heuristic).
   *
   * Candidates already present in `known` (case-insensitive) are excluded.
   */
  private _extractCharacters(
    text: string,
    known: Set<string>
  ): EntityCandidate[] {
    const speakers = EntityExtractor._collectSpeakers(text);
    const recurring = EntityExtractor._collectRecurringProperNouns(text);

    // Union of canonical names; preserve the first-seen capitalisation.
    const names = new Map<string, string>(); // lower → canonical
    for (const name of [...speakers, ...recurring]) {
      const lower = name.toLowerCase();
      if (!names.has(lower)) names.set(lower, name);
    }

    const out: EntityCandidate[] = [];
    for (const [lower, canonical] of names) {
      if (known.has(lower)) continue; // already a known character
      const mentions = EntityExtractor._countOccurrences(text, canonical);
      if (mentions === 0) continue;
      out.push({ name: canonical, mentions });
    }

    return out.sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
  }

  /**
   * Collect every dialogue speaker named via an attribution pattern.
   * Sentence-starter words (e.g. "Then said the man") are filtered out.
   */
  private static _collectSpeakers(text: string): Set<string> {
    const speakers = new Set<string>();

    for (const re of [ATTR_AFTER_RE, ATTR_BEFORE_RE]) {
      const local = new RegExp(re.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = local.exec(text)) !== null) {
        const name = m[1];
        if (!COMMON_SENTENCE_STARTERS.has(name.toLowerCase())) {
          speakers.add(name);
        }
      }
    }

    return speakers;
  }

  /**
   * Collect capitalised single-word proper-noun candidates that recur in
   * NON-sentence-start positions at least `MIN_CHARACTER_MENTIONS` times.
   */
  private static _collectRecurringProperNouns(text: string): Set<string> {
    const nonStartCounts = new Map<string, { canonical: string; count: number }>();
    const sentences = EntityExtractor._splitSentences(text);

    for (const sentence of sentences) {
      const words = sentence.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i++) {
        const core = words[i].replace(/[^A-Za-z]/g, '');
        if (core.length < 2) continue;
        if (!/^[A-Z][a-z]/.test(core)) continue; // Capitalised, not ALL-CAPS
        if (i === 0) continue; // skip the sentence-initial word
        const lower = core.toLowerCase();
        if (COMMON_SENTENCE_STARTERS.has(lower)) continue;

        const existing = nonStartCounts.get(lower);
        if (existing) existing.count++;
        else nonStartCounts.set(lower, { canonical: core, count: 1 });
      }
    }

    const out = new Set<string>();
    for (const { canonical, count } of nonStartCounts.values()) {
      if (count >= MIN_CHARACTER_MENTIONS) out.add(canonical);
    }
    return out;
  }

  // ─── Location extraction ────────────────────────────────────────────────────

  /**
   * Propose NEW locations: capitalised phrases that follow a locational
   * preposition. A candidate is accepted when it is either multi-word, ends in a
   * known place suffix, or is a single proper noun that is NOT already a
   * character candidate. Known locations are excluded.
   */
  private _extractLocations(
    text: string,
    known: Set<string>,
    characterNames: Set<string>
  ): EntityCandidate[] {
    const candidates = new Map<string, string>(); // lower → canonical

    const local = new RegExp(LOCATION_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = local.exec(text)) !== null) {
      const phrase = m[1].trim();
      const words = phrase.split(/\s+/);
      const lastWord = words[words.length - 1].toLowerCase();
      const multiWord = words.length > 1;
      const hasSuffix = PLACE_SUFFIXES.has(lastWord);
      const lower = phrase.toLowerCase();

      // A bare single proper noun is only a place if it is NOT a character.
      const singleAccepted =
        !multiWord && !hasSuffix && !characterNames.has(lower);

      if (!(multiWord || hasSuffix || singleAccepted)) continue;
      // The first word of a multi-word phrase being a sentence-starter is fine
      // (it followed a preposition), but a single starter word is noise.
      if (!multiWord && COMMON_SENTENCE_STARTERS.has(lower)) continue;

      if (!candidates.has(lower)) candidates.set(lower, phrase);
    }

    const out: EntityCandidate[] = [];
    for (const [lower, canonical] of candidates) {
      if (known.has(lower)) continue;
      if (characterNames.has(lower)) continue;
      const mentions = EntityExtractor._countOccurrences(text, canonical);
      if (mentions < MIN_LOCATION_MENTIONS) continue;
      out.push({ name: canonical, mentions });
    }

    return out.sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
  }

  // ─── Existing-entity cross-reference ────────────────────────────────────────

  /**
   * Load the canonical names already recorded under `<projectPath>/<subdir>/`.
   * Parses `name` and `fullName` from each `*.yml` / `*.yaml` file, and also
   * adds each individual word token so that e.g. an existing "Mara Quill"
   * suppresses a bare "Mara" candidate. All entries are lower-cased.
   *
   * File-based and best-effort: a missing directory or malformed YAML simply
   * yields fewer known names rather than throwing.
   */
  private async _loadKnownNames(subdir: string): Promise<Set<string>> {
    const dir = join(this.projectPath, subdir);
    const names = new Set<string>();

    let files: string[];
    try {
      files = (await readdir(dir)).filter(
        (f) => f.endsWith('.yml') || f.endsWith('.yaml')
      );
    } catch {
      return names; // directory does not exist yet
    }

    for (const file of files) {
      try {
        const data = YAML.parse(await readFile(join(dir, file), 'utf-8')) as
          | { name?: string; fullName?: string }
          | null;
        for (const value of [data?.name, data?.fullName]) {
          if (!value) continue;
          const full = value.toLowerCase();
          names.add(full);
          for (const token of full.split(/\s+/)) {
            if (token.length >= 2) names.add(token);
          }
        }
      } catch {
        // Skip unreadable / malformed YAML — cross-referencing is best-effort.
      }
    }

    return names;
  }

  // ─── Text helpers ───────────────────────────────────────────────────────────

  /**
   * Remove all non-prose markup so the heuristics only see narrative text:
   *   - YAML frontmatter (leading `--- … ---`)
   *   - HTML / scene comments (`<!-- … -->`)
   *   - `[MARKER: …]` annotations (TK, TODO, NOTE, …)
   *   - `--- Scene N ---` delimiters and bare horizontal rules
   *   - Markdown headings, emphasis markers, and link syntax
   */
  static stripMarkup(raw: string): string {
    let text = raw.replace(/\r\n/g, '\n');

    // 1. Frontmatter.
    text = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
    // 2. HTML comments (possibly multi-line).
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    // 3. [MARKER: …] annotations.
    text = text.replace(/\[[A-Z][A-Za-z0-9_-]*:[^\]]*\]/g, '');
    // 4. Scene delimiters and bare horizontal rules.
    text = text.replace(/^---\s*Scene\s+\S+\s*---\s*$/gim, '');
    text = text.replace(/^---\s*$/gim, '');
    // 5. Markdown heading hashes (keep the heading text).
    text = text.replace(/^#{1,6}\s+/gm, '');
    // 6. Emphasis / strikethrough markers.
    text = text.replace(/[*_~`]+/g, '');
    // 7. Links/images: keep the visible label, drop the URL part.
    text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');

    return text.trim();
  }

  /**
   * Split text into sentences for sentence-start detection. Splits on
   * end-of-sentence punctuation followed by whitespace, and on line breaks
   * (a new line conservatively begins a new "sentence" for capitalisation
   * purposes).
   */
  private static _splitSentences(text: string): string[] {
    return text
      .split(/(?<=[.!?…])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Count whole-word, case-insensitive occurrences of `term` in `text`.
   * Multi-word terms are matched as a contiguous phrase.
   */
  private static _countOccurrences(text: string, term: string): number {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    return (text.match(re) ?? []).length;
  }
}
