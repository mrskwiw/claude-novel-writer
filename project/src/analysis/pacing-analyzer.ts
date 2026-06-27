/**
 * Pacing & Structure Analyzer (GAP-11 / SPEC-08)
 *
 * Queries the MCP SQLite database to compute tension-arc, POV balance,
 * chapter-length distribution, and derived pacing flags.
 */

import type { MCPClient } from '../core/database.js';
import type {
  ChapterTensionData,
  POVBalance,
  ChapterLengthData,
  PacingFlag,
  PacingReport,
} from '../types/novel.js';

export class PacingAnalyzer {
  constructor(
    private readonly client: MCPClient,
    private readonly projectId: number
  ) {}

  /**
   * Compute average tension per chapter using scenes.tension_level.
   *
   * SQL shape: { chapter_number, title, avg_tension, scene_count }
   */
  async analyzeTensionArc(): Promise<ChapterTensionData[]> {
    const sql = `
      SELECT
        c.chapter_number,
        COALESCE(c.title, '') AS title,
        COALESCE(AVG(s.tension_level), 0) AS avg_tension,
        COUNT(s.id) AS scene_count
      FROM chapters c
      LEFT JOIN scenes s ON s.chapter_id = c.id
      WHERE c.project_id = ?
      GROUP BY c.id
      ORDER BY c.chapter_number
    `;
    const rows = await this.client.readQuery(sql, [this.projectId]);

    return rows.map((r) => ({
      chapterNumber: Number(r.chapter_number),
      chapterTitle: String(r.title ?? ''),
      avgTension: Number(r.avg_tension ?? 0),
      sceneCount: Number(r.scene_count ?? 0),
    }));
  }

  /**
   * Compute POV character distribution across all scenes.
   *
   * SQL shape: { character_name, scene_count }
   */
  async analyzePOVBalance(): Promise<POVBalance[]> {
    const sql = `
      SELECT
        ch.name AS character_name,
        COUNT(s.id) AS scene_count
      FROM scenes s
      JOIN characters ch ON ch.id = s.pov_character_id
      JOIN chapters cap ON cap.id = s.chapter_id
      WHERE cap.project_id = ?
      GROUP BY s.pov_character_id
      ORDER BY scene_count DESC
    `;
    const rows = await this.client.readQuery(sql, [this.projectId]);

    const total = rows.reduce(
      (sum: number, r) => sum + Number(r.scene_count ?? 0),
      0
    );

    return rows.map((r) => {
      const count = Number(r.scene_count ?? 0);
      return {
        characterName: String(r.character_name ?? ''),
        sceneCount: count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      };
    });
  }

  /**
   * Compute word-count distribution per chapter and flag outliers.
   *
   * SQL shape: { chapter_number, title, word_count }
   * Flags: word_count > 2 * avg → 'long', < 0.5 * avg → 'short'
   */
  async analyzeChapterLengths(): Promise<ChapterLengthData[]> {
    const sql = `
      SELECT
        chapter_number,
        COALESCE(title, '') AS title,
        COALESCE(word_count, 0) AS word_count
      FROM chapters
      WHERE project_id = ?
      ORDER BY chapter_number
    `;
    const rows = await this.client.readQuery(sql, [this.projectId]);

    if (rows.length === 0) return [];

    const counts = rows.map((r) => Number(r.word_count ?? 0));
    const avg = counts.reduce((a: number, b: number) => a + b, 0) / counts.length;

    return rows.map((r, i) => {
      const wc = counts[i];
      let deviation: 'normal' | 'long' | 'short' = 'normal';
      if (avg > 0) {
        if (wc > avg * 2) deviation = 'long';
        else if (wc < avg * 0.5) deviation = 'short';
      }
      return {
        chapterNumber: Number(r.chapter_number),
        chapterTitle: String(r.title ?? ''),
        wordCount: wc,
        deviation,
      };
    });
  }

