/**
 * Idea Sync
 * Synchronises idea YAML files to the `ideas` database table via MCPClient.
 */

import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import type { MCPClient } from '../core/database.js';
import type { IdeaEntry } from '../types/novel.js';

/** Upserts idea YAML files into the `ideas` table. */
export class IdeaSync {
  constructor(
    private mcpClient: MCPClient,
    private projectId: number
  ) {}

  /**
   * Upsert a single idea into the database.
   * Inserts if the idea_key does not yet exist for this project; updates otherwise.
   *
   * @param idea - The `IdeaEntry` to persist
   */
  async syncIdea(idea: IdeaEntry): Promise<void> {
    const existing = await this.mcpClient.readQuery(
      'SELECT id FROM ideas WHERE project_id = ? AND idea_key = ?',
      [this.projectId, idea.ideaKey]
    );

    if (existing.length > 0) {
      await this.mcpClient.writeQuery(
        `UPDATE ideas SET content = ?, tags = ?, linked_entity_type = ?, linked_entity_name = ?,
         status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [
          idea.content,
          JSON.stringify(idea.tags),
          idea.linkedEntityType ?? null,
          idea.linkedEntityName ?? null,
          idea.status,
          idea.notes ?? null,
          existing[0].id,
        ]
      );
    } else {
      await this.mcpClient.writeQuery(
        `INSERT INTO ideas (project_id, idea_key, content, tags, linked_entity_type, linked_entity_name, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.projectId,
          idea.ideaKey,
          idea.content,
          JSON.stringify(idea.tags),
          idea.linkedEntityType ?? null,
          idea.linkedEntityName ?? null,
          idea.status,
          idea.notes ?? null,
        ]
      );
    }
  }

  /**
   * Sync all `.yml` files found in `ideasDir` to the database.
   *
   * @param ideasDir - Absolute path to the directory containing idea YAML files
   * @returns Number of ideas synced
   */
  async syncAllFromDirectory(ideasDir: string): Promise<number> {
    if (!existsSync(ideasDir)) return 0;
    const files = await readdir(ideasDir);
    const ymlFiles = files.filter(f => f.endsWith('.yml'));
    let synced = 0;
    for (const file of ymlFiles) {
      const raw = await readFile(join(ideasDir, file), 'utf-8');
      const idea = YAML.parse(raw) as IdeaEntry;
      await this.syncIdea(idea);
      synced++;
    }
    return synced;
  }

  /**
   * Retrieve ideas for this project directly from the database.
   *
   * @param status - Optional status filter ('active' | 'used' | 'discarded')
   * @returns Array of `IdeaEntry` objects ordered newest-first
   */
  async listFromDb(status?: string): Promise<IdeaEntry[]> {
    let query = 'SELECT * FROM ideas WHERE project_id = ?';
    const params: (string | number)[] = [this.projectId];
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';
    const rows = await this.mcpClient.readQuery(query, params);
    return rows.map(row => ({
      id: row.id as number,
      projectId: row.project_id as number,
      ideaKey: row.idea_key as string,
      content: row.content as string,
      tags: JSON.parse((row.tags as string | null) ?? '[]') as string[],
      linkedEntityType: (row.linked_entity_type as IdeaEntry['linkedEntityType']) ?? undefined,
      linkedEntityName: (row.linked_entity_name as string | null) ?? undefined,
      status: row.status as IdeaEntry['status'],
      notes: (row.notes as string | null) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  }
}
