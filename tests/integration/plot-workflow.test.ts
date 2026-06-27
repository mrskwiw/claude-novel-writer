/**
 * Integration Tests: Plot Thread Workflows
 * Tests complete plot thread management workflows from CLI commands
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handlePlotCommand } from '../../project/src/cli/handlers/plot-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';

describe('Plot Thread Workflow Integration Tests', () => {
  let testProjectPath: string;
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
    // Create unique test directory for each test
    testProjectPath = join(process.cwd(), `test-plot-project-${Date.now()}-${Math.random()}`);
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
    // Clean up mock client
    extension.cleanup();
    await rm(testProjectPath, { recursive: true, force: true });
  });

  describe('Plot Thread Creation Workflow', () => {
    it('should create a main plot thread with required fields', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Main Quest',
          type: 'main',
          description: 'The hero must find the ancient artifact',
          priority: '9',
        },
        raw: '/novel plot create --name "Main Quest" --type main --description "The hero must find the ancient artifact" --priority 9',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      // Verify success message
      const successMsg = outputLog.find((msg) => msg.includes('Plot thread created'));
      expect(successMsg).toBeDefined();

      // Verify plot file exists
      const plotBuilder = extension.getPlotThreadBuilder();
      const plotFiles = await plotBuilder.list();
      expect(plotFiles.length).toBe(1);

      // Verify plot file content
      const content = await readFile(plotFiles[0], 'utf-8');
      expect(content).toContain('name: Main Quest');
      expect(content).toContain('type: main');
      expect(content).toContain('The hero must find the ancient artifact');
      expect(content).toContain('priority: 9');
      expect(content).toContain('status: planned');
    });

    it('should create a subplot thread', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Romance Arc',
          type: 'subplot',
          description: 'Love story between protagonist and ally',
          priority: '6',
          status: 'active',
        },
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      const plotBuilder = extension.getPlotThreadBuilder();
      const plotFiles = await plotBuilder.list();
      const content = await readFile(plotFiles[0], 'utf-8');

      expect(content).toContain('name: Romance Arc');
      expect(content).toContain('type: subplot');
      expect(content).toContain('status: active');
      expect(content).toContain('priority: 6');
    });

    it('should create a character plot thread', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Hero\'s Journey',
          type: 'character',
          description: 'Character growth from reluctant hero to leader',
          priority: '8',
        },
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      const plotBuilder = extension.getPlotThreadBuilder();
      const plotFiles = await plotBuilder.list();
      const content = await readFile(plotFiles[0], 'utf-8');

      expect(content).toContain('type: character');
      expect(content).toContain('reluctant hero to leader');
    });

    it('should create a theme plot thread', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Power Corrupts',
          type: 'theme',
          description: 'Exploration of how power corrupts good intentions',
          priority: '5',
        },
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      const plotBuilder = extension.getPlotThreadBuilder();
      const plotFiles = await plotBuilder.list();
      const content = await readFile(plotFiles[0], 'utf-8');

      expect(content).toContain('type: theme');
      expect(content).toContain('power corrupts');
    });

    it('should validate required fields', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Incomplete Thread',
          // Missing type and description
        },
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      // Should have error messages
      const errors = outputLog.filter((msg) => msg.startsWith('ERROR'));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should sync to database after creation', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Test Sync',
          type: 'main',
          description: 'Testing database sync',
          priority: '7',
        },
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      // Verify sync message
      const syncMsg = outputLog.find((msg) => msg.includes('Synced to database'));
      expect(syncMsg).toBeDefined();

      // Verify database record
      const plotSync = extension.getPlotThreadSync();
      const threads = await plotSync.getPlotThreads();
      expect(threads.length).toBe(1);
      expect(threads[0].thread_name).toBe('Test Sync');
      expect(threads[0].thread_type).toBe('main');
      expect(threads[0].priority).toBe(7);
    });
  });

  describe('Plot Beat Management Workflow', () => {
    beforeEach(async () => {
      // Create a plot thread first
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Main Story',
          type: 'main',
          description: 'The main narrative',
          priority: '9',
        },
        raw: '',
      };
      await handlePlotCommand(args, testProjectPath, mockOutput, extension);
      outputLog = []; // Clear log after setup
    });

    it('should add a setup beat to plot thread', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['beat'],
        arguments: {},
        flags: {
          name: 'Main Story',
          scene: 'Ch1.Scene1',
          'beat-type': 'setup',
          'beat-description': 'Introduce the protagonist in their ordinary world',
        },
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      const successMsg = outputLog.find((msg) => msg.includes('Beat added'));
      expect(successMsg).toBeDefined();

      // Verify beat in database
      const plotSync = extension.getPlotThreadSync();
      const threads = await plotSync.getPlotThreads();
      const beats = await plotSync.getBeats(threads[0].id);

      expect(beats.length).toBe(1);
      expect(beats[0].scene_reference).toBe('Ch1.Scene1');
      expect(beats[0].beat_type).toBe('setup');
      expect(beats[0].description).toContain('ordinary world');
    });

    it('should add multiple beats in sequence', async () => {
      // Setup beat
      await handlePlotCommand(
        {
          command: 'plot',
          positional: ['beat'],
          arguments: {},
          flags: {
            name: 'Main Story',
            scene: 'Ch1.Scene2',
            'beat-type': 'setup',
            'beat-description': 'Establish the stakes',
          },
          raw: '',
        },
        testProjectPath,
        mockOutput,
        extension
      );

      // Development beat
      await handlePlotCommand(
        {
          command: 'plot',
          positional: ['beat'],
          arguments: {},
          flags: {
            name: 'Main Story',
            scene: 'Ch5.Scene3',
            'beat-type': 'development',
            'beat-description': 'Hero faces first major challenge',
          },
          raw: '',
        },
        testProjectPath,
        mockOutput,
        extension
      );

      // Climax beat
      await handlePlotCommand(
        {
          command: 'plot',
          positional: ['beat'],
          arguments: {},
          flags: {
            name: 'Main Story',
            scene: 'Ch10.Scene5',
            'beat-type': 'climax',
            'beat-description': 'Final confrontation with antagonist',
          },
          raw: '',
        },
        testProjectPath,
        mockOutput,
        extension
      );

      // Verify all beats in database
      const plotSync = extension.getPlotThreadSync();
      const threads = await plotSync.getPlotThreads();
      const beats = await plotSync.getBeats(threads[0].id);

      expect(beats.length).toBe(3);
      expect(beats[0].beat_type).toBe('setup');
      expect(beats[1].beat_type).toBe('development');
      expect(beats[2].beat_type).toBe('climax');
    });

    it('should handle resolution beat', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['beat'],
        arguments: {},
        flags: {
          name: 'Main Story',
          scene: 'Ch12.Scene2',
          'beat-type': 'resolution',
          'beat-description': 'Aftermath and new normal',
        },
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      const plotSync = extension.getPlotThreadSync();
      const threads = await plotSync.getPlotThreads();
      const beats = await plotSync.getBeats(threads[0].id);

      expect(beats[0].beat_type).toBe('resolution');
      expect(beats[0].description).toContain('Aftermath');
    });
  });

  describe('Plot Thread Listing Workflow', () => {
    beforeEach(async () => {
      // Create multiple plot threads
      const threads = [
        { name: 'Main Quest', type: 'main', priority: '9', status: 'active' },
        { name: 'Romance', type: 'subplot', priority: '6', status: 'active' },
        { name: 'Redemption Arc', type: 'character', priority: '8', status: 'planned' },
        { name: 'Freedom vs Security', type: 'theme', priority: '5', status: 'active' },
        { name: 'Old Mystery', type: 'subplot', priority: '4', status: 'resolved' },
      ];

      for (const thread of threads) {
        await handlePlotCommand(
          {
            command: 'plot',
            positional: ['create'],
            arguments: {},
            flags: {
              name: thread.name,
              type: thread.type,
              description: `Description for ${thread.name}`,
              priority: thread.priority,
              status: thread.status,
            },
            raw: '',
          },
          testProjectPath,
          mockOutput,
          extension
        );
      }

      outputLog = []; // Clear log after setup
    });

    it('should list all plot threads', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['list'],
        arguments: {},
        flags: {},
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      // Should show multiple threads
      expect(outputLog.length).toBeGreaterThan(5);

      // Verify database has all threads
      const plotSync = extension.getPlotThreadSync();
      const threads = await plotSync.getPlotThreads();
      expect(threads.length).toBe(5);
    });

    it('should filter by unresolved status', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['list'],
        arguments: {},
        flags: {
          unresolved: true,
        },
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      // Verify unresolved threads in database
      const plotSync = extension.getPlotThreadSync();
      const unresolved = await plotSync.getUnresolvedThreads();
      expect(unresolved.length).toBe(4); // All except 'Old Mystery'
    });
  });

  describe('Plot Thread Resolution Workflow', () => {
    beforeEach(async () => {
      // Create a plot thread
      await handlePlotCommand(
        {
          command: 'plot',
          positional: ['create'],
          arguments: {},
          flags: {
            name: 'Mystery Plot',
            type: 'subplot',
            description: 'Who stole the artifact?',
            priority: '7',
            status: 'active',
          },
          raw: '',
        },
        testProjectPath,
        mockOutput,
        extension
      );
      outputLog = [];
    });

    it('should resolve a plot thread', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['resolve'],
        arguments: {},
        flags: {
          name: 'Mystery Plot',
        },
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      const successMsg = outputLog.find((msg) => msg.includes('resolved'));
      expect(successMsg).toBeDefined();

      // Verify status in database
      const plotSync = extension.getPlotThreadSync();
      const threads = await plotSync.getPlotThreads();
      const resolvedThread = threads.find((t) => t.thread_name === 'Mystery Plot');

      expect(resolvedThread?.status).toBe('resolved');
    });
  });

  describe('Plot Thread Check Workflow', () => {
    beforeEach(async () => {
      // Create threads with different priorities and statuses
      const threads = [
        { name: 'High Priority Unresolved', type: 'main', priority: '9', status: 'active' },
        { name: 'High Priority Planned', type: 'main', priority: '8', status: 'planned' },
        { name: 'Medium Priority', type: 'subplot', priority: '5', status: 'active' },
        { name: 'Low Priority', type: 'subplot', priority: '3', status: 'planned' },
        { name: 'Resolved High', type: 'main', priority: '9', status: 'resolved' },
      ];

      for (const thread of threads) {
        await handlePlotCommand(
          {
            command: 'plot',
            positional: ['create'],
            arguments: {},
            flags: {
              name: thread.name,
              type: thread.type,
              description: `Description for ${thread.name}`,
              priority: thread.priority,
              status: thread.status,
            },
            raw: '',
          },
          testProjectPath,
          mockOutput,
          extension
        );
      }

      outputLog = [];
    });

    it('should check for unresolved threads', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['check'],
        arguments: {},
        flags: {},
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      // Should show high priority section
      const highPriorityMsg = outputLog.find((msg) => msg.includes('High Priority'));
      expect(highPriorityMsg).toBeDefined();

      // Verify counts in database
      const plotSync = extension.getPlotThreadSync();
      const unresolved = await plotSync.getUnresolvedThreads();
      const highPriority = await plotSync.getHighPriorityUnresolved();

      expect(unresolved.length).toBe(4);
      expect(highPriority.length).toBe(2);
    });

    it('should show success when all threads resolved', async () => {
      // Resolve all threads
      const plotSync = extension.getPlotThreadSync();
      const threads = await plotSync.getPlotThreads();

      for (const thread of threads) {
        if (thread.status !== 'resolved') {
          await plotSync.resolveThread(thread.id);
        }
      }

      const args: ParsedArgs = {
        command: 'plot',
        positional: ['check'],
        arguments: {},
        flags: {},
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      const successMsg = outputLog.find((msg) => msg.includes('All plot threads are resolved'));
      expect(successMsg).toBeDefined();
    });
  });

  describe('Plot Thread Statistics Workflow', () => {
    beforeEach(async () => {
      // Create diverse plot threads
      const threads = [
        { name: 'Main 1', type: 'main', priority: '9', status: 'active' },
        { name: 'Main 2', type: 'main', priority: '8', status: 'resolved' },
        { name: 'Subplot 1', type: 'subplot', priority: '6', status: 'active' },
        { name: 'Subplot 2', type: 'subplot', priority: '5', status: 'planned' },
        { name: 'Character Arc', type: 'character', priority: '7', status: 'active' },
        { name: 'Theme', type: 'theme', priority: '4', status: 'abandoned' },
      ];

      for (const thread of threads) {
        await handlePlotCommand(
          {
            command: 'plot',
            positional: ['create'],
            arguments: {},
            flags: {
              name: thread.name,
              type: thread.type,
              description: `Description for ${thread.name}`,
              priority: thread.priority,
              status: thread.status,
            },
            raw: '',
          },
          testProjectPath,
          mockOutput,
          extension
        );
      }

      // Add beats to some threads
      await handlePlotCommand(
        {
          command: 'plot',
          positional: ['beat'],
          arguments: {},
          flags: {
            name: 'Main 1',
            scene: 'Ch1.S1',
            'beat-type': 'setup',
            'beat-description': 'Setup beat',
          },
          raw: '',
        },
        testProjectPath,
        mockOutput,
        extension
      );

      await handlePlotCommand(
        {
          command: 'plot',
          positional: ['beat'],
          arguments: {},
          flags: {
            name: 'Main 1',
            scene: 'Ch5.S2',
            'beat-type': 'climax',
            'beat-description': 'Climax beat',
          },
          raw: '',
        },
        testProjectPath,
        mockOutput,
        extension
      );

      outputLog = [];
    });

    it('should show comprehensive statistics', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['stats'],
        arguments: {},
        flags: {},
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      // Verify stats in database
      const plotSync = extension.getPlotThreadSync();
      const stats = await plotSync.getStats();

      expect(stats.total).toBe(6);
      expect(stats.byType.main).toBe(2);
      expect(stats.byType.subplot).toBe(2);
      expect(stats.byType.character).toBe(1);
      expect(stats.byType.theme).toBe(1);
      expect(stats.byStatus.active).toBe(3);
      expect(stats.byStatus.planned).toBe(1);
      expect(stats.byStatus.resolved).toBe(1);
      expect(stats.byStatus.abandoned).toBe(1);
      expect(stats.totalBeats).toBe(2); // 2 beats added to Main 1 thread
      expect(stats.unresolved).toBe(4);
      expect(stats.highPriorityUnresolved).toBe(2);
    });
  });

  describe('Plot Thread Sync Workflow', () => {
    it('should sync a single plot thread file', async () => {
      // Create a plot thread first
      await handlePlotCommand(
        {
          command: 'plot',
          positional: ['create'],
          arguments: {},
          flags: {
            name: 'Test Sync',
            type: 'main',
            description: 'Testing sync',
            priority: '7',
          },
          raw: '',
        },
        testProjectPath,
        mockOutput,
        extension
      );

      outputLog = [];

      const args: ParsedArgs = {
        command: 'plot',
        positional: ['sync'],
        arguments: {},
        flags: {
          name: 'Test Sync',
        },
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      const syncMsg = outputLog.find((msg) => msg.includes('Plot thread synced'));
      expect(syncMsg).toBeDefined();
    });

    it('should sync all plot thread files', async () => {
      // Create multiple plot threads
      await handlePlotCommand(
        {
          command: 'plot',
          positional: ['create'],
          arguments: {},
          flags: {
            name: 'Thread 1',
            type: 'main',
            description: 'First thread',
            priority: '7',
          },
          raw: '',
        },
        testProjectPath,
        mockOutput,
        extension
      );

      await handlePlotCommand(
        {
          command: 'plot',
          positional: ['create'],
          arguments: {},
          flags: {
            name: 'Thread 2',
            type: 'subplot',
            description: 'Second thread',
            priority: '5',
          },
          raw: '',
        },
        testProjectPath,
        mockOutput,
        extension
      );

      outputLog = [];

      const args: ParsedArgs = {
        command: 'plot',
        positional: ['sync'],
        arguments: {},
        flags: {
          all: true,
        },
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      const syncMsg = outputLog.find((msg) => msg.includes('Synced 2 plot threads'));
      expect(syncMsg).toBeDefined();
    });
  });

  describe('Plot Thread Show Details Workflow', () => {
    beforeEach(async () => {
      // Create a plot thread with beats
      await handlePlotCommand(
        {
          command: 'plot',
          positional: ['create'],
          arguments: {},
          flags: {
            name: 'Detailed Plot',
            type: 'main',
            description: 'A plot with many details',
            priority: '8',
            status: 'active',
          },
          raw: '',
        },
        testProjectPath,
        mockOutput,
        extension
      );

      // Add beats
      await handlePlotCommand(
        {
          command: 'plot',
          positional: ['beat'],
          arguments: {},
          flags: {
            name: 'Detailed Plot',
            scene: 'Ch1.S1',
            'beat-type': 'setup',
            'beat-description': 'Introduce world',
          },
          raw: '',
        },
        testProjectPath,
        mockOutput,
        extension
      );

      await handlePlotCommand(
        {
          command: 'plot',
          positional: ['beat'],
          arguments: {},
          flags: {
            name: 'Detailed Plot',
            scene: 'Ch10.S5',
            'beat-type': 'climax',
            'beat-description': 'Final battle',
          },
          raw: '',
        },
        testProjectPath,
        mockOutput,
        extension
      );

      outputLog = [];
    });

    it('should show plot thread details', async () => {
      const args: ParsedArgs = {
        command: 'plot',
        positional: ['show'],
        arguments: {},
        flags: {
          name: 'Detailed Plot',
        },
        raw: '',
      };

      await handlePlotCommand(args, testProjectPath, mockOutput, extension);

      // Should show thread details and beats
      expect(outputLog.length).toBeGreaterThan(5);

      // Verify in database
      const plotSync = extension.getPlotThreadSync();
      const threads = await plotSync.getPlotThreads();
      const thread = threads.find((t) => t.thread_name === 'Detailed Plot');
      expect(thread).toBeDefined();

      const beats = await plotSync.getBeats(thread!.id);
      expect(beats.length).toBe(2);
    });
  });
});
