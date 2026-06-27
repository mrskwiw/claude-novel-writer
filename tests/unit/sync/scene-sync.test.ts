/**
 * Unit Tests for SceneSync
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { SceneSync } from '../../../project/src/sync/scene-sync.js';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { getTestProjectPath } from '../../setup.js';

/**
 * Create a chapter file with embedded scene markers that SceneBuilder.parseScenes() can parse.
 */
async function createChapterWithScenes(
  dir: string,
  filename: string,
  scenes: Array<{
    number: number;
    title?: string;
    pov?: string;
    location?: string;
    tension?: number;
    content: string;
  }>
): Promise<string> {
  await mkdir(dir, { recursive: true });
  let body = '';
  for (const s of scenes) {
    let meta = '';
    if (s.title) meta += `<!-- title: ${s.title} -->\n`;
    if (s.pov) meta += `<!-- pov: ${s.pov} -->\n`;
    if (s.location) meta += `<!-- location: ${s.location} -->\n`;
    if (s.tension !== undefined) meta += `<!-- tension: ${s.tension} -->\n`;
    body += `<!-- scene:${s.number} -->\n${meta}${s.content}\n<!-- /scene:${s.number} -->\n\n`;
  }
  const filePath = join(dir, filename);
  await writeFile(filePath, body);
  return filePath;
}

