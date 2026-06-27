/**
 * ForeshadowingService — PROC-03
 *
 * Tag planted setup for later payoff.
 * Sourced from WRITING_PROCESS.md: "Foreshadowing tracker: tag planted setup for later payoff"
 */

import type { MCPClient } from '../core/database.js';
import { generateId } from '../utils/ids.js';

export interface ForeshadowingNote {
  id: string;
  projectId: string;
  chapterId?: number;
  sceneId?: number;
  content: string;
  payoffChapterId?: number;
  status: 'planted' | 'paid_off' | 'forgotten';
  createdAt: string;
  updatedAt: string;
}

export class ForeshadowingService {
  constructor(private readonly client: MCPClient) {}

  /**
   * Add a new foreshadowing note to the project.
   *
   * @param projectId - Project identifier.
   * @param content   - Description of the foreshadowed element.
   * @param opts      - Optional chapter and scene references.
   */
  async add(
    projectId: string,
    content: string,
    opts?: { chapterId?: number; sceneId?: number }
  ): Promise<ForeshadowingNote> {
    const now = new Date().toISOString();
    const note: ForeshadowingNote = {
      id: generateId(),
      projectId,
      chapterId: opts?.chapterId,
      sceneId: opts?.sceneId,
      content: content.trim(),
      status: 'planted',
      createdAt: now,
      updatedAt: now,
    };

    await this.client.writeQuery(
      `INSERT INTO foreshadowing_notes
         (id, project_id, chapter_id, scene_id, content, payoff_chapter_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        note.id,
        note.projectId,
        note.chapterId ?? null,
        note.sceneId ?? null,
        note.content,
        null,
        note.status,
        note.createdAt,
        note.updatedAt,
      ]
    );

    return note;
  }

  /**
   * List foreshadowing notes for a project, optionally filtered by status.
   *
   * @param projectId - Project identifier.
   * @param status    - Optional status filter ('planted' | 'paid_off' | 'forgotten').
   */
  async list(projectId: string, status?: string): Promise<ForeshadowingNote[]> {
    let query: string;
    let params: unknown[];

    if (status !== undefined) {
      query = `
        SELECT id, project_id, chapter_id, scene_id, content,
               payoff_chapter_id, status, created_at, updated_at
        FROM foreshadowing_notes
        WHERE project_id = ? AND status = ?
        ORDER BY created_at ASC
      `;
      params = [projectId, status];
    } else {
      query = `
        SELECT id, project_id, chapter_id, scene_id, content,
               payoff_chapter_id, status, created_at, updated_at
        FROM foreshadowing_notes
        WHERE project_id = ?
        ORDER BY created_at ASC
      `;
      params = [projectId];
    }

    const rows = await this.client.readQuery(query, params);
    return rows.map(this.rowToNote);
  }

  /**
   * Mark a foreshadowing note as paid off, optionally recording which chapter
   * delivered the payoff.
   *
   * @param id              - ID of the foreshadowing note.
   * @param payoffChapterId - Optional chapter where the payoff occurs.
   */
  async markPaidOff(id: string, payoffChapterId?: number): Promise<void> {
    const now = new Date().toISOString();
    await this.client.writeQuery(
      `UPDATE foreshadowing_notes
       SET status = 'paid_off', payoff_chapter_id = ?, updated_at = ?
       WHERE id = ?`,
      [payoffChapterId ?? null, now, id]
    );
  }

  /**
   * List foreshadowing notes that are still 'planted' and therefore potentially
   * forgotten — i.e., seeds planted more than 5 chapters ago with no payoff.
   *
   * @param projectId - Project identifier.
   */
  async listForgotten(projectId: string): Promise<ForeshadowingNote[]> {
    const rows = await this.client.readQuery(
      `SELECT id, project_id, chapter_id, scene_id, content,
              payoff_chapter_id, status, created_at, updated_at
       FROM foreshadowing_notes
       WHERE project_id = ? AND status = 'planted'
       ORDER BY created_at ASC`,
      [projectId]
    );

    const planted = rows.map(this.rowToNote);

    // Determine current highest chapter number for the project
    const chapterRows = await this.client.readQuery(
      `SELECT MAX(chapter_number) as max_chapter
       FROM chapters
       WHERE project_id = ?`,
      [projectId]
    );
    const maxChapter: number = (chapterRows[0]?.max_chapter as number) ?? 0;

    // A note is "forgotten" if it was planted more than 5 chapters before the current chapter
    return planted.filter((note) => {
      if (note.chapterId === undefined || note.chapterId === null) return false;
      return maxChapter - note.chapterId > 5;
    });
  }

  /**
   * Map a raw database row to a typed ForeshadowingNote.
   */
  private rowToNote(row: Record<string, unknown>): ForeshadowingNote {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      chapterId: row.chapter_id !== null ? (row.chapter_id as number) : undefined,
      sceneId: row.scene_id !== null ? (row.scene_id as number) : undefined,
      content: row.content as string,
      payoffChapterId:
        row.payoff_chapter_id !== null
          ? (row.payoff_chapter_id as number)
          : undefined,
      status: row.status as ForeshadowingNote['status'],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
