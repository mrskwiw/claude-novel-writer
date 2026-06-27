/**
 * World Rules Synchronization
 * Syncs world rule YAML files to database, and DB → YAML reverse sync.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import YAML from 'yaml';
import type { WorldRuleYAML } from '../types/novel.js';
import { SyncConflictError } from '../types/novel.js';
import type { MCPClient } from '../core/database.js';
import { SyncStateRepository } from '../db/repositories/sync-state-repository.js';

export interface WorldRulesSyncOptions {
  /** When true, overwrite DB data from file even if a conflict is detected. */
  forceFile?: boolean;
}

export class WorldRulesSync {
  private readonly syncStateRepo: SyncStateRepository;

  constructor(
    private mcpClient: MCPClient,
    private projectId: number,
    private projectPath?: string
  ) {
    this.syncStateRepo = new SyncStateRepository(mcpClient);
  }

  /**
   * Sync a world rule YAML file to database.
   *
   * @param filePath - absolute path to the YAML world-rule file
   * @param options  - optional flags; set `forceFile: true` to suppress conflict errors
   */
  async syncWorldRuleFile(
    filePath: string,
    options?: WorldRulesSyncOptions
  ): Promise<void> {
    console.log(`Syncing world rule from ${filePath}...`);

    // Read and parse YAML
    const content = await readFile(filePath, 'utf-8');
    const ruleData = YAML.parse(content) as WorldRuleYAML;

    // Conflict detection
    if (!options?.forceFile) {
      const existingRow = await this.mcpClient.readQuery(
        'SELECT id, updated_at FROM world_rules WHERE project_id = ? AND rule_name = ?',
        [this.projectId, ruleData.name]
      );
      if (existingRow.length > 0 && existingRow[0].updated_at) {
        const hasConflict = await this.syncStateRepo.detectConflict(
          'world_rule',
          ruleData.name,
          existingRow[0].updated_at as string
        );
        if (hasConflict) {
          throw new SyncConflictError(
            'world_rule',
            ruleData.name,
            `DB record updated at ${existingRow[0].updated_at as string} is newer than last file sync. Use forceFile option to override.`
          );
        }
      }
    }

    // Upsert world rule
    await this.upsertWorldRule(ruleData, filePath);

    // Record successful sync
    await this.syncStateRepo.record(
      'world_rule',
      ruleData.name,
      String(this.projectId),
      filePath
    );

    console.log(`World rule ${ruleData.name} synced successfully`);
  }

  /**
   * Export a world rule from the database back to a YAML file (reverse sync).
   * Writes to `<projectPath>/world-rules/<slug>.yaml`.
   *
   * @param ruleId - numeric DB id of the world_rule row (as string)
   * @returns absolute path to the written file
   */
  async exportToYAML(ruleId: string): Promise<string> {
    const rows = await this.mcpClient.readQuery(
      `SELECT id, rule_name, rule_category, description, limitations,
              is_hard_rule, established_chapter_id, established_quote
       FROM world_rules WHERE id = ? AND project_id = ?`,
      [ruleId, this.projectId]
    );
    if (rows.length === 0) {
      throw new Error(`World rule ${ruleId} not found in project ${this.projectId}`);
    }
    const row = rows[0];

    const yaml: WorldRuleYAML = {
      name: row.rule_name as string,
      category: row.rule_category as WorldRuleYAML['category'],
      description: (row.description as string) ?? '',
      is_hard_rule: Boolean(row.is_hard_rule),
    };

    if (row.limitations) yaml.limitations = row.limitations as string;

    if (row.established_chapter_id || row.established_quote) {
      yaml.established_in = {};
      if (row.established_chapter_id) {
        yaml.established_in.chapter = row.established_chapter_id as number;
      }
      if (row.established_quote) {
        yaml.established_in.quote = row.established_quote as string;
      }
    }

    const slug = (row.rule_name as string).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const basePath = this.projectPath ?? '.';
    const outputPath = join(basePath, 'world-rules', `${slug}.yaml`);

    await mkdir(dirname(outputPath), { recursive: true });
    const yamlContent = YAML.stringify(yaml, { indent: 2, lineWidth: 0 });
    await writeFile(outputPath, yamlContent, 'utf-8');

    console.log(`World rule exported to ${outputPath}`);
    return outputPath;
  }

