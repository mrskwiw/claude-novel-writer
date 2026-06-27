/**
 * CharacterFetcher — loads character profile blocks from the characters table.
 *
 * All scope variants return blocks with type 'character_profiles'.
 * The number of characters returned is capped by scope.n (default: all).
 */

import type { MCPClient } from '../../core/database.js';
import type { ContextBlock, ContextScope } from '../../types/context.js';
import type { ContextFetcher } from './fetcher.js';
import { generateId } from '../../utils/ids.js';
import { estimateTokens } from '../../utils/token-count.js';

/** Raw DB row from the characters table. */
interface CharacterRow {
  id: number;
  project_id: number;
  name: string;
  full_name: string | null;
  role: string | null;
  summary: string | null;
  voice_notes: string | null;
}

/**
 * Fetches character profile context blocks.
 */
export class CharacterFetcher implements ContextFetcher {
  constructor(private readonly mcpClient: MCPClient) {}

  async fetch(
    projectId: string,
    scope: ContextScope,
    _queryText?: string,
  ): Promise<ContextBlock[]> {
    const limitClause = scope.n !== undefined ? ` LIMIT ${scope.n}` : '';
    const sql = `
      SELECT id, project_id, name, full_name, role, summary, voice_notes
      FROM characters
      WHERE project_id = ?
      ORDER BY role, name${limitClause}
    `;

    let rows: CharacterRow[];
    try {
      rows = await this.mcpClient.readQuery(sql, [projectId]) as CharacterRow[];
    } catch {
      return [];
    }

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row, index): ContextBlock => {
      const title = row.full_name
        ? `${row.name} (${row.full_name})`
        : row.name;
      const parts: string[] = [title];
      if (row.role) parts.push(`Role: ${row.role}`);
      if (row.summary) parts.push(`Summary: ${row.summary}`);
      if (row.voice_notes) parts.push(`Voice: ${row.voice_notes}`);
      const content = parts.join('\n');

      return {
        id: generateId(),
        type: 'character_profiles',
        title,
        content,
        sourceId: String(row.id),
        sourceType: 'character',
        priority: 50,
        tokenCount: estimateTokens(content),
        required: false,
        orderIndex: index,
      };
    });
  }
}
