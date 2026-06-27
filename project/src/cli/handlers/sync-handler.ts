/**
 * Sync Command Handlers
 * Handles synchronization of YAML files to database (and reverse: DB → file).
 */

import { join } from 'path';
import { existsSync } from 'fs';
import type { ParsedArgs, CommandContext } from '../types.js';

/**
 * Handle: /novel sync all
 */
export async function handleSyncAll(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { extension, output, cwd } = context;

  if (!extension) {
    output.error('Extension not initialized. This is a bug.');
    return;
  }

  output.heading('Syncing All Content');
  output.newline();

  const results: Record<string, { synced: number; failed: number }> = {
    characters: { synced: 0, failed: 0 },
    locations: { synced: 0, failed: 0 },
    plots: { synced: 0, failed: 0 },
    chapters: { synced: 0, failed: 0 },
    timeline: { synced: 0, failed: 0 },
    'world-rules': { synced: 0, failed: 0 },
  };

  // Sync characters
  const charDir = join(cwd, 'characters');
  if (existsSync(charDir)) {
    const charSpinner = output.spinner('Syncing characters...');
    try {
      const sync = extension.getCharacterSync();
      const fs = await import('fs/promises');
      const files = await fs.readdir(charDir);
      const yamlFiles = files.filter(
        (f) => (f.endsWith('.yml') || f.endsWith('.yaml')) && !f.startsWith('_')
      );

      // Pass 1 — records and attributes
      for (const file of yamlFiles) {
        try {
          await sync.syncCharacterFile(join(charDir, file), { skipRelationships: true });
          results.characters.synced++;
        } catch (error) {
          results.characters.failed++;
        }
      }

      // Pass 2 — relationships (all records now exist, forward refs resolve cleanly)
      for (const file of yamlFiles) {
        try { await sync.syncRelationshipsFromFile(join(charDir, file)); } catch { /* non-fatal */ }
      }

      charSpinner.stop(`Characters synced: ${results.characters.synced}${results.characters.failed > 0 ? `, ${results.characters.failed} failed` : ''}`);
    } catch (error: unknown) {
      charSpinner.stop('Failed');
      output.error(`Character sync error: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  // Sync locations
  const locDir = join(cwd, 'locations');
  if (existsSync(locDir)) {
    const locSpinner = output.spinner('Syncing locations...');
    try {
      const sync = extension.getLocationSync();
      const fs = await import('fs/promises');
      const files = await fs.readdir(locDir);
      const yamlFiles = files.filter(
        (f) => (f.endsWith('.yml') || f.endsWith('.yaml')) && !f.startsWith('_')
      );

      for (const file of yamlFiles) {
        try {
          await sync.syncLocationFile(join(locDir, file));
          results.locations.synced++;
        } catch (error) {
          results.locations.failed++;
        }
      }

      locSpinner.stop(`Locations synced: ${results.locations.synced}${results.locations.failed > 0 ? `, ${results.locations.failed} failed` : ''}`);
    } catch (error: unknown) {
      locSpinner.stop('Failed');
      output.error(`Location sync error: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  // Sync plots
  const plotDir = join(cwd, 'plots');
  if (existsSync(plotDir)) {
    const plotSpinner = output.spinner('Syncing plot threads...');
    try {
      const sync = extension.getPlotSync();
      const fs = await import('fs/promises');
      const files = await fs.readdir(plotDir);
      const yamlFiles = files.filter(
        (f) => (f.endsWith('.yml') || f.endsWith('.yaml')) && !f.startsWith('_')
      );

      for (const file of yamlFiles) {
        try {
          await sync.syncPlotFile(join(plotDir, file));
          results.plots.synced++;
        } catch (error) {
          results.plots.failed++;
        }
      }

      plotSpinner.stop(`Plot threads synced: ${results.plots.synced}${results.plots.failed > 0 ? `, ${results.plots.failed} failed` : ''}`);
    } catch (error: unknown) {
      plotSpinner.stop('Failed');
      output.error(`Plot sync error: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  // Sync chapters
  const chapDir = join(cwd, 'chapters');
  if (existsSync(chapDir)) {
    const chapSpinner = output.spinner('Syncing chapters...');
    try {
      const sync = extension.getChapterSync();
      const fs = await import('fs/promises');
      const files = await fs.readdir(chapDir);
      const mdFiles = files.filter((f) => f.endsWith('.md'));

      for (const file of mdFiles) {
        try {
          await sync.syncChapterFile(join(chapDir, file));
          results.chapters.synced++;
        } catch (error) {
          results.chapters.failed++;
        }
      }

      chapSpinner.stop(`Chapters synced: ${results.chapters.synced}${results.chapters.failed > 0 ? `, ${results.chapters.failed} failed` : ''}`);
    } catch (error: unknown) {
      chapSpinner.stop('Failed');
      output.error(`Chapter sync error: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  // Sync timeline
  const timelineDir = join(cwd, 'timeline');
  if (existsSync(timelineDir)) {
    const timelineSpinner = output.spinner('Syncing timeline...');
    try {
      const sync = extension.getTimelineSync();
      const result = await sync.syncAllTimelines();
      results.timeline.synced = result.synced;
      results.timeline.failed = result.errors.length;
      timelineSpinner.stop(`Timeline synced: ${result.synced}${result.errors.length > 0 ? `, ${result.errors.length} failed` : ''}`);
    } catch (error: unknown) {
      timelineSpinner.stop('Failed');
      output.error(`Timeline sync error: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  // Sync world rules
  const worldRulesDir = join(cwd, 'world-rules');
  if (existsSync(worldRulesDir)) {
    const rulesSpinner = output.spinner('Syncing world rules...');
    try {
      const sync = extension.getWorldRulesSync();
      const count = await sync.syncAllFromDirectory(worldRulesDir);
      results['world-rules'].synced = count;
      rulesSpinner.stop(`World rules synced: ${count}`);
    } catch (error: unknown) {
      rulesSpinner.stop('Failed');
      output.error(`World rules sync error: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  // Summary
  output.newline();
  output.success('Sync Complete');
  output.newline();
  output.keyValue({
    'Characters': `${results.characters.synced} synced${results.characters.failed > 0 ? `, ${results.characters.failed} failed` : ''}`,
    'Locations': `${results.locations.synced} synced${results.locations.failed > 0 ? `, ${results.locations.failed} failed` : ''}`,
    'Plot Threads': `${results.plots.synced} synced${results.plots.failed > 0 ? `, ${results.plots.failed} failed` : ''}`,
    'Chapters': `${results.chapters.synced} synced${results.chapters.failed > 0 ? `, ${results.chapters.failed} failed` : ''}`,
    'Timeline': `${results.timeline.synced} synced${results.timeline.failed > 0 ? `, ${results.timeline.failed} failed` : ''}`,
    'World Rules': `${results['world-rules'].synced} synced${results['world-rules'].failed > 0 ? `, ${results['world-rules'].failed} failed` : ''}`,
  });
}

/**
 * Handle: /novel sync characters
 */
export async function handleSyncCharacters(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { extension, output, cwd } = context;

  if (!extension) {
    output.error('Extension not initialized. This is a bug.');
    return;
  }

  const charDir = join(cwd, 'characters');

  if (!existsSync(charDir)) {
    output.error(`Characters directory not found: ${charDir}`);
    output.info('Create characters with: /novel create character');
    return;
  }

  const spinner = output.spinner('Syncing characters to database...');

  try {
    const sync = extension.getCharacterSync();
    const fs = await import('fs/promises');
    const files = await fs.readdir(charDir);
    const yamlFiles = files.filter(
      (f) => (f.endsWith('.yml') || f.endsWith('.yaml')) && !f.startsWith('_')
    );

    if (yamlFiles.length === 0) {
      spinner.stop('No character files found');
      output.info('Create characters with: /novel create character');
      return;
    }

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    // Pass 1 — insert/update records and attributes, skip relationship resolution
    for (const file of yamlFiles) {
      try {
        await sync.syncCharacterFile(join(charDir, file), { skipRelationships: true });
        synced++;
      } catch (error: unknown) {
        failed++;
        errors.push(`${file}: ${(error instanceof Error ? error.message : String(error))}`);
      }
    }

    spinner.stop(`Records synced: ${synced}${failed > 0 ? `, ${failed} failed` : ''}`);

    // Pass 2 — resolve relationships now that all records exist
    const relSpinner = output.spinner('Resolving character relationships...');
    let relFailed = 0;
    for (const file of yamlFiles) {
      try {
        await sync.syncRelationshipsFromFile(join(charDir, file));
      } catch { relFailed++; }
    }
    relSpinner.stop(relFailed > 0 ? `Relationships resolved (${relFailed} failed)` : 'Relationships resolved');

    output.newline();
    output.success(`Synced ${synced} character(s) to database`);

    if (failed > 0) {
      output.newline();
      output.warning(`${failed} file(s) failed:`);
      errors.forEach((err) => output.info(`  • ${err}`));
    }
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Character sync failed: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

/**
 * Handle: /novel sync locations
 */
export async function handleSyncLocations(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { extension, output, cwd } = context;

  if (!extension) {
    output.error('Extension not initialized. This is a bug.');
    return;
  }

  const locDir = join(cwd, 'locations');

  if (!existsSync(locDir)) {
    output.error(`Locations directory not found: ${locDir}`);
    output.info('Create locations with: /novel create location');
    return;
  }

  const spinner = output.spinner('Syncing locations to database...');

  try {
    const sync = extension.getLocationSync();
    const fs = await import('fs/promises');
    const files = await fs.readdir(locDir);
    const yamlFiles = files.filter(
      (f) => (f.endsWith('.yml') || f.endsWith('.yaml')) && !f.startsWith('_')
    );

    if (yamlFiles.length === 0) {
      spinner.stop('No location files found');
      output.info('Create locations with: /novel create location');
      return;
    }

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const file of yamlFiles) {
      try {
        await sync.syncLocationFile(join(locDir, file));
        synced++;
      } catch (error: unknown) {
        failed++;
        errors.push(`${file}: ${(error instanceof Error ? error.message : String(error))}`);
      }
    }

    spinner.stop('Sync complete');
    output.newline();
    output.success(`Synced ${synced} location(s) to database`);

    if (failed > 0) {
      output.newline();
      output.warning(`${failed} file(s) failed:`);
      errors.forEach((err) => output.info(`  • ${err}`));
    }
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Location sync failed: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

/**
 * Handle: /novel sync plots
 */
export async function handleSyncPlots(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { extension, output, cwd } = context;

  if (!extension) {
    output.error('Extension not initialized. This is a bug.');
    return;
  }

  const plotDir = join(cwd, 'plots');

  if (!existsSync(plotDir)) {
    output.error(`Plots directory not found: ${plotDir}`);
    output.info('Create plot threads with: /novel create plot');
    return;
  }

  const spinner = output.spinner('Syncing plot threads to database...');

  try {
    const sync = extension.getPlotSync();
    const fs = await import('fs/promises');
    const files = await fs.readdir(plotDir);
    const yamlFiles = files.filter(
      (f) => (f.endsWith('.yml') || f.endsWith('.yaml')) && !f.startsWith('_')
    );

    if (yamlFiles.length === 0) {
      spinner.stop('No plot thread files found');
      output.info('Create plot threads with: /novel create plot');
      return;
    }

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const file of yamlFiles) {
      try {
        await sync.syncPlotFile(join(plotDir, file));
        synced++;
      } catch (error: unknown) {
        failed++;
        errors.push(`${file}: ${(error instanceof Error ? error.message : String(error))}`);
      }
    }

    spinner.stop('Sync complete');
    output.newline();
    output.success(`Synced ${synced} plot thread(s) to database`);

    if (failed > 0) {
      output.newline();
      output.warning(`${failed} file(s) failed:`);
      errors.forEach((err) => output.info(`  • ${err}`));
    }
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Plot sync failed: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

/**
 * Handle: /novel sync chapters
 */
export async function handleSyncChapters(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { extension, output, cwd } = context;

  if (!extension) {
    output.error('Extension not initialized. This is a bug.');
    return;
  }

  const chapDir = join(cwd, 'chapters');

  if (!existsSync(chapDir)) {
    output.error(`Chapters directory not found: ${chapDir}`);
    output.info('Create chapters with: /novel create chapter');
    return;
  }

  const spinner = output.spinner('Syncing chapters to database...');

  try {
    const sync = extension.getChapterSync();
    const fs = await import('fs/promises');
    const files = await fs.readdir(chapDir);
    const mdFiles = files.filter((f) => f.endsWith('.md'));

    if (mdFiles.length === 0) {
      spinner.stop('No chapter files found');
      output.info('Create chapters with: /novel create chapter');
      return;
    }

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const file of mdFiles) {
      try {
        await sync.syncChapterFile(join(chapDir, file));
        synced++;
      } catch (error: unknown) {
        failed++;
        errors.push(`${file}: ${(error instanceof Error ? error.message : String(error))}`);
      }
    }

    spinner.stop('Sync complete');
    output.newline();
    output.success(`Synced ${synced} chapter(s) to database`);

    if (failed > 0) {
      output.newline();
      output.warning(`${failed} file(s) failed:`);
      errors.forEach((err) => output.info(`  • ${err}`));
    }
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Chapter sync failed: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

/**
 * Handle: /novel sync timeline
 */
export async function handleSyncTimeline(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { extension, output, cwd } = context;

  if (!extension) {
    output.error('Extension not initialized. This is a bug.');
    return;
  }

  const spinner = output.spinner('Syncing timeline files to database...');

  try {
    const sync = extension.getTimelineSync();
    const result = await sync.syncAllTimelines();

    spinner.stop('Sync complete');
    output.newline();
    output.success(`Synced ${result.synced} timeline event(s) to database`);

    if (result.errors.length > 0) {
      output.newline();
      output.warning(`${result.errors.length} file(s) failed:`);
      result.errors.forEach((err) => output.info(`  • ${err}`));
    }
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Timeline sync failed: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

/**
 * Handle: /novel sync world-rules
 */
export async function handleSyncWorldRules(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { extension, output, cwd } = context;

  if (!extension) {
    output.error('Extension not initialized. This is a bug.');
    return;
  }

  const worldRulesDir = join(cwd, 'world-rules');

  if (!existsSync(worldRulesDir)) {
    output.error(`World rules directory not found: ${worldRulesDir}`);
    output.info('Create world rules with: /novel world-rule create');
    return;
  }

  const spinner = output.spinner('Syncing world rules to database...');

  try {
    const sync = extension.getWorldRulesSync();
    const count = await sync.syncAllFromDirectory(worldRulesDir);

    spinner.stop('Sync complete');
    output.newline();
    output.success(`Synced ${count} world rule(s) to database`);
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`World rules sync failed: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

/**
 * Handle: /novel sync --from-db [type]
 *
 * Exports all entities of a given type from the database back to YAML/Markdown files.
 * Supported types: characters, locations, world-rules, plot-threads, chapters.
 */
export async function handleSyncFromDb(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { extension, output, cwd } = context;

  if (!extension) {
    output.error('Extension not initialized. This is a bug.');
    return;
  }

  const entityType = (args.positional[0] ?? 'all') as string;
  const supported = ['characters', 'locations', 'world-rules', 'plot-threads', 'chapters', 'all'];

  if (!supported.includes(entityType)) {
    output.error(`Unknown entity type: ${entityType}. Supported: ${supported.join(', ')}`);
    return;
  }

  // Auto-snapshot before overwriting files with DB data
  const snapshotManager = extension.getSnapshotManager();
  const snapLabel = `auto-before-from-db-${Date.now()}`;
  try {
    await snapshotManager.create(snapLabel);
    output.info(`[Auto-snapshot] Created "${snapLabel}" — files backed up`);
  } catch (e) {
    // Don't block the sync if chapters dir doesn't exist yet
  }

  output.heading(`Reverse Sync: DB → Files (${entityType})`);
  output.newline();

  const runExport = async (label: string, action: () => Promise<string[]>) => {
    const spinner = output.spinner(`Exporting ${label}...`);
    try {
      const paths = await action();
      spinner.stop(`${label}: ${paths.length} exported`);
      paths.forEach((p) => output.info(`  • ${p}`));
    } catch (err: any) {
      spinner.stop('Failed');
      output.error(`${label} export error: ${err.message}`);
    }
  };

  const exportCharacters = async () => {
    const sync = extension.getCharacterSync();
    const client = extension['mcpClient'];
    const projectId = extension['projectId'];
    const rows = await client.readQuery('SELECT id FROM characters WHERE project_id = ?', [projectId]);
    const paths: string[] = [];
    for (const row of rows) {
      paths.push(await sync.exportToYAML(String(row.id)));
    }
    return paths;
  };

  const exportLocations = async () => {
    const sync = extension.getLocationSync();
    const client = extension['mcpClient'];
    const projectId = extension['projectId'];
    const rows = await client.readQuery('SELECT id FROM locations WHERE project_id = ?', [projectId]);
    const paths: string[] = [];
    for (const row of rows) {
      paths.push(await sync.exportToYAML(String(row.id)));
    }
    return paths;
  };

  const exportWorldRules = async () => {
    const sync = extension.getWorldRulesSync();
    const client = extension['mcpClient'];
    const projectId = extension['projectId'];
    const rows = await client.readQuery('SELECT id FROM world_rules WHERE project_id = ?', [projectId]);
    const paths: string[] = [];
    for (const row of rows) {
      paths.push(await sync.exportToYAML(String(row.id)));
    }
    return paths;
  };

  const exportPlotThreads = async () => {
    const sync = extension.getPlotThreadSync();
    const client = extension['mcpClient'];
    const projectId = extension['projectId'];
    const rows = await client.readQuery('SELECT id FROM plot_threads WHERE project_id = ?', [projectId]);
    const paths: string[] = [];
    for (const row of rows) {
      paths.push(await sync.exportToYAML(String(row.id)));
    }
    return paths;
  };

  const exportChapters = async () => {
    const sync = extension.getChapterSync();
    const client = extension['mcpClient'];
    const projectId = extension['projectId'];
    const rows = await client.readQuery('SELECT id FROM chapters WHERE project_id = ?', [projectId]);
    const paths: string[] = [];
    for (const row of rows) {
      paths.push(await sync.exportToFile(row.id as number));
    }
    return paths;
  };

  if (entityType === 'characters' || entityType === 'all') {
    await runExport('Characters', exportCharacters);
  }
  if (entityType === 'locations' || entityType === 'all') {
    await runExport('Locations', exportLocations);
  }
  if (entityType === 'world-rules' || entityType === 'all') {
    await runExport('World Rules', exportWorldRules);
  }
  if (entityType === 'plot-threads' || entityType === 'all') {
    await runExport('Plot Threads', exportPlotThreads);
  }
  if (entityType === 'chapters' || entityType === 'all') {
    await runExport('Chapters', exportChapters);
  }

  output.newline();
  output.success('Reverse sync complete');
}
