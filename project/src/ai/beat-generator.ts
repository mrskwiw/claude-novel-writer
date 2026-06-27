/**
 * Scene Beat Generator
 *
 * Assembles scene context from the database and calls Claude to generate
 * free-form narrative beats for a scene — the micro-structure of what happens
 * beat by beat within a single scene.
 *
 * Philosophy: beats are planning scaffolding, not prose. They help the author
 * see the shape of the scene before writing it. "Suggest, don't dictate."
 */

import type { MCPClient } from '../core/database.js';
import { ClaudeClient, PassthroughClaudeClient, type IClaudeClient } from './claude-client.js';
import type { SceneBeat } from '../types/novel.js';
import type { SceneMetadata } from '../builders/scene-builder.js';

export interface BeatContext {
  projectTitle: string;
  projectGenre?: string;
  chapterNumber: number;
  chapterTitle?: string;
  chapterSummary?: string;
  scene: SceneMetadata;
  povCharacter?: {
    name: string;
    role?: string;
    summary?: string;
    personality?: string;
    arc?: string;
  };
  activePlotThreads: Array<{ name: string; description: string; priority: number }>;
  hardWorldRules: Array<{ name: string; description: string }>;
  previousSceneLastBeat?: string;
}

export interface BeatGeneratorOptions {
  count?: number; // number of beats to generate (default 5)
}

export class BeatGenerator {
  private claude: IClaudeClient;

  constructor(
    private mcpClient: MCPClient,
    private projectId: number
  ) {
    this.claude = ClaudeClient.isConfigured()
      ? new ClaudeClient()
      : new PassthroughClaudeClient();
  }

  /**
   * Build the beat-generation prompt without calling the API.
   * Useful for surfacing context to the active Claude Code session.
   */
  async buildBeatPrompt(
    sceneMetadata: SceneMetadata,
    chapterNumber: number,
    count = 5
  ): Promise<string> {
    const ctx = await this.assembleContext(sceneMetadata, chapterNumber);
    return this.buildPrompt(ctx, count);
  }

  /**
   * Generate beats for a scene from its metadata and DB context.
   * Does not require the scene to have prose — works from planning data alone.
   *
   * Returns an empty array when running in passthrough mode (no standalone API
   * key). The caller should display the assembled prompt so the active Claude
   * Code session can generate beats and write them back.
   */
  async generateBeats(
    sceneMetadata: SceneMetadata,
    chapterNumber: number,
    options: BeatGeneratorOptions = {}
  ): Promise<SceneBeat[]> {
    const count = options.count ?? 5;
    const ctx = await this.assembleContext(sceneMetadata, chapterNumber);
    const prompt = this.buildPrompt(ctx, count);

    const response = await this.claude.generateStructured(prompt, {
      temperature: 0.8,
      maxTokens: 1024,
      systemPrompt:
        'You are a story structure assistant helping a novelist plan scene beats. ' +
        'Write concise, concrete, specific beats — not vague summaries. ' +
        'Each beat is one focused narrative unit: an action, a revelation, a decision, or a shift in understanding. ' +
        'Return ONLY the numbered list, nothing else.',
    });

    // Passthrough mode: no standalone API key configured — the prompt has been
    // emitted to stdout for the active Claude Code session to handle. Return a
    // sentinel so the CLI handler can print the context and wait for the agent
    // to supply beats rather than trying to parse the raw prompt text as beats.
    if (response.passthrough) {
      return [];
    }

    return this.parseBeats(response.content);
  }

  // ============================================================
  // CONTEXT ASSEMBLY
  // ============================================================

  private async assembleContext(
    scene: SceneMetadata,
    chapterNumber: number
  ): Promise<BeatContext> {
    const [project, chapterRow, threads, rules, previousSceneBeat] =
      await Promise.all([
        this.loadProject(),
        this.loadChapter(chapterNumber),
        this.loadActivePlotThreads(),
        this.loadHardWorldRules(),
        this.loadPreviousSceneLastBeat(chapterNumber, scene.sceneNumber),
      ]);

    const povCharacter = scene.pov
      ? await this.loadCharacter(scene.pov)
      : undefined;

    return {
      projectTitle: (project?.title as string) ?? 'Untitled',
      projectGenre: project?.genre as string | undefined,
      chapterNumber,
      chapterTitle: chapterRow?.title as string | undefined,
      chapterSummary: chapterRow?.summary as string | undefined,
      scene,
      povCharacter,
      activePlotThreads: threads,
      hardWorldRules: rules,
      previousSceneLastBeat: previousSceneBeat,
    };
  }

