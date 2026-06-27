/**
 * ResearchRepository — CRUD for research_notes and research_usage tables.
 * Tags are stored as a JSON string and parsed on read.
 */

import type { MCPClient } from '../../core/database.js';
import type { ResearchNote, ResearchUsage } from '../../types/novel.js';

interface ResearchNoteRow {
  id: string;
  project_id: string;
  title: string;
  url: string | null;
  notes: string | null;
  tags: string;
  verified: number;
  created_at: string;
  updated_at: string;
}

interface ResearchUsageRow {
  id: string;
  research_id: string;
  chapter_id: number | null;
  scene_id: number | null;
  note: string | null;
  linked_at: string;
}

function rowToNote(row: ResearchNoteRow): ResearchNote {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    url: row.url ?? undefined,
    notes: row.notes ?? undefined,
    tags: JSON.parse(row.tags) as string[],
    verified: row.verified === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToUsage(row: ResearchUsageRow): ResearchUsage {
  return {
    id: row.id,
    researchId: row.research_id,
    chapterId: row.chapter_id ?? undefined,
    sceneId: row.scene_id ?? undefined,
    note: row.note ?? undefined,
    linkedAt: row.linked_at,
  };
}

export class ResearchRepository {
  constructor(private readonly client: MCPClient) {}

  /**
   * Insert a new research note.
   */
  async insert(note: ResearchNote): Promise<void> {
    await this.client.writeQuery(
      `INSERT INTO research_notes
         (id, project_id, title, url, notes, tags, verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        note.id,
        note.projectId,
        note.title,
        note.url ?? null,
        note.notes ?? null,
        JSON.stringify(note.tags),
        note.verified ? 1 : 0,
        note.createdAt,
        note.updatedAt,
      ]
    );
  }

  /**
   * Fetch a research note by its primary key.
   */
  async getById(id: string): Promise<ResearchNote | null> {
    const rows = await this.client.readQuery(
      'SELECT * FROM research_notes WHERE id = ? LIMIT 1',
      [id]
    ) as ResearchNoteRow[];
    return rows[0] ? rowToNote(rows[0]) : null;
  }

  /**
   * List all research notes for a project, optionally filtered by tag.
   */
  async list(projectId: string, tag?: string): Promise<ResearchNote[]> {
    const rows = await this.client.readQuery(
      'SELECT * FROM research_notes WHERE project_id = ? ORDER BY created_at DESC',
      [projectId]
    ) as ResearchNoteRow[];

    const notes = rows.map(rowToNote);
    if (!tag) return notes;
    return notes.filter((n) => n.tags.includes(tag));
  }

  /**
   * Update a subset of fields on an existing note.
   * Always refreshes updated_at.
   */
  async update(
    id: string,
    fields: Partial<Pick<ResearchNote, 'title' | 'url' | 'notes' | 'tags' | 'verified'>>
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const now = new Date().toISOString();

    if (fields.title !== undefined) { sets.push('title = ?'); params.push(fields.title); }
    if (fields.url !== undefined)   { sets.push('url = ?');   params.push(fields.url ?? null); }
    if (fields.notes !== undefined) { sets.push('notes = ?'); params.push(fields.notes ?? null); }
    if (fields.tags !== undefined)  { sets.push('tags = ?');  params.push(JSON.stringify(fields.tags)); }
    if (fields.verified !== undefined) {
      sets.push('verified = ?');
      params.push(fields.verified ? 1 : 0);
    }

    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    params.push(now);
    params.push(id);

    await this.client.writeQuery(
      `UPDATE research_notes SET ${sets.join(', ')} WHERE id = ?`,
      params as string[]
    );
  }

  /**
   * Insert a research_usage record linking a note to a chapter or scene.
   */
  async addUsage(usage: ResearchUsage): Promise<void> {
    await this.client.writeQuery(
      `INSERT INTO research_usage
         (id, research_id, chapter_id, scene_id, note, linked_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        usage.id,
        usage.researchId,
        usage.chapterId ?? null,
        usage.sceneId ?? null,
        usage.note ?? null,
        usage.linkedAt,
      ]
    );
  }

  /**
   * List all usage records for a given research note.
   */
  async listUsage(researchId: string): Promise<ResearchUsage[]> {
    const rows = await this.client.readQuery(
      'SELECT * FROM research_usage WHERE research_id = ? ORDER BY linked_at DESC',
      [researchId]
    ) as ResearchUsageRow[];
    return rows.map(rowToUsage);
  }

  /**
   * Delete a research note (and its usage records via the reference constraint).
   */
  async delete(id: string): Promise<void> {
    await this.client.writeQuery(
      'DELETE FROM research_notes WHERE id = ?',
      [id]
    );
  }
}
