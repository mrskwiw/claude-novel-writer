/**
 * Plot Thread Command Handlers
 * Handles plot thread management commands
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import { NovelWriterExtension } from '../../index.js';
import type { PlotThreadBuilder } from '../../builders/plot-thread-builder.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile, unlink, writeFile } from 'fs/promises';
import YAML from 'yaml';
import type { PlotYAML } from '../../types/novel.js';

// ─── DB row types ─────────────────────────────────────────────────────────────

interface PlotThreadRow {
  id: number;
  thread_name: string;
  thread_type: string;
  description: string | null;
  status: string;
  priority: number;
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

export async function handlePlotCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'create':
      await handlePlotCreate(args, projectPath, output, injectedExtension);
      break;
    case 'list':
      await handlePlotList(args, projectPath, output, injectedExtension);
      break;
    case 'show':
      await handlePlotShow(args, projectPath, output, injectedExtension);
      break;
    case 'beat':
      await handlePlotBeat(args, projectPath, output, injectedExtension);
      break;
    case 'resolve':
      await handlePlotResolve(args, projectPath, output, injectedExtension);
      break;
    case 'sync':
      await handlePlotSync(args, projectPath, output, injectedExtension);
      break;
    case 'check':
      await handlePlotCheck(args, projectPath, output, injectedExtension);
      break;
    case 'stats':
      await handlePlotStats(args, projectPath, output, injectedExtension);
      break;
    default:
      output.error('Unknown plot subcommand. Use: create, list, show, beat, resolve, sync, check, stats');
  }
}

/**
 * Handle plot create command
 */
