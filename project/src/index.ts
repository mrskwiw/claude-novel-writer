/**
 * Claude Novel Writer Extension
 * Main entry point
 */

import { join } from 'path';
import { DatabaseManager, MCPSQLiteClient, DirectSQLiteClient } from './core/database.js';
import type { MCPClient } from './core/database.js';
import { CharacterSync } from './sync/character-sync.js';
import { LocationSync } from './sync/location-sync.js';
import { ChapterSync } from './sync/chapter-sync.js';
import { SceneSync } from './sync/scene-sync.js';
import { PlotSync } from './sync/plot-sync.js';
import { PlotThreadSync } from './sync/plot-thread-sync.js';
import { WorldRulesSync } from './sync/world-rules-sync.js';
import { TimelineSync } from './sync/timeline-sync.js';
import { SceneContextAssembler } from './context/scene-context.js';
import { ConsistencyChecker } from './consistency/checker.js';
import { CharacterBuilder } from './builders/character-builder.js';
import { TimelineBuilder } from './builders/timeline-builder.js';
import { LocationBuilder } from './builders/location-builder.js';
import { PlotBuilder } from './builders/plot-builder.js';
import { PlotThreadBuilder } from './builders/plot-thread-builder.js';
import { WorldRulesBuilder } from './builders/world-rules-builder.js';
import { ChapterBuilder } from './builders/chapter-builder.js';
import { SceneBuilder } from './builders/scene-builder.js';
import { SessionManager } from './session/session-manager.js';
import { ProgressDashboard } from './session/progress-dashboard.js';
import { ManuscriptAssembler } from './builders/manuscript-assembler.js';
import { GenerationManager } from './ai/generation-manager.js';
import { BeatGenerator } from './ai/beat-generator.js';
import { IdeaBuilder } from './builders/idea-builder.js';
import { IdeaSync } from './sync/idea-sync.js';
import { KnowledgeService } from './services/knowledge-service.js';
import { CanonService } from './services/canon-service.js';
import { PromiseService } from './services/promise-service.js';
import { ContextContractService } from './services/context-contract-service.js';
import { NarrativeGraphService } from './services/narrative-graph-service.js';
import { SnapshotManager } from './revision/snapshot-manager.js';
import { DraftScanner } from './analysis/draft-scanner.js';
import { PacingAnalyzer } from './analysis/pacing-analyzer.js';
import { ProseAnalyzer } from './analysis/prose-analyzer.js';
import { ReadAloudPreparer } from './analysis/read-aloud.js';
import { ResearchService } from './services/research-service.js';
import { CharacterArcService } from './services/character-arc-service.js';
import { BetaReaderService } from './services/beta-reader-service.js';
import { QueryTrackerService } from './services/query-tracker-service.js';
import { ForeshadowingService } from './services/foreshadowing-service.js';
import { SeriesManager } from './services/series-manager.js';
import type { InitOptions } from './types/novel.js';
import type { PromptFunction } from './builders/character-builder.js';

export class NovelWriterExtension {
  private db: DatabaseManager;
  private mcpClient: MCPClient;
  private projectId?: number;
  private projectPath: string;

  constructor(projectPath: string, mcpClient?: MCPClient) {
    this.projectPath = projectPath;
    const dbPath = join(projectPath, '.novel', 'data.db');
    // Default: use DirectSQLiteClient for standalone CLI; callers inside Claude Code
    // should pass an MCPSQLiteClient connected to the running MCP server.
    this.mcpClient = mcpClient ?? new DirectSQLiteClient(dbPath);

    this.db = new DatabaseManager(
      { dbPath, projectPath },
      this.mcpClient
    );
  }

  /**
   * Initialize a new novel project
   */
  async initialize(options: InitOptions): Promise<void> {
    console.log('Initializing novel project...');

    // Initialize database
    await this.db.initialize();

    // Create project entry
    this.projectId = await this.db.createProject({
      title: options.title,
      author: options.author,
      genre: options.genre,
      targetWordCount: options.targetWordCount,
      currentPhase: 'ideation',
    });

    console.log(`Project initialized with ID: ${this.projectId}`);
  }

  /**
   * Set the current project ID (for existing projects)
   */
  setProjectId(projectId: number): void {
    this.projectId = projectId;
  }

  /**
   * Check if project ID is set
   */
  hasProjectId(): boolean {
    return this.projectId !== null && this.projectId !== undefined;
  }

