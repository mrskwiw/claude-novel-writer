/**
 * Plot thread file to database synchronization
 * Handles YAML plot thread files → database
 */

import { readFile } from 'fs/promises';
import YAML from 'yaml';
import type { PlotYAML } from '../types/novel.js';
import type { MCPClient } from '../core/database.js';

export class PlotSync {
  constructor(
    private mcpClient: MCPClient,
    private projectId: number
  ) {}

  /**
   * Sync a plot YAML file to the database
   */
  async syncPlotFile(filePath: string): Promise<void> {
    console.log(`Syncing plot thread from ${filePath}...`);

    // Read and parse YAML
    const content = await readFile(filePath, 'utf-8');
    const plot = YAML.parse(content) as PlotYAML;

    // Validate required fields
    if (!plot.name) {
      throw new Error(`Plot file ${filePath} missing required 'name' field`);
    }

    if (!plot.type) {
      throw new Error(`Plot file ${filePath} missing required 'type' field`);
    }

    // Insert or update plot thread
    const plotId = await this.upsertPlot(plot, filePath);

    // Sync plot beats
    if (plot.beats && plot.beats.length > 0) {
      await this.syncBeats(plotId, plot.beats);
    }

    console.log(`Plot thread ${plot.name} synced successfully`);
  }

  /**
   * Insert or update plot thread record
   */
  private async upsertPlot(
    plot: PlotYAML,
    filePath: string
  ): Promise<number> {
    // Check if plot exists
    const existingQuery = `
      SELECT id FROM plot_threads
      WHERE project_id = ? AND thread_name = ?
    `;
    const existing = await this.mcpClient.readQuery<{ id: number }>(existingQuery, [
      this.projectId,
      plot.name,
    ]);

    if (existing.length > 0) {
      // Update existing
      const updateQuery = `
        UPDATE plot_threads
        SET thread_type = ?,
            description = ?,
            status = ?,
            priority = ?,
            notes = ?,
            file_path = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await this.mcpClient.writeQuery(updateQuery, [
        plot.type,
        plot.description || null,
        plot.status,
        plot.priority,
        plot.notes || null,
        filePath,
        existing[0].id,
      ]);

      return existing[0].id;
    } else {
      // Insert new
      const insertQuery = `
        INSERT INTO plot_threads (
          project_id,
          thread_name,
          thread_type,
          description,
          status,
          priority,
          notes,
          file_path,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;

      await this.mcpClient.writeQuery(insertQuery, [
        this.projectId,
        plot.name,
        plot.type,
        plot.description || null,
        plot.status,
        plot.priority,
        plot.notes || null,
        filePath,
      ]);

      // Get the ID of the inserted record
      const idQuery = `
        SELECT id FROM plot_threads
        WHERE project_id = ? AND thread_name = ?
      `;
      const result = await this.mcpClient.readQuery<{ id: number }>(idQuery, [
        this.projectId,
        plot.name,
      ]);

      return result[0].id;
    }
  }

  /**
   * Sync plot beats
   */
  private async syncBeats(
    plotId: number,
    beats: PlotYAML['beats']
  ): Promise<void> {
    if (!beats) return;

    // Delete existing beats for this plot
    const deleteQuery = `
      DELETE FROM plot_beats
      WHERE plot_thread_id = ?
    `;
    await this.mcpClient.writeQuery(deleteQuery, [plotId]);

    // Insert new beats
    const insertQuery = `
      INSERT INTO plot_beats (
        plot_thread_id,
        beat_order,
        beat_type,
        description,
        scene_reference,
        created_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      await this.mcpClient.writeQuery(insertQuery, [
        plotId,
        i + 1,
        beat.type,
        beat.description,
        beat.scene || null,
      ]);
    }
  }

  /**
   * Sync all plot files in the plots directory
   */
  async syncAllPlots(plotsDir: string): Promise<void> {
    const { readdir } = await import('fs/promises');
    const { join } = await import('path');
    const { existsSync } = await import('fs');

    if (!existsSync(plotsDir)) {
      console.log('No plots directory found');
      return;
    }

    const files = await readdir(plotsDir);
    const plotFiles = files.filter(
      (f) =>
        (f.endsWith('.yml') || f.endsWith('.yaml')) && !f.startsWith('_')
    );

    console.log(`Found ${plotFiles.length} plot file(s)`);

    for (const file of plotFiles) {
      const filePath = join(plotsDir, file);
      try {
        await this.syncPlotFile(filePath);
      } catch (error) {
        console.error(`Failed to sync ${file}:`, error);
      }
    }
  }
}