async function handlePlotCreate(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getPlotThreadBuilder();

    const name = args.flags.name as string | undefined;
    const type = args.flags.type as 'main' | 'subplot' | 'character' | 'theme' | undefined;
    const description = args.flags.description as string | undefined;
    const priorityRaw = args.flags.priority;
    const priority = priorityRaw ? Number(priorityRaw) : 5;
    const status = args.flags.status as 'planned' | 'active' | 'resolved' | 'abandoned' | undefined;

    if (!name) {
      output.error('Plot thread name required. Use --name <name>');
      return;
    }

    if (!type) {
      output.error('Plot thread type required. Use --type <main|subplot|character|theme>');
      return;
    }

    if (!description) {
      output.error('Plot thread description required. Use --description "text"');
      return;
    }

    const plotData: PlotYAML = {
      name,
      type,
      status: status || 'planned',
      priority,
      description,
    };

    // Validate
    const errors = builder.validate(plotData);
    if (errors.length > 0) {
      output.error('Validation errors:');
      errors.forEach((err: string) => output.error(`  - ${err}`));
      return;
    }

    // Create plot thread file
    const filePath = await builder.create(plotData);

    output.success(`Plot thread created: ${filePath}`);
    output.info(`Name: ${name}`);
    output.info(`Type: ${type}`);
    output.info(`Priority: ${plotData.priority}`);
    output.info(`Status: ${plotData.status}`);

    // Auto-sync to database if initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      if (!extension.hasProjectId()) {
        await loadProjectId(extension, projectPath);
      }
      const plotSync = extension.getPlotThreadSync();
      await plotSync.syncPlotThreadFile(filePath);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to create plot thread: ${(error as Error).message}`);
  }
}

/**
 * Handle plot list command
 */
async function handlePlotList(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getPlotThreadBuilder();

    const plotFiles = await builder.list();

    if (plotFiles.length === 0) {
      output.info('No plot threads found');
      output.dim('Create your first plot thread with: /novel plot create');
      return;
    }

    const unresolvedOnly = args.flags.unresolved as boolean | undefined;

    output.info('=== Plot Threads ===');
    output.newline();

    // Load and display each plot thread
    for (const filePath of plotFiles) {
      const content = await readFile(filePath, 'utf-8');
      const plot = YAML.parse(content) as PlotYAML;

      // Skip if filtering for unresolved
      if (unresolvedOnly && (plot.status === 'resolved' || plot.status === 'abandoned')) {
        continue;
      }

      const statusEmoji = getStatusEmoji(plot.status);
      const priorityIndicator = plot.priority >= 7 ? '🔥' : plot.priority >= 4 ? '⚠️' : '';

      output.success(`${statusEmoji} ${plot.name} ${priorityIndicator}`);
      output.dim(`  Type: ${plot.type} | Status: ${plot.status} | Priority: ${plot.priority}/10`);

      if (plot.description && plot.description.length > 80) {
        output.dim(`  ${plot.description.substring(0, 80)}...`);
      } else if (plot.description) {
        output.dim(`  ${plot.description}`);
      }

      if (plot.beats && plot.beats.length > 0) {
        output.dim(`  Beats: ${plot.beats.length}`);
      }

      output.newline();
    }

    output.info(`Total: ${plotFiles.length} plot threads`);
  } catch (error) {
    output.error(`Failed to list plot threads: ${(error as Error).message}`);
  }
}

/**
 * Handle plot show command
 */
async function handlePlotShow(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const name = args.flags.name as string | undefined;
    const showAll = args.flags.all as boolean | undefined;

    if (!name) {
      output.error('Plot thread name required. Use --name <name>');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getPlotThreadBuilder();

    // Find plot thread file
    const plotFile = await findPlotFile(name, builder);
    if (!plotFile) {
      output.error(`Plot thread not found: ${name}`);
      return;
    }

    // Load plot thread
    const content = await readFile(plotFile, 'utf-8');
    const plot = YAML.parse(content) as PlotYAML;

    // Display plot thread details
    const statusEmoji = getStatusEmoji(plot.status);
    output.info(`=== ${statusEmoji} ${plot.name} ===`);
    output.newline();

    output.success('Basic Information:');
    output.info(`  Type: ${plot.type}`);
    output.info(`  Status: ${plot.status}`);
    output.info(`  Priority: ${plot.priority}/10`);
    output.newline();

    if (plot.description) {
      output.success('Description:');
      output.dim(`  ${plot.description}`);
      output.newline();
    }

    if (plot.beats && plot.beats.length > 0) {
      output.success('Plot Beats:');
      plot.beats.forEach((beat, idx) => {
        const beatTypeEmoji = getBeatTypeEmoji(beat.type);
        output.info(`  ${idx + 1}. ${beatTypeEmoji} ${beat.type.toUpperCase()}: ${beat.scene}`);
        output.dim(`     ${beat.description}`);
      });
      output.newline();
    }

    if (showAll) {
      if (plot.characters && plot.characters.length > 0) {
        output.success('Characters:');
        plot.characters.forEach(char => {
          output.info(`  - ${char.name}: ${char.role}`);
          if (char.arc) {
            output.dim(`    Arc: ${char.arc}`);
          }
        });
        output.newline();
      }

      if (plot.themes && plot.themes.length > 0) {
        output.success('Themes:');
        plot.themes.forEach(theme => {
          output.dim(`  - ${theme}`);
        });
        output.newline();
      }

      if (plot.dependencies && plot.dependencies.length > 0) {
        output.success('Dependencies:');
        plot.dependencies.forEach(dep => {
          output.dim(`  - ${dep}`);
        });
        output.newline();
      }

      if (plot.notes) {
        output.success('Notes:');
        output.dim(`  ${plot.notes}`);
        output.newline();
      }
    } else {
      output.dim('Use --all to show complete details');
    }
  } catch (error) {
    output.error(`Failed to show plot thread: ${(error as Error).message}`);
  }
}

/**
 * Handle plot beat command
 */
async function handlePlotBeat(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const name = args.flags.name as string | undefined;
    const scene = args.flags.scene as string | undefined;
    const beatType = args.flags['beat-type'] as 'setup' | 'development' | 'climax' | 'resolution' | undefined;
    const beatDescription = args.flags['beat-description'] as string | undefined;

    if (!name) {
      output.error('Plot thread name required. Use --name <name>');
      return;
    }

    if (!scene) {
      output.error('Scene reference required. Use --scene <reference>');
      return;
    }

    if (!beatType) {
      output.error('Beat type required. Use --beat-type <setup|development|climax|resolution>');
      return;
    }

    if (!beatDescription) {
      output.error('Beat description required. Use --beat-description "text"');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getPlotThreadBuilder();

    // Find plot thread file
    const plotFile = await findPlotFile(name, builder);
    if (!plotFile) {
      output.error(`Plot thread not found: ${name}`);
      return;
    }

    // Add beat
    await builder.addBeat(plotFile, {
      scene,
      description: beatDescription,
      type: beatType,
    });

    output.success(`Beat added to plot thread: ${name}`);
    output.info(`Scene: ${scene}`);
    output.info(`Type: ${beatType}`);

    // Auto-sync to database if initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      if (!extension.hasProjectId()) {
        await loadProjectId(extension, projectPath);
      }
      const plotSync = extension.getPlotThreadSync();
      await plotSync.syncPlotThreadFile(plotFile);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to add beat: ${(error as Error).message}`);
  }
}

/**
 * Handle plot resolve command
 */
