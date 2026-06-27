/**
 * Chapter file to database synchronization
 * Handles Markdown chapter files → database, and DB → Markdown reverse sync.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { basename, join, dirname } from 'path';
import type { MCPClient } from '../core/database.js';
import { SyncConflictError } from '../types/novel.js';
import { SyncStateRepository } from '../db/repositories/sync-state-repository.js';

export interface ChapterSyncOptions {
  /** When true, overwrite DB data from file even if a conflict is detected. */
  forceFile?: boolean;
}

export class ChapterSync {
  private readonly syncStateRepo: SyncStateRepository;

  constructor(
    private mcpClient: MCPClient,
    private projectId: number,
    private projectPath?: string
  ) {
    this.syncStateRepo = new SyncStateRepository(mcpClient);
  }

  /**
   * Sync a chapter markdown file to the database.
   *
   * @param filePath - absolute path to the Markdown chapter file
   * @param options  - optional flags; set `forceFile: true` to suppress conflict errors
   */
  async syncChapterFile(
    filePath: string,
    options?: ChapterSyncOptions
  ): Promise<void> {
    console.log(`Syncing chapter from ${filePath}...`);

    // Read chapter content
    const content = await readFile(filePath, 'utf-8');

    // Parse chapter metadata and content
    const metadata = this.parseChapterMetadata(content);
    const wordCount = this.countWords(content);

    // Extract chapter number from filename (e.g., "01-opening.md" -> 1)
    const chapterNumber = this.extractChapterNumber(filePath);

    // Conflict detection
    if (!options?.forceFile) {
      const existingRow = await this.mcpClient.readQuery(
        'SELECT id, updated_at FROM chapters WHERE project_id = ? AND chapter_number = ?',
        [this.projectId, chapterNumber]
      );
      if (existingRow.length > 0 && existingRow[0].updated_at) {
        const hasConflict = await this.syncStateRepo.detectConflict(
          'chapter',
          String(chapterNumber),
          existingRow[0].updated_at as string
        );
        if (hasConflict) {
          throw new SyncConflictError(
            'chapter',
            String(chapterNumber),
            `DB record updated at ${existingRow[0].updated_at as string} is newer than last file sync. Use forceFile option to override.`
          );
        }
      }
    }

    // Resolve POV character ID from name if provided
    let povCharacterId: number | undefined;
    if (metadata.pov) {
      const povRows = await this.mcpClient.readQuery<{ id: number }>(
        'SELECT id FROM characters WHERE project_id = ? AND name = ? LIMIT 1',
        [this.projectId, metadata.pov]
      );
      if (povRows.length > 0) povCharacterId = povRows[0].id;
    }

    // Upsert chapter
    await this.upsertChapter({
      chapterNumber,
      title: metadata.title,
      filePath,
      wordCount,
      status: metadata.status || 'drafted',
      summary: metadata.summary,
      notes: metadata.notes,
      povCharacterId,
    });

    // Record successful sync
    await this.syncStateRepo.record(
      'chapter',
      String(chapterNumber),
      String(this.projectId),
      filePath
    );

    console.log(`Chapter ${chapterNumber} synced successfully`);
  }

  /**
   * Export a chapter from the database back to a Markdown file (reverse sync).
   * Reconstructs YAML frontmatter from DB data and writes to `<projectPath>/chapters/`.
   * Does not overwrite existing chapter body content — body defaults to empty if no
   * file_path is recorded.
   *
   * @param chapterId - numeric DB id of the chapter row
   * @returns absolute path to the written file
   */
  async exportToFile(chapterId: number): Promise<string> {
    const rows = await this.mcpClient.readQuery(
      `SELECT id, chapter_number, title, status, summary, notes, file_path, word_count
       FROM chapters WHERE id = ? AND project_id = ?`,
      [chapterId, this.projectId]
    );
    if (rows.length === 0) {
      throw new Error(`Chapter ${chapterId} not found in project ${this.projectId}`);
    }
    const row = rows[0];

    // Build frontmatter lines
    const frontmatterLines: string[] = ['---'];
    if (row.title) frontmatterLines.push(`title: ${row.title as string}`);
    frontmatterLines.push(`number: ${row.chapter_number as number}`);
    if (row.status) frontmatterLines.push(`status: ${row.status as string}`);
    if (row.summary) frontmatterLines.push(`summary: ${row.summary as string}`);
    if (row.notes) frontmatterLines.push(`notes: ${row.notes as string}`);
    frontmatterLines.push('---');
    frontmatterLines.push('');

    const markdownContent = frontmatterLines.join('\n');

    // Determine output path
    const chapterNum = row.chapter_number as number;
    const slug = row.title
      ? (row.title as string).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      : '';
    const filename = slug ? `${String(chapterNum).padStart(2, '0')}-${slug}.md` : `${String(chapterNum).padStart(2, '0')}.md`;
    const basePath = this.projectPath ?? '.';
    const outputPath = (row.file_path as string | null) ?? join(basePath, 'chapters', filename);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, markdownContent, 'utf-8');

