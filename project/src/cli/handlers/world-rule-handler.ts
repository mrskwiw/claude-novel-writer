/**
 * World Rule CLI Handlers
 */

import { join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import YAML from 'yaml';
import { NovelWriterExtension } from '../../index.js';
import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { WorldRuleYAML } from '../../types/novel.js';
import type { WorldRulesBuilder } from '../../builders/world-rules-builder.js';

// ─── DB row types ─────────────────────────────────────────────────────────────

interface WorldRuleRow {
  id: number;
  rule_name: string;
  rule_category: string;
  description: string;
  limitations: string | null;
  is_hard_rule: number;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper to load and set project ID for database operations
 */
async function loadProjectId(
  extension: NovelWriterExtension,
  _projectPath: string
): Promise<void> {
  const mcpClient = (extension as any).mcpClient;
  const result = await mcpClient.readQuery(
    'SELECT id FROM projects ORDER BY id LIMIT 1',
    []
  );

  if (result.length === 0) {
    throw new Error('Project not found in database. Run `novel-writer init` first.');
  }

  extension.setProjectId(result[0].id);
}

export async function handleWorldRuleCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'create':
      await handleWorldRuleCreate(args, projectPath, output, injectedExtension);
      break;
    case 'list':
      await handleWorldRuleList(args, projectPath, output, injectedExtension);
      break;
    case 'show':
      await handleWorldRuleShow(args, projectPath, output, injectedExtension);
      break;
    case 'add-example':
      await handleWorldRuleAddExample(args, projectPath, output, injectedExtension);
      break;
    case 'add-exception':
      await handleWorldRuleAddException(args, projectPath, output, injectedExtension);
      break;
    case 'limitations':
      await handleWorldRuleLimitations(args, projectPath, output, injectedExtension);
      break;
    case 'established':
      await handleWorldRuleEstablished(args, projectPath, output, injectedExtension);
      break;
    case 'toggle-hard':
      await handleWorldRuleToggleHard(args, projectPath, output, injectedExtension);
      break;
    case 'sync':
      await handleWorldRuleSync(args, projectPath, output, injectedExtension);
      break;
    case 'stats':
      await handleWorldRuleStats(args, projectPath, output, injectedExtension);
      break;
    case 'search':
      await handleWorldRuleSearch(args, projectPath, output, injectedExtension);
      break;
    default:
      output.error(`Unknown world-rule subcommand: ${subcommand}`);
      output.info('Available commands: create, list, show, add-example, add-exception, limitations, established, toggle-hard, sync, stats, search');
  }
}