describe('SceneSync', () => {
  let sync: SceneSync;
  let mockClient: MockMCPClient;
  let projectPath: string;
  const projectId = 1;

  beforeEach(() => {
    projectPath = getTestProjectPath();
    mockClient = new MockMCPClient();
    sync = new SceneSync(mockClient, projectId);
  });

  // ─── syncChapterScenes ────────────────────────────────────────────────────

  describe('syncChapterScenes()', () => {
    it('should throw when chapter is not in database', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      const filePath = await createChapterWithScenes(chaptersDir, 'ch01.md', [
        { number: 1, content: 'Scene content' },
      ]);

      await expect(sync.syncChapterScenes(filePath)).rejects.toThrow('Chapter not found in database');
    });

    it('should insert scenes when chapter exists in DB', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      const filePath = await createChapterWithScenes(chaptersDir, 'ch01.md', [
        { number: 1, title: 'Arrival', content: 'The hero arrives.' },
        { number: 2, title: 'Confrontation', content: 'They face off.' },
      ]);

      mockClient.seed('chapters', [
        { id: 10, project_id: projectId, file_path: filePath },
      ]);

      await sync.syncChapterScenes(filePath);

      expect(mockClient.getRecordCount('scenes')).toBe(2);
    });

    it('should delete existing scenes before re-inserting', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      const filePath = await createChapterWithScenes(chaptersDir, 'ch02.md', [
        { number: 1, content: 'Scene 1' },
      ]);

      mockClient.seed('chapters', [
        { id: 10, project_id: projectId, file_path: filePath },
      ]);
      // Pre-seed old scenes for this chapter
      mockClient.seed('scenes', [
        { id: 99, chapter_id: 10, scene_number: 5 },
        { id: 100, chapter_id: 10, scene_number: 6 },
      ]);

      await sync.syncChapterScenes(filePath);

      // After sync: only new scenes remain (the 2 old ones should be deleted)
      const scenes = mockClient.getTableData('scenes');
      expect(scenes.every((s) => s.scene_number !== 5)).toBe(true);
      expect(scenes.every((s) => s.scene_number !== 6)).toBe(true);
    });

    it('should resolve pov character name to ID when resolveCharacterNames=true', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      const filePath = await createChapterWithScenes(chaptersDir, 'ch03.md', [
        { number: 1, pov: 'Alice', content: 'Alice enters.' },
      ]);

      mockClient.seed('chapters', [
        { id: 10, project_id: projectId, file_path: filePath },
      ]);
      mockClient.seed('characters', [
        { id: 7, project_id: projectId, name: 'Alice' },
      ]);

      await sync.syncChapterScenes(filePath, { resolveCharacterNames: true });

      const scenes = mockClient.getTableData('scenes');
      expect(scenes[0].pov_character_id).toBe(7);
    });

    it('should use null pov_character_id when character not found', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      const filePath = await createChapterWithScenes(chaptersDir, 'ch04.md', [
        { number: 1, pov: 'Ghost', content: 'Ghost appears.' },
      ]);

      mockClient.seed('chapters', [
        { id: 10, project_id: projectId, file_path: filePath },
      ]);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await sync.syncChapterScenes(filePath, { resolveCharacterNames: true });
      warnSpy.mockRestore();

      const scenes = mockClient.getTableData('scenes');
      expect(scenes[0].pov_character_id).toBeNull();
    });

    it('should resolve location name to ID when resolveLocationNames=true', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      const filePath = await createChapterWithScenes(chaptersDir, 'ch05.md', [
        { number: 1, location: 'The Library', content: 'Books everywhere.' },
      ]);

      mockClient.seed('chapters', [
        { id: 10, project_id: projectId, file_path: filePath },
      ]);
      mockClient.seed('locations', [
        { id: 99, project_id: projectId, name: 'The Library' },
      ]);

      await sync.syncChapterScenes(filePath, { resolveLocationNames: true });

      const scenes = mockClient.getTableData('scenes');
      expect(scenes[0].location_id).toBe(99);
    });

    it('should use null location_id when location not found', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      const filePath = await createChapterWithScenes(chaptersDir, 'ch06.md', [
        { number: 1, location: 'Atlantis', content: 'Underwater.' },
      ]);

      mockClient.seed('chapters', [
        { id: 10, project_id: projectId, file_path: filePath },
      ]);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await sync.syncChapterScenes(filePath, { resolveLocationNames: true });
      warnSpy.mockRestore();

      const scenes = mockClient.getTableData('scenes');
      expect(scenes[0].location_id).toBeNull();
    });

    it('should sync scene with tension level', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      const filePath = await createChapterWithScenes(chaptersDir, 'ch07.md', [
        { number: 1, tension: 8, content: 'High stakes.' },
      ]);

      mockClient.seed('chapters', [
        { id: 10, project_id: projectId, file_path: filePath },
      ]);

      await sync.syncChapterScenes(filePath);

      const scenes = mockClient.getTableData('scenes');
      expect(scenes[0].tension_level).toBe(8);
    });
  });

  // ─── syncAllScenes ────────────────────────────────────────────────────────

  describe('syncAllScenes()', () => {
    it('should process multiple chapter paths', async () => {
      const chaptersDir = join(projectPath, 'chapters');

      const file1 = await createChapterWithScenes(chaptersDir, 'ch01.md', [
        { number: 1, content: 'First scene' },
      ]);
      const file2 = await createChapterWithScenes(chaptersDir, 'ch02.md', [
        { number: 1, content: 'Second chapter scene' },
      ]);

      mockClient.seed('chapters', [
        { id: 1, project_id: projectId, file_path: file1 },
        { id: 2, project_id: projectId, file_path: file2 },
      ]);

      await sync.syncAllScenes([file1, file2]);

      expect(mockClient.getRecordCount('scenes')).toBe(2);
    });

    it('should continue processing remaining chapters when one fails', async () => {
      const chaptersDir = join(projectPath, 'chapters');
      const file1 = join(chaptersDir, 'nonexistent.md'); // Not in DB → will throw
      const file2 = await createChapterWithScenes(chaptersDir, 'ch02.md', [
        { number: 1, content: 'Valid scene' },
      ]);

      mockClient.seed('chapters', [
        { id: 2, project_id: projectId, file_path: file2 },
      ]);

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await sync.syncAllScenes([file1, file2]);
      errorSpy.mockRestore();

      expect(mockClient.getRecordCount('scenes')).toBe(1);
    });
  });

  // ─── loadChapterScenes ────────────────────────────────────────────────────
  // loadChapterScenes uses a multi-LEFT-JOIN query. MockMCPClient only handles
  // single JOINs, so we override readQuery directly for these tests.

  describe('loadChapterScenes()', () => {
    it('should return empty array when no scenes for chapter', async () => {
      // Empty readQuery response → empty result
      vi.spyOn(mockClient, 'readQuery').mockResolvedValue([]);
      const scenes = await sync.loadChapterScenes(999);
      expect(scenes).toHaveLength(0);
    });

    it('should map DB rows to SceneContent objects', async () => {
      const mockRow = {
        scene_number: 1,
        title: 'The Chase',
        pov_character_name: 'Bob',
        location_name: 'Alley',
        time_of_day: 'dusk',
        purpose: 'action',
        emotional_tone: 'tense',
        tension_level: 8,
        summary: 'Chase scene',
      };
      vi.spyOn(mockClient, 'readQuery').mockResolvedValue([mockRow]);

      const scenes = await sync.loadChapterScenes(10);

      expect(scenes).toHaveLength(1);
      expect(scenes[0].metadata.sceneNumber).toBe(1);
      expect(scenes[0].metadata.title).toBe('The Chase');
      expect(scenes[0].metadata.pov).toBe('Bob');
      expect(scenes[0].metadata.location).toBe('Alley');
      expect(scenes[0].content).toBe('Chase scene');
    });

    it('should handle null optional fields gracefully', async () => {
      const mockRow = {
        scene_number: 2,
        title: null,
        pov_character_name: null,
        location_name: null,
        time_of_day: null,
        purpose: null,
        emotional_tone: null,
        tension_level: null,
        summary: null,
      };
      vi.spyOn(mockClient, 'readQuery').mockResolvedValue([mockRow]);

      const scenes = await sync.loadChapterScenes(10);
      expect(scenes[0].metadata.title).toBeUndefined();
      expect(scenes[0].metadata.pov).toBeUndefined();
      expect(scenes[0].content).toBe('');
    });
  });

  // ─── getChapterSceneStats ─────────────────────────────────────────────────

  describe('getChapterSceneStats()', () => {
    it('should return stats for a chapter with scenes', async () => {
      mockClient.seed('scenes', [
        { id: 1, chapter_id: 10, scene_number: 1, word_count: 100, tension_level: 5 },
        { id: 2, chapter_id: 10, scene_number: 2, word_count: 200, tension_level: 8 },
      ]);

      const stats = await sync.getChapterSceneStats(10);

      expect(stats.totalScenes).toBe(2);
      expect(stats.totalWords).toBe(300);
      expect(typeof stats.scenesByTension).toBe('object');
    });

    it('should return zero stats for chapter with no scenes', async () => {
      const stats = await sync.getChapterSceneStats(999);
      expect(stats.totalScenes).toBe(0);
      expect(stats.totalWords).toBe(0);
    });
  });

  // ─── getScenesByCharacter ─────────────────────────────────────────────────

  describe('getScenesByCharacter()', () => {
    it('should return empty array when no scenes for character', async () => {
      vi.spyOn(mockClient, 'readQuery').mockResolvedValue([]);
      const scenes = await sync.getScenesByCharacter(999);
      expect(scenes).toEqual([]);
    });

    it('should return rows from join query for known character', async () => {
      const mockRows = [
        { id: 1, chapter_id: 1, scene_number: 1, chapter_number: 1, chapter_title: 'Ch1' },
      ];
      vi.spyOn(mockClient, 'readQuery').mockResolvedValue(mockRows);
      const scenes = await sync.getScenesByCharacter(7);
      expect(scenes).toHaveLength(1);
    });
  });

  // ─── getScenesByLocation ──────────────────────────────────────────────────

  describe('getScenesByLocation()', () => {
    it('should return empty array when no scenes for location', async () => {
      vi.spyOn(mockClient, 'readQuery').mockResolvedValue([]);
      const scenes = await sync.getScenesByLocation(999);
      expect(scenes).toEqual([]);
    });

    it('should return rows from join query for known location', async () => {
      const mockRows = [
        { id: 2, chapter_id: 1, scene_number: 2, chapter_number: 1, chapter_title: 'Ch1' },
      ];
      vi.spyOn(mockClient, 'readQuery').mockResolvedValue(mockRows);
      const scenes = await sync.getScenesByLocation(99);
      expect(scenes).toHaveLength(1);
    });
  });

  // ─── getTensionArc ────────────────────────────────────────────────────────

  describe('getTensionArc()', () => {
    it('should return empty array when no tension data', async () => {
      const arc = await sync.getTensionArc();
      expect(arc).toEqual([]);
    });

    it('should map DB rows to arc objects', async () => {
      // getTensionArc uses a JOIN query; mock readQuery directly
      const mockRows = [
        { chapter_number: 1, scene_number: 1, tension_level: 7 },
        { chapter_number: 1, scene_number: 2, tension_level: 9 },
      ];
      vi.spyOn(mockClient, 'readQuery').mockResolvedValue(mockRows);

      const arc = await sync.getTensionArc();

      expect(arc).toHaveLength(2);
      expect(arc[0].chapterNumber).toBe(1);
      expect(arc[0].tensionLevel).toBe(7);
    });
  });
});
