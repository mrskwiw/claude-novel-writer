/**
 * CanonFetcher — loads active canon items from the canon_items table.
 *
 * Block type mapping:
 *   - canon_items.type = 'fact' | 'rule' | 'assertion' → ContextType 'canon_facts'
 *   - canon_items.type = 'situation'                   → ContextType 'canon_situations'
 *
 * Only rows with status = 'active' are returned.
 */

import type { MCPClient } from '../../core/database.js';
import type { ContextBlock, ContextScope, ContextType } from '../../types/context.js';
import type { ContextFetcher } from './fetcher.js';
import { generateId } from '../../utils/ids.js';
import { estimateTokens } from '../../utils/token-count.js';

/** Raw DB row from the canon_items table. */
interface CanonRow {
  id: string;
  project_id: string;
  type: string;
  status: string;
  strength: string;
  subject: string;
  predicate: string;
  object: string | null;
  description: string;
  confidence: number;
}

/**
 * Fetches canon fact / situation context blocks.
 */
export class CanonFetcher implements ContextFetcher {
  constructor(private readonly mcpClient: MCPClient) {}

  async fetch(
    projectId: string,
    _scope: ContextScope,
    _queryText?: string,
  ): Promise<ContextBlock[]> {
    const sql = `
      SELECT id, project_id, type, status, strength, subject, predicate, object,
             description, confidence
      FROM canon_items
      WHERE project_id = ?
        AND status = 'active'
      ORDER BY type, subject
    `;

    let rows: CanonRow[];
    try {
      rows = await this.mcpClient.readQuery(sql, [projectId]) as CanonRow[];
    } catch {
      return [];
    }

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row, index): ContextBlock => {
      const blockType: ContextType =
        row.type === 'situation' ? 'canon_situations' : 'canon_facts';

      const title = row.object
        ? `${row.subject} ${row.predicate} ${row.object}`
        : `${row.subject} ${row.predicate}`;

      const parts: string[] = [title];
      parts.push(`Type: ${row.type} | Strength: ${row.strength}`);
      if (row.description) parts.push(row.description);
      const content = parts.join('\n');

      return {
        id: generateId(),
        type: blockType,
        title,
        content,
        sourceId: row.id,
        sourceType: 'canon_item',
        priority: 50,
        tokenCount: estimateTokens(content),
        required: false,
        orderIndex: index,
      };
    });
  }
}
