/**
 * Story-structure beat templates (deterministic, no LLM).
 *
 * Each template maps named story beats to a fractional position (0..1) within
 * the manuscript. Multiplying a beat's `position` by the project's
 * `target_word_count` yields the target word-count position for that beat.
 *
 * Templates:
 *  - `three-act`      — classic three-act structure
 *  - `save-the-cat`   — Blake Snyder's 15-beat sheet
 *  - `heros-journey`  — Campbell / Vogler 12-stage monomyth
 */

export type StructureTemplateId = 'three-act' | 'save-the-cat' | 'heros-journey';

export interface StructureBeat {
  /** Stable slug, unique within its template. */
  id: string;
  /** Human-readable beat name. */
  name: string;
  /** Fractional position within the manuscript, 0..1 inclusive. */
  position: number;
  /** Short description of the beat's narrative purpose. */
  description: string;
}

export interface StructureTemplate {
  id: StructureTemplateId | string;
  /** Display name. */
  name: string;
  /** One-line summary of the model. */
  description: string;
  /** Attribution for the model. */
  source: string;
  /** Beats in ascending `position` order. */
  beats: StructureBeat[];
}

// ─── Template data ────────────────────────────────────────────────────────────

const THREE_ACT: StructureTemplate = {
  id: 'three-act',
  name: 'Three-Act Structure',
  description: 'Classic setup / confrontation / resolution arc.',
  source: 'Classical dramatic structure',
  beats: [
    { id: 'opening-image', name: 'Opening Image', position: 0.0, description: 'Establish tone, world, and protagonist in their status quo.' },
    { id: 'inciting-incident', name: 'Inciting Incident', position: 0.1, description: 'The event that disrupts the status quo and sets the story in motion.' },
    { id: 'first-plot-point', name: 'First Plot Point', position: 0.25, description: 'Protagonist commits to the journey; end of Act One.' },
    { id: 'midpoint', name: 'Midpoint', position: 0.5, description: 'A major turn or revelation that raises the stakes.' },
    { id: 'second-plot-point', name: 'Second Plot Point', position: 0.75, description: 'The final piece falls into place; end of Act Two.' },
    { id: 'climax', name: 'Climax', position: 0.9, description: 'The decisive confrontation that resolves the central conflict.' },
    { id: 'resolution', name: 'Resolution', position: 1.0, description: 'The new normal; loose threads are tied off.' },
  ],
};

const SAVE_THE_CAT: StructureTemplate = {
  id: 'save-the-cat',
  name: 'Save the Cat (15 Beats)',
  description: "Blake Snyder's fifteen-beat story map.",
  source: 'Blake Snyder, "Save the Cat!"',
  beats: [
    { id: 'opening-image', name: 'Opening Image', position: 0.0, description: 'A snapshot of the protagonist before the change.' },
    { id: 'theme-stated', name: 'Theme Stated', position: 0.05, description: "The story's thematic argument is voiced, often in passing." },
    { id: 'set-up', name: 'Set-Up', position: 0.09, description: 'Introduce the world, stakes, and what needs fixing.' },
    { id: 'catalyst', name: 'Catalyst', position: 0.1, description: 'The inciting event that knocks the old world off balance.' },
    { id: 'debate', name: 'Debate', position: 0.15, description: 'The protagonist hesitates before committing.' },
    { id: 'break-into-two', name: 'Break Into Two', position: 0.2, description: 'The protagonist chooses to act and enters the new world.' },
    { id: 'b-story', name: 'B Story', position: 0.22, description: 'A secondary (often relationship) thread that carries the theme.' },
    { id: 'fun-and-games', name: 'Fun and Games', position: 0.3, description: 'The "promise of the premise" — the heart of the concept.' },
    { id: 'midpoint', name: 'Midpoint', position: 0.5, description: 'A false victory or false defeat that raises the stakes.' },
    { id: 'bad-guys-close-in', name: 'Bad Guys Close In', position: 0.62, description: 'External and internal pressures mount on the protagonist.' },
    { id: 'all-is-lost', name: 'All Is Lost', position: 0.75, description: 'The lowest point; the goal seems impossible.' },
    { id: 'dark-night-of-the-soul', name: 'Dark Night of the Soul', position: 0.77, description: 'The protagonist wallows in defeat before finding a way forward.' },
    { id: 'break-into-three', name: 'Break Into Three', position: 0.8, description: 'A new idea synthesises the A and B stories into a solution.' },
    { id: 'finale', name: 'Finale', position: 0.9, description: 'The protagonist executes the plan and proves the change.' },
    { id: 'final-image', name: 'Final Image', position: 1.0, description: 'A closing snapshot mirroring the opening image, transformed.' },
  ],
};

