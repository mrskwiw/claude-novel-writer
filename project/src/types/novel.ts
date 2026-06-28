/**
 * Core type definitions for novel writing extension
 */

/**
 * Supported manuscript export formats.
 * 'docx' | 'epub' | 'pdf' require pandoc to be installed on the system.
 */
export type ExportFormat = 'markdown' | 'docx' | 'epub' | 'pdf';

export type NovelPhase =
  | 'ideation'
  | 'planning'
  | 'drafting'
  | 'first_revision'
  | 'developmental_edit'
  | 'line_edit'
  | 'polish'
  | 'beta_feedback'
  | 'final_polish'
  | 'production'
  | 'distribution';

export interface ProjectConfig {
  id: number;
  title: string;
  author?: string;
  genre?: string;
  targetWordCount?: number;
  currentPhase: NovelPhase;
  createdAt: Date;
  updatedAt: Date;
  settings?: Record<string, unknown>;
}

export interface Chapter {
  id: number;
  projectId: number;
  chapterNumber: number;
  title?: string;
  filePath?: string;
  wordCount: number;
  status: 'planned' | 'drafted' | 'revised' | 'polished' | 'final';
  povCharacterId?: number;
  summary?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A single AI-generated beat within a scene (free-form description). */
export interface SceneBeat {
  beatNumber: number;
  description: string;
}

export interface Scene {
  id: number;
  chapterId: number;
  sceneNumber: number;
  title?: string;
  povCharacterId?: number;
  locationId?: number;
  timeOfDay?: string;
  wordCount: number;
  summary?: string;
  purpose?: string;
  emotionalTone?: string;
  tensionLevel?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Character {
  id: number;
  projectId: number;
  name: string;
  fullName?: string;
  role: 'protagonist' | 'antagonist' | 'major' | 'minor' | 'background';
  filePath?: string;
  summary?: string;
  voiceNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterAttribute {
  id: number;
  characterId: number;
  attributeType: 'physical' | 'personality' | 'background' | 'skill';
  attributeName: string;
  attributeValue: string;
  firstMentionedChapterId?: number;
  firstMentionedLine?: string;
  confidence: number;
  notes?: string;
  createdAt: Date;
}

export interface Location {
  id: number;
  projectId: number;
  name: string;
  locationType?: string;
  parentLocationId?: number;
  description?: string;
  firstMentionedChapterId?: number;
  filePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorldRule {
  id: number;
  projectId: number;
  ruleCategory: 'magic' | 'technology' | 'physics' | 'social' | 'political';
  ruleName: string;
  description: string;
  limitations?: string;
  establishedChapterId?: number;
  establishedQuote?: string;
  isHardRule: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlotThread {
  id: number;
  projectId: number;
  threadName: string;
  threadType: 'main' | 'subplot' | 'character' | 'theme';
  description?: string;
  status: 'planned' | 'active' | 'resolved' | 'abandoned';
  introducedSceneId?: number;
  resolvedSceneId?: number;
  priority: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsistencyIssue {
  id: number;
  projectId: number;
  issueType: 'character_attribute' | 'timeline' | 'world_rule' | 'continuity';
  severity: 'info' | 'warning' | 'error';
  description: string;
  chapterId?: number;
  sceneId?: number;
  characterId?: number;
  locationId?: number;
  detectedAt: Date;
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
  resolutionNotes?: string;
}

export interface WritingSession {
  id: number;
  projectId: number;
  sessionDate: Date;
  startTime?: Date;
  endTime?: Date;
  wordsWritten: number;
  chaptersTouched?: number[];
  sessionType: 'drafting' | 'revising' | 'planning' | 'editing';
  notes?: string;
  moodBefore?: number;
  moodAfter?: number;
  createdAt: Date;
}

export interface TimelineEvent {
  id: number;
  projectId: number;
  eventName: string;
  eventType: 'plot' | 'backstory' | 'world_history';
  description?: string;
  storyDate?: string;
  storyTimestamp?: number;
  sceneId?: number;
  isBackstory: boolean;
  importance: number;
  createdAt: Date;
}

/**
 * Context assembled for AI when writing a scene
 */
export interface SceneContext {
  scene: Scene;
  chapter: Chapter;
  characters: Character[];
  location?: Location;
  worldRules: WorldRule[];
  plotThreads: PlotThread[];
  recentChapterSummaries: Array<{ chapterNumber: number; summary: string }>;
  timelineEvents: TimelineEvent[];
}

/**
 * Chapter frontmatter metadata
 */
export interface ChapterMetadata {
  title: string;
  number?: number;
  status?: 'planned' | 'drafted' | 'revised' | 'polished' | 'final';
  povCharacter?: string;
  summary?: string;
  notes?: string;
  wordCount?: number;
}

/**
 * YAML file structure for character profiles
 */
export interface CharacterYAML {
  name: string;
  fullName?: string;
  role: 'protagonist' | 'antagonist' | 'major' | 'minor' | 'background';
  summary: string;
  physical?: Record<string, string>;
  personality?: Record<string, string>;
  background?: Record<string, string>;
  skills?: Record<string, string>;
  voice?: {
    patterns?: string[];
    quirks?: string[];
    vocabulary?: string;
  };
  relationships?: Array<{
    character: string;
    type: string;
    description: string;
  }>;
  arc?: {
    startingState: string;
    endingState: string;
    midpointCrisis?: string;
  };
  notes?: string;
}

/**
 * YAML file structure for locations
 */
export interface LocationYAML {
  name: string;
  type?: string;
  parentLocation?: string;
  description: string;
  details?: Record<string, string>;
  rules?: string[];
  firstAppearance?: string;
  notes?: string;
}

/**
 * YAML file structure for plot threads
 */
export interface PlotYAML {
  name: string;
  type: 'main' | 'subplot' | 'character' | 'theme';
  status: 'planned' | 'active' | 'resolved' | 'abandoned';
  priority: number;
  description: string;
  beats?: Array<{
    scene: string;
    description: string;
    type: 'setup' | 'development' | 'climax' | 'resolution';
  }>;
  characters?: Array<{
    name: string;
    role: string;
    arc?: string;
  }>;
  themes?: string[];
  dependencies?: string[];
  notes?: string;
  introduced_in?: number;
  resolved_in?: number;
  first_appearance?: string;
}

/**
 * YAML file structure for world rules
 */
export interface WorldRuleYAML {
  name: string;
  category: 'magic' | 'technology' | 'physics' | 'social' | 'political';
  description: string;
  limitations?: string;
  is_hard_rule?: boolean;
  established_in?: {
    chapter?: number;
    scene?: string;
    quote?: string;
  };
  examples?: string[];
  exceptions?: string[];
  notes?: string;
}

/**
 * Project initialization options
 */
export interface InitOptions {
  title: string;
  author?: string;
  genre?: string;
  targetWordCount?: number;
  projectPath: string;
}

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  autoStart?: boolean;
}

/**
 * Idea entry for brainstorming capture
 */
export interface IdeaEntry {
  id?: number;
  projectId: number;
  ideaKey: string;
  content: string;
  tags: string[];
  linkedEntityType?: 'character' | 'plot' | 'location' | 'scene' | 'world-rule';
  linkedEntityName?: string;
  status: 'active' | 'used' | 'discarded';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Character Arc Visualization (SPEC-09) ───────────────────────────────────

export type CharacterState =
  | 'hopeful'
  | 'determined'
  | 'fearful'
  | 'angry'
  | 'grieving'
  | 'joyful'
  | 'confused'
  | 'resigned'
  | 'transformed'
  | 'neutral'
  | 'tense'
  | 'melancholic';

export interface CharacterSceneState {
  id: string;
  projectId: string;
  characterId: number;
  sceneId: number;
  state: CharacterState;
  notes?: string;
  recordedAt: string;
}

export interface CharacterArc {
  characterName: string;
  states: Array<{
    chapterNumber: number;
    sceneOrder: number;
    state: CharacterState;
    sceneTitle: string;
  }>;
  /** true when first state !== last state */
  isComplete: boolean;
  /** scene orders where a static run (3+ consecutive identical states) begins */
  staticRuns: number[];
}

// ─── Research Repository (SPEC-04) ───────────────────────────────────────────

/**
 * A research note capturing a source, URL, or reference for the novel project.
 */
export interface ResearchNote {
  id: string;
  projectId: string;
  title: string;
  url?: string;
  notes?: string;
  tags: string[];
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Links a research note to a chapter or scene.
 */
export interface ResearchUsage {
  id: string;
  researchId: string;
  chapterId?: number;
  sceneId?: number;
  note?: string;
  linkedAt: string;
}

// ─── Pacing & Structure Analysis (GAP-11 / SPEC-08) ──────────────────────────

export interface ChapterTensionData {
  chapterNumber: number;
  chapterTitle: string;
  avgTension: number;
  sceneCount: number;
}

export interface POVBalance {
  characterName: string;
  sceneCount: number;
  percentage: number;
}

export interface ChapterLengthData {
  chapterNumber: number;
  chapterTitle: string;
  wordCount: number;
  /** >2x avg = 'long', <0.5x avg = 'short', otherwise 'normal' */
  deviation: 'normal' | 'long' | 'short';
}

export interface PacingFlag {
  type: 'tension_dip' | 'pov_imbalance' | 'length_outlier' | 'conflict_gap';
  description: string;
  affectedChapters?: number[];
}

export interface PacingReport {
  tensionArc: ChapterTensionData[];
  povBalance: POVBalance[];
  chapterLengths: ChapterLengthData[];
  flags: PacingFlag[];
  asciiTensionChart: string;
}

// ─── Prose Analysis (SPEC-05) ────────────────────────────────────────────────

export interface ProseCheck {
  type:
    | 'intensifier'
    | 'filter_word'
    | 'adverb_tag'
    | 'passive_voice'
    | 'doubled_word'
    | 'sentence_monotony'
    | 'word_repetition'
    | 'on_the_nose_dialogue'
    | 'dialogue_tag'
    | 'purple_prose';
  line: number;
  column?: number;
  /** The offending excerpt */
  text: string;
  /** Replacement hint */
  suggestion?: string;
  severity: 'info' | 'warning' | 'error';
}

export interface ProseAnalysisResult {
  chapterFile: string;
  chapterNumber?: number;
  checks: ProseCheck[];
  /** 0–100; 100 = no filler words */
  economyScore: number;
  wordCount: number;
  /** % of text that is dialogue (inside quotes) */
  dialoguePercent: number;
}

// ─── Synopsis & Query Materials (SPEC-10) ────────────────────────────────────

/**
 * Controls the target word-count and depth of a generated synopsis.
 * - short  ~150 words: hook + conflict + stakes, ending with a question
 * - medium ~400 words: full arc without resolution, ending on a cliffhanger
 * - long   ~800 words: agent-ready full synopsis including resolution
 */
export type SynopsisLength = 'short' | 'medium' | 'long';

/**
 * Length presets for `generate overview` — a planning summary of the INTENDED
 * book, assembled from the outline (plot threads + beats) and cast.
 * - brief    ~150 words: premise + protagonist + central conflict + stakes
 * - standard ~350 words: premise, main cast, plot through-line, direction
 * - full     ~700 words: planning treatment — full cast, interweaving threads,
 *            hard world rules, intended arc
 */
export type OverviewLength = 'brief' | 'standard' | 'full';

/**
 * Aggregated project data used as context for synopsis, pitch,
 * query-letter, and comp-title generation.
 */
export interface SynopsisContext {
  title: string;
  genre: string;
  wordCount: number;
  protagonist: string;
  antagonist?: string;
  mainConflict: string;
  chapterSummaries: Array<{ number: number; title: string; summary: string }>;
  worldRules: string[];
  openPromises: string[];
}

// ─── Beta Reader Management (SPEC-11) ────────────────────────────────────────

export type BetaFeedbackType = 'pacing' | 'character' | 'plot' | 'clarity' | 'emotion' | 'other';

export interface BetaReader {
  id: string;
  projectId: string;
  name: string;
  email?: string;
  /** e.g. ["1-10"] or ["1", "2", "3"] */
  chapters: string[];
  status: 'active' | 'completed' | 'dropped';
  invitedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BetaFeedback {
  id: string;
  projectId: string;
  readerId: string;
  chapterId?: number;
  feedbackType: BetaFeedbackType;
  note: string;
  resolved: boolean;
  createdAt: string;
}

export interface BetaReport {
  totalReaders: number;
  totalFeedback: number;
  byChapter: Record<number, { count: number; types: Record<string, number> }>;
  byType: Record<BetaFeedbackType, number>;
  unresolved: number;
}

// ─── Sync Conflict Detection (GAP-04) ────────────────────────────────────────

/**
 * Thrown when the database record for an entity was modified after the last
 * file-to-database sync, indicating a potential conflict with the YAML file.
 * Pass `options?: { forceFile?: boolean }` to the sync method to suppress.
 */
export class SyncConflictError extends Error {
  constructor(
    public readonly entityType: string,
    public readonly entityId: string,
    public readonly details: string
  ) {
    super(`Sync conflict: ${entityType} "${entityId}" — ${details}`);
    this.name = 'SyncConflictError';
  }
}
