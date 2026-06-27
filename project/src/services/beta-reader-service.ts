/**
 * BetaReaderService — SPEC-11
 *
 * Manages beta readers and their feedback for a novel project.
 * All persistence is via MCPClient SQL queries (no direct SQLite access).
 */

import type { MCPClient } from '../core/database.js';
import type {
  BetaReader,
  BetaFeedback,
  BetaFeedbackType,
  BetaReport,
} from '../types/novel.js';
import { generateId } from '../utils/ids.js';

// ── row shapes returned from the DB ──────────────────────────────────────────

interface BetaReaderRow {
  id: string;
  project_id: string;
  name: string;
  email: string | null;
  chapters: string;
  status: string;
  invited_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BetaFeedbackRow {
  id: string;
  project_id: string;
  reader_id: string;
  chapter_id: number | null;
  feedback_type: string;
  note: string;
  resolved: number;
  created_at: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function rowToReader(row: BetaReaderRow): BetaReader {
  let chapters: string[] = [];
  try {
    chapters = JSON.parse(row.chapters) as string[];
  } catch {
    chapters = [];
  }
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    email: row.email ?? undefined,
    chapters,
    status: row.status as BetaReader['status'],
    invitedAt: row.invited_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFeedback(row: BetaFeedbackRow): BetaFeedback {
  return {
    id: row.id,
    projectId: row.project_id,
    readerId: row.reader_id,
    chapterId: row.chapter_id ?? undefined,
    feedbackType: row.feedback_type as BetaFeedbackType,
    note: row.note,
    resolved: row.resolved === 1,
    createdAt: row.created_at,
  };
}

const ALL_FEEDBACK_TYPES: BetaFeedbackType[] = [
  'pacing',
  'character',
  'plot',
  'clarity',
  'emotion',
  'other',
];

// ── service ───────────────────────────────────────────────────────────────────

export class BetaReaderService {
  constructor(private readonly client: MCPClient) {}

  /**
   * Add a new beta reader to the project.
   *
   * @param projectId - The project identifier
   * @param name      - Reader's display name
   * @param opts      - Optional email and chapter assignments (e.g. ["1-10"])
   */
  async addReader(
    projectId: string,
    name: string,
    opts: { email?: string; chapters?: string[] } = {}
  ): Promise<BetaReader> {
    const now = new Date().toISOString();
    const reader: BetaReader = {
      id: generateId(),
      projectId,
      name: name.trim(),
      email: opts.email,
      chapters: opts.chapters ?? [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await this.client.writeQuery(
      `INSERT INTO beta_readers
         (id, project_id, name, email, chapters, status, invited_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reader.id,
        reader.projectId,
        reader.name,
        reader.email ?? null,
        JSON.stringify(reader.chapters),
        reader.status,
        null,
        reader.createdAt,
        reader.updatedAt,
      ]
    );

    return reader;
  }

  /**
   * List all beta readers for a project.
   */
  async listReaders(projectId: string): Promise<BetaReader[]> {
    const rows = await this.client.readQuery(
      `SELECT * FROM beta_readers WHERE project_id = ? ORDER BY created_at ASC`,
      [projectId]
    ) as BetaReaderRow[];
    return rows.map(rowToReader);
  }

  /**
   * Retrieve a single beta reader by id.
   */
  async getReader(id: string): Promise<BetaReader | null> {
    const rows = await this.client.readQuery(
      `SELECT * FROM beta_readers WHERE id = ? LIMIT 1`,
      [id]
    ) as BetaReaderRow[];
    return rows.length > 0 ? rowToReader(rows[0]) : null;
  }

  /**
   * Update mutable fields on an existing beta reader.
   *
   * @param id     - Reader id
   * @param fields - Fields to update (status and/or chapters)
   */
  async updateReader(
    id: string,
    fields: Partial<Pick<BetaReader, 'status' | 'chapters'>>
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (fields.status !== undefined) {
      sets.push('status = ?');
      params.push(fields.status);
    }
    if (fields.chapters !== undefined) {
      sets.push('chapters = ?');
      params.push(JSON.stringify(fields.chapters));
    }

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await this.client.writeQuery(
      `UPDATE beta_readers SET ${sets.join(', ')} WHERE id = ?`,
      params
    );
  }

  /**
   * Add a feedback entry for a beta reader, looked up by name within the project.
   *
   * @throws Error if the reader name is not found in the project
   */
  async addFeedback(
    projectId: string,
    readerName: string,
    chapterId: number | undefined,
    feedbackType: BetaFeedbackType,
    note: string
  ): Promise<BetaFeedback> {
    // Look up reader by name
    const readerRows = await this.client.readQuery(
      `SELECT id FROM beta_readers WHERE project_id = ? AND name = ? LIMIT 1`,
      [projectId, readerName]
    ) as Array<{ id: string }>;

    if (readerRows.length === 0) {
      throw new Error(`Beta reader not found: "${readerName}"`);
    }

    const readerId = readerRows[0].id;
    const now = new Date().toISOString();
    const feedback: BetaFeedback = {
      id: generateId(),
      projectId,
      readerId,
      chapterId,
      feedbackType,
      note: note.trim(),
      resolved: false,
      createdAt: now,
    };

    await this.client.writeQuery(
      `INSERT INTO beta_feedback
         (id, project_id, reader_id, chapter_id, feedback_type, note, resolved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        feedback.id,
        feedback.projectId,
        feedback.readerId,
        feedback.chapterId ?? null,
        feedback.feedbackType,
        feedback.note,
        0,
        feedback.createdAt,
      ]
    );

    return feedback;
  }

  /**
   * List feedback for a project, with optional filters by reader, chapter, or type.
   */
  async listFeedback(
    projectId: string,
    filter?: {
      readerId?: string;
      chapterId?: number;
      type?: BetaFeedbackType;
    }
  ): Promise<BetaFeedback[]> {
    const conditions: string[] = ['project_id = ?'];
    const params: unknown[] = [projectId];

    if (filter?.readerId !== undefined) {
      conditions.push('reader_id = ?');
      params.push(filter.readerId);
    }
    if (filter?.chapterId !== undefined) {
      conditions.push('chapter_id = ?');
      params.push(filter.chapterId);
    }
    if (filter?.type !== undefined) {
      conditions.push('feedback_type = ?');
      params.push(filter.type);
    }

    const sql = `SELECT * FROM beta_feedback WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`;
    const rows = await this.client.readQuery(sql, params) as BetaFeedbackRow[];
    return rows.map(rowToFeedback);
  }

  /**
   * Mark a feedback entry as resolved.
   */
  async resolveFeedback(id: string): Promise<void> {
    await this.client.writeQuery(
      `UPDATE beta_feedback SET resolved = 1 WHERE id = ?`,
      [id]
    );
  }

  /**
   * Generate an aggregated report for all beta feedback in the project.
   *
   * Aggregates total readers, total feedback, breakdown by chapter,
   * breakdown by feedback type, and unresolved count.
   */
  async generateReport(projectId: string): Promise<BetaReport> {
    const [readers, feedback] = await Promise.all([
      this.listReaders(projectId),
      this.listFeedback(projectId),
    ]);

    // Initialise byType with zero counts for all types
    const byType = Object.fromEntries(
      ALL_FEEDBACK_TYPES.map((t) => [t, 0])
    ) as Record<BetaFeedbackType, number>;

    const byChapter: Record<number, { count: number; types: Record<string, number> }> = {};
    let unresolved = 0;

    for (const fb of feedback) {
      // Count by type
      byType[fb.feedbackType] = (byType[fb.feedbackType] ?? 0) + 1;

      // Count by chapter
      if (fb.chapterId !== undefined) {
        if (!byChapter[fb.chapterId]) {
          byChapter[fb.chapterId] = { count: 0, types: {} };
        }
        byChapter[fb.chapterId].count += 1;
        byChapter[fb.chapterId].types[fb.feedbackType] =
          (byChapter[fb.chapterId].types[fb.feedbackType] ?? 0) + 1;
      }

      // Count unresolved
      if (!fb.resolved) {
        unresolved += 1;
      }
    }

    return {
      totalReaders: readers.length,
      totalFeedback: feedback.length,
      byChapter,
      byType,
      unresolved,
    };
  }
}
