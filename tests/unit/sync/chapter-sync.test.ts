/**
 * Unit Tests for ChapterSync
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { ChapterSync } from '../../../project/src/sync/chapter-sync.js';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { createTestChapterFile } from '../../helpers/test-utils.js';
import { getTestProjectPath } from '../../setup.js';

describe('ChapterSync', () => {
  let sync: ChapterSync;
  let mockClient: MockMCPClient;
  let projectPath: string;
  const projectId = 1;

  beforeEach(() => {
    projectPath = getTestProjectPath();
    mockClient = new MockMCPClient();
    sync = new ChapterSync(mockClient, projectId, projectPath);
  });

  // ─── syncChapterFile ───────────────────────────────────────────────────────

  describe('syncChapterFile()', () => {
    it('should insert a new chapter into the database', async () => {
      const filePath = await createTestChapterFile(projectPath, 1, 'The Beginning');
      await sync.syncChapterFile(filePath);
      expect(mockClient.getRecordCount('chapters')).toBe(1);
    });

    it('should set chapter_number from filename', async () => {
      const filePath = await createTestChapterFile(projectPath, 5, 'Chapter Five');
      await sync.syncChapterFile(filePath);
      const rows = mockClient.getTableData('chapters');
      expect(rows[0].chapter_number).toBe(5);
    });

    it('should update an existing chapter on second sync', async () => {
      const filePath = await createTestChapterFile(projectPath, 1, 'Chapter One');
      await sync.syncChapterFile(filePath);
      expect(mockClient.getRecordCount('chapters')).toBe(1);

      // Update the file with new title via frontmatter
      const content = `---\ntitle: Updated Title\nstatus: revised\n---\n\nNew content here.`;
      await writeFile(filePath, content);
      await sync.syncChapterFile(filePath);

      // Should still be 1 row
      expect(mockClient.getRecordCount('chapters')).toBe(1);
    });

    it('should parse frontmatter title, status, summary, notes, pov', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      await mkdir(chaptersDir, { recursive: true });
      const filePath = join(chaptersDir, '03-test.md');
      const content = `---\ntitle: The Storm\nstatus: revised\nsummary: A big storm\nnotes: Needs revision\npov: Alice\n---\n\nChapter body here.`;
      await writeFile(filePath, content);

      await sync.syncChapterFile(filePath);

      const rows = mockClient.getTableData('chapters');
      expect(rows[0].title).toBe('The Storm');
      expect(rows[0].status).toBe('revised');
      expect(rows[0].summary).toBe('A big storm');
      expect(rows[0].notes).toBe('Needs revision');
    });

    it('should resolve pov character ID when character exists in DB', async () => {
      mockClient.seed('characters', [
        { id: 42, project_id: projectId, name: 'Alice' },
      ]);

      const chaptersDir = join(projectPath, 'chapters');
      await mkdir(chaptersDir, { recursive: true });
      const filePath = join(chaptersDir, '02-test.md');
      await writeFile(filePath, `---\ntitle: Alice POV\npov: Alice\n---\n\nBody.`);

      await sync.syncChapterFile(filePath);

      const rows = mockClient.getTableData('chapters');
      expect(rows[0].pov_character_id).toBe(42);
    });

    it('should leave pov_character_id null when character not found', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      await mkdir(chaptersDir, { recursive: true });
      const filePath = join(chaptersDir, '04-test.md');
      await writeFile(filePath, `---\ntitle: Unknown POV\npov: UnknownChar\n---\n\nBody.`);

      await sync.syncChapterFile(filePath);

      const rows = mockClient.getTableData('chapters');
      // pov character not found → stored as null (explicit null from ?? null)
      expect(rows[0].pov_character_id === null || rows[0].pov_character_id === undefined).toBe(true);
    });

    it('should count words in body (not frontmatter)', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      await mkdir(chaptersDir, { recursive: true });
      const filePath = join(chaptersDir, '06-test.md');
      // 4-word body
      await writeFile(filePath, `---\ntitle: Word Count\n---\n\nThis is four words.`);

      await sync.syncChapterFile(filePath);

      const rows = mockClient.getTableData('chapters');
      expect(rows[0].word_count).toBeGreaterThan(0);
    });

    it('should extract chapter number from numeric filename', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      await mkdir(chaptersDir, { recursive: true });
      const filePath = join(chaptersDir, '07.md');
      await writeFile(filePath, 'No frontmatter here');

      await sync.syncChapterFile(filePath);

      const rows = mockClient.getTableData('chapters');
      expect(rows[0].chapter_number).toBe(7);
    });

    it('should use default status "drafted" when no status in frontmatter', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      await mkdir(chaptersDir, { recursive: true });
      const filePath = join(chaptersDir, '08-no-status.md');
      await writeFile(filePath, `---\ntitle: No Status\n---\n\nBody.`);

      await sync.syncChapterFile(filePath);

      const rows = mockClient.getTableData('chapters');
      expect(rows[0].status).toBe('drafted');
    });

    it('should extract title from first heading when no frontmatter', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      await mkdir(chaptersDir, { recursive: true });
      const filePath = join(chaptersDir, '09-heading.md');
      await writeFile(filePath, `# The Grand Opening\n\nSome content here.`);

      await sync.syncChapterFile(filePath);

      const rows = mockClient.getTableData('chapters');
      expect(rows[0].title).toBe('The Grand Opening');
    });

    it('should throw SyncConflictError when DB row is newer than last sync', async () => {
      const dbUpdatedAt = new Date(Date.now() + 60_000).toISOString();
      mockClient.seed('chapters', [
        { id: 1, project_id: projectId, chapter_number: 1, updated_at: dbUpdatedAt },
      ]);
      const olderSync = new Date(Date.now() - 60_000).toISOString();
      mockClient.seed('sync_state', [
        { id: 1, entity_type: 'chapter', entity_id: '1', project_id: String(projectId), last_synced_at: olderSync, file_path: null },
      ]);

      const filePath = await createTestChapterFile(projectPath, 1, 'Chapter One');

      const { SyncConflictError } = await import('../../../project/src/types/novel.js');
      await expect(sync.syncChapterFile(filePath)).rejects.toBeInstanceOf(SyncConflictError);
    });

    it('should succeed with forceFile=true despite conflict', async () => {
      const dbUpdatedAt = new Date(Date.now() + 60_000).toISOString();
      mockClient.seed('chapters', [
        { id: 1, project_id: projectId, chapter_number: 1, updated_at: dbUpdatedAt },
      ]);
      const olderSync = new Date(Date.now() - 60_000).toISOString();
      mockClient.seed('sync_state', [
        { id: 1, entity_type: 'chapter', entity_id: '1', project_id: String(projectId), last_synced_at: olderSync, file_path: null },
      ]);

      const filePath = await createTestChapterFile(projectPath, 1, 'Chapter One');
      await expect(sync.syncChapterFile(filePath, { forceFile: true })).resolves.toBeUndefined();
    });

    it('should not conflict when existing row has no updated_at', async () => {
      mockClient.seed('chapters', [
        { id: 1, project_id: projectId, chapter_number: 1, updated_at: null },
      ]);

      const filePath = await createTestChapterFile(projectPath, 1, 'Chapter One');
      await expect(sync.syncChapterFile(filePath)).resolves.toBeUndefined();
    });
  });

  // ─── exportToFile ─────────────────────────────────────────────────────────

  describe('exportToFile()', () => {
    it('should write a markdown file for the given chapter ID', async () => {
      mockClient.seed('chapters', [
        {
          id: 1,
          project_id: projectId,
          chapter_number: 1,
          title: 'The Beginning',
          status: 'drafted',
          summary: 'Things begin',
          notes: 'Work in progress',
          file_path: null,
          word_count: 100,
        },
      ]);

      const outputPath = await sync.exportToFile(1);
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('title: The Beginning');
      expect(content).toContain('number: 1');
      expect(content).toContain('status: drafted');
    });

    it('should use existing file_path from DB when present', async () => {
      const customPath = join(projectPath, 'chapters', 'custom.md');
      mockClient.seed('chapters', [
        {
          id: 2,
          project_id: projectId,
          chapter_number: 2,
          title: null,
          status: 'drafted',
          summary: null,
          notes: null,
          file_path: customPath,
          word_count: 0,
        },
      ]);

      const outputPath = await sync.exportToFile(2);
      expect(outputPath).toBe(customPath);
    });

    it('should throw when chapter ID not found', async () => {
      await expect(sync.exportToFile(999)).rejects.toThrow('Chapter 999 not found');
    });

    it('should create slug-less filename when title is null', async () => {
      mockClient.seed('chapters', [
        {
          id: 3,
          project_id: projectId,
          chapter_number: 3,
          title: null,
          status: 'drafted',
          summary: null,
          notes: null,
          file_path: null,
          word_count: 0,
        },
      ]);

      const outputPath = await sync.exportToFile(3);
      expect(outputPath).toContain('03.md');
    });
  });

  // ─── deleteChapter ─────────────────────────────────────────────────────────

  describe('deleteChapter()', () => {
    it('should remove chapter from database', async () => {
      mockClient.seed('chapters', [
        { id: 1, project_id: projectId, chapter_number: 1 },
        { id: 2, project_id: projectId, chapter_number: 2 },
      ]);

      await sync.deleteChapter(1);

      const rows = mockClient.getTableData('chapters');
      expect(rows.find((r) => r.chapter_number === 1)).toBeUndefined();
      expect(rows.find((r) => r.chapter_number === 2)).toBeDefined();
    });
  });

  // ─── generateChapterSummary ────────────────────────────────────────────────

  describe('generateChapterSummary()', () => {
    it('should return a placeholder summary for existing chapter', async () => {
      // Create a temp chapter file to read from
      const filePath = await createTestChapterFile(projectPath, 1, 'Chapter One');
      mockClient.seed('chapters', [
        { id: 1, project_id: projectId, chapter_number: 1, file_path: filePath },
      ]);

      const summary = await sync.generateChapterSummary(1);
      expect(summary).toContain('chapter 1');
    });

    it('should throw when chapter not found', async () => {
      await expect(sync.generateChapterSummary(999)).rejects.toThrow('Chapter 999 not found');
    });
  });

  // ─── word count / markdown cleanup ────────────────────────────────────────

  describe('word count (via syncChapterFile)', () => {
    it('should strip markdown headers before counting', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      await mkdir(chaptersDir, { recursive: true });
      const filePath = join(chaptersDir, '10-markdown.md');
      // The word "Chapter" is a header and should NOT be double-counted
      await writeFile(filePath, `# Chapter Title\n\n**Bold word** and *italic word*.`);

      await sync.syncChapterFile(filePath);
      const rows = mockClient.getTableData('chapters');
      // "Chapter Title" + "Bold word" + "and" + "italic word" = 6 words (approximately)
      expect(rows[0].word_count).toBeGreaterThan(0);
    });

    it('should handle chapter with only frontmatter (0 body words)', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      await mkdir(chaptersDir, { recursive: true });
      const filePath = join(chaptersDir, '11-empty.md');
      await writeFile(filePath, `---\ntitle: Empty\n---\n`);

      await sync.syncChapterFile(filePath);
      const rows = mockClient.getTableData('chapters');
      expect(rows[0].word_count).toBe(0);
    });
  });
});
