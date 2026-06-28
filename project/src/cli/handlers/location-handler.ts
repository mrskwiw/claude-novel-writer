/**
 * Location Command Handlers
 * Handles location management commands
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import { NovelWriterExtension } from '../../index.js';
import type { LocationBuilder } from '../../builders/location-builder.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile, unlink, writeFile } from 'fs/promises';
import YAML from 'yaml';
import type { LocationYAML } from '../../types/novel.js';

export async function handleLocationCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'create':
      await handleLocationCreate(args, projectPath, output);
      break;
    case 'list':
      await handleLocationList(args, projectPath, output);
      break;
    case 'show':
      await handleLocationShow(args, projectPath, output);
      break;
    case 'edit':
      await handleLocationEdit(args, projectPath, output);
      break;
    case 'delete':
      await handleLocationDelete(args, projectPath, output);
      break;
    case 'sync':
      await handleLocationSync(args, projectPath, output);
      break;
    case 'scenes':
      await handleLocationScenes(args, projectPath, output);
      break;
    default:
      output.error('Unknown location subcommand. Use: create, list, show, edit, delete, sync, scenes');
  }
}

/**
 * Handle location create command
 */
async function handleLocationCreate(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const builder = extension.getLocationBuilder();

    const name = args.flags.name as string | undefined;
    const description = args.flags.description as string | undefined;
    const type = args.flags.type as string | undefined;
    const parent = args.flags.parent as string | undefined;

    if (!name) {
      output.error('Location name required. Use --name <name>');
      return;
    }

    if (!description) {
      output.error('Location description required. Use --description "text"');
      return;
    }

    const locationData: Partial<LocationYAML> = {
      name,
      description,
      type,
      parentLocation: parent,
    };

    // Validate
    const errors = builder.validate(locationData as LocationYAML);
    if (errors.length > 0) {
      output.error('Validation errors:');
      errors.forEach(err => output.error(`  - ${err}`));
      return;
    }

    // Create location file
    const filePath = await builder.create(locationData as LocationYAML);

    output.success(`Location created: ${filePath}`);
    output.info(`Name: ${name}`);
    if (type) output.info(`Type: ${type}`);
    if (parent) output.info(`Parent: ${parent}`);

    // Auto-sync to database if initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      const locSync = extension.getLocationSync();
      await locSync.syncLocationFile(filePath);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to create location: ${(error as Error).message}`);
  }
}

/**
 * Handle location list command
 */
async function handleLocationList(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const builder = extension.getLocationBuilder();

    const locationFiles = await builder.list();

    if (locationFiles.length === 0) {
      output.info('No locations found');
      output.dim('Create your first location with: /novel location create');
      return;
    }

    output.info('=== Locations ===');
    output.newline();

    // Load and display each location
    for (const filePath of locationFiles) {
      const content = await readFile(filePath, 'utf-8');
      const location = YAML.parse(content) as LocationYAML;

      output.success(`${location.name}`);
      if (location.type) output.dim(`  Type: ${location.type}`);
      if (location.parentLocation) output.dim(`  Parent: ${location.parentLocation}`);

      if (location.description && location.description.length > 60) {
        output.dim(`  ${location.description.substring(0, 60)}...`);
      } else if (location.description) {
        output.dim(`  ${location.description}`);
      }

      output.newline();
    }

    output.info(`Total: ${locationFiles.length} locations`);
  } catch (error) {
    output.error(`Failed to list locations: ${(error as Error).message}`);
  }
}

/**
 * Handle location show command
 */
async function handleLocationShow(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const name = args.flags.name as string | undefined;
    const showAll = args.flags.all as boolean | undefined;

    if (!name) {
      output.error('Location name required. Use --name <name>');
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const builder = extension.getLocationBuilder();

    // Find location file
    const locationFile = await findLocationFile(name, builder);
    if (!locationFile) {
      output.error(`Location not found: ${name}`);
      return;
    }

    // Load location
    const content = await readFile(locationFile, 'utf-8');
    const location = YAML.parse(content) as LocationYAML;

    // Display location details
    output.info(`=== ${location.name} ===`);
    output.newline();

    output.success('Basic Information:');
    if (location.type) output.info(`  Type: ${location.type}`);
    if (location.parentLocation) output.info(`  Parent: ${location.parentLocation}`);
    output.newline();

    if (location.description) {
      output.success('Description:');
      output.dim(`  ${location.description}`);
      output.newline();
    }

    if (showAll) {
      if (location.details && Object.keys(location.details).length > 0) {
        output.success('Details:');
        Object.entries(location.details).forEach(([key, value]) => {
          output.info(`  ${key}: ${value}`);
        });
        output.newline();
      }

      if (location.rules && location.rules.length > 0) {
        output.success('Location Rules:');
        location.rules.forEach(rule => {
          output.dim(`  - ${rule}`);
        });
        output.newline();
      }

      if (location.firstAppearance) {
        output.success('First Appearance:');
        output.dim(`  ${location.firstAppearance}`);
        output.newline();
      }

      if (location.notes) {
        output.success('Notes:');
        output.dim(`  ${location.notes}`);
        output.newline();
      }
    } else {
      output.dim('Use --all to show complete details');
    }
  } catch (error) {
    output.error(`Failed to show location: ${(error as Error).message}`);
  }
}

/**
 * Handle location edit command
 */
async function handleLocationEdit(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const name = args.flags.name as string | undefined;

    if (!name) {
      output.error('Location name required. Use --name <name>');
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const builder = extension.getLocationBuilder();

    // Find location file
    const locationFile = await findLocationFile(name, builder);
    if (!locationFile) {
      output.error(`Location not found: ${name}`);
      return;
    }

    // Load location
    const content = await readFile(locationFile, 'utf-8');
    const location = YAML.parse(content) as LocationYAML;

    // Apply updates
    let updated = false;

    if (args.flags.description) {
      location.description = args.flags.description as string;
      updated = true;
    }

    if (args.flags.type) {
      location.type = args.flags.type as string;
      updated = true;
    }

    if (args.flags.parent !== undefined) {
      location.parentLocation = args.flags.parent as string || undefined;
      updated = true;
    }

    if (!updated) {
      output.error('No updates specified. Use --description, --type, or --parent');
      return;
    }

    // Write updated location
    const yamlContent = YAML.stringify(location);
    await writeFile(locationFile, yamlContent, 'utf-8');

    output.success(`Location updated: ${name}`);

    // Auto-sync to database if initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      const locSync = extension.getLocationSync();
      await locSync.syncLocationFile(locationFile);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to edit location: ${(error as Error).message}`);
  }
}