  private async loadProject(): Promise<Record<string, unknown> | undefined> {
    try {
      const rows = await this.mcpClient.readQuery(
        'SELECT title, genre FROM projects WHERE id = ? LIMIT 1',
        [this.projectId]
      );
      return rows[0] as Record<string, unknown> | undefined;
    } catch {
      return undefined;
    }
  }

  private async loadChapter(
    chapterNumber: number
  ): Promise<Record<string, unknown> | undefined> {
    try {
      const rows = await this.mcpClient.readQuery(
        'SELECT title, summary FROM chapters WHERE project_id = ? AND chapter_number = ? LIMIT 1',
        [this.projectId, chapterNumber]
      );
      return rows[0] as Record<string, unknown> | undefined;
    } catch {
      return undefined;
    }
  }

  private async loadCharacter(
    name: string
  ): Promise<BeatContext['povCharacter']> {
    try {
      const rows = await this.mcpClient.readQuery(
        `SELECT name, role, summary,
                GROUP_CONCAT(CASE WHEN ca.attribute_name = 'personality' THEN ca.attribute_value END) AS personality,
                GROUP_CONCAT(CASE WHEN ca.attribute_name = 'arc' THEN ca.attribute_value END) AS arc
         FROM characters c
         LEFT JOIN character_attributes ca ON ca.character_id = c.id
         WHERE c.project_id = ? AND c.name = ?
         GROUP BY c.id
         LIMIT 1`,
        [this.projectId, name]
      );
      if (!rows[0]) return undefined;
      const r = rows[0] as Record<string, unknown>;
      return {
        name: r.name as string,
        role: r.role as string | undefined,
        summary: r.summary as string | undefined,
        personality: r.personality as string | undefined,
        arc: r.arc as string | undefined,
      };
    } catch {
      return undefined;
    }
  }

  private async loadActivePlotThreads(): Promise<BeatContext['activePlotThreads']> {
    try {
      const rows = await this.mcpClient.readQuery(
        `SELECT thread_name AS name, description, priority
         FROM plot_threads
         WHERE project_id = ? AND status = 'active'
         ORDER BY priority DESC
         LIMIT 5`,
        [this.projectId]
      );
      return (rows as Array<Record<string, unknown>>).map((r) => ({
        name: r.name as string,
        description: (r.description as string) ?? '',
        priority: (r.priority as number) ?? 5,
      }));
    } catch {
      return [];
    }
  }

  private async loadHardWorldRules(): Promise<BeatContext['hardWorldRules']> {
    try {
      const rows = await this.mcpClient.readQuery(
        `SELECT rule_name AS name, description
         FROM world_rules
         WHERE project_id = ? AND is_hard_rule = 1
         LIMIT 6`,
        [this.projectId]
      );
      return (rows as Array<Record<string, unknown>>).map((r) => ({
        name: r.name as string,
        description: (r.description as string) ?? '',
      }));
    } catch {
      return [];
    }
  }

  /**
   * Load the last beat from the previous scene in the same chapter (for continuity).
   * Returns undefined if this is scene 1 or no beats exist.
   */
  private async loadPreviousSceneLastBeat(
    chapterNumber: number,
    sceneNumber: number
  ): Promise<string | undefined> {
    if (sceneNumber <= 1) return undefined;
    try {
      const rows = await this.mcpClient.readQuery(
        `SELECT sb.description
         FROM scene_beats sb
         JOIN scenes s ON sb.scene_id = s.id
         JOIN chapters c ON s.chapter_id = c.id
         WHERE c.project_id = ?
           AND c.chapter_number = ?
           AND s.scene_number = ?
         ORDER BY sb.beat_number DESC
         LIMIT 1`,
        [this.projectId, chapterNumber, sceneNumber - 1]
      );
      return rows[0]
        ? (rows[0] as Record<string, unknown>).description as string
        : undefined;
    } catch {
      return undefined;
    }
  }