    console.log(`Chapter exported to ${outputPath}`);
    return outputPath;
  }

  /**
   * Extract chapter number from filename
   * Supports formats: 01.md, 01-title.md, chapter-01.md, etc.
   */
  private extractChapterNumber(filePath: string): number {
    const filename = basename(filePath);
    const match = filename.match(/(\d+)/);

    if (!match) {
      throw new Error(
        `Could not extract chapter number from filename: ${filename}`
      );
    }

    return parseInt(match[1], 10);
  }

  /**
   * Parse YAML frontmatter from markdown
   */
  private parseChapterMetadata(content: string): {
    title?: string;
    status?: string;
    summary?: string;
    notes?: string;
    pov?: string;
  } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) {
      // No frontmatter, try to extract title from first heading
      const titleMatch = content.match(/^#\s+(.+)$/m);
      return {
        title: titleMatch ? titleMatch[1] : undefined,
      };
    }

    const frontmatter = frontmatterMatch[1];
    const metadata: Record<string, string> = {};

    // Simple YAML parsing (handles basic key: value pairs)
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      if (value) {
        metadata[key] = value;
      }
    }

    return {
      title: metadata['title'],
      status: metadata['status'],
      summary: metadata['summary'],
      notes: metadata['notes'],
      pov: metadata['pov'],
    };
  }

  /**
   * Count words in text (excluding frontmatter)
   */
  private countWords(content: string): number {
    // Remove frontmatter
    let text = content.replace(/^---\n[\s\S]*?\n---\n/, '');

    // Remove markdown syntax
    text = text
      .replace(/^#{1,6}\s+/gm, '') // Headers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
      .replace(/\*([^*]+)\*/g, '$1') // Italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      .replace(/`([^`]+)`/g, '$1'); // Code

    // Count words
    const words = text.trim().split(/\s+/);
    return words.filter((w) => w.length > 0).length;
  }

  /**
   * Insert or update chapter record
   */
  private async upsertChapter(data: {
    chapterNumber: number;
    title?: string;
    filePath: string;
    wordCount: number;
    status: string;
    summary?: string;
    notes?: string;
    povCharacterId?: number;
  }): Promise<number> {
    // Check if chapter exists
    const existingQuery = `
      SELECT id FROM chapters
      WHERE project_id = ? AND chapter_number = ?
    `;
    const existing = await this.mcpClient.readQuery<{ id: number }>(existingQuery, [
      this.projectId,
      data.chapterNumber,
    ]);

    if (existing.length > 0) {
      // Update existing
      const updateQuery = `
        UPDATE chapters
        SET title = ?,
            file_path = ?,
            word_count = ?,
            status = ?,
            summary = ?,
            notes = ?,
            pov_character_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await this.mcpClient.writeQuery(updateQuery, [
        data.title || null,
        data.filePath,
        data.wordCount,
        data.status,
        data.summary || null,
        data.notes || null,
        data.povCharacterId ?? null,
        existing[0].id,
      ]);

      return existing[0].id;
    } else {
      // Insert new
      const insertQuery = `
        INSERT INTO chapters (
          project_id, chapter_number, title, file_path,
          word_count, status, summary, notes, pov_character_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.mcpClient.writeQuery(insertQuery, [
        this.projectId,
        data.chapterNumber,
        data.title || null,
        data.filePath,
        data.wordCount,
        data.status,
        data.summary || null,
        data.notes || null,
        data.povCharacterId ?? null,
      ]);

      // Get the inserted ID
      const idQuery = 'SELECT last_insert_rowid() as id';
      const result = await this.mcpClient.readQuery<{ id: number }>(idQuery);
      return result[0].id;
    }
  }

  /**
   * Delete a chapter from database (when file is deleted)
   */
  async deleteChapter(chapterNumber: number): Promise<void> {
    const query = `
      DELETE FROM chapters
      WHERE project_id = ? AND chapter_number = ?
    `;
    await this.mcpClient.writeQuery(query, [this.projectId, chapterNumber]);
    console.log(`Chapter ${chapterNumber} deleted`);
  }

  /**
   * Return the next available chapter number for this project — one more than
   * the current maximum, or 1 when the project has no chapters yet.
   */
  async getNextChapterNumber(): Promise<number> {
    const rows = await this.mcpClient.readQuery<{ maxNum: number | null }>(
      'SELECT MAX(chapter_number) AS maxNum FROM chapters WHERE project_id = ?',
      [this.projectId]
    );
    const max = rows.length > 0 && rows[0].maxNum != null ? Number(rows[0].maxNum) : 0;
    return max + 1;
  }
}
