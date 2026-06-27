import type { MCPClient } from '../../core/database.js';
import type { CanonItem, CanonConflict } from '../../types/canon.js';
import type { ID } from '../../types/common.js';

interface CanonItemRow {
  id: string;
  project_id: string;
  type: string;
  status: string;
  strength: string;
  subject: string;
  predicate: string;
  object: string | null;
  description: string;
  scope: string;
  source: string;
  confidence: number;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

interface CanonConflictRow {
  id: string;
  project_id: string;
  item_a: string;
  item_b: string;
  conflict_type: string;
  severity: string;
  explanation: string;
  recommended_resolution: string | null;
  status: string;
  created_at: string;
}

function rowToItem(row: CanonItemRow): CanonItem {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as CanonItem['type'],
    status: row.status as CanonItem['status'],
    strength: row.strength as CanonItem['strength'],
    subject: row.subject,
    predicate: row.predicate,
    object: row.object ?? undefined,
    description: row.description,
    scope: JSON.parse(row.scope),
    source: JSON.parse(row.source),
    confidence: row.confidence,
    validFrom: row.valid_from ? JSON.parse(row.valid_from) : undefined,
    validUntil: row.valid_until ? JSON.parse(row.valid_until) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToConflict(row: CanonConflictRow): CanonConflict {
  return {
    id: row.id,
    projectId: row.project_id,
    itemA: row.item_a,
    itemB: row.item_b,
    conflictType: row.conflict_type as CanonConflict['conflictType'],
    severity: row.severity as CanonConflict['severity'],
    explanation: row.explanation,
    recommendedResolution: row.recommended_resolution ?? undefined,
    status: row.status as CanonConflict['status'],
  };
}

export class CanonRepository {
  constructor(private readonly client: MCPClient) {}

  async insert(item: CanonItem): Promise<void> {
    await this.client.writeQuery(
      `INSERT INTO canon_items
         (id, project_id, type, status, strength, subject, predicate, object,
          description, scope, source, confidence, valid_from, valid_until,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.projectId,
        item.type,
        item.status,
        item.strength,
        item.subject,
        item.predicate,
        item.object ?? null,
        item.description,
        JSON.stringify(item.scope),
        JSON.stringify(item.source),
        item.confidence,
        item.validFrom ? JSON.stringify(item.validFrom) : null,
        item.validUntil ? JSON.stringify(item.validUntil) : null,
        item.createdAt,
        item.updatedAt,
      ]
    );
  }

  async update(id: ID, fields: Partial<CanonItem>): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const now = new Date().toISOString();

    if (fields.type !== undefined) { sets.push('type = ?'); params.push(fields.type); }
    if (fields.status !== undefined) { sets.push('status = ?'); params.push(fields.status); }
    if (fields.strength !== undefined) { sets.push('strength = ?'); params.push(fields.strength); }
    if (fields.description !== undefined) { sets.push('description = ?'); params.push(fields.description); }
    if (fields.confidence !== undefined) { sets.push('confidence = ?'); params.push(fields.confidence); }
    if (fields.object !== undefined) { sets.push('object = ?'); params.push(fields.object); }
    if (fields.scope !== undefined) { sets.push('scope = ?'); params.push(JSON.stringify(fields.scope)); }
    if (fields.source !== undefined) { sets.push('source = ?'); params.push(JSON.stringify(fields.source)); }
    if (fields.validFrom !== undefined) { sets.push('valid_from = ?'); params.push(JSON.stringify(fields.validFrom)); }
    if (fields.validUntil !== undefined) { sets.push('valid_until = ?'); params.push(JSON.stringify(fields.validUntil)); }

    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    params.push(now);
    params.push(id);

    await this.client.writeQuery(
      `UPDATE canon_items SET ${sets.join(', ')} WHERE id = ?`,
      params as string[]
    );
  }

  async getById(id: ID): Promise<CanonItem | null> {
    const rows = await this.client.readQuery(
      'SELECT * FROM canon_items WHERE id = ? LIMIT 1',
      [id]
    ) as CanonItemRow[];
    return rows[0] ? rowToItem(rows[0]) : null;
  }

  async listBySubject(projectId: ID, subject: string): Promise<CanonItem[]> {
    const rows = await this.client.readQuery(
      `SELECT * FROM canon_items WHERE project_id = ? AND subject = ? ORDER BY created_at DESC`,
      [projectId, subject]
    ) as CanonItemRow[];
    return rows.map(rowToItem);
  }

  async listByType(projectId: ID, type: CanonItem['type']): Promise<CanonItem[]> {
    const rows = await this.client.readQuery(
      `SELECT * FROM canon_items WHERE project_id = ? AND type = ? ORDER BY created_at DESC`,
      [projectId, type]
    ) as CanonItemRow[];
    return rows.map(rowToItem);
  }

  async listActive(projectId: ID): Promise<CanonItem[]> {
    const rows = await this.client.readQuery(
      `SELECT * FROM canon_items WHERE project_id = ? AND status = 'active' ORDER BY subject ASC`,
      [projectId]
    ) as CanonItemRow[];
    return rows.map(rowToItem);
  }

  /** Find existing items for same project + subject + predicate (used in conflict detection). */
  async findBySubjectPredicate(projectId: ID, subject: string, predicate: string): Promise<CanonItem[]> {
    const rows = await this.client.readQuery(
      `SELECT * FROM canon_items
       WHERE project_id = ? AND subject = ? AND predicate = ? AND status = 'active'`,
      [projectId, subject, predicate]
    ) as CanonItemRow[];
    return rows.map(rowToItem);
  }

  async insertConflict(conflict: CanonConflict): Promise<void> {
    await this.client.writeQuery(
      `INSERT INTO canon_conflicts
         (id, project_id, item_a, item_b, conflict_type, severity, explanation,
          recommended_resolution, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conflict.id,
        conflict.projectId,
        conflict.itemA,
        conflict.itemB,
        conflict.conflictType,
        conflict.severity,
        conflict.explanation,
        conflict.recommendedResolution ?? null,
        conflict.status,
        new Date().toISOString(),
      ]
    );
  }

  async listConflicts(projectId: ID, status: CanonConflict['status'] = 'open'): Promise<CanonConflict[]> {
    const rows = await this.client.readQuery(
      `SELECT * FROM canon_conflicts WHERE project_id = ? AND status = ? ORDER BY created_at DESC`,
      [projectId, status]
    ) as CanonConflictRow[];
    return rows.map(rowToConflict);
  }
}
