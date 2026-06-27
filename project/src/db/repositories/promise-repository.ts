import type { MCPClient } from '../../core/database.js';
import type { NarrativePromise, PromisePayoff } from '../../types/promise.js';
import type { ID } from '../../types/common.js';

interface PromiseRow {
  id: string;
  project_id: string;
  type: string;
  status: string;
  title: string;
  description: string;
  introduced_at: string;
  expected_payoff_window: string | null;
  importance: number;
  reader_visibility: number;
  related_characters: string;
  related_plot_threads: string;
  related_themes: string;
  source: string;
  created_at: string;
  updated_at: string;
}

interface PayoffRow {
  id: string;
  promise_id: string;
  payoff_at: string;
  description: string;
  payoff_strength: number;
  resolves_promise: number;
  notes: string | null;
  created_at: string;
}

function rowToPromise(row: PromiseRow): NarrativePromise {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as NarrativePromise['type'],
    status: row.status as NarrativePromise['status'],
    title: row.title,
    description: row.description,
    introducedAt: JSON.parse(row.introduced_at),
    expectedPayoffWindow: row.expected_payoff_window ? JSON.parse(row.expected_payoff_window) : undefined,
    importance: row.importance,
    readerVisibility: row.reader_visibility,
    relatedCharacters: JSON.parse(row.related_characters),
    relatedPlotThreads: JSON.parse(row.related_plot_threads),
    relatedThemes: JSON.parse(row.related_themes),
    source: JSON.parse(row.source),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPayoff(row: PayoffRow): PromisePayoff {
  return {
    id: row.id,
    promiseId: row.promise_id,
    payoffAt: JSON.parse(row.payoff_at),
    description: row.description,
    payoffStrength: row.payoff_strength,
    resolvesPromise: row.resolves_promise === 1,
    notes: row.notes ?? undefined,
  };
}

export class PromiseRepository {
  constructor(private readonly client: MCPClient) {}

  async insert(promise: NarrativePromise): Promise<void> {
    await this.client.writeQuery(
      `INSERT INTO narrative_promises
         (id, project_id, type, status, title, description, introduced_at,
          expected_payoff_window, importance, reader_visibility,
          related_characters, related_plot_threads, related_themes, source,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        promise.id,
        promise.projectId,
        promise.type,
        promise.status,
        promise.title,
        promise.description,
        JSON.stringify(promise.introducedAt),
        promise.expectedPayoffWindow ? JSON.stringify(promise.expectedPayoffWindow) : null,
        promise.importance,
        promise.readerVisibility,
        JSON.stringify(promise.relatedCharacters),
        JSON.stringify(promise.relatedPlotThreads),
        JSON.stringify(promise.relatedThemes),
        JSON.stringify(promise.source),
        promise.createdAt,
        promise.updatedAt,
      ]
    );
  }

  async update(id: ID, fields: Partial<NarrativePromise>): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const now = new Date().toISOString();

    if (fields.status !== undefined) { sets.push('status = ?'); params.push(fields.status); }
    if (fields.title !== undefined) { sets.push('title = ?'); params.push(fields.title); }
    if (fields.description !== undefined) { sets.push('description = ?'); params.push(fields.description); }
    if (fields.importance !== undefined) { sets.push('importance = ?'); params.push(fields.importance); }
    if (fields.readerVisibility !== undefined) { sets.push('reader_visibility = ?'); params.push(fields.readerVisibility); }
    if (fields.expectedPayoffWindow !== undefined) { sets.push('expected_payoff_window = ?'); params.push(JSON.stringify(fields.expectedPayoffWindow)); }
    if (fields.relatedCharacters !== undefined) { sets.push('related_characters = ?'); params.push(JSON.stringify(fields.relatedCharacters)); }
    if (fields.relatedPlotThreads !== undefined) { sets.push('related_plot_threads = ?'); params.push(JSON.stringify(fields.relatedPlotThreads)); }
    if (fields.relatedThemes !== undefined) { sets.push('related_themes = ?'); params.push(JSON.stringify(fields.relatedThemes)); }

    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    params.push(now);
    params.push(id);

    await this.client.writeQuery(
      `UPDATE narrative_promises SET ${sets.join(', ')} WHERE id = ?`,
      params as string[]
    );
  }

  async getById(id: ID): Promise<NarrativePromise | null> {
    const rows = await this.client.readQuery(
      'SELECT * FROM narrative_promises WHERE id = ? LIMIT 1',
      [id]
    ) as PromiseRow[];
    return rows[0] ? rowToPromise(rows[0]) : null;
  }

  async listOpen(projectId: ID): Promise<NarrativePromise[]> {
    const rows = await this.client.readQuery(
      `SELECT * FROM narrative_promises WHERE project_id = ? AND status IN ('open', 'developing') ORDER BY importance DESC`,
      [projectId]
    ) as PromiseRow[];
    return rows.map(rowToPromise);
  }

  async listByProject(projectId: ID): Promise<NarrativePromise[]> {
    const rows = await this.client.readQuery(
      'SELECT * FROM narrative_promises WHERE project_id = ? ORDER BY created_at DESC',
      [projectId]
    ) as PromiseRow[];
    return rows.map(rowToPromise);
  }

  async insertPayoff(payoff: PromisePayoff): Promise<void> {
    await this.client.writeQuery(
      `INSERT INTO promise_payoffs
         (id, promise_id, payoff_at, description, payoff_strength, resolves_promise, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payoff.id,
        payoff.promiseId,
        JSON.stringify(payoff.payoffAt),
        payoff.description,
        payoff.payoffStrength,
        payoff.resolvesPromise ? 1 : 0,
        payoff.notes ?? null,
        new Date().toISOString(),
      ]
    );
  }

  async listPayoffs(promiseId: ID): Promise<PromisePayoff[]> {
    const rows = await this.client.readQuery(
      'SELECT * FROM promise_payoffs WHERE promise_id = ? ORDER BY created_at DESC',
      [promiseId]
    ) as PayoffRow[];
    return rows.map(rowToPayoff);
  }
}
