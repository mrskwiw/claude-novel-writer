/**
 * Plot Thread Synchronization
 * Syncs plot thread YAML files to database, and DB → YAML reverse sync.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import YAML from 'yaml';
import type { PlotYAML } from '../types/novel.js';
import { SyncConflictError } from '../types/novel.js';
import type { MCPClient } from '../core/database.js';
import { SyncStateRepository } from '../db/repositories/sync-state-repository.js';

export interface PlotThreadSyncOptions {
  /** When true, overwrite DB data from file even if a conflict is detected. */
  forceFile?: boolean;
}

export class PlotThreadSync {
  private readonly syncStateRepo: SyncStateRepository;

  constructor(
    private mcpClient: MCPClient,
    private projectId: number,
    private projectPath?: string
  ) {
    this.syncStateRepo = new SyncStateRepository(mcpClient);
  }

  /**
   * Sync a plot thread YAML file to database.
   *
   * @param filePath - absolute path to the YAML plot-thread file
   * @param options  - optional flags; set `forceFile: true` to suppress conflict errors
   */
  async syncPlotThreadFile(
    filePath: string,
    options?: PlotThreadSyncOptions
  ): Promise<void> {
    console.log(`Syncing plot thread from ${filePath}...`);

    // Read and parse YAML
    const content = await readFile(filePath, 'utf-8');
    const plotData = YAML.parse(content) as PlotYAML;

    // Conflict detection
    if (!options?.forceFile) {
      const existingRow = await this.mcpClient.readQuery(
        'SELECT id, updated_at FROM plot_threads WHERE project_id = ? AND thread_name = ?',
        [this.projectId, plotData.name]
      );
      if (existingRow.length > 0 && existingRow[0].updated_at) {
        const hasConflict = await this.syncStateRepo.detectConflict(
          'plot_thread',
          plotData.name,
          existingRow[0].updated_at as string
        );
        if (hasConflict) {
          throw new SyncConflictError(
            'plot_thread',
            plotData.name,
            `DB record updated at ${existingRow[0].updated_at as string} is newer than last file sync. Use forceFile option to override.`
          );
        }
      }
    }

    // Upsert plot thread
    const threadId = await this.upsertPlotThread(plotData, filePath);

    // Sync beats
    if (plotData.beats && plotData.beats.length > 0) {
      await this.syncBeats(threadId, plotData.beats);
    }

    // Record successful sync
    await this.syncStateRepo.record(
      'plot_thread',
      plotData.name,
      String(this.projectId),
      filePath
    );

    console.log(`Plot thread ${plotData.name} synced successfully`);
  }

  /**
   * Export a plot thread from the database back to a YAML file (reverse sync).
   * Writes to `<projectPath>/plots/<slug>.yaml`.
   *
   * @param threadId - numeric DB id of the plot_thread row (as string)
   * @returns absolute path to the written file
   */
  async exportToYAML(threadId: string): Promise<string> {
    const rows = await this.mcpClient.readQuery(
      `SELECT id, thread_name, thread_type, description, status, priority, notes
       FROM plot_threads WHERE id = ? AND project_id = ?`,
      [threadId, this.projectId]
    );
    if (rows.length === 0) {
      throw new Error(`Plot thread ${threadId} not found in project ${this.projectId}`);
    }
    const row = rows[0];

    // Load beats
    const beatRows = await this.mcpClient.readQuery(
      `SELECT scene_reference, description, beat_type
       FROM plot_beats WHERE plot_thread_id = ? ORDER BY beat_order`,
      [threadId]
    );

    const yaml: PlotYAML = {
      name: row.thread_name as string,
      type: row.thread_type as PlotYAML['type'],
      status: row.status as PlotYAML['status'],
      priority: row.priority as number,
      description: (row.description as string) ?? '',
    };

    if (row.notes) yaml.notes = row.notes as string;

    type BeatType = 'setup' | 'development' | 'climax' | 'resolution';
    if (beatRows.length > 0) {
      yaml.beats = beatRows.map((b) => ({
        scene: (b.scene_reference as string) ?? '',
        description: b.description as string,
        type: b.beat_type as BeatType,
      }));
    }

    const slug = (row.thread_name as string).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const basePath = this.projectPath ?? '.';
    const outputPath = join(basePath, 'plots', `${slug}.yaml`);

    await mkdir(dirname(outputPath), { recursive: true });
    const yamlContent = YAML.stringify(yaml, { indent: 2, lineWidth: 0 });
    await writeFile(outputPath, yamlContent, 'utf-8');

    console.log(`Plot thread exported to ${outputPath}`);
    return outputPath;
  }

