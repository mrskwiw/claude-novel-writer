/**
 * SceneFetcher — loads scene context blocks from the scenes JOIN chapters tables.
 *
 * Scope mapping:
 *   - 'current_scene'      → type 'current_scene'  (LIMIT 1, most recent scene)
 *   - all other scopes     → type 'recent_scenes'   (up to n scenes, default 5)
 */

import type { MCPClient } from '../../core/database.js';
import type { ContextBlock, ContextScope, ContextType } from '../../types/context.js';
import type { ContextFetcher } from './fetcher.js';
import { generateId } from '../../utils/ids.js';
import { estimateTokens } from '../../utils/token-count.js';

/** Raw DB row returned by the scenes JOIN chapters query. */
interface SceneRow {
  id: number;
  scene_number: number;
  title: string | null;
  purpose: string | null;
  emotional_tone: string | null;
  summary: string | null;
  chapter_id: number;
  chapter_number: number;
  chapter_title: string | null;
  project_id: number;
}

/**
 * Fetches scene context blocks for use by the policy engine.
 */
export class SceneFetcher implements ContextFetcher {
  constructor(private readonly mcpClient: MCPClient) {}

  async fetch(
    projectId: string,
    scope: ContextScope,
    _queryText?: string,
  ): Promise<ContextBlock[]> {
    const isCurrent = scope.range === 'current_scene';
    const limit = isCurrent ? 1 : (scope.n ?? 5);
    const blockType: ContextType = isCurrent ? 'current_scene' : 'recent_scenes';

    const sql = `
      SELECT
        s.id,
        s.scene_number,
        s.title,
        s.purpose,
        s.emotional_tone,
        s.summary,
        s.chapter_id,
        c.chapter_number,
        c.title AS chapter_title,
        c.project_id
      FROM scenes s
      JOIN chapters c ON s.chapter_id = c.id
      WHERE c.project_id = ?
      ORDER BY c.chapter_number DESC, s.scene_number DESC
      LIMIT ?
    `;

    let rows: SceneRow[];
    try {
      rows = await this.mcpClient.readQuery(sql, [projectId, limit]) as SceneRow[];
    } catch {
      return [];
    }

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row, index): ContextBlock => {
      const title = `Ch. ${row.chapter_number} / Scene ${row.scene_number}${row.title ? `: ${row.title}` : ''}`;
      const parts: string[] = [title];
      if (row.purpose) parts.push(`Purpose: ${row.purpose}`);
      if (row.emotional_tone) parts.push(`Tone: ${row.emotional_tone}`);
      if (row.summary) parts.push(`Summary: ${row.summary}`);
      const content = parts.join('\n');

      return {
        id: generateId(),
        type: blockType,
        title,
        content,
        sourceId: String(row.id),
        sourceType: 'scene',
        priority: 50,
        tokenCount: estimateTokens(content),
        required: false,
        orderIndex: index,
      };
    });
  }
}
