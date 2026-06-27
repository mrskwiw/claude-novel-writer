/**
 * Integration Tests: World Rules Workflows
 * Tests complete world rules management workflows from CLI commands
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleWorldRuleCommand } from '../../project/src/cli/handlers/world-rule-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';

describe('World Rules Workflow Integration Tests', () => {
  const testProjectPath = join(process.cwd(), 'test-world-rules-project');
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
  });

  afterEach(async () => {
    // Clean up mock client
    extension.cleanup();
    await rm(testProjectPath, { recursive: true, force: true });
  });

  describe('World Rule Creation Workflow', () => {
    it('should create a magic system rule with required fields', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Elemental Magic',
          category: 'magic',
          description: 'Mages can control the four classical elements',
          'hard-rule': true,
        },
        raw: '/novel world-rule create --name "Elemental Magic" --category magic --description "Mages can control the four classical elements" --hard-rule',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      // Verify success message
      const successMsg = outputLog.find((msg) => msg.includes('World rule created'));
      expect(successMsg).toBeDefined();

      // Verify rule file exists
      const builder = extension.getWorldRulesBuilder();
      const ruleFiles = await builder.list();
      expect(ruleFiles.length).toBe(1);

      // Verify rule file content
      const content = await readFile(ruleFiles[0], 'utf-8');
      expect(content).toContain('name: Elemental Magic');
      expect(content).toContain('category: magic');
      expect(content).toContain('Mages can control the four classical elements');
      expect(content).toContain('is_hard_rule: true');
    });

    it('should create a flexible technology rule', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Steam Power',
          category: 'technology',
          description: 'Technology is based on steam engines',
          limitations: 'Limited by coal availability',
          'hard-rule': false,
        },
        raw: '/novel world-rule create --name "Steam Power" --category technology --description "Technology is based on steam engines" --limitations "Limited by coal availability"',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const successMsg = outputLog.find((msg) => msg.includes('World rule created'));
      expect(successMsg).toBeDefined();

      const builder = extension.getWorldRulesBuilder();
      const ruleFiles = await builder.list();
      const content = await readFile(ruleFiles[0], 'utf-8');
      expect(content).toContain('is_hard_rule: false');
      expect(content).toContain('limitations: Limited by coal availability');
    });

    it('should reject rule creation without required fields', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Incomplete Rule',
          // Missing category and description
        },
        raw: '/novel world-rule create --name "Incomplete Rule"',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const errorMsg = outputLog.find((msg) => msg.includes('ERROR'));
      expect(errorMsg).toBeDefined();
    });

    it('should reject invalid category', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Invalid Rule',
          category: 'invalid-category',
          description: 'This should fail',
        },
        raw: '/novel world-rule create --name "Invalid Rule" --category invalid-category',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const errorMsg = outputLog.find((msg) => msg.includes('ERROR') || msg.includes('invalid'));
      expect(errorMsg).toBeDefined();
    });
  });

  describe('World Rule Listing Workflow', () => {
    beforeEach(async () => {
      // Create multiple rules
      const builder = extension.getWorldRulesBuilder();

      await builder.create({
        name: 'Fire Magic',
        category: 'magic',
        description: 'Control over flames',
        is_hard_rule: true,
      });

      await builder.create({
        name: 'Airships',
        category: 'technology',
        description: 'Flying vehicles powered by magic',
        is_hard_rule: false,
      });

      await builder.create({
        name: 'Monarchy',
        category: 'political',
        description: 'Kingdom ruled by hereditary monarchs',
        is_hard_rule: true,
      });

      // Sync all rules to database
      const sync = extension.getWorldRulesSync();
      const worldRulesDir = join(testProjectPath, 'world-rules');
      await sync.syncAllFromDirectory(worldRulesDir);
    });

    it('should list all world rules', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['list'],
        arguments: {},
        flags: {},
        raw: '/novel world-rule list',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const output = outputLog.join('\n');
      expect(output).toContain('Fire Magic');
      expect(output).toContain('Airships');
      expect(output).toContain('Monarchy');
    });

    it('should filter rules by category', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['list'],
        arguments: {},
        flags: {
          category: 'magic',
        },
        raw: '/novel world-rule list --category magic',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const output = outputLog.join('\n');
      expect(output).toContain('Fire Magic');
      expect(output).not.toContain('Airships');
      expect(output).not.toContain('Monarchy');
    });
  });

  describe('World Rule Modification Workflow', () => {
    beforeEach(async () => {
      const builder = extension.getWorldRulesBuilder();
      await builder.create({
        name: 'Magic System',
        category: 'magic',
        description: 'Spellcasting requires verbal incantations',
        is_hard_rule: true,
      });
    });

    it('should add example to world rule', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['add-example'],
        arguments: {},
        flags: {
          name: 'Magic System',
          example: 'The wizard spoke the words "Ignis Flamma" and fire erupted from his staff',
        },
        raw: '/novel world-rule add-example --name "Magic System" --example "..."',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const successMsg = outputLog.find((msg) => msg.includes('Example added'));
      expect(successMsg).toBeDefined();

      const builder = extension.getWorldRulesBuilder();
      const files = await builder.list();
      const content = await readFile(files[0], 'utf-8');
      expect(content).toContain('Ignis Flamma');
    });

    it('should add exception to world rule', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['add-exception'],
        arguments: {},
        flags: {
          name: 'Magic System',
          exception: 'Ancient artifacts can cast spells silently',
        },
        raw: '/novel world-rule add-exception --name "Magic System" --exception "..."',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const successMsg = outputLog.find((msg) => msg.includes('Exception added'));
      expect(successMsg).toBeDefined();

      const builder = extension.getWorldRulesBuilder();
      const files = await builder.list();
      const content = await readFile(files[0], 'utf-8');
      expect(content).toContain('Ancient artifacts');
    });

    it('should update rule limitations', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['limitations'],
        arguments: {},
        flags: {
          name: 'Magic System',
          limitations: 'Spells require line of sight to target',
        },
        raw: '/novel world-rule limitations --name "Magic System" --limitations "..."',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const successMsg = outputLog.find((msg) => msg.includes('Limitations updated'));
      expect(successMsg).toBeDefined();

      const builder = extension.getWorldRulesBuilder();
      const files = await builder.list();
      const content = await readFile(files[0], 'utf-8');
      expect(content).toContain('line of sight');
    });

    it('should mark where rule was established', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['established'],
        arguments: {},
        flags: {
          name: 'Magic System',
          chapter: 1,
          scene: 'Ch1.S3',
          quote: 'Magic always requires words of power',
        },
        raw: '/novel world-rule established --name "Magic System" --chapter 1 --scene "Ch1.S3" --quote "..."',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const successMsg = outputLog.find((msg) => msg.includes('Marked establishment point'));
      expect(successMsg).toBeDefined();

      const builder = extension.getWorldRulesBuilder();
      const files = await builder.list();
      const content = await readFile(files[0], 'utf-8');
      expect(content).toContain('chapter: 1');
      expect(content).toContain('scene: Ch1.S3');
      expect(content).toContain('words of power');
    });

    it('should toggle hard rule status', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['toggle-hard'],
        arguments: {},
        flags: {
          name: 'Magic System',
        },
        raw: '/novel world-rule toggle-hard --name "Magic System"',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const successMsg = outputLog.find((msg) => msg.includes('Toggled hard rule status'));
      expect(successMsg).toBeDefined();

      const builder = extension.getWorldRulesBuilder();
      const files = await builder.list();
      const content = await readFile(files[0], 'utf-8');
      expect(content).toContain('is_hard_rule: false');
    });
  });

  describe('World Rule Details Workflow', () => {
    beforeEach(async () => {
      const builder = extension.getWorldRulesBuilder();
      await builder.create({
        name: 'Time Travel',
        category: 'physics',
        description: 'Time travel is possible but has strict limitations',
        limitations: 'Cannot change past events, only observe',
        is_hard_rule: true,
      });
    });

    it('should show detailed rule information', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['show'],
        arguments: {},
        flags: {
          name: 'Time Travel',
        },
        raw: '/novel world-rule show --name "Time Travel"',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const output = outputLog.join('\n');
      expect(output).toContain('Time Travel');
      expect(output).toContain('physics');
      expect(output).toContain('Cannot change past events');
    });

    it('should show all details with --all flag', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['show'],
        arguments: {},
        flags: {
          name: 'Time Travel',
          all: true,
        },
        raw: '/novel world-rule show --name "Time Travel" --all',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const output = outputLog.join('\n');
      expect(output).toContain('Time Travel');
      expect(output).toContain('Hard Rule');
    });
  });

  describe('World Rule Statistics Workflow', () => {
    beforeEach(async () => {
      const builder = extension.getWorldRulesBuilder();

      await builder.create({
        name: 'Fire Magic',
        category: 'magic',
        description: 'Fire spells',
        is_hard_rule: true,
      });

      await builder.create({
        name: 'Water Magic',
        category: 'magic',
        description: 'Water spells',
        is_hard_rule: true,
      });

      await builder.create({
        name: 'Airships',
        category: 'technology',
        description: 'Flying vehicles',
        is_hard_rule: false,
      });

      // Sync all rules to database
      const sync = extension.getWorldRulesSync();
      const worldRulesDir = join(testProjectPath, 'world-rules');
      await sync.syncAllFromDirectory(worldRulesDir);
    });

    it('should show world rule statistics', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['stats'],
        arguments: {},
        flags: {},
        raw: '/novel world-rule stats',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const output = outputLog.join('\n');
      expect(output).toContain('Statistics');
      expect(output).toContain('Total');
      expect(output).toContain('3'); // Total rules
    });
  });

  describe('World Rule Search Workflow', () => {
    beforeEach(async () => {
      const builder = extension.getWorldRulesBuilder();

      await builder.create({
        name: 'Fire Magic',
        category: 'magic',
        description: 'Control flames and heat',
        is_hard_rule: true,
      });

      await builder.create({
        name: 'Ice Magic',
        category: 'magic',
        description: 'Control ice and cold',
        is_hard_rule: true,
      });

      await builder.create({
        name: 'Steam Engines',
        category: 'technology',
        description: 'Powered by coal and fire',
        is_hard_rule: false,
      });

      // Sync all rules to database
      const sync = extension.getWorldRulesSync();
      const worldRulesDir = join(testProjectPath, 'world-rules');
      await sync.syncAllFromDirectory(worldRulesDir);
    });

    it('should search rules by keyword', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['search'],
        arguments: {},
        flags: {
          keyword: 'fire',
        },
        raw: '/novel world-rule search --keyword fire',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const output = outputLog.join('\n');
      expect(output).toContain('Fire Magic');
      expect(output).toContain('Steam Engines'); // Contains "fire" in description
      expect(output).not.toContain('Ice Magic');
    });

    it('should handle no search results', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['search'],
        arguments: {},
        flags: {
          keyword: 'nonexistent',
        },
        raw: '/novel world-rule search --keyword nonexistent',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const output = outputLog.join('\n');
      expect(output).toContain('No rules found matching');
    });
  });

  describe('World Rule Sync Workflow', () => {
    beforeEach(async () => {
      const builder = extension.getWorldRulesBuilder();
      await builder.create({
        name: 'Gravity',
        category: 'physics',
        description: 'Gravity works normally',
        is_hard_rule: true,
      });
    });

    it('should sync single rule to database', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['sync'],
        arguments: {},
        flags: {
          name: 'Gravity',
        },
        raw: '/novel world-rule sync --name Gravity',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const successMsg = outputLog.find((msg) => msg.includes('Synced'));
      expect(successMsg).toBeDefined();

      // Verify in database
      const worldRulesSync = extension.getWorldRulesSync();
      const rules = await worldRulesSync.getWorldRules();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some((r: any) => r.rule_name === 'Gravity')).toBe(true);
    });

    it('should sync all rules to database', async () => {
      // Create another rule
      const builder = extension.getWorldRulesBuilder();
      await builder.create({
        name: 'Thermodynamics',
        category: 'physics',
        description: 'Energy is conserved',
        is_hard_rule: true,
      });

      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['sync'],
        arguments: {},
        flags: {
          all: true,
        },
        raw: '/novel world-rule sync --all',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const successMsg = outputLog.find((msg) => msg.includes('Synced'));
      expect(successMsg).toBeDefined();

      // Verify in database
      const worldRulesSync = extension.getWorldRulesSync();
      const rules = await worldRulesSync.getWorldRules();
      expect(rules.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('World Rule Error Handling', () => {
    it('should handle non-existent rule gracefully', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['show'],
        arguments: {},
        flags: {
          name: 'Nonexistent Rule',
        },
        raw: '/novel world-rule show --name "Nonexistent Rule"',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const errorMsg = outputLog.find((msg) => msg.includes('ERROR') || msg.includes('not found'));
      expect(errorMsg).toBeDefined();
    });

    it('should handle missing required flags', async () => {
      const args: ParsedArgs = {
        command: 'world-rule',
        positional: ['add-example'],
        arguments: {},
        flags: {
          // Missing name and example
        },
        raw: '/novel world-rule add-example',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);

      const errorMsg = outputLog.find((msg) => msg.includes('ERROR') || msg.includes('required'));
      expect(errorMsg).toBeDefined();
    });
  });

  describe('World Rule Complete Workflow', () => {
    it('should support complete rule lifecycle', async () => {
      // 1. Create rule
      let args: ParsedArgs = {
        command: 'world-rule',
        positional: ['create'],
        arguments: {},
        flags: {
          name: 'Teleportation',
          category: 'magic',
          description: 'Instant travel between locations',
          'hard-rule': true,
        },
        raw: '/novel world-rule create --name Teleportation --category magic --description "..." --hard-rule',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);
      expect(outputLog.some(msg => msg.includes('World rule created'))).toBe(true);
      outputLog = [];

      // 2. Add limitations
      args = {
        command: 'world-rule',
        positional: ['limitations'],
        arguments: {},
        flags: {
          name: 'Teleportation',
          limitations: 'Requires line of sight to destination',
        },
        raw: '/novel world-rule limitations --name Teleportation --limitations "..."',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);
      expect(outputLog.some(msg => msg.includes('Limitations updated'))).toBe(true);
      outputLog = [];

      // 3. Add example
      args = {
        command: 'world-rule',
        positional: ['add-example'],
        arguments: {},
        flags: {
          name: 'Teleportation',
          example: 'The mage vanished and reappeared across the room',
        },
        raw: '/novel world-rule add-example --name Teleportation --example "..."',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);
      expect(outputLog.some(msg => msg.includes('Example added'))).toBe(true);
      outputLog = [];

      // 4. Add exception
      args = {
        command: 'world-rule',
        positional: ['add-exception'],
        arguments: {},
        flags: {
          name: 'Teleportation',
          exception: 'Archmages can teleport to familiar locations without line of sight',
        },
        raw: '/novel world-rule add-exception --name Teleportation --exception "..."',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);
      expect(outputLog.some(msg => msg.includes('Exception added'))).toBe(true);
      outputLog = [];

      // 5. Mark established
      args = {
        command: 'world-rule',
        positional: ['established'],
        arguments: {},
        flags: {
          name: 'Teleportation',
          chapter: 2,
          scene: 'Ch2.S1',
          quote: 'Teleportation is the rarest of magics',
        },
        raw: '/novel world-rule established --name Teleportation --chapter 2 --scene Ch2.S1 --quote "..."',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);
      expect(outputLog.some(msg => msg.includes('Marked establishment point'))).toBe(true);
      outputLog = [];

      // 6. View details
      args = {
        command: 'world-rule',
        positional: ['show'],
        arguments: {},
        flags: {
          name: 'Teleportation',
          all: true,
        },
        raw: '/novel world-rule show --name Teleportation --all',
      };

      await handleWorldRuleCommand(args, testProjectPath, mockOutput, extension);
      const output = outputLog.join('\n');
      expect(output).toContain('Teleportation');
      expect(output).toContain('line of sight');
      expect(output).toContain('Archmages');
    });
  });
});
