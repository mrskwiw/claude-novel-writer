/**
 * PromiseFetcher — loads open/developing narrative promises from the
 * narrative_promises table.
 *
 * All returned blocks have type 'promises'.
 * Only rows with status IN ('open', 'developing') are returned.
 */

import type { MCPClient } from '../../core/database.js';
import type { ContextBlock, ContextScope } from '../../types/context.js';
import type { ContextFetcher } from './fetcher.js';
import { generateId } from '../../utils/ids.js';
import { estimateTokens } from '../../utils/token-count.js';

/** Raw DB row from the narrative_promises table. */
interface PromiseRow {
  id: string;
  project_id: string;
  type: string;
  status: string;
  title: string;
  description: string;
  importance: number;
  reader_visibility: number;
}

/**
 * Fetches narrative promise context blocks.
 */
export class PromiseFetcher implements ContextFetcher {
  constructor(private readonly mcpClient: MCPClient) {}

  async fetch(
    projectId: string,
    _scope: ContextScope,
    _queryText?: string,
  ): Promise<ContextBlock[]> {
    const sql = `
      SELECT id, project_id, type, status, title, description,
             importance, reader_visibility
      FROM narrative_promises
      WHERE project_id = ?
        AND status IN ('open', 'developing')
      ORDER BY importance DESC, reader_visibility DESC
    `;

    let rows: PromiseRow[];
    try {
      rows = await this.mcpClient.readQuery(sql, [projectId]) as PromiseRow[];
    } catch {
      return [];
    }

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row, index): ContextBlock => {
      const title = `${row.title} [${row.type}]`;
      const parts: string[] = [title];
      parts.push(`Status: ${row.status} | Importance: ${row.importance}`);
      if (row.description) parts.push(row.description);
      const content = parts.join('\n');

      return {
        id: generateId(),
        type: 'promises',
        title,
        content,
        sourceId: row.id,
        sourceType: 'narrative_promise',
        priority: 50,
        tokenCount: estimateTokens(content),
        required: false,
        orderIndex: index,
      };
    });
  }
}