  /**
   * Upsert world rule record
   */
  private async upsertWorldRule(
    ruleData: WorldRuleYAML,
    filePath: string
  ): Promise<number> {
    // Check if rule already exists
    const existing = await this.mcpClient.readQuery<{ id: number }>(
      'SELECT id FROM world_rules WHERE project_id = ? AND rule_name = ?',
      [this.projectId, ruleData.name]
    );

    const establishedChapterId = ruleData.established_in?.chapter || null;
    const establishedQuote = ruleData.established_in?.quote || null;
    const isHardRule = ruleData.is_hard_rule !== undefined ? (ruleData.is_hard_rule ? 1 : 0) : 1;

    if (existing.length > 0) {
      // Update existing
      const ruleId = existing[0].id;

      await this.mcpClient.writeQuery(
        `UPDATE world_rules SET
          rule_category = ?,
          description = ?,
          limitations = ?,
          established_chapter_id = ?,
          established_quote = ?,
          is_hard_rule = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          ruleData.category,
          ruleData.description,
          ruleData.limitations || null,
          establishedChapterId,
          establishedQuote,
          isHardRule,
          ruleId,
        ]
      );

      return ruleId;
    } else {
      // Insert new
      await this.mcpClient.writeQuery(
        `INSERT INTO world_rules (
          project_id, rule_category, rule_name, description,
          limitations, established_chapter_id, established_quote,
          is_hard_rule, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          this.projectId,
          ruleData.category,
          ruleData.name,
          ruleData.description,
          ruleData.limitations || null,
          establishedChapterId,
          establishedQuote,
          isHardRule,
        ]
      );

      // Get the inserted ID
      const result = await this.mcpClient.readQuery<{ id: number }>(
        'SELECT id FROM world_rules WHERE project_id = ? AND rule_name = ?',
        [this.projectId, ruleData.name]
      );

      return result[0].id;
    }
  }

  /**
   * Get all world rules for project
   */
  async getWorldRules(categoryFilter?: string): Promise<Record<string, unknown>[]> {
    let query = `
      SELECT
        id,
        rule_category,
        rule_name,
        description,
        limitations,
        established_chapter_id,
        established_quote,
        is_hard_rule,
        created_at,
        updated_at
      FROM world_rules
      WHERE project_id = ?
    `;

    const params: unknown[] = [this.projectId];

    if (categoryFilter) {
      query += ' AND rule_category = ?';
      params.push(categoryFilter);
    }

    query += ' ORDER BY rule_category, rule_name';

    return await this.mcpClient.readQuery(query, params);
  }

  /**
   * Get world rules by category
   */
  async getRulesByCategory(
    category: 'magic' | 'technology' | 'physics' | 'social' | 'political'
  ): Promise<Record<string, unknown>[]> {
    return await this.mcpClient.readQuery(
      `SELECT
        id,
        rule_name,
        description,
        limitations,
        is_hard_rule,
        established_chapter_id,
        established_quote
      FROM world_rules
      WHERE project_id = ?
        AND rule_category = ?
      ORDER BY rule_name`,
      [this.projectId, category]
    );
  }

  /**
   * Get hard rules (must never violate)
   */
  async getHardRules(): Promise<any[]> {
    return await this.mcpClient.readQuery(
      `SELECT
        id,
        rule_category,
        rule_name,
        description,
        limitations
      FROM world_rules
      WHERE project_id = ?
        AND is_hard_rule = 1
      ORDER BY rule_category, rule_name`,
      [this.projectId]
    );
  }

  /**
   * Get flexible rules
   */
  async getFlexibleRules(): Promise<any[]> {
    return await this.mcpClient.readQuery(
      `SELECT
        id,
        rule_category,
        rule_name,
        description,
        limitations
      FROM world_rules
      WHERE project_id = ?
        AND is_hard_rule = 0
      ORDER BY rule_category, rule_name`,
      [this.projectId]
    );
  }