export async function handleWorldRuleCreate(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const name = args.flags['name'] as string;
  const category = args.flags['category'] as string;
  const description = args.flags['description'] as string;
  const limitations = args.flags['limitations'] as string;
  const hardRule = args.flags['hard-rule'] as boolean;

  if (!name) {
    output.error('World rule name required (--name)');
    return;
  }

  if (!category) {
    output.error('Category required (--category: magic, technology, physics, social, political)');
    return;
  }

  if (!description) {
    output.error('Description required (--description)');
    return;
  }

  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getWorldRulesBuilder();

    const ruleData: WorldRuleYAML = {
      name,
      category: category as any,
      description,
      limitations,
      is_hard_rule: hardRule !== undefined ? hardRule : true,
    };

    const errors = builder.validate(ruleData);
    if (errors.length > 0) {
      output.error('Validation errors:');
      errors.forEach((err: string) => output.error(`  - ${err}`));
      return;
    }

    const filePath = await builder.create(ruleData);

    output.success(`World rule created: ${filePath}`);
    output.info(`Name: ${name}`);
    output.info(`Category: ${category}`);
    output.info(`Hard Rule: ${ruleData.is_hard_rule}`);

    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      const worldRulesSync = extension.getWorldRulesSync();
      await worldRulesSync.syncWorldRuleFile(filePath);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to create world rule: ${(error as Error).message}`);
  }
}

async function handleWorldRuleList(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const category = args.flags['category'] as string;

  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);

    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      if (!extension.hasProjectId()) {
        await loadProjectId(extension, projectPath);
      }
      const worldRulesSync = extension.getWorldRulesSync();

      const rules = await worldRulesSync.getWorldRules(category);

      if (rules.length === 0) {
        output.info('No world rules found');
        return;
      }

      output.success(`Found ${rules.length} world rules:`);
      output.newline();

      (rules as unknown as WorldRuleRow[]).forEach((rule) => {
        const hardIndicator = rule.is_hard_rule ? '🔒' : '🔓';
        const categoryEmoji = getCategoryEmoji(rule.rule_category);

        output.info(`${hardIndicator} ${categoryEmoji} ${rule.rule_name}`);
        output.dim(`  Category: ${rule.rule_category}`);

        if (rule.description.length > 60) {
          output.dim(`  ${rule.description.substring(0, 60)}...`);
        } else {
          output.dim(`  ${rule.description}`);
        }

        if (rule.limitations) {
          output.dim(`  Limitations: ${rule.limitations.substring(0, 50)}...`);
        }

        output.newline();
      });
    } else {
      const builder = extension.getWorldRulesBuilder();
      const files = await builder.list();

      if (files.length === 0) {
        output.info('No world rules found');
        return;
      }

      output.success(`Found ${files.length} world rule files`);
    }
  } catch (error) {
    output.error(`Failed to list world rules: ${(error as Error).message}`);
  }
}

async function handleWorldRuleShow(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const name = args.flags['name'] as string;

  if (!name) {
    output.error('World rule name required (--name)');
    return;
  }

  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getWorldRulesBuilder();

    const ruleFile = await findRuleFile(name, builder);
    if (!ruleFile) {
      output.error(`World rule not found: ${name}`);
      return;
    }

    const content = await readFile(ruleFile, 'utf-8');
    const rule = YAML.parse(content) as WorldRuleYAML;

    output.success(`World Rule: ${rule.name}`);
    output.newline();
    output.info(`Category: ${getCategoryEmoji(rule.category)} ${rule.category}`);
    output.info(`Hard Rule: ${rule.is_hard_rule ? '🔒 Yes (must never violate)' : '🔓 No (flexible)'}`);
    output.newline();
    output.info('Description:');
    output.dim(`  ${rule.description}`);
    output.newline();

    if (rule.limitations) {
      output.info('Limitations:');
      output.dim(`  ${rule.limitations}`);
      output.newline();
    }

    if (rule.examples && rule.examples.length > 0) {
      output.info(`Examples (${rule.examples.length}):`);
      rule.examples.forEach((example: string, idx: number) => {
        output.dim(`  ${idx + 1}. ${example}`);
      });
      output.newline();
    }

    if (rule.exceptions && rule.exceptions.length > 0) {
      output.info(`Exceptions (${rule.exceptions.length}):`);
      rule.exceptions.forEach((exception: string, idx: number) => {
        output.dim(`  ${idx + 1}. ${exception}`);
      });
      output.newline();
    }

    if (rule.established_in) {
      output.info('Established:');
      if (rule.established_in.chapter) {
        output.dim(`  Chapter: ${rule.established_in.chapter}`);
      }
      if (rule.established_in.scene) {
        output.dim(`  Scene: ${rule.established_in.scene}`);
      }
      if (rule.established_in.quote) {
        output.dim(`  Quote: "${rule.established_in.quote}"`);
      }
      output.newline();
    }

    if (rule.notes) {
      output.info('Notes:');
      output.dim(`  ${rule.notes}`);
    }
  } catch (error) {
    output.error(`Failed to show world rule: ${(error as Error).message}`);
  }
}

async function handleWorldRuleAddExample(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const name = args.flags['name'] as string;
  const example = args.flags['example'] as string;

  if (!name || !example) {
    output.error('Rule name and example required (--name, --example)');
    return;
  }

  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getWorldRulesBuilder();

    const ruleFile = await findRuleFile(name, builder);
    if (!ruleFile) {
      output.error(`World rule not found: ${name}`);
      return;
    }

    await builder.addExample(ruleFile, example);
    output.success(`Example added to rule: ${name}`);

    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      if (!extension.hasProjectId()) {
        await loadProjectId(extension, projectPath);
      }
      const worldRulesSync = extension.getWorldRulesSync();
      await worldRulesSync.syncWorldRuleFile(ruleFile);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to add example: ${(error as Error).message}`);
  }
}