  /**
   * Get the current project ID, or undefined if no project has been
   * initialized / loaded yet.
   */
  getProjectId(): number | undefined {
    return this.projectId;
  }

  /**
   * Get character sync manager
   */
  getCharacterSync(): CharacterSync {
    this.ensureProjectId();
    return new CharacterSync(this.mcpClient, this.projectId!, this.projectPath);
  }

  /**
   * Get location sync manager
   */
  getLocationSync(): LocationSync {
    this.ensureProjectId();
    return new LocationSync(this.mcpClient, this.projectId!, this.projectPath);
  }

  /**
   * Get chapter sync manager
   */
  getChapterSync(): ChapterSync {
    this.ensureProjectId();
    return new ChapterSync(this.mcpClient, this.projectId!, this.projectPath);
  }

  /**
   * Get scene sync manager
   */
  getSceneSync(): SceneSync {
    this.ensureProjectId();
    return new SceneSync(this.mcpClient, this.projectId!);
  }

  /**
   * Get scene context assembler
   */
  getContextAssembler(): SceneContextAssembler {
    this.ensureProjectId();
    return new SceneContextAssembler(this.mcpClient, this.projectId!);
  }

  /**
   * Get consistency checker
   */
  getConsistencyChecker(): ConsistencyChecker {
    this.ensureProjectId();
    return new ConsistencyChecker(this.mcpClient, this.projectId!);
  }

  /**
   * Get project health dashboard
   */
  async getProjectHealth(): Promise<any> {
    this.ensureProjectId();
    return await this.db.getProjectHealth(this.projectId!);
  }

  /**
   * Get active plot threads
   */
  async getActivePlotThreads(): Promise<any[]> {
    this.ensureProjectId();
    return await this.db.getActivePlotThreads(this.projectId!);
  }

  /**
   * Get writing streak info
   */
  async getWritingStreak(): Promise<any> {
    this.ensureProjectId();
    return await this.db.getWritingStreak(this.projectId!);
  }

  /**
   * Get character builder for creating new characters
   */
  getCharacterBuilder(): CharacterBuilder {
    return new CharacterBuilder({ projectPath: this.projectPath });
  }

  /**
   * Get location builder for creating new locations
   */
  getLocationBuilder(): LocationBuilder {
    return new LocationBuilder({ projectPath: this.projectPath });
  }

  /**
   * Get plot builder for creating new plot threads
   */
  getPlotBuilder(): PlotBuilder {
    return new PlotBuilder({ projectPath: this.projectPath });
  }

  /**
   * Get plot thread builder for creating new plot thread YAML files
   */
  getPlotThreadBuilder(): PlotThreadBuilder {
    return new PlotThreadBuilder(this.projectPath);
  }

  /**
   * Get world rules builder for creating world rule YAML files
   */
  getWorldRulesBuilder(): WorldRulesBuilder {
    return new WorldRulesBuilder(this.projectPath);
  }

  /**
   * Get chapter builder for creating new chapters
   */
  getChapterBuilder(): ChapterBuilder {
    return new ChapterBuilder({ projectPath: this.projectPath });
  }

  /**
   * Get scene builder for managing scenes in a chapter
   */
  getSceneBuilder(chapterFilePath: string): SceneBuilder {
    return new SceneBuilder({ chapterFilePath });
  }

  /**
   * Get plot sync manager
   */
  getPlotSync(): PlotSync {
    this.ensureProjectId();
    return new PlotSync(this.mcpClient, this.projectId!);
  }

  /**
   * Get plot thread sync manager for database synchronization
   */
  getPlotThreadSync(): PlotThreadSync {
    this.ensureProjectId();
    return new PlotThreadSync(this.mcpClient, this.projectId!, this.projectPath);
  }

  /**
   * Get world rules sync manager for database synchronization
   */
  getWorldRulesSync(): WorldRulesSync {
    this.ensureProjectId();
    return new WorldRulesSync(this.mcpClient, this.projectId!, this.projectPath);
  }

  /**
   * Get timeline builder for creating and managing timeline events
   */
  getTimelineBuilder(): TimelineBuilder {
    this.ensureProjectId();
    return new TimelineBuilder({
      projectId: this.projectId!,
      mcpClient: this.mcpClient,
    });
  }