async function handlePlotResolve(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const name = args.flags.name as string | undefined;

    if (!name) {
      output.error('Plot thread name required. Use --name <name>');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getPlotThreadBuilder();

    // Find plot thread file
    const plotFile = await findPlotFile(name, builder);
    if (!plotFile) {
      output.error(`Plot thread not found: ${name}`);
      return;
    }

    // Update status to resolved
    await builder.updateStatus(plotFile, 'resolved');

    output.success(`Plot thread marked as resolved: ${name}`);

    // Auto-sync to database if initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      if (!extension.hasProjectId()) {
        await loadProjectId(extension, projectPath);
      }
      const plotSync = extension.getPlotThreadSync();
      await plotSync.syncPlotThreadFile(plotFile);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to resolve plot thread: ${(error as Error).message}`);
  }
}

/**
 * Handle plot sync command
 */
async function handlePlotSync(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    // Check if project initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const name = args.flags.name as string | undefined;
    const extension = injectedExtension || new NovelWriterExtension(projectPath);

    if (!extension.hasProjectId()) {
      await loadProjectId(extension, projectPath);
    }

    const plotSync = extension.getPlotThreadSync();
    const builder = extension.getPlotThreadBuilder();

    if (name) {
      // Sync single plot thread
      const plotFile = await findPlotFile(name, builder);
      if (!plotFile) {
        output.error(`Plot thread not found: ${name}`);
        return;
      }

      await plotSync.syncPlotThreadFile(plotFile);
      output.success(`Plot thread synced: ${name}`);
    } else {
      // Sync all plot threads
      const plotFiles = await builder.list();

      if (plotFiles.length === 0) {
        output.info('No plot threads to sync');
        return;
      }

      for (const file of plotFiles) {
        await plotSync.syncPlotThreadFile(file);
      }

      output.success(`Synced ${plotFiles.length} plot threads to database`);
    }
  } catch (error) {
    output.error(`Failed to sync plot threads: ${(error as Error).message}`);
  }
}

/**
 * Handle plot check command
 */
async function handlePlotCheck(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    // Check if project initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);

    if (!extension.hasProjectId()) {
      await loadProjectId(extension, projectPath);
    }

    const plotSync = extension.getPlotThreadSync();

    // Get unresolved threads
    const unresolved = await plotSync.getUnresolvedThreads();

    if (unresolved.length === 0) {
      output.success('✅ All plot threads are resolved!');
      return;
    }

    output.warning(`⚠️  ${unresolved.length} unresolved plot thread${unresolved.length !== 1 ? 's' : ''} found`);
    output.newline();

    // Get high priority unresolved
    const highPriority = (await plotSync.getHighPriorityUnresolved()) as unknown as PlotThreadRow[];

    if (highPriority.length > 0) {
      output.error(`🔥 High Priority (${highPriority.length}):`);
      highPriority.forEach((thread) => {
        output.info(`  - ${thread.thread_name} (${thread.thread_type})`);
        output.dim(`    Priority: ${thread.priority}/10 | Status: ${thread.status}`);
        if (thread.description && thread.description.length > 60) {
          output.dim(`    ${thread.description.substring(0, 60)}...`);
        } else if (thread.description) {
          output.dim(`    ${thread.description}`);
        }
      });
      output.newline();
    }

    // Show other unresolved
    const otherUnresolved = (unresolved as unknown as PlotThreadRow[]).filter((t) => t.priority < 7);
    if (otherUnresolved.length > 0) {
      output.info(`📋 Other Unresolved (${otherUnresolved.length}):`);
      otherUnresolved.forEach((thread) => {
        output.dim(`  - ${thread.thread_name} (${thread.thread_type}, priority: ${thread.priority})`);
      });
    }
  } catch (error) {
    output.error(`Failed to check plot threads: ${(error as Error).message}`);
  }
}

/**
 * Handle plot stats command
 */
async function handlePlotStats(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    // Check if project initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);

    if (!extension.hasProjectId()) {
      await loadProjectId(extension, projectPath);
    }

    const plotSync = extension.getPlotThreadSync();

    const stats = await plotSync.getStats();

    output.info('=== 📊 Plot Thread Statistics ===');
    output.newline();

    // Overall stats
    output.info('📈 Overall:');
    output.dim(`  Total threads: ${stats.total}`);
    output.dim(`  Total beats: ${stats.totalBeats}`);
    output.newline();

    // By type
    if (Object.keys(stats.byType).length > 0) {
      output.info('📚 By Type:');
      Object.entries(stats.byType).forEach(([type, count]) => {
        output.dim(`  ${type}: ${count}`);
      });
      output.newline();
    }

    // By status
    if (Object.keys(stats.byStatus).length > 0) {
      output.info('📊 By Status:');
      Object.entries(stats.byStatus).forEach(([status, count]) => {
        const emoji = getStatusEmoji(status);
        output.dim(`  ${emoji} ${status}: ${count}`);
      });
      output.newline();
    }

    // Unresolved
    if (stats.unresolved > 0) {
      output.warning(`⚠️  Unresolved threads: ${stats.unresolved}`);
      if (stats.highPriorityUnresolved > 0) {
        output.error(`  🔥 High priority: ${stats.highPriorityUnresolved}`);
      }
    } else {
      output.success('✅ All plot threads resolved!');
    }
  } catch (error) {
    output.error(`Failed to get plot stats: ${(error as Error).message}`);
  }
}

/**
 * Helper: Find plot thread file by name
 */
async function findPlotFile(
  name: string,
  builder: PlotThreadBuilder
): Promise<string | null> {
  const files = await builder.list();

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const plot = YAML.parse(content) as PlotYAML;

    if (plot.name.toLowerCase() === name.toLowerCase()) {
      return file;
    }
  }

  return null;
}

/**
 * Get status emoji
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'planned': return '📝';
    case 'active': return '▶️';
    case 'resolved': return '✅';
    case 'abandoned': return '❌';
    default: return '❓';
  }
}

/**
 * Get beat type emoji
 */
function getBeatTypeEmoji(type: string): string {
  switch (type) {
    case 'setup': return '🎬';
    case 'development': return '📈';
    case 'climax': return '💥';
    case 'resolution': return '🎯';
    default: return '•';
  }
}