  /**
   * Upsert plot thread record
   */
  private async upsertPlotThread(
    plotData: PlotYAML,
    filePath: string
  ): Promise<number> {
    // Check if thread already exists
    const existing = await this.mcpClient.readQuery<{ id: number }>(
      'SELECT id FROM plot_threads WHERE project_id = ? AND thread_name = ?',
      [this.projectId, plotData.name]
    );

    if (existing.length > 0) {
      // Update existing
      const threadId = existing[0].id;

      await this.mcpClient.writeQuery(
        `UPDATE plot_threads SET
          thread_type = ?,
          description = ?,
          status = ?,
          priority = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          plotData.type,
          plotData.description,
          plotData.status,
          plotData.priority,
          plotData.notes || null,
          threadId,
        ]
      );

      return threadId;
    } else {
      // Insert new
      await this.mcpClient.writeQuery(
        `INSERT INTO plot_threads (
          project_id, thread_name, thread_type, description,
          status, priority, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          this.projectId,
          plotData.name,
          plotData.type,
          plotData.description,
          plotData.status,
          plotData.priority,
          plotData.notes || null,
        ]
      );

      // Get the inserted ID
      const result = await this.mcpClient.readQuery<{ id: number }>(
        'SELECT id FROM plot_threads WHERE project_id = ? AND thread_name = ?',
        [this.projectId, plotData.name]
      );

      return result[0].id;
    }
  }

  /**
   * Resolve a scene reference string to a scene ID.
   * Parses: "Ch3.Scene2", "Ch3.S2", "Chapter 3 Scene 2", "3.2"
   * Returns { sceneId, canonicalKey } or null if unresolvable.
   */
  async resolveSceneRef(ref: string): Promise<{ sceneId: number; canonicalKey: string } | null> {
    let chapterNum: number | null = null;
    let sceneNum: number | null = null;

    const patterns = [
      /^Ch(\d+)\.Scene(\d+)$/i,
      /^Ch(\d+)\.S(\d+)$/i,
      /^Chapter\s+(\d+)\s+Scene\s+(\d+)$/i,
      /^(\d+)\.(\d+)$/,
    ];

    for (const pattern of patterns) {
      const m = ref.match(pattern);
      if (m) {
        chapterNum = parseInt(m[1], 10);
        sceneNum = parseInt(m[2], 10);
        break;
      }
    }

    if (chapterNum === null || sceneNum === null) {
      return null;
    }

    const results = await this.mcpClient.readQuery<{ id: number }>(
      `SELECT s.id FROM scenes s
       JOIN chapters c ON s.chapter_id = c.id
       WHERE c.project_id = ? AND c.chapter_number = ? AND s.scene_number = ?
       LIMIT 1`,
      [this.projectId, chapterNum, sceneNum]
    );

    if (results.length === 0) {
      return null;
    }

    return {
      sceneId: results[0].id,
      canonicalKey: `Ch${chapterNum}.Scene${sceneNum}`,
    };
  }

