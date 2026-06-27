/**
 * Scene Context Assembly
 * Loads relevant story context for AI when writing a scene
 */

import type { MCPClient } from '../core/database.js';
import type { SceneContext } from '../types/novel.js';

export interface ContextOptions {
  /**
   * Number of recent chapters to include summaries for
   */
  recentChapterCount?: number;

  /**
   * Maximum word count for context (to fit in AI window)
   */
  maxTokenBudget?: number;

  /**
   * Include full character details or just names
   */
  detailedCharacters?: boolean;

  /**
   * Include world rules relevant to location
   */
  includeWorldRules?: boolean;
}

export class SceneContextAssembler {
  constructor(
    private mcpClient: MCPClient,
    private projectId: number
  ) {}

  /**
   * Assemble complete context for writing a scene
   */
  async assembleContext(
    sceneId: number,
    options: ContextOptions = {}
  ): Promise<SceneContext> {
    const {
      recentChapterCount = 3,
      maxTokenBudget = 8000,
      detailedCharacters = true,
      includeWorldRules = true,
    } = options;

    console.log(`Assembling context for scene ${sceneId}...`);

    // Load scene and chapter
    const [scene, chapter] = await Promise.all([
      this.loadScene(sceneId),
      this.loadChapterForScene(sceneId),
    ]);

    // Load related data in parallel
    const [
      characters,
      location,
      worldRules,
      plotThreads,
      recentChapterSummaries,
      timelineEvents,
    ] = await Promise.all([
      this.loadSceneCharacters(sceneId, detailedCharacters),
      scene.locationId ? this.loadLocation(scene.locationId) : null,
      includeWorldRules ? this.loadRelevantWorldRules(scene.locationId) : [],
      this.loadRelevantPlotThreads(sceneId),
      this.loadRecentChapterSummaries(chapter.chapterNumber, recentChapterCount),
      this.loadRelevantTimelineEvents(sceneId),
    ]);

    let context: SceneContext = {
      scene,
      chapter,
      characters,
      location: location || undefined,
      worldRules,
      plotThreads,
      recentChapterSummaries,
      timelineEvents,
    };

    if (maxTokenBudget) {
      context = this.pruneToTokenBudget(context, maxTokenBudget);
    }

    console.log(
      `Context assembled: ${context.characters.length} characters, ${context.plotThreads.length} plot threads, ${context.worldRules.length} world rules`
    );

    return context;
  }

  /**
   * Prune low-priority context blocks until the assembled context fits within the token budget.
   * Pruning order (lowest priority first):
   *   1. Oldest chapter summaries (keep most recent)
   *   2. Inactive plot threads
   *   3. Non-hard world rules
   *   4. Timeline events
   */
  pruneToTokenBudget(context: SceneContext, budget: number): SceneContext {
    const pruned = { ...context };

    // Oldest summaries first — always keep at least 1
    while (
      this.estimateTokenCount(pruned) > budget &&
      pruned.recentChapterSummaries.length > 1
    ) {
      pruned.recentChapterSummaries = pruned.recentChapterSummaries.slice(1);
    }

    // Inactive plot threads
    if (this.estimateTokenCount(pruned) > budget) {
      pruned.plotThreads = pruned.plotThreads.filter(t => t.status === 'active');
    }

    // Non-hard world rules
    if (this.estimateTokenCount(pruned) > budget) {
      pruned.worldRules = pruned.worldRules.filter(r => r.isHardRule);
    }

    // Drop all timeline events if still over budget
    if (this.estimateTokenCount(pruned) > budget) {
      pruned.timelineEvents = [];
    }

    // Drop remaining chapter summaries if still over budget
    if (this.estimateTokenCount(pruned) > budget) {
      pruned.recentChapterSummaries = [];
    }

    return pruned;
  }

  /**
   * Load scene details
   */
  private async loadScene(sceneId: number): Promise<any> {
    const query = 'SELECT * FROM scenes WHERE id = ?';
    const results = await this.mcpClient.readQuery(query, [sceneId]);

    if (results.length === 0) {
      throw new Error(`Scene ${sceneId} not found`);
    }

    return results[0];
  }

  /**
   * Load chapter for a scene
   */
  private async loadChapterForScene(sceneId: number): Promise<any> {
    const query = `
      SELECT c.* FROM chapters c
      JOIN scenes s ON s.chapter_id = c.id
      WHERE s.id = ?
    `;
    const results = await this.mcpClient.readQuery(query, [sceneId]);

    if (results.length === 0) {
      throw new Error(`Chapter for scene ${sceneId} not found`);
    }

    return results[0];
  }

  /**
   * Load characters appearing in scene
   */
  private async loadSceneCharacters(
    sceneId: number,
    detailed: boolean
  ): Promise<any[]> {
    if (detailed) {
      // Load full character details with attributes
      const query = `
        SELECT
          c.*,
          GROUP_CONCAT(
            ca.attribute_type || ':' || ca.attribute_name || '=' || ca.attribute_value,
            '|'
          ) as attributes
        FROM characters c
        JOIN character_appearances cap ON c.id = cap.character_id
        LEFT JOIN character_attributes ca ON ca.character_id = c.id
        WHERE cap.scene_id = ?
        GROUP BY c.id
      `;
      return await this.mcpClient.readQuery(query, [sceneId]);
    } else {
      // Just load basic character info
      const query = `
        SELECT c.id, c.name, c.role, c.summary
        FROM characters c
        JOIN character_appearances cap ON c.id = cap.character_id
        WHERE cap.scene_id = ?
      `;
      return await this.mcpClient.readQuery(query, [sceneId]);
    }
  }