/**
 * Handle location delete command
 */
async function handleLocationDelete(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const name = args.flags.name as string | undefined;

    if (!name) {
      output.error('Location name required. Use --name <name>');
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const builder = extension.getLocationBuilder();

    // Find location file
    const locationFile = await findLocationFile(name, builder);
    if (!locationFile) {
      output.error(`Location not found: ${name}`);
      return;
    }

    // Delete file
    await unlink(locationFile);

    output.success(`Location deleted: ${name}`);
    output.dim('Note: Database entry not automatically removed. Use /novel sync to update.');
  } catch (error) {
    output.error(`Failed to delete location: ${(error as Error).message}`);
  }
}

/**
 * Handle location sync command
 */
async function handleLocationSync(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    // Check if project initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const name = args.flags.name as string | undefined;
    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const locSync = extension.getLocationSync();
    const builder = extension.getLocationBuilder();

    if (name) {
      // Sync single location
      const locationFile = await findLocationFile(name, builder);
      if (!locationFile) {
        output.error(`Location not found: ${name}`);
        return;
      }

      await locSync.syncLocationFile(locationFile);
      output.success(`Location synced: ${name}`);
    } else {
      // Sync all locations
      const locationFiles = await builder.list();

      if (locationFiles.length === 0) {
        output.info('No locations to sync');
        return;
      }

      for (const file of locationFiles) {
        await locSync.syncLocationFile(file);
      }

      output.success(`Synced ${locationFiles.length} locations to database`);
    }
  } catch (error) {
    output.error(`Failed to sync locations: ${(error as Error).message}`);
  }
}

/**
 * Handle location scenes command
 */
async function handleLocationScenes(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    // Check if project initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const name = args.flags.name as string | undefined;

    if (!name) {
      output.error('Location name required. Use --name <name>');
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const mcpClient = (extension as any).mcpClient;

    // Find location ID by name
    const locations = await mcpClient.readQuery(
      'SELECT id, name FROM locations WHERE name LIKE ?',
      [`%${name}%`]
    );

    if (locations.length === 0) {
      output.error(`Location not found in database: ${name}`);
      output.dim('Make sure to sync locations first with: /novel location sync');
      return;
    }

    const locationId = locations[0].id;
    const locationName = locations[0].name;

    // Get scenes set in this location
    const sceneSync = extension.getSceneSync();
    const scenes = await sceneSync.getScenesByLocation(locationId);

    if (scenes.length === 0) {
      output.info(`No scenes found set in ${locationName}`);
      return;
    }

    output.info(`=== Scenes set in ${locationName} ===`);
    output.newline();

    let currentChapter = 0;
    for (const scene of scenes) {
      if (scene.chapter_number !== currentChapter) {
        if (currentChapter > 0) output.newline();
        output.success(`Chapter ${scene.chapter_number}: ${scene.chapter_title || 'Untitled'}`);
        currentChapter = scene.chapter_number;
      }

      output.dim(`  Scene ${scene.scene_number}${scene.title ? `: ${scene.title}` : ''}`);
      if (scene.word_count) {
        output.dim(`    ${scene.word_count} words`);
      }
    }

    output.newline();
    output.info(`Total: ${scenes.length} scenes`);
  } catch (error) {
    output.error(`Failed to get location scenes: ${(error as Error).message}`);
  }
}

/**
 * Helper: Find location file by name
 */
async function findLocationFile(
  name: string,
  builder: LocationBuilder
): Promise<string | null> {
  const files = await builder.list();

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const location = YAML.parse(content) as LocationYAML;

    if (location.name.toLowerCase() === name.toLowerCase()) {
      return file;
    }
  }

  return null;
}
