/**
 * Location file to database synchronization
 * Handles YAML/Markdown location files → database, and DB → YAML reverse sync.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import YAML from 'yaml';
import type { LocationYAML } from '../types/novel.js';
import { SyncConflictError } from '../types/novel.js';
import type { MCPClient } from '../core/database.js';
import { SyncStateRepository } from '../db/repositories/sync-state-repository.js';

export interface LocationSyncOptions {
  /** When true, overwrite DB data from file even if a conflict is detected. */
  forceFile?: boolean;
}

export class LocationSync {
  private readonly syncStateRepo: SyncStateRepository;

  constructor(
    private mcpClient: MCPClient,
    private projectId: number,
    private projectPath?: string
  ) {
    this.syncStateRepo = new SyncStateRepository(mcpClient);
  }

  /**
   * Sync a location file to the database.
   *
   * @param filePath - absolute path to the YAML location file
   * @param options  - optional flags; set `forceFile: true` to suppress conflict errors
   */
  async syncLocationFile(
    filePath: string,
    options?: LocationSyncOptions
  ): Promise<void> {
    console.log(`Syncing location from ${filePath}...`);

    // Read and parse YAML
    const content = await readFile(filePath, 'utf-8');
    const location = YAML.parse(content) as LocationYAML;

    // Validate required fields
    if (!location.name) {
      throw new Error(
        `Location file ${filePath} missing required 'name' field`
      );
    }

    // Conflict detection
    if (!options?.forceFile) {
      const existingRow = await this.mcpClient.readQuery(
        'SELECT id, updated_at FROM locations WHERE project_id = ? AND name = ?',
        [this.projectId, location.name]
      );
      if (existingRow.length > 0 && existingRow[0].updated_at) {
        const hasConflict = await this.syncStateRepo.detectConflict(
          'location',
          location.name,
          existingRow[0].updated_at as string
        );
        if (hasConflict) {
          throw new SyncConflictError(
            'location',
            location.name,
            `DB record updated at ${existingRow[0].updated_at as string} is newer than last file sync. Use forceFile option to override.`
          );
        }
      }
    }

    // Insert or update location
    await this.upsertLocation(location, filePath);

    // Record successful sync
    await this.syncStateRepo.record(
      'location',
      location.name,
      String(this.projectId),
      filePath
    );

    console.log(`Location ${location.name} synced successfully`);
  }

  /**
   * Insert or update location record
   */
  private async upsertLocation(
    location: LocationYAML,
    filePath: string
  ): Promise<number> {
    // Check if location exists
    const existingQuery = `
      SELECT id FROM locations
      WHERE project_id = ? AND name = ?
    `;
    const existing = await this.mcpClient.readQuery<{ id: number }>(existingQuery, [
      this.projectId,
      location.name,
    ]);

    // Get parent location ID if specified
    let parentLocationId = null;
    if (location.parentLocation) {
      const parentQuery = `
        SELECT id FROM locations
        WHERE project_id = ? AND name = ?
      `;
      const parent = await this.mcpClient.readQuery<{ id: number }>(parentQuery, [
        this.projectId,
        location.parentLocation,
      ]);
      if (parent.length > 0) {
        parentLocationId = parent[0].id;
      } else {
        console.warn(
          `Parent location not found: ${location.parentLocation}`
        );
      }
    }

    if (existing.length > 0) {
      // Update existing
      const updateQuery = `
        UPDATE locations
        SET location_type = ?,
            parent_location_id = ?,
            description = ?,
            file_path = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await this.mcpClient.writeQuery(updateQuery, [
        location.type || null,
        parentLocationId,
        this.buildDescription(location),
        filePath,
        existing[0].id,
      ]);

      return existing[0].id;
    } else {
      // Insert new
      const insertQuery = `
        INSERT INTO locations (
          project_id, name, location_type, parent_location_id,
          description, file_path
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      await this.mcpClient.writeQuery(insertQuery, [
        this.projectId,
        location.name,
        location.type || null,
        parentLocationId,
        this.buildDescription(location),
        filePath,
      ]);

      // Get the inserted ID
      const idQuery = 'SELECT last_insert_rowid() as id';
      const result = await this.mcpClient.readQuery<{ id: number }>(idQuery);
      return result[0].id;
    }
  }

  /**
   * Build description from location data
   */
  private buildDescription(location: LocationYAML): string {
    const parts: string[] = [location.description];

    if (location.details) {
      parts.push('\n\nDetails:');
      for (const [key, value] of Object.entries(location.details)) {
        parts.push(`- ${key}: ${value}`);
      }
    }

    if (location.rules && location.rules.length > 0) {
      parts.push('\n\nRules:');
      for (const rule of location.rules) {
        parts.push(`- ${rule}`);
      }
    }

    if (location.notes) {
      parts.push(`\n\nNotes: ${location.notes}`);
    }

    return parts.join('\n');
  }

  /**
   * Export a location from the database back to a YAML file (reverse sync).
   * Writes to `<projectPath>/locations/<slug>.yaml`.
   *
   * @param locationId - numeric DB id of the location row (as string)
   * @returns absolute path to the written file
   */
  async exportToYAML(locationId: string): Promise<string> {
    const rows = await this.mcpClient.readQuery(
      `SELECT id, name, location_type, description, file_path
       FROM locations WHERE id = ? AND project_id = ?`,
      [locationId, this.projectId]
    );
    if (rows.length === 0) {
      throw new Error(`Location ${locationId} not found in project ${this.projectId}`);
    }
    const row = rows[0];

    const yaml: LocationYAML = {
      name: row.name as string,
      description: (row.description as string) ?? '',
    };

    if (row.location_type) yaml.type = row.location_type as string;

    const slug = (row.name as string).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const basePath = this.projectPath ?? '.';
    const outputPath = (row.file_path as string | null) ?? join(basePath, 'locations', `${slug}.yaml`);

    await mkdir(dirname(outputPath), { recursive: true });
    const yamlContent = YAML.stringify(yaml, { indent: 2, lineWidth: 0 });
    await writeFile(outputPath, yamlContent, 'utf-8');

    console.log(`Location exported to ${outputPath}`);
    return outputPath;
  }

  /**
   * Delete a location from database (when file is deleted)
   */
  async deleteLocation(locationName: string): Promise<void> {
    const query = `
      DELETE FROM locations
      WHERE project_id = ? AND name = ?
    `;
    await this.mcpClient.writeQuery(query, [this.projectId, locationName]);
    console.log(`Location ${locationName} deleted`);
  }
}