  /**
   * Generate a full pacing report combining all three analyses and derived flags.
   */
  async generateReport(): Promise<PacingReport> {
    const [tensionArc, povBalance, chapterLengths] = await Promise.all([
      this.analyzeTensionArc(),
      this.analyzePOVBalance(),
      this.analyzeChapterLengths(),
    ]);

    const flags = this.deriveFlags(tensionArc, povBalance, chapterLengths);
    const asciiTensionChart = this.buildAsciiChart(tensionArc);

    return { tensionArc, povBalance, chapterLengths, flags, asciiTensionChart };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Derive PacingFlag[] from the three data arrays.
   *
   * Rules:
   *  - tension_dip   : 3+ consecutive chapters with avg_tension < 4,
   *                    appearing after a chapter with avg_tension > 5
   *  - conflict_gap  : 3+ consecutive chapters with avg_tension <= 3
   *  - pov_imbalance : any single character holds > 70% of scenes
   *  - length_outlier: any chapter flagged 'long' or 'short'
   */
  private deriveFlags(
    tension: ChapterTensionData[],
    pov: POVBalance[],
    lengths: ChapterLengthData[]
  ): PacingFlag[] {
    const flags: PacingFlag[] = [];

    // ── tension_dip ──────────────────────────────────────────────────────────
    let hadHighTension = false;
    let dipRun: number[] = [];

    for (const ch of tension) {
      if (ch.avgTension > 5) {
        // Flush any in-progress dip run before noting high tension
        if (hadHighTension && dipRun.length >= 3) {
          flags.push({
            type: 'tension_dip',
            description: `Chapters ${dipRun.join(', ')} have avg tension < 4 following a high-tension chapter.`,
            affectedChapters: [...dipRun],
          });
        }
        dipRun = [];
        hadHighTension = true;
      } else if (ch.avgTension < 4 && hadHighTension) {
        dipRun.push(ch.chapterNumber);
      } else {
        // Tension is between 4 and 5 inclusive — flush run without flagging
        if (hadHighTension && dipRun.length >= 3) {
          flags.push({
            type: 'tension_dip',
            description: `Chapters ${dipRun.join(', ')} have avg tension < 4 following a high-tension chapter.`,
            affectedChapters: [...dipRun],
          });
        }
        dipRun = [];
      }
    }
    // Flush at end of arc
    if (hadHighTension && dipRun.length >= 3) {
      flags.push({
        type: 'tension_dip',
        description: `Chapters ${dipRun.join(', ')} have avg tension < 4 following a high-tension chapter.`,
        affectedChapters: [...dipRun],
      });
    }

    // ── conflict_gap ─────────────────────────────────────────────────────────
    let gapRun: number[] = [];
    for (const ch of tension) {
      if (ch.avgTension <= 3) {
        gapRun.push(ch.chapterNumber);
      } else {
        if (gapRun.length >= 3) {
          flags.push({
            type: 'conflict_gap',
            description: `Chapters ${gapRun.join(', ')} have avg tension ≤ 3 (conflict gap).`,
            affectedChapters: [...gapRun],
          });
        }
        gapRun = [];
      }
    }
    if (gapRun.length >= 3) {
      flags.push({
        type: 'conflict_gap',
        description: `Chapters ${gapRun.join(', ')} have avg tension ≤ 3 (conflict gap).`,
        affectedChapters: [...gapRun],
      });
    }

    // ── pov_imbalance ─────────────────────────────────────────────────────────
    for (const p of pov) {
      if (p.percentage > 70) {
        flags.push({
          type: 'pov_imbalance',
          description: `"${p.characterName}" has ${p.percentage.toFixed(1)}% of POV scenes (> 70%).`,
        });
      }
    }

    // ── length_outlier ────────────────────────────────────────────────────────
    for (const l of lengths) {
      if (l.deviation !== 'normal') {
        flags.push({
          type: 'length_outlier',
          description: `Chapter ${l.chapterNumber} ("${l.chapterTitle}") word count ${l.wordCount} is flagged as '${l.deviation}'.`,
          affectedChapters: [l.chapterNumber],
        });
      }
    }

    return flags;
  }

  /**
   * Build an ASCII tension chart.
   *
   * Format per line:  "Ch<N> <filled>█<empty>░ <value>"
   * Scale: 10 blocks total; each █ = 1 tension point (clamped to [0, 10]).
   */
  private buildAsciiChart(tensionData: ChapterTensionData[]): string {
    if (tensionData.length === 0) return '(no chapters)';

    const MAX_BLOCKS = 10;

    const lines = tensionData.map((ch) => {
      const clamped = Math.min(MAX_BLOCKS, Math.max(0, ch.avgTension));
      const filled = Math.round(clamped);
      const empty = MAX_BLOCKS - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      const label = `Ch${ch.chapterNumber}`.padEnd(5);
      return `${label} ${bar} ${ch.avgTension.toFixed(1)}`;
    });

    return lines.join('\n');
  }
}
