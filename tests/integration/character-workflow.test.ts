/**
 * Integration Tests: Character Workflows
 * Tests complete character management workflows from CLI commands
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleCharacterCommand } from '../../project/src/cli/handlers/character-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';

describe('Character Workflow Integration Tests', () => {
  const testProjectPath = join(process.cwd(), 'test-character-project');
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
    });
  });

  afterEach(async () => {
    extension.cleanup();
    await rm(testProjectPath, { recursive: true, force: true });
  });

  describe('Character Creation Workflow', () => {
    it('should create a character with required fields', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Alice Walker',
          role: 'protagonist',
          summary: 'A brilliant detective with a troubled past',
        },
        raw: '/novel character create --name "Alice Walker" --role protagonist --summary "A brilliant detective with a troubled past"',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      // Verify success message
      const successMsg = outputLog.find((msg) => msg.includes('Character created'));
      expect(successMsg).toBeDefined();

      // Verify character file exists
      const characterFiles = await extension.getCharacterBuilder().list();
      expect(characterFiles.length).toBe(1);

      // Verify character file content
      const content = await readFile(characterFiles[0], 'utf-8');
      expect(content).toContain('name: Alice Walker');
      expect(content).toContain('role: protagonist');
      expect(content).toContain('A brilliant detective with a troubled past');
    });

    it('should create a character with physical attributes', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Bob Smith',
          role: 'major',
          summary: 'Alice\'s partner',
          age: '35',
          'eye-color': 'brown',
          'hair-color': 'black',
          height: '6\'2"',
          build: 'athletic',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      const characterFiles = await extension.getCharacterBuilder().list();
      const content = await readFile(characterFiles[0], 'utf-8');

      expect(content).toContain('age: "35"');
      expect(content).toContain('eyeColor: "brown"');
      expect(content).toContain('hairColor: "black"');
      expect(content).toContain('height: "6\'2""');
      expect(content).toContain('build: "athletic"');
    });

    it('should create a character with personality', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Carol Jones',
          role: 'minor',
          summary: 'A helpful informant',
          personality: 'Nervous but loyal, always looking over her shoulder',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      const characterFiles = await extension.getCharacterBuilder().list();
      const content = await readFile(characterFiles[0], 'utf-8');

      expect(content).toContain('personality:');
      expect(content).toContain('core: "Nervous but loyal, always looking over her shoulder"');
    });

    it('should fail to create character without required fields', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Incomplete Character',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      const errorMsg = outputLog.find((msg) => msg.includes('ERROR'));
      expect(errorMsg).toBeDefined();
    });

    it('should auto-sync character to database after creation', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Dave Wilson',
          role: 'antagonist',
          summary: 'The mastermind behind the conspiracy',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      // Verify sync message
      const syncMsg = outputLog.find((msg) => msg.includes('Synced to database'));
      expect(syncMsg).toBeDefined();

      // Verify in database
      const mcpClient = (extension as any).mcpClient;
      const characters = await mcpClient.readQuery(
        'SELECT * FROM characters WHERE name = ?',
        ['Dave Wilson']
      );

      expect(characters.length).toBe(1);
      expect(characters[0].name).toBe('Dave Wilson');
      expect(characters[0].role).toBe('antagonist');
      expect(characters[0].summary.trim()).toBe('The mastermind behind the conspiracy');
    });
  });

  describe('Character Listing Workflow', () => {
    beforeEach(async () => {
      // Create test characters
      const builder = extension.getCharacterBuilder();
      await builder.create({
        name: 'Alice Walker',
        role: 'protagonist',
        summary: 'Detective',
      });
      await builder.create({
        name: 'Bob Smith',
        role: 'major',
        summary: 'Partner',
      });
      await builder.create({
        name: 'Carol Jones',
        role: 'minor',
        summary: 'Informant',
      });
    });

    it('should list all characters', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['list'],
        arguments: {},
        flags: {},
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Alice Walker'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('Bob Smith'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('Carol Jones'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('Total: 3 characters'))).toBeDefined();
    });

    it('should show message when no characters exist', async () => {
      // Remove all characters
      await rm(join(testProjectPath, 'characters'), { recursive: true, force: true });

      const args: ParsedArgs = {
        command: 'character',
        positional: ['list'],
        arguments: {},
        flags: {},
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('No characters found'))).toBeDefined();
    });
  });

  describe('Character Show Workflow', () => {
    beforeEach(async () => {
      const builder = extension.getCharacterBuilder();
      await builder.create({
        name: 'Alice Walker',
        role: 'protagonist',
        fullName: 'Alice Marie Walker',
        summary: 'A brilliant detective',
        physical: {
          age: '32',
          eyeColor: 'green',
          hairColor: 'auburn',
        },
        personality: {
          core: 'Determined and analytical',
        },
        arc: {
          startingState: 'Isolated and distrustful',
          endingState: 'Connected and trusting',
          midpointCrisis: 'Loses her partner',
        },
      });
    });

    it('should show basic character information', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['show'],
        arguments: {},
        flags: {
          name: 'Alice Walker',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Alice Walker'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('protagonist'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('Alice Marie Walker'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('brilliant detective'))).toBeDefined();
    });

    it('should show all details with --all flag', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['show'],
        arguments: {},
        flags: {
          name: 'Alice Walker',
          all: true,
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Character Arc'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('Isolated and distrustful'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('Connected and trusting'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('Loses her partner'))).toBeDefined();
    });

    it('should handle character not found', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['show'],
        arguments: {},
        flags: {
          name: 'Nonexistent Character',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Character not found'))).toBeDefined();
    });
  });

  describe('Character Edit Workflow', () => {
    beforeEach(async () => {
      const builder = extension.getCharacterBuilder();
      await builder.create({
        name: 'Alice Walker',
        role: 'protagonist',
        summary: 'A detective',
        physical: {
          age: '32',
        },
      });
    });

    it('should edit character role', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['edit'],
        arguments: {},
        flags: {
          name: 'Alice Walker',
          role: 'major',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Character updated'))).toBeDefined();

      const characterFiles = await extension.getCharacterBuilder().list();
      const content = await readFile(characterFiles[0], 'utf-8');
      expect(content).toContain('role: major');
    });

    it('should edit character summary', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['edit'],
        arguments: {},
        flags: {
          name: 'Alice Walker',
          summary: 'A brilliant detective with a troubled past',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      const characterFiles = await extension.getCharacterBuilder().list();
      const content = await readFile(characterFiles[0], 'utf-8');
      expect(content).toContain('A brilliant detective with a troubled past');
    });

    it('should edit physical attributes', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['edit'],
        arguments: {},
        flags: {
          name: 'Alice Walker',
          age: '33',
          'eye-color': 'blue',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      const characterFiles = await extension.getCharacterBuilder().list();
      const content = await readFile(characterFiles[0], 'utf-8');
      expect(content).toContain('age: "33"');
      expect(content).toContain('eyeColor: blue');
    });

    it('should auto-sync after editing', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['edit'],
        arguments: {},
        flags: {
          name: 'Alice Walker',
          role: 'major',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Synced to database'))).toBeDefined();
    });
  });

  describe('Character Delete Workflow', () => {
    beforeEach(async () => {
      const builder = extension.getCharacterBuilder();
      await builder.create({
        name: 'Temporary Character',
        role: 'background',
        summary: 'To be deleted',
      });
    });

    it('should delete character file', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['delete'],
        arguments: {},
        flags: {
          name: 'Temporary Character',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Character deleted'))).toBeDefined();

      const characterFiles = await extension.getCharacterBuilder().list();
      expect(characterFiles.length).toBe(0);
    });

    it('should handle delete of nonexistent character', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['delete'],
        arguments: {},
        flags: {
          name: 'Nonexistent',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Character not found'))).toBeDefined();
    });
  });

  describe('Character Sync Workflow', () => {
    beforeEach(async () => {
      const builder = extension.getCharacterBuilder();
      await builder.create({
        name: 'Alice Walker',
        role: 'protagonist',
        summary: 'Detective',
      });
      await builder.create({
        name: 'Bob Smith',
        role: 'major',
        summary: 'Partner',
      });
    });

    it('should sync all characters to database', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['sync'],
        arguments: {},
        flags: {},
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Synced 2 characters'))).toBeDefined();

      const mcpClient = (extension as any).mcpClient;
      const characters = await mcpClient.readQuery('SELECT * FROM characters ORDER BY name');

      expect(characters.length).toBe(2);
      expect(characters[0].name).toBe('Alice Walker');
      expect(characters[1].name).toBe('Bob Smith');
    });

    it('should sync single character to database', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['sync'],
        arguments: {},
        flags: {
          name: 'Alice Walker',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Character synced: Alice Walker'))).toBeDefined();
    });
  });

  describe('Character Scenes Workflow', () => {
    beforeEach(async () => {
      // Create character
      const builder = extension.getCharacterBuilder();
      await builder.create({
        name: 'Alice Walker',
        role: 'protagonist',
        summary: 'Detective',
      });

      // Sync to database
      const charSync = extension.getCharacterSync();
      const characterFiles = await builder.list();
      await charSync.syncCharacterFile(characterFiles[0]);

      // Get character ID
      const mcpClient = (extension as any).mcpClient;
      const characters = await mcpClient.readQuery(
        'SELECT id FROM characters WHERE name = ?',
        ['Alice Walker']
      );
      const characterId = characters[0].id;

      // Create a chapter
      const chaptersPath = join(testProjectPath, 'chapters');
      await mkdir(chaptersPath, { recursive: true });
      const chapterPath = join(chaptersPath, '01-opening.md');

      const chapterContent = `# Chapter 1: The Case Begins

<!-- scene:1 -->
<!-- pov: Alice Walker -->
<!-- location: Police Station -->
<!-- title: Morning Briefing -->

Alice stood at the whiteboard, markers in hand.

<!-- /scene:1 -->

<!-- scene:2 -->
<!-- pov: Alice Walker -->
<!-- title: First Clue -->

She found the note tucked under the evidence bag.

<!-- /scene:2 -->
`;

      await writeFile(chapterPath, chapterContent, 'utf-8');

      // Sync chapter to database first
      const chapterSync = extension.getChapterSync();
      await chapterSync.syncChapterFile(chapterPath);

      // Sync scenes
      const sceneSync = extension.getSceneSync();
      await sceneSync.syncChapterScenes(chapterPath, {
        resolveCharacterNames: true,
        resolveLocationNames: false,
      });
    });

    it('should list scenes featuring a character', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['scenes'],
        arguments: {},
        flags: {
          name: 'Alice Walker',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Scenes featuring Alice Walker'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('Chapter 1'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('Scene 1'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('Scene 2'))).toBeDefined();
      expect(outputLog.find((msg) => msg.includes('Total: 2 scenes'))).toBeDefined();
    });

    it('should handle character not found in database', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['scenes'],
        arguments: {},
        flags: {
          name: 'Nonexistent Character',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Character not found in database'))).toBeDefined();
    });

    it('should handle character with no scenes', async () => {
      // Create another character not in scenes
      const builder = extension.getCharacterBuilder();
      await builder.create({
        name: 'Unused Character',
        role: 'background',
        summary: 'Never appears',
      });

      const charSync = extension.getCharacterSync();
      const characterFiles = await builder.list();
      const unusedCharFile = characterFiles.find((f) => f.includes('unused'));
      if (unusedCharFile) {
        await charSync.syncCharacterFile(unusedCharFile);
      }

      const args: ParsedArgs = {
        command: 'character',
        positional: ['scenes'],
        arguments: {},
        flags: {
          name: 'Unused Character',
        },
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('No scenes found featuring'))).toBeDefined();
    });
  });

  describe('Unknown Subcommand', () => {
    it('should handle unknown subcommand', async () => {
      const args: ParsedArgs = {
        command: 'character',
        positional: ['invalid'],
        arguments: {},
        flags: {},
        raw: '',
      };

      await handleCharacterCommand(args, testProjectPath, mockOutput, extension);

      expect(outputLog.find((msg) => msg.includes('Unknown character subcommand'))).toBeDefined();
    });
  });
});