  /**
   * Get timeline sync manager for database synchronization
   */
  getTimelineSync(): TimelineSync {
    this.ensureProjectId();
    return new TimelineSync(this.mcpClient, this.projectId!, this.projectPath);
  }

  /**
   * Get session manager for tracking writing sessions
   */
  async getSessionManager(): Promise<SessionManager> {
    this.ensureProjectId();
    return new SessionManager(this.mcpClient, this.projectId!);
  }

  /**
   * Get progress dashboard for displaying writing progress
   */
  async getProgressDashboard(): Promise<ProgressDashboard> {
    const sessionManager = await this.getSessionManager();
    return new ProgressDashboard(sessionManager);
  }

  /**
   * Get manuscript assembler for exporting
   */
  getManuscriptAssembler(): ManuscriptAssembler {
    return new ManuscriptAssembler(this.projectPath);
  }

  /**
   * Get AI generation manager
   */
  getGenerationManager(): GenerationManager {
    this.ensureProjectId();
    return new GenerationManager(this.mcpClient, this.projectId!);
  }

  /**
   * Get scene beat generator
   */
  getBeatGenerator(): BeatGenerator {
    this.ensureProjectId();
    return new BeatGenerator(this.mcpClient, this.projectId!);
  }

  /**
   * Get idea builder for creating and managing idea YAML files
   */
  getIdeaBuilder(): IdeaBuilder {
    return new IdeaBuilder(this.projectPath);
  }

  /**
   * Get idea sync manager for pushing ideas to the database
   */
  getIdeaSync(): IdeaSync {
    this.ensureProjectId();
    return new IdeaSync(this.mcpClient, this.projectId!);
  }

  /**
   * Get knowledge service for managing knowledge objects
   */
  getKnowledgeService(): KnowledgeService {
    return new KnowledgeService(this.mcpClient);
  }

  /**
   * Get canon service for managing canonical story facts
   */
  getCanonService(): CanonService {
    return new CanonService(this.mcpClient);
  }

  /**
   * Get promise service for managing narrative promises
   */
  getPromiseService(): PromiseService {
    return new PromiseService(this.mcpClient);
  }

  /**
   * Get context contract service for managing context contracts
   */
  getContextContractService(): ContextContractService {
    return new ContextContractService(this.mcpClient);
  }

  /**
   * Get narrative graph service for managing the narrative graph
   */
  getNarrativeGraphService(): NarrativeGraphService {
    return new NarrativeGraphService(this.mcpClient);
  }

  /**
   * Get snapshot manager for draft version control.
   *
   * Snapshots are created in `<projectPath>/revisions/` and operate directly
   * on the `chapters/` directory — no database access required.
   *
   * @returns A `SnapshotManager` scoped to this project's path
   */
  getSnapshotManager(): SnapshotManager {
    return new SnapshotManager(this.projectPath);
  }

  /**
   * Get a DraftScanner for finding placeholder markers and running chapter
   * checklists. — SPEC-06 Drafting Support Tools
   *
   * @returns A `DraftScanner` scoped to this project's path
   */
  getDraftScanner(): DraftScanner {
    return new DraftScanner(this.projectPath);
  }

  /**
   * Get a PacingAnalyzer for tension-arc, POV balance, chapter-length, and
   * pacing-flag analysis. — GAP-11 / SPEC-08
   *
   * @returns A `PacingAnalyzer` scoped to this project
   */
  getPacingAnalyzer(): PacingAnalyzer {
    this.ensureProjectId();
    return new PacingAnalyzer(this.mcpClient, this.projectId!);
  }

  /**
   * Get a ProseAnalyzer for word-level, rhythm, repetition, and dialogue
   * prose checks on chapter Markdown files. — SPEC-05
   *
   * @returns A `ProseAnalyzer` scoped to this project's path
   */
  getProseAnalyzer(): ProseAnalyzer {
    return new ProseAnalyzer(this.projectPath);
  }

  /**
   * Get a ReadAloudPreparer for stripping markup and analyzing rhythm/rhyme.
   * — CRAFT-05
   *
   * @returns A `ReadAloudPreparer` scoped to this project's path
   */
  getReadAloudPreparer(): ReadAloudPreparer {
    return new ReadAloudPreparer(this.projectPath);
  }