async function handleWorldRuleAddException(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const name = args.flags['name'] as string;
  const exception = args.flags['exception'] as string;

  if (!name || !exception) {
    output.error('Rule name and exception required (--name, --exception)');
    return;
  }

  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getWorldRulesBuilder();

    const ruleFile = await findRuleFile(name, builder);
    if (!ruleFile) {
      output.error(`World rule not found: ${name}`);
      return;
    }

    await builder.addException(ruleFile, exception);
    output.success(`Exception added to rule: ${name}`);

    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      if (!extension.hasProjectId()) {
        await loadProjectId(extension, projectPath);
      }
      const worldRulesSync = extension.getWorldRulesSync();
      await worldRulesSync.syncWorldRuleFile(ruleFile);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to add exception: ${(error as Error).message}`);
  }
}

async function handleWorldRuleLimitations(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const name = args.flags['name'] as string;
  const limitations = args.flags['limitations'] as string;

  if (!name || !limitations) {
    output.error('Rule name and limitations required (--name, --limitations)');
    return;
  }

  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getWorldRulesBuilder();

    const ruleFile = await findRuleFile(name, builder);
    if (!ruleFile) {
      output.error(`World rule not found: ${name}`);
      return;
    }

    await builder.updateLimitations(ruleFile, limitations);
    output.success(`Limitations updated for rule: ${name}`);

    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      if (!extension.hasProjectId()) {
        await loadProjectId(extension, projectPath);
      }
      const worldRulesSync = extension.getWorldRulesSync();
      await worldRulesSync.syncWorldRuleFile(ruleFile);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to update limitations: ${(error as Error).message}`);
  }
}

async function handleWorldRuleEstablished(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const name = args.flags['name'] as string;
  const chapter = args.flags['chapter'] as number;
  const scene = args.flags['scene'] as string;
  const quote = args.flags['quote'] as string;

  if (!name) {
    output.error('Rule name required (--name)');
    return;
  }

  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getWorldRulesBuilder();

    const ruleFile = await findRuleFile(name, builder);
    if (!ruleFile) {
      output.error(`World rule not found: ${name}`);
      return;
    }

    await builder.markEstablished(ruleFile, chapter, scene, quote);
    output.success(`Marked establishment point for rule: ${name}`);

    if (chapter) output.info(`Chapter: ${chapter}`);
    if (scene) output.info(`Scene: ${scene}`);
    if (quote) output.info(`Quote: "${quote}"`);

    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      if (!extension.hasProjectId()) {
        await loadProjectId(extension, projectPath);
      }
      const worldRulesSync = extension.getWorldRulesSync();
      await worldRulesSync.syncWorldRuleFile(ruleFile);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to mark established: ${(error as Error).message}`);
  }
}

async function handleWorldRuleToggleHard(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const name = args.flags['name'] as string;

  if (!name) {
    output.error('Rule name required (--name)');
    return;
  }

  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getWorldRulesBuilder();

    const ruleFile = await findRuleFile(name, builder);
    if (!ruleFile) {
      output.error(`World rule not found: ${name}`);
      return;
    }

    const isHardRule = await builder.toggleHardRule(ruleFile);
    output.success(`Toggled hard rule status for: ${name}`);
    output.info(`Now: ${isHardRule ? '🔒 Hard rule (must never violate)' : '🔓 Flexible rule'}`);

    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      if (!extension.hasProjectId()) {
        await loadProjectId(extension, projectPath);
      }
      const worldRulesSync = extension.getWorldRulesSync();
      await worldRulesSync.syncWorldRuleFile(ruleFile);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to toggle hard rule: ${(error as Error).message}`);
  }
}

