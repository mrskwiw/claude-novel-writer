/**
 * Integration Tests: Scene Workflow
 * Tests complete scene management workflow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NovelWriterExtension } from '../../../project/src/index.js';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { getTestProjectPath } from '../../setup.js';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { writeFile, rm } from 'fs/promises';

describe('Scene Workflow (Integration)', () => {
  let extension: NovelWriterExtension;
  let mcpClient: MockMCPClient;
  let projectPath: string;
  let chapterPath: string;
  const projectId = 1;

  beforeEach(async () => {
    projectPath = getTestProjectPath();
    mcpClient = new MockMCPClient();

    // Create test directory structure
    const chaptersDir = join(projectPath, 'chapters');
    if (!existsSync(chaptersDir)) {
      mkdirSync(chaptersDir, { recursive: true });
    }

    // Create test chapter file
    chapterPath = join(chaptersDir, '01-test-chapter.md');
    const chapterContent = `---
title: Test Chapter
status: drafted
---

# Test Chapter

This is the opening content before any scenes.
`;

    await writeFile(chapterPath, chapterContent, 'utf-8');

    // Mock database: insert project
    await mcpClient.writeQuery(
      'INSERT INTO projects (id, title) VALUES (?, ?)',
      [projectId, 'Test Novel']
    );

    // Mock database: insert chapter
    await mcpClient.writeQuery(
      `INSERT INTO chapters (id, project_id, chapter_number, title, file_path) VALUES (?, ?, ?, ?, ?)`,
      [1, projectId, 1, 'Test Chapter', chapterPath]
    );

    extension = new NovelWriterExtension(projectPath);
    extension.setProjectId(projectId);

    // Inject mock client
    (extension as any).mcpClient = mcpClient;
  });

  afterEach(async () => {
    // Clean up test files
    if (existsSync(projectPath)) {
      await rm(projectPath, { recursive: true, force: true });
    }
  });

  it('should complete full scene creation workflow', async () => {
    // Step 1: Create scene
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    const metadata = await sceneBuilder.addScene(
      {
        title: 'Opening Scene',
        pov: 'Sarah Chen',
        location: 'Coffee Shop',
        timeOfDay: 'Morning',
        tensionLevel: 5,
        purpose: 'Introduce protagonist',
      },
      'Sarah sat by the window, watching the rain.'
    );

    expect(metadata.sceneNumber).toBe(1);
    expect(metadata.title).toBe('Opening Scene');
    expect(metadata.pov).toBe('Sarah Chen');

    // Step 2: Parse scenes
    const scenes = await sceneBuilder.parseScenes();
    expect(scenes).toHaveLength(1);
    expect(scenes[0].metadata.sceneNumber).toBe(1);

    // Step 3: Count words
    const wordCount = sceneBuilder.countSceneWords(scenes[0].content);
    expect(wordCount).toBeGreaterThan(0);

    // Step 4: Get stats
    const stats = await sceneBuilder.getSceneStats();
    expect(stats.totalScenes).toBe(1);
    expect(stats.totalWords).toBeGreaterThan(0);
  });

  it('should sync scenes to database', async () => {
    // Create character in database
    await mcpClient.writeQuery(
      'INSERT INTO characters (id, project_id, name) VALUES (?, ?, ?)',
      [1, projectId, 'Sarah Chen']
    );

    // Create location in database
    await mcpClient.writeQuery(
      'INSERT INTO locations (id, project_id, name) VALUES (?, ?, ?)',
      [1, projectId, 'Coffee Shop']
    );

    // Add scene to chapter
    const sceneBuilder = extension.getSceneBuilder(chapterPath);
    await sceneBuilder.addScene(
      {
        title: 'Opening',
        pov: 'Sarah Chen',
        location: 'Coffee Shop',
        tensionLevel: 5,
      },
      'Scene content here.'
    );

    // Sync to database
    const sceneSync = extension.getSceneSync();
    await sceneSync.syncChapterScenes(chapterPath, {
      resolveCharacterNames: true,
      resolveLocationNames: true,
    });

    // Verify scene in database
    const scenes = await mcpClient.readQuery(
      'SELECT * FROM scenes WHERE chapter_id = ?',
      [1]
    );

    expect(scenes).toHaveLength(1);
    expect(scenes[0].scene_number).toBe(1);
    expect(scenes[0].title).toBe('Opening');
    expect(scenes[0].pov_character_id).toBe(1);
    expect(scenes[0].location_id).toBe(1);
    expect(scenes[0].tension_level).toBe(5);
  });

  it('should handle multiple scenes', async () => {
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    // Add three scenes
    await sceneBuilder.addScene(
      { title: 'Scene 1', tensionLevel: 3 },
      'First scene content.'
    );

    await sceneBuilder.addScene(
      { title: 'Scene 2', tensionLevel: 6 },
      'Second scene content.'
    );

    await sceneBuilder.addScene(
      { title: 'Scene 3', tensionLevel: 4 },
      'Third scene content.'
    );

    const scenes = await sceneBuilder.parseScenes();
    expect(scenes).toHaveLength(3);

    // Verify scene numbers
    expect(scenes[0].metadata.sceneNumber).toBe(1);
    expect(scenes[1].metadata.sceneNumber).toBe(2);
    expect(scenes[2].metadata.sceneNumber).toBe(3);

    // Verify tension levels
    expect(scenes[0].metadata.tensionLevel).toBe(3);
    expect(scenes[1].metadata.tensionLevel).toBe(6);
    expect(scenes[2].metadata.tensionLevel).toBe(4);
  });

  it('should update scene metadata', async () => {
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    // Create scene
    await sceneBuilder.addScene(
      { title: 'Original Title', tensionLevel: 5 },
      'Scene content.'
    );

    // Update metadata
    await sceneBuilder.updateSceneMetadata(1, {
      title: 'Updated Title',
      tensionLevel: 8,
      emotionalTone: 'Tense',
    });

    // Verify update
    const scenes = await sceneBuilder.parseScenes();
    expect(scenes[0].metadata.title).toBe('Updated Title');
    expect(scenes[0].metadata.tensionLevel).toBe(8);
    expect(scenes[0].metadata.emotionalTone).toBe('Tense');
  });

  it('should delete and renumber scenes', async () => {
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    // Add three scenes
    await sceneBuilder.addScene({ title: 'Scene 1' }, 'First');
    await sceneBuilder.addScene({ title: 'Scene 2' }, 'Second');
    await sceneBuilder.addScene({ title: 'Scene 3' }, 'Third');

    // Delete middle scene
    await sceneBuilder.deleteScene(2);

    const scenes = await sceneBuilder.parseScenes();
    expect(scenes).toHaveLength(2);

    // Verify renumbering
    expect(scenes[0].metadata.sceneNumber).toBe(1);
    expect(scenes[0].content.trim()).toBe('First');

    expect(scenes[1].metadata.sceneNumber).toBe(2); // Renumbered from 3
    expect(scenes[1].content.trim()).toBe('Third');
  });

  it('should reorder scenes', async () => {
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    // Add three scenes
    await sceneBuilder.addScene({ title: 'A' }, 'Scene A');
    await sceneBuilder.addScene({ title: 'B' }, 'Scene B');
    await sceneBuilder.addScene({ title: 'C' }, 'Scene C');

    // Reorder: 3, 1, 2
    await sceneBuilder.reorderScenes([3, 1, 2]);

    const scenes = await sceneBuilder.parseScenes();
    expect(scenes).toHaveLength(3);

    // Verify new order
    expect(scenes[0].content.trim()).toBe('Scene C');
    expect(scenes[0].metadata.sceneNumber).toBe(1);

    expect(scenes[1].content.trim()).toBe('Scene A');
    expect(scenes[1].metadata.sceneNumber).toBe(2);

    expect(scenes[2].content.trim()).toBe('Scene B');
    expect(scenes[2].metadata.sceneNumber).toBe(3);
  });

  it('should calculate scene statistics', async () => {
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    // Add scenes with known word counts
    await sceneBuilder.addScene(
      { title: 'Scene 1' },
      'This scene has exactly ten words including this period here.'
    );

    await sceneBuilder.addScene(
      { title: 'Scene 2' },
      'Four words here.'
    );

    const stats = await sceneBuilder.getSceneStats();

    expect(stats.totalScenes).toBe(2);
    expect(stats.totalWords).toBe(13); // 10 + 3
    expect(stats.averageWordsPerScene).toBe(6.5);

    expect(stats.scenes[0].sceneNumber).toBe(1);
    expect(stats.scenes[0].wordCount).toBe(10);

    expect(stats.scenes[1].sceneNumber).toBe(2);
    expect(stats.scenes[1].wordCount).toBe(3);
  });

  it('should get scenes by character', async () => {
    // Create character
    await mcpClient.writeQuery(
      'INSERT INTO characters (id, project_id, name) VALUES (?, ?, ?)',
      [1, projectId, 'Alice']
    );

    // Create scenes with POV
    const sceneBuilder = extension.getSceneBuilder(chapterPath);
    await sceneBuilder.addScene({ pov: 'Alice' }, 'Alice scene 1');
    await sceneBuilder.addScene({ pov: 'Alice' }, 'Alice scene 2');
    await sceneBuilder.addScene({ pov: 'Bob' }, 'Bob scene');

    // Sync to database
    const sceneSync = extension.getSceneSync();
    await sceneSync.syncChapterScenes(chapterPath, {
      resolveCharacterNames: true,
    });

    // Query by character
    const aliceScenes = await sceneSync.getScenesByCharacter(1);
    expect(aliceScenes).toHaveLength(2);
  });

  it('should get tension arc', async () => {
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    // Add scenes with tension levels
    await sceneBuilder.addScene({ tensionLevel: 3 }, 'Low tension');
    await sceneBuilder.addScene({ tensionLevel: 7 }, 'High tension');
    await sceneBuilder.addScene({ tensionLevel: 5 }, 'Medium tension');

    // Sync to database
    const sceneSync = extension.getSceneSync();
    await sceneSync.syncChapterScenes(chapterPath);

    // Get tension arc
    const tensionArc = await sceneSync.getTensionArc();

    expect(tensionArc).toHaveLength(3);
    expect(tensionArc[0].tensionLevel).toBe(3);
    expect(tensionArc[1].tensionLevel).toBe(7);
    expect(tensionArc[2].tensionLevel).toBe(5);
  });

  it('should get chapter scene statistics from database', async () => {
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    // Add scenes
    await sceneBuilder.addScene({ tensionLevel: 5 }, 'Scene 1 has ten words here including this.');
    await sceneBuilder.addScene({ tensionLevel: 7 }, 'Scene 2 five words.');
    await sceneBuilder.addScene({ tensionLevel: 3 }, 'Scene 3 four words.');

    // Sync to database
    const sceneSync = extension.getSceneSync();
    await sceneSync.syncChapterScenes(chapterPath);

    // Get stats from database
    const stats = await sceneSync.getChapterSceneStats(1);

    expect(stats.totalScenes).toBe(3);
    expect(stats.totalWords).toBeGreaterThan(0);
    expect(stats.averageWordsPerScene).toBeGreaterThan(0);
    expect(stats.averageTensionLevel).toBe(5); // (5 + 7 + 3) / 3
    expect(stats.scenesByTension.get(5)).toBe(1);
    expect(stats.scenesByTension.get(7)).toBe(1);
    expect(stats.scenesByTension.get(3)).toBe(1);
  });

  it('should handle scene sync without character/location resolution', async () => {
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    await sceneBuilder.addScene(
      {
        pov: 'NonExistentCharacter',
        location: 'NonExistentLocation',
      },
      'Scene content'
    );

    // Sync without resolution (should succeed with null IDs)
    const sceneSync = extension.getSceneSync();
    await sceneSync.syncChapterScenes(chapterPath, {
      resolveCharacterNames: false,
      resolveLocationNames: false,
    });

    const scenes = await mcpClient.readQuery(
      'SELECT * FROM scenes WHERE chapter_id = ?',
      [1]
    );

    expect(scenes).toHaveLength(1);
    expect(scenes[0].pov_character_id).toBeNull();
    expect(scenes[0].location_id).toBeNull();
  });

  it('should preserve content when updating metadata', async () => {
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    const originalContent = 'This is the original scene content that should be preserved.';

    await sceneBuilder.addScene({ title: 'Original' }, originalContent);

    // Update metadata
    await sceneBuilder.updateSceneMetadata(1, {
      title: 'Updated',
      tensionLevel: 8,
    });

    // Verify content unchanged
    const scenes = await sceneBuilder.parseScenes();
    expect(scenes[0].content.trim()).toBe(originalContent);
    expect(scenes[0].metadata.title).toBe('Updated');
  });
});
