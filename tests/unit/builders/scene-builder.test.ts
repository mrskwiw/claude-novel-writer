/**
 * Unit Tests for SceneBuilder
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SceneBuilder } from '../../../project/src/builders/scene-builder.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getTestProjectPath } from '../../setup.js';

describe('SceneBuilder', () => {
  let sceneBuilder: SceneBuilder;
  let testChapterPath: string;
  let testDir: string;

  beforeEach(async () => {
    testDir = getTestProjectPath();
    const chaptersDir = join(testDir, 'chapters');

    // Create test directory
    if (!existsSync(chaptersDir)) {
      await mkdir(chaptersDir, { recursive: true });
    }

    // Create test chapter file
    testChapterPath = join(chaptersDir, '01-test-chapter.md');
    const chapterContent = `---
title: Test Chapter
status: drafted
---

# Test Chapter

This is initial chapter content.
`;

    await writeFile(testChapterPath, chapterContent, 'utf-8');

    sceneBuilder = new SceneBuilder({ chapterFilePath: testChapterPath });
  });

  afterEach(async () => {
    // Clean up test files
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe('addScene()', () => {
    it('should add scene to empty chapter', async () => {
      const metadata = await sceneBuilder.addScene(
        {
          title: 'Opening Scene',
          pov: 'Sarah Chen',
          location: 'Coffee Shop',
          timeOfDay: 'Morning',
          tensionLevel: 5,
        },
        'The coffee shop was crowded with morning regulars.'
      );

      expect(metadata.sceneNumber).toBe(1);
      expect(metadata.title).toBe('Opening Scene');
      expect(metadata.pov).toBe('Sarah Chen');

      // Verify scene was written to file
      const scenes = await sceneBuilder.parseScenes();
      expect(scenes).toHaveLength(1);
      expect(scenes[0].metadata.sceneNumber).toBe(1);
      expect(scenes[0].content).toContain('coffee shop');
    });

    it('should add multiple scenes', async () => {
      // Add first scene
      await sceneBuilder.addScene(
        { title: 'Scene 1', pov: 'Alice' },
        'First scene content.'
      );

      // Add second scene
      await sceneBuilder.addScene(
        { title: 'Scene 2', pov: 'Bob' },
        'Second scene content.'
      );

      const scenes = await sceneBuilder.parseScenes();
      expect(scenes).toHaveLength(2);
      expect(scenes[0].metadata.sceneNumber).toBe(1);
      expect(scenes[1].metadata.sceneNumber).toBe(2);
    });

    it('should add scene with all metadata fields', async () => {
      const metadata = await sceneBuilder.addScene({
        title: 'Complex Scene',
        pov: 'John Doe',
        location: 'Library',
        timeOfDay: 'Evening',
        purpose: 'Reveal key information',
        emotionalTone: 'Tense',
        tensionLevel: 8,
      });

      const scenes = await sceneBuilder.parseScenes();
      const scene = scenes[0];

      expect(scene.metadata.title).toBe('Complex Scene');
      expect(scene.metadata.pov).toBe('John Doe');
      expect(scene.metadata.location).toBe('Library');
      expect(scene.metadata.timeOfDay).toBe('Evening');
      expect(scene.metadata.purpose).toBe('Reveal key information');
      expect(scene.metadata.emotionalTone).toBe('Tense');
      expect(scene.metadata.tensionLevel).toBe(8);
    });

    it('should insert scene after specific scene', async () => {
      // Add two scenes
      await sceneBuilder.addScene({ title: 'Scene 1' }, 'First');
      await sceneBuilder.addScene({ title: 'Scene 3' }, 'Third');

      // Insert scene 2 between them
      await sceneBuilder.addScene(
        { title: 'Scene 2', insertAfterScene: 1 },
        'Second'
      );

      const scenes = await sceneBuilder.parseScenes();
      expect(scenes).toHaveLength(3);
      // Note: This won't renumber automatically, so scene 3 is still scene 3
      expect(scenes[0].content.trim()).toBe('First');
      expect(scenes[1].content.trim()).toBe('Second');
      expect(scenes[2].content.trim()).toBe('Third');
    });
  });

  describe('parseScenes()', () => {
    it('should parse scenes from chapter file', async () => {
      // Add test scenes
      const chapterWithScenes = `---
title: Test Chapter
---

# Test Chapter

<!-- scene:1 -->
<!-- title: Opening -->
<!-- pov: Sarah -->
Scene 1 content here.
<!-- /scene:1 -->

<!-- scene:2 -->
<!-- title: Rising Action -->
<!-- pov: John -->
<!-- tension: 7 -->
Scene 2 content here.
<!-- /scene:2 -->
`;

      await writeFile(testChapterPath, chapterWithScenes, 'utf-8');

      const scenes = await sceneBuilder.parseScenes();

      expect(scenes).toHaveLength(2);

      expect(scenes[0].metadata.sceneNumber).toBe(1);
      expect(scenes[0].metadata.title).toBe('Opening');
      expect(scenes[0].metadata.pov).toBe('Sarah');
      expect(scenes[0].content.trim()).toBe('Scene 1 content here.');

      expect(scenes[1].metadata.sceneNumber).toBe(2);
      expect(scenes[1].metadata.title).toBe('Rising Action');
      expect(scenes[1].metadata.pov).toBe('John');
      expect(scenes[1].metadata.tensionLevel).toBe(7);
    });

    it('should handle empty chapter', async () => {
      const scenes = await sceneBuilder.parseScenes();
      expect(scenes).toEqual([]);
    });

    it('should parse all metadata fields', async () => {
      const chapterContent = `---
title: Test
---

<!-- scene:1 -->
<!-- title: Complex Scene -->
<!-- pov: Alice -->
<!-- location: Library -->
<!-- time: Evening -->
<!-- purpose: Reveal secret -->
<!-- tone: Tense -->
<!-- tension: 9 -->
Content here.
<!-- /scene:1 -->
`;

      await writeFile(testChapterPath, chapterContent, 'utf-8');

      const scenes = await sceneBuilder.parseScenes();
      const scene = scenes[0];

      expect(scene.metadata.title).toBe('Complex Scene');
      expect(scene.metadata.pov).toBe('Alice');
      expect(scene.metadata.location).toBe('Library');
      expect(scene.metadata.timeOfDay).toBe('Evening');
      expect(scene.metadata.purpose).toBe('Reveal secret');
      expect(scene.metadata.emotionalTone).toBe('Tense');
      expect(scene.metadata.tensionLevel).toBe(9);
    });
  });

  describe('updateSceneMetadata()', () => {
    beforeEach(async () => {
      await sceneBuilder.addScene(
        {
          title: 'Original Title',
          pov: 'Alice',
          tensionLevel: 5,
        },
        'Scene content.'
      );
    });

    it('should update scene title', async () => {
      await sceneBuilder.updateSceneMetadata(1, { title: 'New Title' });

      const scenes = await sceneBuilder.parseScenes();
      expect(scenes[0].metadata.title).toBe('New Title');
      expect(scenes[0].metadata.pov).toBe('Alice'); // Other fields unchanged
    });

    it('should update tension level', async () => {
      await sceneBuilder.updateSceneMetadata(1, { tensionLevel: 9 });

      const scenes = await sceneBuilder.parseScenes();
      expect(scenes[0].metadata.tensionLevel).toBe(9);
    });

    it('should update multiple fields', async () => {
      await sceneBuilder.updateSceneMetadata(1, {
        title: 'Updated Title',
        location: 'Park',
        timeOfDay: 'Afternoon',
        tensionLevel: 7,
      });

      const scenes = await sceneBuilder.parseScenes();
      expect(scenes[0].metadata.title).toBe('Updated Title');
      expect(scenes[0].metadata.location).toBe('Park');
      expect(scenes[0].metadata.timeOfDay).toBe('Afternoon');
      expect(scenes[0].metadata.tensionLevel).toBe(7);
    });

    it('should throw error for non-existent scene', async () => {
      await expect(
        sceneBuilder.updateSceneMetadata(999, { title: 'New Title' })
      ).rejects.toThrow('Scene 999 not found');
    });

    it('should preserve scene content when updating metadata', async () => {
      await sceneBuilder.updateSceneMetadata(1, { title: 'New Title' });

      const scenes = await sceneBuilder.parseScenes();
      expect(scenes[0].content.trim()).toBe('Scene content.');
    });
  });

  describe('deleteScene()', () => {
    beforeEach(async () => {
      await sceneBuilder.addScene({ title: 'Scene 1' }, 'First scene.');
      await sceneBuilder.addScene({ title: 'Scene 2' }, 'Second scene.');
      await sceneBuilder.addScene({ title: 'Scene 3' }, 'Third scene.');
    });

    it('should delete scene and renumber remaining', async () => {
      await sceneBuilder.deleteScene(2);

      const scenes = await sceneBuilder.parseScenes();
      expect(scenes).toHaveLength(2);
      expect(scenes[0].metadata.sceneNumber).toBe(1);
      expect(scenes[1].metadata.sceneNumber).toBe(2); // Renumbered from 3
      expect(scenes[1].content.trim()).toBe('Third scene.');
    });

    it('should delete first scene', async () => {
      await sceneBuilder.deleteScene(1);

      const scenes = await sceneBuilder.parseScenes();
      expect(scenes).toHaveLength(2);
      expect(scenes[0].content.trim()).toBe('Second scene.');
      expect(scenes[1].content.trim()).toBe('Third scene.');
    });

    it('should delete last scene', async () => {
      await sceneBuilder.deleteScene(3);

      const scenes = await sceneBuilder.parseScenes();
      expect(scenes).toHaveLength(2);
      expect(scenes[0].content.trim()).toBe('First scene.');
      expect(scenes[1].content.trim()).toBe('Second scene.');
    });

    it('should throw error for non-existent scene', async () => {
      await expect(sceneBuilder.deleteScene(999)).rejects.toThrow(
        'Scene 999 not found'
      );
    });
  });

  describe('reorderScenes()', () => {
    beforeEach(async () => {
      await sceneBuilder.addScene({ title: 'Scene 1' }, 'First scene.');
      await sceneBuilder.addScene({ title: 'Scene 2' }, 'Second scene.');
      await sceneBuilder.addScene({ title: 'Scene 3' }, 'Third scene.');
    });

    it('should reorder scenes', async () => {
      await sceneBuilder.reorderScenes([3, 1, 2]);

      const scenes = await sceneBuilder.parseScenes();
      expect(scenes).toHaveLength(3);

      expect(scenes[0].content.trim()).toBe('Third scene.');
      expect(scenes[0].metadata.sceneNumber).toBe(1);

      expect(scenes[1].content.trim()).toBe('First scene.');
      expect(scenes[1].metadata.sceneNumber).toBe(2);

      expect(scenes[2].content.trim()).toBe('Second scene.');
      expect(scenes[2].metadata.sceneNumber).toBe(3);
    });

    it('should reverse scene order', async () => {
      await sceneBuilder.reorderScenes([3, 2, 1]);

      const scenes = await sceneBuilder.parseScenes();
      expect(scenes[0].content.trim()).toBe('Third scene.');
      expect(scenes[1].content.trim()).toBe('Second scene.');
      expect(scenes[2].content.trim()).toBe('First scene.');
    });

    it('should throw error if order length mismatch', async () => {
      await expect(sceneBuilder.reorderScenes([1, 2])).rejects.toThrow(
        'must include all 3 scenes'
      );
    });

    it('should throw error if duplicate scene numbers', async () => {
      await expect(sceneBuilder.reorderScenes([1, 1, 2])).rejects.toThrow(
        'duplicate scene numbers'
      );
    });

    it('should throw error if non-existent scene', async () => {
      await expect(sceneBuilder.reorderScenes([1, 2, 999])).rejects.toThrow(
        'Scene 999 not found'
      );
    });
  });

  describe('countSceneWords()', () => {
    it('should count words in plain text', () => {
      const content = 'This is a test with exactly nine words total.';
      const count = sceneBuilder.countSceneWords(content);
      expect(count).toBe(9);
    });

    it('should exclude HTML comments', () => {
      const content = `<!-- This is a comment -->
        This is actual content with five words.`;
      const count = sceneBuilder.countSceneWords(content);
      expect(count).toBe(7); // "This is actual content with five words"
    });

    it('should handle markdown formatting', () => {
      const content = `# Header

**Bold text** and *italic text* here.

[Link text](https://example.com)`;

      const count = sceneBuilder.countSceneWords(content);
      // "Header Bold text and italic text here Link text"
      expect(count).toBeGreaterThan(5);
    });

    it('should handle empty content', () => {
      const count = sceneBuilder.countSceneWords('');
      expect(count).toBe(0);
    });

    it('should handle content with only whitespace', () => {
      const count = sceneBuilder.countSceneWords('   \n\n   ');
      expect(count).toBe(0);
    });

    it('should count words with punctuation correctly', () => {
      const content = "Words, words! Words? Words. Words; words—words.";
      const count = sceneBuilder.countSceneWords(content);
      expect(count).toBeGreaterThan(5); // At least the words themselves
    });
  });

  describe('getSceneStats()', () => {
    beforeEach(async () => {
      await sceneBuilder.addScene(
        { title: 'Scene 1' },
        'This scene has exactly ten words including this period here.'
      );
      await sceneBuilder.addScene(
        { title: 'Scene 2' },
        'Scene two has five words.'
      );
      await sceneBuilder.addScene(
        { title: 'Scene 3' },
        'And scene three has six words.'
      );
    });

    it('should calculate scene statistics', async () => {
      const stats = await sceneBuilder.getSceneStats();

      expect(stats.totalScenes).toBe(3);
      expect(stats.totalWords).toBeGreaterThan(0);
      expect(stats.averageWordsPerScene).toBeGreaterThan(0);
      expect(stats.scenes).toHaveLength(3);
    });

    it('should track word count per scene', async () => {
      const stats = await sceneBuilder.getSceneStats();

      expect(stats.scenes[0].sceneNumber).toBe(1);
      expect(stats.scenes[0].wordCount).toBe(10);

      expect(stats.scenes[1].sceneNumber).toBe(2);
      expect(stats.scenes[1].wordCount).toBe(5);

      expect(stats.scenes[2].sceneNumber).toBe(3);
      expect(stats.scenes[2].wordCount).toBe(6);
    });

    it('should handle chapter with no scenes', async () => {
      // Create builder with empty chapter
      const emptyChapterPath = join(testDir, 'chapters', '02-empty.md');
      await writeFile(emptyChapterPath, '---\ntitle: Empty\n---\n\n# Empty\n', 'utf-8');

      const emptyBuilder = new SceneBuilder({ chapterFilePath: emptyChapterPath });
      const stats = await emptyBuilder.getSceneStats();

      expect(stats.totalScenes).toBe(0);
      expect(stats.totalWords).toBe(0);
      expect(stats.averageWordsPerScene).toBe(0);
      expect(stats.scenes).toEqual([]);
    });
  });

  describe('validate()', () => {
    it('should accept valid metadata', () => {
      const errors = sceneBuilder.validate({
        sceneNumber: 1,
        title: 'Valid Scene',
        tensionLevel: 5,
      });

      expect(errors).toEqual([]);
    });

    it('should reject tension level below 1', () => {
      const errors = sceneBuilder.validate({ tensionLevel: 0 });
      expect(errors).toContain('Tension level must be between 1 and 10');
    });

    it('should reject tension level above 10', () => {
      const errors = sceneBuilder.validate({ tensionLevel: 11 });
      expect(errors).toContain('Tension level must be between 1 and 10');
    });

    it('should reject negative scene number', () => {
      const errors = sceneBuilder.validate({ sceneNumber: -1 });
      expect(errors).toContain('Scene number must be positive');
    });

    it('should reject zero scene number', () => {
      const errors = sceneBuilder.validate({ sceneNumber: 0 });
      expect(errors).toContain('Scene number must be positive');
    });

    it('should collect multiple errors', () => {
      const errors = sceneBuilder.validate({
        sceneNumber: -1,
        tensionLevel: 15,
      });

      expect(errors).toHaveLength(2);
    });
  });
});
