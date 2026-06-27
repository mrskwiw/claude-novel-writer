/**
 * Integration Tests: Export Workflows
 * Tests manuscript export and statistics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { TestNovelWriterExtension } from '../../helpers/test-extension.js';
import { handleExportCommand } from '../../../project/src/cli/handlers/export-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../../project/src/cli/types.js';

describe('Export Workflow Integration Tests', () => {
  const testProjectPath = join(process.cwd(), 'test-export-project');
  let extension: TestNovelWriterExtension;
  let outputLog: string[];

  // Mock OutputFormatter
  const mockOutput: OutputFormatter = {
    success: (msg: string) => outputLog.push(`SUCCESS: ${msg}`),
    error: (msg: string) => outputLog.push(`ERROR: ${msg}`),
    warning: (msg: string) => outputLog.push(`WARNING: ${msg}`),
    info: (msg: string) => outputLog.push(`INFO: ${msg}`),
    dim: (msg: string) => outputLog.push(`DIM: ${msg}`),
    table: () => outputLog.push('TABLE'),
    list: () => outputLog.push('LIST'),
    section: () => outputLog.push('SECTION'),
    spinner: () => ({ stop: () => {} }),
    newline: () => outputLog.push(''),
    heading: () => outputLog.push('HEADING'),
    keyValue: () => outputLog.push('KEYVALUE'),
    code: () => outputLog.push('CODE'),
  };

  beforeEach(async () => {
    outputLog = [];
    await mkdir(testProjectPath, { recursive: true });
    extension = new TestNovelWriterExtension(testProjectPath);
    await extension.initialize({
      title: 'Test Novel',
      author: 'Test Author',
      genre: 'Fantasy',
      targetWordCount: 80000,
      projectPath: testProjectPath,
    });

    // Create test chapters
    const chaptersDir = join(testProjectPath, 'chapters');
    await mkdir(chaptersDir, { recursive: true });

    // Chapter 1
    await writeFile(
      join(chaptersDir, '01-opening.md'),
      `---
title: The Beginning
number: 1
status: drafted
povCharacter: Sarah
---

# The Beginning

This is the first chapter.

<!-- scene:1 -->
<!-- title: Opening Scene -->
Sarah looked out the window.
<!-- /scene:1 -->

<!-- scene:2 -->
<!-- title: Discovery -->
She found something amazing.
<!-- /scene:2 -->
`,
      'utf-8'
    );

    // Chapter 2
    await writeFile(
      join(chaptersDir, '02-conflict.md'),
      `---
title: Rising Tension
number: 2
status: drafted
povCharacter: Tom
---

# Rising Tension

The second chapter begins.

<!-- scene:1 -->
<!-- title: Confrontation -->
Tom confronted Sarah about the discovery.
<!-- /scene:1 -->
`,
      'utf-8'
    );
  });

  afterEach(async () => {
    extension.cleanup();
    await rm(testProjectPath, { recursive: true, force: true });
  });

  describe('Export Manuscript Workflow', () => {
    it('should export manuscript with default options', async () => {
      const args: ParsedArgs = {
        command: 'export',
        positional: ['manuscript'],
        arguments: {},
        flags: {},
        raw: '/novel export manuscript',
      };

      await handleExportCommand(args, testProjectPath, mockOutput, extension);

      const successMsg = outputLog.find((msg) => msg.includes('Manuscript exported'));
      expect(successMsg).toBeDefined();

      // Verify file was created
      const exportPath = join(testProjectPath, 'export', 'manuscript.md');
      expect(existsSync(exportPath)).toBe(true);

      // Verify content
      const content = await readFile(exportPath, 'utf-8');
      expect(content).toContain('# Test Novel');
      expect(content).toContain('*by Test Author*');
      expect(content).toContain('# Chapter 1: The Beginning');
      expect(content).toContain('# Chapter 2: Rising Tension');
      expect(content).toContain('Sarah looked out the window');
      expect(content).toContain('Tom confronted Sarah');
      expect(content).not.toContain('<!-- scene:'); // Scene markers removed
    });

    it('should export with custom output path', async () => {
      const customPath = join(testProjectPath, 'custom-manuscript.md');

      const args: ParsedArgs = {
        command: 'export',
        positional: ['manuscript'],
        arguments: {},
        flags: {
          output: customPath,
        },
        raw: '/novel export manuscript --output custom-manuscript.md',
      };

      await handleExportCommand(args, testProjectPath, mockOutput, extension);

      expect(existsSync(customPath)).toBe(true);

      const content = await readFile(customPath, 'utf-8');
      expect(content).toContain('Test Novel');
    });

    it('should export with custom metadata', async () => {
      const args: ParsedArgs = {
        command: 'export',
        positional: ['manuscript'],
        arguments: {},
        flags: {
          title: 'My Epic Novel',
          author: 'Jane Doe',
          genre: 'Science Fiction',
          copyright: '© 2025 Jane Doe',
          dedication: 'For my family',
        },
        raw: '/novel export manuscript --title "My Epic Novel" --author "Jane Doe"',
      };

      await handleExportCommand(args, testProjectPath, mockOutput, extension);

      const exportPath = join(testProjectPath, 'export', 'manuscript.md');
      const content = await readFile(exportPath, 'utf-8');

      expect(content).toContain('# My Epic Novel');
      expect(content).toContain('*by Jane Doe*');
      expect(content).toContain('*Science Fiction*');
      expect(content).toContain('© 2025 Jane Doe');
      expect(content).toContain('For my family');
    });

    it('should export without metadata and front matter', async () => {
      const args: ParsedArgs = {
        command: 'export',
        positional: ['manuscript'],
        arguments: {},
        flags: {
          'no-metadata': true,
          'no-front-matter': true,
        },
        raw: '/novel export manuscript --no-metadata --no-front-matter',
      };

      await handleExportCommand(args, testProjectPath, mockOutput, extension);

      const exportPath = join(testProjectPath, 'export', 'manuscript.md');
      const content = await readFile(exportPath, 'utf-8');

      expect(content).not.toContain('*by Test Author*');
      expect(content).toContain('# Chapter 1: The Beginning');
    });

    it('should export without chapter numbers', async () => {
      const args: ParsedArgs = {
        command: 'export',
        positional: ['manuscript'],
        arguments: {},
        flags: {
          'no-chapter-numbers': true,
        },
        raw: '/novel export manuscript --no-chapter-numbers',
      };

      await handleExportCommand(args, testProjectPath, mockOutput, extension);

      const exportPath = join(testProjectPath, 'export', 'manuscript.md');
      const content = await readFile(exportPath, 'utf-8');

      expect(content).toContain('# The Beginning');
      expect(content).not.toContain('# Chapter 1:');
    });

    it('should export specific chapters only', async () => {
      const args: ParsedArgs = {
        command: 'export',
        positional: ['manuscript'],
        arguments: {},
        flags: {
          chapters: '1',
        },
        raw: '/novel export manuscript --chapters 1',
      };

      await handleExportCommand(args, testProjectPath, mockOutput, extension);

      const exportPath = join(testProjectPath, 'export', 'manuscript.md');
      const content = await readFile(exportPath, 'utf-8');

      expect(content).toContain('# Chapter 1: The Beginning');
      expect(content).not.toContain('# Chapter 2: Rising Tension');
    });

    it('should use custom scene break', async () => {
      const args: ParsedArgs = {
        command: 'export',
        positional: ['manuscript'],
        arguments: {},
        flags: {
          'scene-break': '\n\n# # #\n\n',
        },
        raw: '/novel export manuscript --scene-break "# # #"',
      };

      await handleExportCommand(args, testProjectPath, mockOutput, extension);

      const exportPath = join(testProjectPath, 'export', 'manuscript.md');
      const content = await readFile(exportPath, 'utf-8');

      expect(content).toContain('# # #');
    });
  });

  describe('Export Statistics Workflow', () => {
    it('should show manuscript statistics', async () => {
      const args: ParsedArgs = {
        command: 'export',
        positional: ['stats'],
        arguments: {},
        flags: {},
        raw: '/novel export stats',
      };

      await handleExportCommand(args, testProjectPath, mockOutput, extension);

      const output = outputLog.join('\n');

      expect(output).toContain('Manuscript Statistics');
      expect(output).toContain('Total Chapters: 2');
      expect(output).toContain('Total Words:');
      expect(output).toContain('Chapter Breakdown:');
      expect(output).toContain('Ch 1: The Beginning');
      expect(output).toContain('Ch 2: Rising Tension');
    });

    it('should show statistics for specific chapters', async () => {
      const args: ParsedArgs = {
        command: 'export',
        positional: ['stats'],
        arguments: {},
        flags: {
          chapters: '1',
        },
        raw: '/novel export stats --chapters 1',
      };

      await handleExportCommand(args, testProjectPath, mockOutput, extension);

      const output = outputLog.join('\n');

      expect(output).toContain('Total Chapters: 1');
      expect(output).toContain('Ch 1: The Beginning');
      expect(output).not.toContain('Ch 2: Rising Tension');
    });
  });

  describe('Export Error Handling', () => {
    it('should handle missing chapters directory', async () => {
      await rm(join(testProjectPath, 'chapters'), { recursive: true, force: true });

      const args: ParsedArgs = {
        command: 'export',
        positional: ['manuscript'],
        arguments: {},
        flags: {},
        raw: '/novel export manuscript',
      };

      await handleExportCommand(args, testProjectPath, mockOutput, extension);

      // Should still succeed, just with empty manuscript
      const exportPath = join(testProjectPath, 'export', 'manuscript.md');
      expect(existsSync(exportPath)).toBe(true);
    });
  });
});