const HEROS_JOURNEY: StructureTemplate = {
  id: 'heros-journey',
  name: "Hero's Journey (12 Stages)",
  description: 'The Campbell / Vogler monomyth in twelve stages.',
  source: 'Joseph Campbell / Christopher Vogler',
  beats: [
    { id: 'ordinary-world', name: 'Ordinary World', position: 0.0, description: "The hero's normal life before the adventure." },
    { id: 'call-to-adventure', name: 'Call to Adventure', position: 0.08, description: 'A problem or challenge upsets the ordinary world.' },
    { id: 'refusal-of-the-call', name: 'Refusal of the Call', position: 0.12, description: 'The hero hesitates or refuses out of fear.' },
    { id: 'meeting-the-mentor', name: 'Meeting the Mentor', position: 0.17, description: 'The hero gains guidance, training, or a key item.' },
    { id: 'crossing-the-threshold', name: 'Crossing the Threshold', position: 0.25, description: 'The hero commits and enters the special world.' },
    { id: 'tests-allies-enemies', name: 'Tests, Allies, Enemies', position: 0.35, description: 'The hero learns the rules of the special world.' },
    { id: 'approach-to-the-inmost-cave', name: 'Approach to the Inmost Cave', position: 0.45, description: 'The hero prepares for the central ordeal.' },
    { id: 'the-ordeal', name: 'The Ordeal', position: 0.5, description: 'A life-or-death crisis; the hero faces their greatest fear.' },
    { id: 'reward', name: 'Reward (Seizing the Sword)', position: 0.6, description: 'The hero survives and gains the prize.' },
    { id: 'the-road-back', name: 'The Road Back', position: 0.75, description: 'The hero begins the journey home, often pursued.' },
    { id: 'resurrection', name: 'Resurrection', position: 0.9, description: 'A final test where the hero is purified and transformed.' },
    { id: 'return-with-the-elixir', name: 'Return with the Elixir', position: 1.0, description: 'The hero returns home changed, bearing a boon for others.' },
  ],
};

/** Registry of all built-in templates, keyed by id. */
export const STRUCTURE_TEMPLATES: Readonly<Record<string, StructureTemplate>> = {
  'three-act': THREE_ACT,
  'save-the-cat': SAVE_THE_CAT,
  'heros-journey': HEROS_JOURNEY,
};

/** Return all built-in templates as a list. */
export function listTemplates(): StructureTemplate[] {
  return Object.values(STRUCTURE_TEMPLATES);
}

/** Look up a template by id, or `undefined` if no such template exists. */
export function getTemplate(id: string): StructureTemplate | undefined {
  return STRUCTURE_TEMPLATES[id];
}

// ─── Applied plan ─────────────────────────────────────────────────────────────

export interface AppliedStructurePlanBeat {
  id: string;
  name: string;
  position: number;
  /** Target word-count position, `round(position * targetWordCount)`. */
  targetWord: number;
  description: string;
}

export interface AppliedStructurePlan {
  /** Template id this plan was generated from. */
  template: StructureTemplateId | string;
  templateName: string;
  targetWordCount: number;
  /** ISO-8601 timestamp of when the plan was applied. */
  appliedAt: string;
  beats: AppliedStructurePlanBeat[];
}

/** Round a beat position to its target word-count position. */
export function beatTargetWord(position: number, targetWordCount: number): number {
  return Math.round(position * targetWordCount);
}

/**
 * Build a concrete, word-count-resolved plan from a template and a target
 * word count.
 */
