import type { MCPClient } from '../../core/database.js';
import type { KnowledgeObject, KnowledgeObjectType } from '../../types/knowledge.js';
import type { ID } from '../../types/common.js';

interface KnowledgeObjectRow {
  id: string;
  project_id: string;
  type: string;
  title: string;
  summary: string | null;
  body: string | null;
  structured_data: string;
  scope: string;
  source: string;
  confidence: number;
  status: string;
  context_eligible: number;
  graph_eligible: number;
  embedding_eligible: number;
  created_at: string;
  updated_at: string;
}

function rowToObject(row: KnowledgeObjectRow): KnowledgeObject {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as KnowledgeObjectType,
    title: row.title,
    summary: row.summary ?? undefined,
    body: row.body ?? undefined,
    structuredData: JSON.parse(row.structured_data) as Record<string, unknown>,
    scope: JSON.parse(row.scope),
    source: JSON.parse(row.source),
    confidence: row.confidence,
    status: row.status as KnowledgeObject['status'],
    contextEligible: row.context_eligible === 1,
    graphEligible: row.graph_eligible === 1,
    embeddingEligible: row.embedding_eligible === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KnowledgeRepository {
  constructor(private readonly client: MCPClient) {}

  async insert(obj: KnowledgeObject): Promise<void> {
    await this.client.writeQuery(
      `INSERT INTO knowledge_objects
         (id, project_id, type, title, summary, body, structured_data, scope, source,
          confidence, status, context_eligible, graph_eligible, embedding_eligible,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        obj.id,
        obj.projectId,
        obj.type,
        obj.title,
        obj.summary ?? null,
        obj.body ?? null,
        JSON.stringify(obj.structuredData),
        JSON.stringify(obj.scope),
        JSON.stringify(obj.source),
        obj.confidence,
        obj.status,
        obj.contextEligible ? 1 : 0,
        obj.graphEligible ? 1 : 0,
        obj.embeddingEligible ? 1 : 0,
        obj.createdAt,
        obj.updatedAt,
      ]
    );
  }

  async update(id: ID, fields: Partial<KnowledgeObject>): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const now = new Date().toISOString();

    if (fields.title !== undefined) { sets.push('title = ?'); params.push(fields.title); }
    if (fields.summary !== undefined) { sets.push('summary = ?'); params.push(fields.summary); }
    if (fields.body !== undefined) { sets.push('body = ?'); params.push(fields.body); }
    if (fields.structuredData !== undefined) { sets.push('structured_data = ?'); params.push(JSON.stringify(fields.structuredData)); }
    if (fields.scope !== undefined) { sets.push('scope = ?'); params.push(JSON.stringify(fields.scope)); }
    if (fields.source !== undefined) { sets.push('source = ?'); params.push(JSON.stringify(fields.source)); }
    if (fields.confidence !== undefined) { sets.push('confidence = ?'); params.push(fields.confidence); }
    if (fields.status !== undefined) { sets.push('status = ?'); params.push(fields.status); }
    if (fields.contextEligible !== undefined) { sets.push('context_eligible = ?'); params.push(fields.contextEligible ? 1 : 0); }
    if (fields.graphEligible !== undefined) { sets.push('graph_eligible = ?'); params.push(fields.graphEligible ? 1 : 0); }
    if (fields.embeddingEligible !== undefined) { sets.push('embedding_eligible = ?'); params.push(fields.embeddingEligible ? 1 : 0); }

    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    params.push(now);
    params.push(id);

    await this.client.writeQuery(
      `UPDATE knowledge_objects SET ${sets.join(', ')} WHERE id = ?`,
      params as string[]
    );
  }

  async getById(id: ID): Promise<KnowledgeObject | null> {
    const rows = await this.client.readQuery(
      'SELECT * FROM knowledge_objects WHERE id = ? LIMIT 1',
      [id]
    ) as KnowledgeObjectRow[];
    return rows[0] ? rowToObject(rows[0]) : null;
  }

  async listByType(projectId: ID, type: KnowledgeObjectType): Promise<KnowledgeObject[]> {
    const rows = await this.client.readQuery(
      'SELECT * FROM knowledge_objects WHERE project_id = ? AND type = ? ORDER BY created_at DESC',
      [projectId, type]
    ) as KnowledgeObjectRow[];
    return rows.map(rowToObject);
  }

  async listByStatus(projectId: ID, status: KnowledgeObject['status']): Promise<KnowledgeObject[]> {
    const rows = await this.client.readQuery(
      'SELECT * FROM knowledge_objects WHERE project_id = ? AND status = ? ORDER BY created_at DESC',
      [projectId, status]
    ) as KnowledgeObjectRow[];
    return rows.map(rowToObject);
  }

  async filterContextEligible(projectId: ID): Promise<KnowledgeObject[]> {
    const rows = await this.client.readQuery(
      'SELECT * FROM knowledge_objects WHERE project_id = ? AND context_eligible = 1 ORDER BY confidence DESC',
      [projectId]
    ) as KnowledgeObjectRow[];
    return rows.map(rowToObject);
  }

  async filterGraphEligible(projectId: ID): Promise<KnowledgeObject[]> {
    const rows = await this.client.readQuery(
      'SELECT * FROM knowledge_objects WHERE project_id = ? AND graph_eligible = 1 ORDER BY confidence DESC',
      [projectId]
    ) as KnowledgeObjectRow[];
    return rows.map(rowToObject);
  }

  async filterEmbeddingEligible(projectId: ID): Promise<KnowledgeObject[]> {
    const rows = await this.client.readQuery(
      'SELECT * FROM knowledge_objects WHERE project_id = ? AND embedding_eligible = 1 ORDER BY confidence DESC',
      [projectId]
    ) as KnowledgeObjectRow[];
    return rows.map(rowToObject);
  }

  /** Full-text search across title and summary fields. */
  async search(projectId: ID, query: string): Promise<KnowledgeObject[]> {
    const like = `%${query}%`;
    const rows = await this.client.readQuery(
      `SELECT * FROM knowledge_objects
       WHERE project_id = ?
         AND (title LIKE ? OR summary LIKE ? OR body LIKE ?)
       ORDER BY created_at DESC`,
      [projectId, like, like, like]
    ) as KnowledgeObjectRow[];
    return rows.map(rowToObject);
  }

  /** Upsert — insert or replace an existing row with the same id. */
  async upsert(obj: KnowledgeObject): Promise<void> {
    await this.client.writeQuery(
      `INSERT INTO knowledge_objects
         (id, project_id, type, title, summary, body, structured_data, scope, source,
          confidence, status, context_eligible, graph_eligible, embedding_eligible,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         summary = excluded.summary,
         body = excluded.body,
         structured_data = excluded.structured_data,
         scope = excluded.scope,
         source = excluded.source,
         confidence = excluded.confidence,
         status = excluded.status,
         context_eligible = excluded.context_eligible,
         graph_eligible = excluded.graph_eligible,
         embedding_eligible = excluded.embedding_eligible,
         updated_at = excluded.updated_at`,
      [
        obj.id,
        obj.projectId,
        obj.type,
        obj.title,
        obj.summary ?? null,
        obj.body ?? null,
        JSON.stringify(obj.structuredData),
        JSON.stringify(obj.scope),
        JSON.stringify(obj.source),
        obj.confidence,
        obj.status,
        obj.contextEligible ? 1 : 0,
        obj.graphEligible ? 1 : 0,
        obj.embeddingEligible ? 1 : 0,
        obj.createdAt,
        obj.updatedAt,
      ]
    );
  }
}