async function handleWorldRuleSync(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const name = args.flags['name'] as string;
  const all = args.flags['all'] as boolean;

  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const worldRulesSync = extension.getWorldRulesSync();
    const builder = extension.getWorldRulesBuilder();

    if (all) {
      const worldRulesDir = join(projectPath, 'world-rules');
      const synced = await worldRulesSync.syncAllFromDirectory(worldRulesDir);
      output.success(`Synced ${synced} world rules to database`);
    } else if (name) {
      const ruleFile = await findRuleFile(name, builder);
      if (!ruleFile) {
        output.error(`World rule not found: ${name}`);
        return;
      }

      await worldRulesSync.syncWorldRuleFile(ruleFile);
      output.success(`Synced world rule: ${name}`);
    } else {
      output.error('Specify rule name (--name) or use --all');
    }
  } catch (error) {
    output.error(`Failed to sync: ${(error as Error).message}`);
  }
}

async function handleWorldRuleStats(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);

    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      if (!extension.hasProjectId()) {
        await loadProjectId(extension, projectPath);
      }
      const worldRulesSync = extension.getWorldRulesSync();

      const stats = await worldRulesSync.getStats();

      output.success('World Rules Statistics:');
      output.newline();
      output.info(`Total Rules: ${stats.total}`);
      output.info(`Hard Rules: 🔒 ${stats.hardRules}`);
      output.info(`Flexible Rules: 🔓 ${stats.flexibleRules}`);
      output.info(`Established: ${stats.established}`);
      output.newline();
      output.info('By Category:');
      Object.entries(stats.byCategory).forEach(([category, count]) => {
        output.dim(`  ${getCategoryEmoji(category)} ${category}: ${count}`);
      });
    } else {
      const builder = extension.getWorldRulesBuilder();
      const stats = await builder.getStats();

      output.success('World Rules Statistics (from files):');
      output.newline();
      output.info(`Total Rules: ${stats.totalRules}`);
      output.info(`Hard Rules: 🔒 ${stats.hardRules}`);
      output.info(`Flexible Rules: 🔓 ${stats.flexibleRules}`);
      output.info(`With Limitations: ${stats.withLimitations}`);
      output.info(`With Examples: ${stats.withExamples}`);
      output.info(`With Exceptions: ${stats.withExceptions}`);
      output.info(`Established: ${stats.established}`);
      output.newline();
      output.info('By Category:');
      Object.entries(stats.byCategory).forEach(([category, count]) => {
        output.dim(`  ${getCategoryEmoji(category)} ${category}: ${count}`);
      });
    }
  } catch (error) {
    output.error(`Failed to get stats: ${(error as Error).message}`);
  }
}

async function handleWorldRuleSearch(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const keyword = args.flags['keyword'] as string;

  if (!keyword) {
    output.error('Search keyword required (--keyword)');
    return;
  }

  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);

    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      if (!extension.hasProjectId()) {
        await loadProjectId(extension, projectPath);
      }
      const worldRulesSync = extension.getWorldRulesSync();

      const results = await worldRulesSync.searchRules(keyword);

      if (results.length === 0) {
        output.info(`No rules found matching: ${keyword}`);
        return;
      }

      output.success(`Found ${results.length} rules matching: ${keyword}`);
      output.newline();

      (results as unknown as WorldRuleRow[]).forEach((rule) => {
        const hardIndicator = rule.is_hard_rule ? '🔒' : '🔓';
        const categoryEmoji = getCategoryEmoji(rule.rule_category);

        output.info(`${hardIndicator} ${categoryEmoji} ${rule.rule_name}`);
        output.dim(`  Category: ${rule.rule_category}`);
        output.dim(`  ${rule.description.substring(0, 80)}...`);
        output.newline();
      });
    } else {
      output.error('Database not initialized. Run /novel init first.');
    }
  } catch (error) {
    output.error(`Failed to search: ${(error as Error).message}`);
  }
}

async function findRuleFile(name: string, builder: WorldRulesBuilder): Promise<string | null> {
  const files = await builder.list();

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const rule = YAML.parse(content) as WorldRuleYAML;

    if (rule.name.toLowerCase() === name.toLowerCase()) {
      return file;
    }
  }

  return null;
}

function getCategoryEmoji(category: string): string {
  const emojis: Record<string, string> = {
    magic: '✨',
    technology: '⚙️',
    physics: '🔬',
    social: '👥',
    political: '🏛️',
  };
  return emojis[category] || '📋';
}