export function buildAppliedPlan(
  template: StructureTemplate,
  targetWordCount: number,
  appliedAt: Date = new Date()
): AppliedStructurePlan {
  return {
    template: template.id,
    templateName: template.name,
    targetWordCount,
    appliedAt: appliedAt.toISOString(),
    beats: template.beats.map((b) => ({
      id: b.id,
      name: b.name,
      position: b.position,
      targetWord: beatTargetWord(b.position, targetWordCount),
      description: b.description,
    })),
  };
}

// ─── Status computation ───────────────────────────────────────────────────────

/**
 * Pacing label for a beat relative to the current drafted position:
 *  - `passed`   — drafted well past this beat's target word
 *  - `due`      — drafted position is within tolerance of this beat's target
 *  - `upcoming` — this beat's target is still ahead
 */
export type BeatPaceLabel = 'passed' | 'due' | 'upcoming';

export interface BeatStatus {
  beat: StructureBeat;
  targetWord: number;
  /** `currentWords - targetWord` (positive = drafted past the beat). */
  delta: number;
  /** Whether the drafted word count has reached the beat's target word. */
  reached: boolean;
  label: BeatPaceLabel;
}

export interface StructureStatusReport {
  templateId: string;
  templateName: string;
  targetWordCount: number;
  currentWords: number;
  /** `currentWords / targetWordCount`, or 0 when the target is 0. */
  fractionComplete: number;
  beats: BeatStatus[];
  /** Count of beats whose target word position has been reached. */
  reachedCount: number;
  /** First beat not yet reached, or `null` when all are reached. */
  nextBeat: BeatStatus | null;
  /** Words remaining to the next beat, or `null` when all are reached. */
  wordsToNextBeat: number | null;
}

/**
 * Compare a template's beats against the current drafted word count.
 *
 * Deterministic: a beat is "reached" once `currentWords >= targetWord`. A beat
 * is "due" when the drafted position is within `tolerance` (a fraction of the
 * target word count) of the beat's target — i.e. you are at that beat now.
 *
 * @param template        the structure template (or a plan-derived template)
 * @param targetWordCount the project's target word count
 * @param currentWords    total drafted words so far
 * @param tolerance       band, as a fraction of target, for the `due` label
 */
export function computeStructureStatus(
  template: StructureTemplate,
  targetWordCount: number,
  currentWords: number,
  tolerance = 0.05
): StructureStatusReport {
  const toleranceWords = Math.round(tolerance * targetWordCount);

  const sorted = [...template.beats].sort((a, b) => a.position - b.position);

  const beats: BeatStatus[] = sorted.map((beat) => {
    const targetWord = beatTargetWord(beat.position, targetWordCount);
    const delta = currentWords - targetWord;
    const reached = currentWords >= targetWord;
    let label: BeatPaceLabel;
    if (delta > toleranceWords) {
      label = 'passed';
    } else if (delta < -toleranceWords) {
      label = 'upcoming';
    } else {
      label = 'due';
    }
    return { beat, targetWord, delta, reached, label };
  });

  const reachedCount = beats.filter((b) => b.reached).length;
  const nextBeat = beats.find((b) => !b.reached) ?? null;
  const wordsToNextBeat = nextBeat ? nextBeat.targetWord - currentWords : null;
  const fractionComplete = targetWordCount > 0 ? currentWords / targetWordCount : 0;

  return {
    templateId: String(template.id),
    templateName: template.name,
    targetWordCount,
    currentWords,
    fractionComplete,
    beats,
    reachedCount,
    nextBeat,
    wordsToNextBeat,
  };
}

/**
 * Reconstruct a `StructureTemplate` from a previously-applied plan. Used by the
 * status command when the plan's template id is not a built-in (e.g. the plan
 * file was hand-edited) so status can still be computed from the saved beats.
 */
export function templateFromPlan(plan: AppliedStructurePlan): StructureTemplate {
  return {
    id: plan.template,
    name: plan.templateName,
    description: 'Reconstructed from applied plan.',
    source: 'applied plan',
    beats: plan.beats.map((b) => ({
      id: b.id,
      name: b.name,
      position: b.position,
      description: b.description,
    })),
  };
}