  /**
   * Get a ResearchService for managing research notes and [VERIFY:] markers.
   * — SPEC-04
   *
   * @returns A `ResearchService` backed by this project's MCPClient
   */
  getResearchService(): ResearchService {
    return new ResearchService(this.mcpClient);
  }

  /**
   * Get a CharacterArcService for recording scene states and visualizing arcs.
   * — SPEC-09
   *
   * @returns A `CharacterArcService` backed by this project's MCPClient
   */
  getCharacterArcService(): CharacterArcService {
    return new CharacterArcService(this.mcpClient);
  }

  /**
   * Get a BetaReaderService for managing beta readers and their feedback.
   * — SPEC-11
   *
   * @returns A `BetaReaderService` backed by this project's MCPClient
   */
  getBetaReaderService(): BetaReaderService {
    return new BetaReaderService(this.mcpClient);
  }

  /**
   * Get a QueryTrackerService for tracking literary agent query submissions.
   * — PROC-10
   *
   * @returns A `QueryTrackerService` backed by this project's MCPClient
   */
  getQueryTrackerService(): QueryTrackerService {
    return new QueryTrackerService(this.mcpClient);
  }

  /**
   * Get a ForeshadowingService for tagging planted setup and tracking payoff.
   * — PROC-03
   *
   * @returns A `ForeshadowingService` backed by this project's MCPClient
   */
  getForeshadowingService(): ForeshadowingService {
    return new ForeshadowingService(this.mcpClient);
  }

  /**
   * Get a SeriesManager for grouping projects into a series with a shared bible
   * and cross-book thread tracking. — PROC-11
   *
   * @returns A `SeriesManager` backed by this project's MCPClient
   */
  getSeriesManager(): SeriesManager {
    return new SeriesManager(this.mcpClient);
  }

  /**
   * Create character interactively with prompts
   *
   * @param promptFn - Function to prompt user for input
   * @returns Path to created YAML file
   */
  async createCharacterInteractive(promptFn: PromptFunction): Promise<string> {
    const builder = this.getCharacterBuilder();
    const filePath = await builder.createInteractive(promptFn);

    // Auto-sync to database if project is initialized
    if (this.projectId) {
      const sync = this.getCharacterSync();
      await sync.syncCharacterFile(filePath);
    }

    return filePath;
  }

  /**
   * Create location interactively with prompts
   *
   * @param promptFn - Function to prompt user for input
   * @returns Path to created YAML file
   */
  async createLocationInteractive(promptFn: PromptFunction): Promise<string> {
    const builder = this.getLocationBuilder();
    const filePath = await builder.createInteractive(promptFn);

    // Auto-sync to database if project is initialized
    if (this.projectId) {
      const sync = this.getLocationSync();
      await sync.syncLocationFile(filePath);
    }

    return filePath;
  }

  /**
   * Create plot thread interactively with prompts
   *
   * @param promptFn - Function to prompt user for input
   * @returns Path to created YAML file
   */
  async createPlotInteractive(promptFn: PromptFunction): Promise<string> {
    const builder = this.getPlotBuilder();
    const filePath = await builder.createInteractive(promptFn);

    // Auto-sync to database if project is initialized
    if (this.projectId) {
      const sync = this.getPlotSync();
      await sync.syncPlotFile(filePath);
    }

    return filePath;
  }

  /**
   * Ensure project ID is set
   */
  private ensureProjectId(): void {
    if (!this.projectId) {
      throw new Error(
        'Project ID not set. Call initialize() or setProjectId() first.'
      );
    }
  }
}

/**
 * Main extension API
 */
export {
  DatabaseManager,
  MCPSQLiteClient,
  CharacterSync,
  LocationSync,
  ChapterSync,
  SceneSync,
  PlotSync,
  PlotThreadSync,
  WorldRulesSync,
  SceneContextAssembler,
  ConsistencyChecker,
  CharacterBuilder,
  LocationBuilder,
  PlotBuilder,
  PlotThreadBuilder,
  WorldRulesBuilder,
  ChapterBuilder,
  SceneBuilder,
  SessionManager,
  ProgressDashboard,
  IdeaBuilder,
  IdeaSync,
};

export * from './types/novel.js';
export type { PromptFunction, PromptOptions } from './builders/character-builder.js';

/**
 * CLI and Command Handlers
 */
export { handleNovelCommand } from './commands/index.js';

/**
 * Extension version
 */
export const VERSION = '0.1.0';