  /**
   * Sync plot beats to database.
   * Attempts to resolve scene_reference strings to scene_id FKs.
   * Unresolvable references log a warning but don't fail the sync.
   */
  private async syncBeats(
    threadId: number,
    beats: Array<{
      scene: string;
      description: string;
      type: 'setup' | 'development' | 'climax' | 'resolution';
    }>
  ): Promise<void> {
    // Delete existing beats for this thread
    await this.mcpClient.writeQuery(
      'DELETE FROM plot_beats WHERE plot_thread_id = ?',
      [threadId]
    );

    // Insert new beats, resolving scene refs where possible
    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      const resolved = beat.scene ? await this.resolveSceneRef(beat.scene) : null;

      if (beat.scene && !resolved) {
        console.warn(`Could not resolve scene reference: "${beat.scene}" — scene_id left null`);
      }

      await this.mcpClient.writeQuery(
        `INSERT INTO plot_beats (
          plot_thread_id,
          beat_order,
          scene_reference,
          scene_id,
          description,
          beat_type,
          resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          threadId,
          i + 1,
          beat.scene || null,
          resolved?.sceneId ?? null,
          beat.description,
          beat.type,
          resolved ? new Date().toISOString() : null,
        ]
      );
    }

    console.log(`Synced ${beats.length} beats for thread ${threadId}`);
  }

  /**
   * Get all plot threads for project
   */
  async getPlotThreads(statusFilter?: string): Promise<any[]> {
    let query = `
      SELECT
        id,
        thread_name,
        thread_type,
        description,
        status,
        priority,
        notes,
        created_at,
        updated_at
      FROM plot_threads
      WHERE project_id = ?
    `;

    const params: unknown[] = [this.projectId];

    if (statusFilter) {
      query += ' AND status = ?';
      params.push(statusFilter);
    }

    query += ' ORDER BY priority DESC, thread_name';

    return await this.mcpClient.readQuery(query, params);
  }

  /**
   * Get beats for a plot thread
   */
  async getBeats(threadId: number): Promise<Record<string, unknown>[]> {
    return await this.mcpClient.readQuery(
      `SELECT
        id,
        beat_order,
        scene_reference,
        description,
        beat_type,
        created_at
      FROM plot_beats
      WHERE plot_thread_id = ?
      ORDER BY beat_order`,
      [threadId]
    );
  }

  /**
   * Get unresolved plot threads
   */
  async getUnresolvedThreads(): Promise<Record<string, unknown>[]> {
    return await this.mcpClient.readQuery(
      `SELECT
        id,
        thread_name,
        thread_type,
        description,
        status,
        priority,
        notes
      FROM plot_threads
      WHERE project_id = ?
        AND status NOT IN ('resolved', 'abandoned')
      ORDER BY priority DESC, thread_name`,
      [this.projectId]
    );
  }

  /**
   * Get high-priority unresolved threads
   */
  async getHighPriorityUnresolved(): Promise<any[]> {
    return await this.mcpClient.readQuery(
      `SELECT
        id,
        thread_name,
        thread_type,
        description,
        status,
        priority,
        notes
      FROM plot_threads
      WHERE project_id = ?
        AND status NOT IN ('resolved', 'abandoned')
        AND priority >= 7
      ORDER BY priority DESC, thread_name`,
      [this.projectId]
    );
  }

  /**
   * Get plot threads by type
   */
  async getThreadsByType(
    type: 'main' | 'subplot' | 'character' | 'theme'
  ): Promise<any[]> {
    return await this.mcpClient.readQuery(
      `SELECT
        id,
        thread_name,
        thread_type,
        description,
        status,
        priority,
        notes
      FROM plot_threads
      WHERE project_id = ?
        AND thread_type = ?
      ORDER BY priority DESC, thread_name`,
      [this.projectId, type]
    );
  }

  /**
   * Mark plot thread as resolved
   */
  async resolveThread(threadId: number, resolvedInSceneId?: number): Promise<void> {
    await this.mcpClient.writeQuery(
      `UPDATE plot_threads SET
        status = 'resolved',
        resolved_scene_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [resolvedInSceneId || null, threadId]
    );

    console.log(`Plot thread ${threadId} marked as resolved`);
  }

  /**
   * Get plot thread statistics
   */
  async getStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    totalBeats: number;
    unresolved: number;
    highPriorityUnresolved: number;
  }> {
    // Total threads
    const totalResult = await this.mcpClient.readQuery<{ count: number }>(
      'SELECT COUNT(*) as count FROM plot_threads WHERE project_id = ?',
      [this.projectId]
    );

    // By type
    const byTypeResult = await this.mcpClient.readQuery<{ thread_type: string; count: number }>(
      `SELECT thread_type, COUNT(*) as count
       FROM plot_threads
       WHERE project_id = ?
       GROUP BY thread_type`,
      [this.projectId]
    );

    // By status
    const byStatusResult = await this.mcpClient.readQuery<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count
       FROM plot_threads
       WHERE project_id = ?
       GROUP BY status`,
      [this.projectId]
    );

    // Total beats
    const beatsResult = await this.mcpClient.readQuery<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM plot_beats pb
       JOIN plot_threads pt ON pb.plot_thread_id = pt.id
       WHERE pt.project_id = ?`,
      [this.projectId]
    );

    // Unresolved
    const unresolvedResult = await this.mcpClient.readQuery<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM plot_threads
       WHERE project_id = ?
         AND status NOT IN ('resolved', 'abandoned')`,
      [this.projectId]
    );

    // High priority unresolved
    const highPriorityResult = await this.mcpClient.readQuery<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM plot_threads
       WHERE project_id = ?
         AND status NOT IN ('resolved', 'abandoned')
         AND priority >= 7`,
      [this.projectId]
    );

    const stats = {
      total: totalResult[0]?.count || 0,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      totalBeats: beatsResult[0]?.count || 0,
      unresolved: unresolvedResult[0]?.count || 0,
      highPriorityUnresolved: highPriorityResult[0]?.count || 0,
    };

    byTypeResult.forEach((row) => {
      stats.byType[row.thread_type] = row.count;
    });

    byStatusResult.forEach((row) => {
      stats.byStatus[row.status] = row.count;
    });

    return stats;
  }

  /**
   * Sync all plot thread files from a directory
   */
  async syncAllFromDirectory(plotDir: string): Promise<number> {
    const { readdir } = await import('fs/promises');
    const { existsSync } = await import('fs');
    const { join } = await import('path');

    if (!existsSync(plotDir)) {
      return 0;
    }

    const files = await readdir(plotDir);
    const plotFiles = files.filter(
      (f) => f.endsWith('.yml') || f.endsWith('.yaml')
    );

    let synced = 0;
    for (const file of plotFiles) {
      const filePath = join(plotDir, file);
      await this.syncPlotThreadFile(filePath);
      synced++;
    }

    return synced;
  }
}