  /**
   * Get established rules (have source reference)
   */
  async getEstablishedRules(): Promise<any[]> {
    return await this.mcpClient.readQuery(
      `SELECT
        id,
        rule_category,
        rule_name,
        description,
        established_chapter_id,
        established_quote
      FROM world_rules
      WHERE project_id = ?
        AND established_chapter_id IS NOT NULL
      ORDER BY established_chapter_id, rule_name`,
      [this.projectId]
    );
  }

  /**
   * Get world rules statistics
   */
  async getStats(): Promise<{
    total: number;
    byCategory: Record<string, number>;
    hardRules: number;
    flexibleRules: number;
    established: number;
  }> {
    // Total rules
    const totalResult = await this.mcpClient.readQuery<{ count: number }>(
      'SELECT COUNT(*) as count FROM world_rules WHERE project_id = ?',
      [this.projectId]
    );

    // By category
    const byCategoryResult = await this.mcpClient.readQuery<{ rule_category: string; count: number }>(
      `SELECT rule_category, COUNT(*) as count
       FROM world_rules
       WHERE project_id = ?
       GROUP BY rule_category`,
      [this.projectId]
    );

    // Hard rules
    const hardRulesResult = await this.mcpClient.readQuery<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM world_rules
       WHERE project_id = ?
         AND is_hard_rule = 1`,
      [this.projectId]
    );

    // Flexible rules
    const flexibleRulesResult = await this.mcpClient.readQuery<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM world_rules
       WHERE project_id = ?
         AND is_hard_rule = 0`,
      [this.projectId]
    );

    // Established rules
    const establishedResult = await this.mcpClient.readQuery<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM world_rules
       WHERE project_id = ?
         AND established_chapter_id IS NOT NULL`,
      [this.projectId]
    );

    const stats = {
      total: totalResult[0]?.count || 0,
      byCategory: {} as Record<string, number>,
      hardRules: hardRulesResult[0]?.count || 0,
      flexibleRules: flexibleRulesResult[0]?.count || 0,
      established: establishedResult[0]?.count || 0,
    };

    byCategoryResult.forEach((row) => {
      stats.byCategory[row.rule_category] = row.count;
    });

    return stats;
  }

  /**
   * Sync all world rule files from a directory
   */
  async syncAllFromDirectory(worldRulesDir: string): Promise<number> {
    const { readdir } = await import('fs/promises');
    const { existsSync } = await import('fs');
    const { join } = await import('path');

    if (!existsSync(worldRulesDir)) {
      return 0;
    }

    const files = await readdir(worldRulesDir);
    const ruleFiles = files.filter(
      (f) => f.endsWith('.yml') || f.endsWith('.yaml')
    );

    let synced = 0;
    for (const file of ruleFiles) {
      const filePath = join(worldRulesDir, file);
      await this.syncWorldRuleFile(filePath);
      synced++;
    }

    return synced;
  }

  /**
   * Delete a world rule
   */
  async deleteRule(ruleId: number): Promise<void> {
    await this.mcpClient.writeQuery(
      'DELETE FROM world_rules WHERE id = ? AND project_id = ?',
      [ruleId, this.projectId]
    );

    console.log(`World rule ${ruleId} deleted`);
  }

  /**
   * Search world rules by keyword
   */
  async searchRules(keyword: string): Promise<any[]> {
    return await this.mcpClient.readQuery(
      `SELECT
        id,
        rule_category,
        rule_name,
        description,
        limitations,
        is_hard_rule
      FROM world_rules
      WHERE project_id = ?
        AND (rule_name LIKE ? OR description LIKE ? OR limitations LIKE ?)
      ORDER BY rule_category, rule_name`,
      [
        this.projectId,
        `%${keyword}%`,
        `%${keyword}%`,
        `%${keyword}%`,
      ]
    );
  }
}