  // ============================================================
  // PROMPT BUILDING
  // ============================================================

  private buildPrompt(ctx: BeatContext, count: number): string {
    const lines: string[] = [];

    lines.push(
      `PROJECT: ${ctx.projectTitle}${ctx.projectGenre ? ` (${ctx.projectGenre})` : ''}`,
      `CHAPTER ${ctx.chapterNumber}${ctx.chapterTitle ? `: ${ctx.chapterTitle}` : ''}`
    );

    if (ctx.chapterSummary) {
      lines.push(`Chapter summary: ${ctx.chapterSummary.trim()}`);
    }

    lines.push('');
    lines.push(
      `SCENE ${ctx.scene.sceneNumber}${ctx.scene.title ? `: ${ctx.scene.title}` : ''}`
    );
    if (ctx.scene.purpose) lines.push(`Purpose: ${ctx.scene.purpose}`);
    if (ctx.scene.emotionalTone) lines.push(`Tone: ${ctx.scene.emotionalTone}`);
    if (ctx.scene.tensionLevel != null)
      lines.push(`Tension level: ${ctx.scene.tensionLevel}/10`);
    if (ctx.scene.timeOfDay) lines.push(`Time: ${ctx.scene.timeOfDay}`);
    if (ctx.scene.location) lines.push(`Location: ${ctx.scene.location}`);
    if (ctx.scene.pov) lines.push(`POV: ${ctx.scene.pov}`);

    if (ctx.povCharacter) {
      lines.push('');
      lines.push(`POV CHARACTER — ${ctx.povCharacter.name}:`);
      if (ctx.povCharacter.role) lines.push(`  Role: ${ctx.povCharacter.role}`);
      if (ctx.povCharacter.summary)
        lines.push(`  ${ctx.povCharacter.summary.trim().slice(0, 400)}`);
      if (ctx.povCharacter.personality)
        lines.push(`  Personality: ${ctx.povCharacter.personality}`);
      if (ctx.povCharacter.arc)
        lines.push(`  Arc: ${ctx.povCharacter.arc}`);
    }

    if (ctx.activePlotThreads.length > 0) {
      lines.push('');
      lines.push('ACTIVE PLOT THREADS:');
      for (const t of ctx.activePlotThreads) {
        lines.push(`  • ${t.name} (priority ${t.priority}): ${t.description.slice(0, 200)}`);
      }
    }

    if (ctx.hardWorldRules.length > 0) {
      lines.push('');
      lines.push('HARD WORLD RULES (must not be violated):');
      for (const r of ctx.hardWorldRules) {
        lines.push(`  • ${r.name}: ${r.description.slice(0, 150)}`);
      }
    }

    if (ctx.previousSceneLastBeat) {
      lines.push('');
      lines.push(`PREVIOUS SCENE ENDS WITH:`);
      lines.push(`  ${ctx.previousSceneLastBeat}`);
    }

    lines.push('');
    lines.push(
      `Generate exactly ${count} beats for this scene. A beat is one focused narrative unit — ` +
        `an action, a reaction, a moment of realisation, a decision, a shift. ` +
        `Each beat should be one or two sentences, specific and concrete. ` +
        `Do not use labels or categories. Write only what happens.`
    );
    lines.push('');
    lines.push('Format — return only this, nothing else:');
    lines.push('1. [description]');
    lines.push('2. [description]');
    lines.push('...');

    return lines.join('\n');
  }

  // ============================================================
  // RESPONSE PARSING
  // ============================================================

  /**
   * Parse Claude's numbered list response into SceneBeat[].
   * Tolerates minor formatting variation (periods, parentheses, extra whitespace).
   */
  parseBeats(raw: string): SceneBeat[] {
    const beats: SceneBeat[] = [];
    const lines = raw.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Match "1. description", "1) description", "1: description"
      const match = trimmed.match(/^(\d+)[.):\s]\s*(.+)$/);
      if (match) {
        const beatNumber = parseInt(match[1], 10);
        const description = match[2].trim();
        if (description) {
          beats.push({ beatNumber, description });
        }
      }
    }

    // Re-number sequentially in case Claude skipped numbers
    return beats.map((b, i) => ({ ...b, beatNumber: i + 1 }));
  }
}