  /**
   * Load location details
   */
  private async loadLocation(locationId: number): Promise<any> {
    const query = `
      SELECT l.*,
             pl.name as parent_location_name
      FROM locations l
      LEFT JOIN locations pl ON l.parent_location_id = pl.id
      WHERE l.id = ?
    `;
    const results = await this.mcpClient.readQuery(query, [locationId]);
    return results[0] || null;
  }

  /**
   * Load world rules relevant to the scene
   */
  private async loadRelevantWorldRules(locationId?: number): Promise<any[]> {
    // Load all hard rules + rules specific to location
    const query = `
      SELECT * FROM world_rules
      WHERE project_id = ?
        AND (is_hard_rule = 1 OR ? IS NULL)
      ORDER BY is_hard_rule DESC, created_at
    `;
    return await this.mcpClient.readQuery(query, [this.projectId, locationId]);
  }

  /**
   * Load plot threads active in this scene
   */
  private async loadRelevantPlotThreads(sceneId: number): Promise<any[]> {
    const query = `
      SELECT DISTINCT pt.*,
             pb.description as beat_description
      FROM plot_threads pt
      LEFT JOIN plot_beats pb ON pb.plot_thread_id = pt.id AND pb.scene_id = ?
      WHERE pt.project_id = ?
        AND pt.status = 'active'
        AND (
          pb.scene_id = ?
          OR pt.introduced_scene_id <= ?
        )
      ORDER BY pt.priority DESC
    `;
    return await this.mcpClient.readQuery(query, [
      sceneId,
      this.projectId,
      sceneId,
      sceneId,
    ]);
  }

  /**
   * Load summaries of recent chapters for continuity
   */
  private async loadRecentChapterSummaries(
    currentChapterNumber: number,
    count: number
  ): Promise<Array<{ chapterNumber: number; summary: string }>> {
    const query = `
      SELECT chapter_number, summary
      FROM chapters
      WHERE project_id = ?
        AND chapter_number < ?
        AND summary IS NOT NULL
      ORDER BY chapter_number DESC
      LIMIT ?
    `;
    return await this.mcpClient.readQuery(query, [
      this.projectId,
      currentChapterNumber,
      count,
    ]);
  }

  /**
   * Load timeline events relevant to current point in story
   */
  private async loadRelevantTimelineEvents(sceneId: number): Promise<any[]> {
    const query = `
      SELECT te.*
      FROM timeline_events te
      WHERE te.project_id = ?
        AND (
          te.scene_id = ?
          OR te.scene_id IS NULL
          OR te.scene_id <= ?
        )
        AND te.importance >= 5
      ORDER BY te.story_timestamp DESC
      LIMIT 10
    `;
    return await this.mcpClient.readQuery(query, [
      this.projectId,
      sceneId,
      sceneId,
    ]);
  }

  /**
   * Format context as markdown for AI prompt
   */
  formatContextAsMarkdown(context: SceneContext): string {
    const parts: string[] = [];

    parts.push(`# Scene Context\n`);

    // Chapter info
    parts.push(`## Current Chapter`);
    parts.push(
      `**Chapter ${context.chapter.chapterNumber}**: ${context.chapter.title || 'Untitled'}`
    );
    parts.push(`Word count: ${context.chapter.wordCount}`);
    parts.push(`Status: ${context.chapter.status}\n`);

    // Scene info
    parts.push(`## This Scene`);
    parts.push(`**Scene ${context.scene.sceneNumber}**: ${context.scene.title || 'Untitled'}`);
    if (context.scene.purpose) {
      parts.push(`Purpose: ${context.scene.purpose}`);
    }
    if (context.scene.emotionalTone) {
      parts.push(`Tone: ${context.scene.emotionalTone}`);
    }
    parts.push('');

    // Characters
    if (context.characters.length > 0) {
      parts.push(`## Characters in This Scene`);
      for (const char of context.characters) {
        parts.push(`### ${char.name} (${char.role})`);
        if (char.summary) {
          parts.push(char.summary);
        }
        if (char.voiceNotes) {
          parts.push(`**Voice**: ${char.voiceNotes}`);
        }
        parts.push('');
      }
    }

    // Location
    if (context.location) {
      parts.push(`## Location: ${context.location.name}`);
      // Note: parentLocationId would need to be resolved to name via query if needed
      if (context.location.parentLocationId) {
        parts.push(`Parent Location ID: ${context.location.parentLocationId}`);
      }
      if (context.location.description) {
        parts.push(context.location.description);
      }
      parts.push('');
    }

    // World rules
    if (context.worldRules.length > 0) {
      parts.push(`## World Rules`);
      for (const rule of context.worldRules) {
        parts.push(`**${rule.ruleName}** (${rule.ruleCategory})`);
        parts.push(rule.description);
        if (rule.limitations) {
          parts.push(`*Limitations*: ${rule.limitations}`);
        }
        parts.push('');
      }
    }

    // Plot threads
    if (context.plotThreads.length > 0) {
      parts.push(`## Active Plot Threads`);
      for (const thread of context.plotThreads) {
        parts.push(`**${thread.threadName}** (${thread.threadType})`);
        if (thread.description) {
          parts.push(thread.description);
        }
        // Note: beat_description is not a PlotThread property
        // Would need to be loaded separately from plot_beats table if needed
        parts.push('');
      }
    }

    // Recent chapter summaries
    if (context.recentChapterSummaries.length > 0) {
      parts.push(`## Recent Chapters`);
      for (const summary of context.recentChapterSummaries.reverse()) {
        parts.push(
          `**Chapter ${summary.chapterNumber}**: ${summary.summary || 'No summary'}`
        );
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Get estimated token count for context
   */
  estimateTokenCount(context: SceneContext): number {
    const markdown = this.formatContextAsMarkdown(context);
    // Rough estimate: 1 token per 4 characters
    return Math.ceil(markdown.length / 4);
  }
}
