/**
 * DevelopmentalAnalyzer — PROC-04 Developmental Revision Tools
 *
 * Provides scene purpose audits, subplot balance checks, and plot-hole
 * detection by querying the MCP SQLite database.
 */

import type { MCPClient } from '../core/database.js';

// ─── Public interfaces ────────────────────────────────────────────────────────

/**
 * Result item for a single scene in a scene-purpose audit.
 * `hasPurpose` is true when the scene's `purpose` field is non-null and
 * non-empty; false otherwise.
 */
export interface ScenePurposeAudit {
  chapterId: number;
  chapterTitle: string;
  sceneId: number;
  sceneTitle: string;
  purpose?: string;
  hasPurpose: boolean;
}

/**
 * Result item for a single plot thread in a subplot balance check.
 * `flag` is true when the thread has fewer than 3 beats, indicating it may be
 * underdeveloped.
 */
export interface SubplotBalance {
  plotThreadId: string;
  title: string;
  sceneCount: number;
  flag: boolean;
}

/**
 * Result item for a plot-hole detection scan.
 * Threads that are still open but have had no new beats in the last 3 chapters
 * (relative to the maximum chapter number in the project) are returned.
 */
export interface PlotHole {
  threadId: string;
  title: string;
  /** Chapter number of the most recent beat, if any. */
  lastChapter?: number;
  /** ISO timestamp of when the thread was opened / created. */
  openSince?: string;
}

// ─── DevelopmentalAnalyzer ────────────────────────────────────────────────────

/**
 * Runs developmental-revision queries against the project database.
 *
 * All methods accept `projectId` as a string because the MCP layer stores
 * project IDs as either integer or string depending on the query context —
 * we coerce to the correct type in each query binding.
 */
export class DevelopmentalAnalyzer {
  constructor(private readonly client: MCPClient) {}

  // ─── Scene purpose audit ──────────────────────────────────────────────────

  /**
   * Return every scene in the project together with its `purpose` field.
   * Scenes that have a null or empty-string purpose are flagged with
   * `hasPurpose: false`.
   *
   * @param projectId - The numeric project ID (as string or number).
   */
  async auditScenePurposes(projectId: string): Promise<ScenePurposeAudit[]> {
    const sql = `
      SELECT
        s.id            AS scene_id,
        COALESCE(s.title, '') AS scene_title,
        s.purpose,
        c.id            AS chapter_id,
        COALESCE(c.title, '') AS chapter_title
      FROM scenes s
      JOIN chapters c ON c.id = s.chapter_id
      WHERE c.project_id = ?
      ORDER BY c.chapter_number, s.scene_number
    `;

    const rows = await this.client.readQuery(sql, [projectId]);

    return rows.map((r) => {
      const purpose: string | undefined =
        r.purpose != null && String(r.purpose).trim() !== ''
          ? String(r.purpose)
          : undefined;

      return {
        chapterId: Number(r.chapter_id),
        chapterTitle: String(r.chapter_title ?? ''),
        sceneId: Number(r.scene_id),
        sceneTitle: String(r.scene_title ?? ''),
        purpose,
        hasPurpose: purpose !== undefined,
      } satisfies ScenePurposeAudit;
    });
  }

  // ─── Subplot balance ──────────────────────────────────────────────────────

  /**
   * Count the number of plot beats per plot thread and flag threads with fewer
   * than 3 beats as potentially underdeveloped.
   *
   * @param projectId - The numeric project ID (as string or number).
   */
  async analyzeSubplotBalance(projectId: string): Promise<SubplotBalance[]> {
    const sql = `
      SELECT
        pt.id    AS thread_id,
        COALESCE(pt.thread_name, '') AS title,
        COUNT(pb.id) AS beat_count
      FROM plot_threads pt
      LEFT JOIN plot_beats pb ON pb.plot_thread_id = pt.id
      WHERE pt.project_id = ?
      GROUP BY pt.id
      ORDER BY beat_count
    `;

    const rows = await this.client.readQuery(sql, [projectId]);

    return rows.map((r) => {
      const sceneCount = Number(r.beat_count ?? 0);
      return {
        plotThreadId: String(r.thread_id),
        title: String(r.title ?? ''),
        sceneCount,
        flag: sceneCount < 3,
      } satisfies SubplotBalance;
    });
  }

  // ─── Plot holes ────────────────────────────────────────────────────────────

  /**
   * Find open plot threads that have had no new beats in the last 3 chapters.
   *
   * A thread qualifies as a potential plot hole when:
   *   - Its `status` is still open (not 'resolved' / 'closed').
   *   - Its most recent beat belongs to a chapter whose `chapter_number` is at
   *     least 3 less than the maximum chapter number in the project, OR it has
   *     no beats at all.
   *
   * @param projectId - The numeric project ID (as string or number).
   */
  async findPlotHoles(projectId: string): Promise<PlotHole[]> {
    // Step 1: get the maximum chapter number for this project.
    const maxChapterSql = `
      SELECT COALESCE(MAX(chapter_number), 0) AS max_chapter
      FROM chapters
      WHERE project_id = ?
    `;
    const maxRows = await this.client.readQuery(maxChapterSql, [projectId]);
    const maxChapter = Number(maxRows[0]?.max_chapter ?? 0);

    // Step 2: for each open thread, find the chapter number of its most recent beat.
    const threadsSql = `
      SELECT
        pt.id          AS thread_id,
        COALESCE(pt.thread_name, '') AS title,
        pt.created_at  AS open_since,
        MAX(c.chapter_number) AS last_chapter
      FROM plot_threads pt
      LEFT JOIN plot_beats pb ON pb.plot_thread_id = pt.id
      LEFT JOIN scenes sc ON sc.id = pb.scene_id
      LEFT JOIN chapters c ON c.id = sc.chapter_id
      WHERE pt.project_id = ?
        AND (pt.status IS NULL OR (pt.status != 'resolved' AND pt.status != 'closed'))
      GROUP BY pt.id
      ORDER BY last_chapter
    `;

    const rows = await this.client.readQuery(threadsSql, [projectId]);

    // Step 3: filter threads whose last beat was more than 3 chapters ago (or never).
    return rows
      .filter((r) => {
        const lastChapter = r.last_chapter != null ? Number(r.last_chapter) : null;
        if (lastChapter === null) return true; // no beats at all
        return maxChapter - lastChapter >= 3;
      })
      .map((r) => {
        const lastChapter = r.last_chapter != null ? Number(r.last_chapter) : undefined;
        const openSince = r.open_since != null ? String(r.open_since) : undefined;
        return {
          threadId: String(r.thread_id),
          title: String(r.title ?? ''),
          lastChapter,
          openSince,
        } satisfies PlotHole;
      });
  }
}
