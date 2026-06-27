/**
 * Create Command Handlers
 * Handles character, location, chapter, and plot thread creation
 */

import { join } from 'path';
import { existsSync } from 'fs';
import type { ParsedArgs, CommandContext } from '../types.js';
import type { PromptFunction, PromptOptions } from '../../builders/character-builder.js';
import type { CharacterYAML } from '../../types/novel.js';
import type { LocationYAML } from '../../types/novel.js';
import type { PlotYAML } from '../../types/novel.js';

/**
 * Create a CLI prompt function that uses Claude Code's output
 */
function createPromptFunction(context: CommandContext): PromptFunction {
  return async (message: string, options?: PromptOptions) => {
    // For CLI mode, we can't do interactive prompts directly
    // This would need integration with Claude Code's prompt system
    // For now, throw an error directing user to provide flags
    throw new Error(
      `Interactive mode requires Claude Code integration. Please provide all required flags instead.`
    );
  };
}

/**
 * Handle: /novel create character
 */
export async function handleCreateCharacter(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { flags } = args;
  const { extension, output } = context;

  if (!extension) {
    output.error('Extension not initialized. This is a bug.');
    return;
  }

  // Check if interactive mode
  const isInteractive =
    flags.interactive ||
    (!flags.name && !flags.role && !flags.summary);

  if (isInteractive) {
    // Interactive mode
    output.info('Starting interactive character creation...');
    output.newline();

    try {
      const promptFn = createPromptFunction(context);
      const filePath = await extension.createCharacterInteractive(promptFn);

      output.success(`Character created!`);
      output.newline();
      output.keyValue({
        'File': filePath,
        'Status': 'Synced to database',
      });
    } catch (error: unknown) {
      output.error('Character creation failed');
      output.info((error as Error).message);
      output.newline();
      output.info('For non-interactive mode, provide required flags:');
      output.code('/novel create character --name "Name" --role protagonist --summary "Description"');
    }
    return;
  }

  // Non-interactive mode - validate required fields
  if (!flags.name) {
    output.error('Missing required flag: --name');
    output.info('Example: /novel create character --name "Sarah Chen" --role protagonist --summary "A brilliant scientist"');
    return;
  }

  if (!flags.role) {
    output.error('Missing required flag: --role');
    output.info('Valid roles: protagonist, antagonist, major, minor, background');
    return;
  }

  if (!flags.summary) {
    output.error('Missing required flag: --summary');
    output.info('Example: --summary "A brilliant astrophysicist haunted by her past"');
    return;
  }

  // Create character from flags
  const spinner = output.spinner(`Creating character: ${flags.name}`);

  try {
    const builder = extension.getCharacterBuilder();

    // Build character data
    const characterData: Partial<CharacterYAML> = {
      name: flags.name as string,
      fullName: flags['full-name'] as string | undefined,
      role: flags.role as CharacterYAML['role'],
      summary: flags.summary as string,
    };

    // Add optional physical attributes
    const physical: Record<string, string> = {};
    if (flags.age) physical.age = flags.age as string;
    if (flags.eyes) physical.eyes = flags.eyes as string;
    if (flags.hair) physical.hair = flags.hair as string;
    if (flags.height) physical.height = flags.height as string;
    if (flags.build) physical.build = flags.build as string;

    if (Object.keys(physical).length > 0) {
      characterData.physical = physical;
    }

    // Create the file
    const filePath = await builder.create(characterData as CharacterYAML);

    // Sync to database if project is initialized
    const sync = extension.getCharacterSync();
    await sync.syncCharacterFile(filePath);

    spinner.stop('Character created successfully!');
    output.newline();
    output.success(`Character created: ${flags.name}`);
    output.newline();
    output.keyValue({
      'File': filePath,
      'Role': flags.role as string,
      'Database': 'synced',
    });
    output.newline();
    output.info('Next steps:');
    output.list([
      `/novel show character "${flags.name}"`,
      `Edit the YAML file to add more details`,
      `/novel list characters`,
    ], '→');
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Failed to create character: ${(error as Error).message}`);
  }
}

/**
 * Handle: /novel create location
 */
export async function handleCreateLocation(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { flags } = args;
  const { extension, output } = context;

  if (!extension) {
    output.error('Extension not initialized. This is a bug.');
    return;
  }

  // Check if interactive mode
  const isInteractive =
    flags.interactive ||
    (!flags.name && !flags.description);

  if (isInteractive) {
    // Interactive mode
    output.info('Starting interactive location creation...');
    output.newline();

    try {
      const promptFn = createPromptFunction(context);
      const filePath = await extension.createLocationInteractive(promptFn);

      output.success(`Location created!`);
      output.newline();
      output.keyValue({
        'File': filePath,
        'Status': 'Synced to database',
      });
    } catch (error: unknown) {
      output.error('Location creation failed');
      output.info((error as Error).message);
      output.newline();
      output.info('For non-interactive mode, provide required flags:');
      output.code('/novel create location --name "Name" --description "Description"');
    }
    return;
  }

  // Non-interactive mode - validate required fields
  if (!flags.name) {
    output.error('Missing required flag: --name');
    output.info('Example: /novel create location --name "SETI Observatory" --type building --description "A remote facility"');
    return;
  }

  if (!flags.description) {
    output.error('Missing required flag: --description');
    output.info('Example: --description "A remote facility in the Nevada desert"');
    return;
  }

  // Create location from flags
  const spinner = output.spinner(`Creating location: ${flags.name}`);

  try {
    const builder = extension.getLocationBuilder();

    // Build location data
    const locationData: LocationYAML = {
      name: flags.name as string,
      description: flags.description as string,
      type: flags.type as string | undefined,
      parentLocation: flags.parent as string | undefined,
    };

    // Create the file
    const filePath = await builder.create(locationData);

    // Sync to database if project is initialized
    const sync = extension.getLocationSync();
    await sync.syncLocationFile(filePath);

    spinner.stop('Location created successfully!');
    output.newline();
    output.success(`Location created: ${flags.name}`);
    output.newline();
    output.keyValue({
      'File': filePath,
      'Type': (flags.type as string) || '(none)',
      'Database': 'synced',
    });
    output.newline();
    output.info('Next steps:');
    output.list([
      `/novel show location "${flags.name}"`,
      `Edit the YAML file to add more details`,
      `/novel list locations`,
    ], '→');
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Failed to create location: ${(error as Error).message}`);
  }
}

/**
 * Handle: /novel create chapter
 */
export async function handleCreateChapter(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { flags } = args;
  const { cwd, extension, output } = context;

  if (!extension) {
    output.error('Extension not initialized. This is a bug.');
    return;
  }

  const chapterSync = extension.getChapterSync();

  // Determine chapter number — explicit flag, else next available in the DB.
  let chapterNumber = flags.number as number | undefined;
  if (!chapterNumber) {
    chapterNumber = await chapterSync.getNextChapterNumber();
  }

  // Get title
  let chapterTitle = flags.title as string | undefined;
  if (!chapterTitle) {
    output.error('Missing required flag: --title');
    output.info('Example: /novel create chapter --title "The Signal" --number 1');
    return;
  }

  const spinner = output.spinner(`Creating Chapter ${chapterNumber}: ${chapterTitle}`);

  try {
    // Format chapter number (01, 02, etc.)
    const chapterNumStr = chapterNumber.toString().padStart(2, '0');

    // Create filename-safe title
    const titleSlug = chapterTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const filename = `${chapterNumStr}-${titleSlug}.md`;
    const chapterPath = join(cwd, 'chapters', filename);

    // Check if file exists
    if (existsSync(chapterPath)) {
      spinner.stop('Failed');
      output.error(`Chapter file already exists: ${filename}`);
      output.info('Choose a different number or title');
      return;
    }

    // Build YAML frontmatter
    const frontmatter: Record<string, string | number | undefined> = {
      chapter: chapterNumber,
      title: chapterTitle,
    };

    if (flags.pov) {
      frontmatter.pov = flags.pov as string;
    }

    if (flags.location) {
      frontmatter.location = flags.location as string;
    }

    // Build chapter content
    const sceneCount = (flags.scenes as number) || 1;
    let content = '---\n';
    content += `chapter: ${chapterNumber}\n`;
    content += `title: "${chapterTitle}"\n`;
    if (flags.pov) content += `pov: ${flags.pov}\n`;
    if (flags.location) content += `location: ${flags.location}\n`;
    content += '---\n\n';
    content += `# Chapter ${chapterNumber}: ${chapterTitle}\n\n`;

    for (let i = 1; i <= sceneCount; i++) {
      content += `## Scene ${i}\n\n`;
      content += `[Write your scene here]\n\n`;
    }

    // Write file
    const fs = await import('fs/promises');
    await fs.writeFile(chapterPath, content, 'utf-8');

    // Sync the new chapter into the database so it's visible to analysis,
    // consistency, and context features immediately (no manual `sync` needed).
    await chapterSync.syncChapterFile(chapterPath);

    spinner.stop('Chapter created successfully!');
    output.newline();
    output.success(`Chapter created: Chapter ${chapterNumber} - ${chapterTitle}`);
    output.newline();
    output.keyValue({
      'File': chapterPath,
      'Scenes': sceneCount.toString(),
    });
    output.newline();
    output.info('Next steps:');
    output.list([
      `Open ${filename} and start writing`,
      `/novel show chapter ${chapterNumber}`,
      `/novel list chapters`,
    ], '→');
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Failed to create chapter: ${(error as Error).message}`);
  }
}

/**
 * Handle: /novel create plot
 */
export async function handleCreatePlot(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { flags } = args;
  const { extension, output } = context;

  if (!extension) {
    output.error('Extension not initialized. This is a bug.');
    return;
  }

  // Check if interactive mode
  const isInteractive = flags.interactive || !flags.name;

  if (isInteractive) {
    // Interactive mode
    output.info('Starting interactive plot creation...');
    output.newline();

    try {
      const promptFn = createPromptFunction(context);
      const filePath = await extension.createPlotInteractive(promptFn);

      output.success(`Plot thread created!`);
      output.newline();
      output.keyValue({
        'File': filePath,
        'Status': 'Synced to database',
      });
    } catch (error: unknown) {
      output.error('Plot creation failed');
      output.info((error as Error).message);
      output.newline();
      output.info('For non-interactive mode, provide required flags:');
      output.code('/novel create plot --name "Plot Name" --type subplot --description "Description"');
    }
    return;
  }

  // Non-interactive mode - validate required fields
  if (!flags.name) {
    output.error('Missing required flag: --name');
    output.info('Example: /novel create plot --name "The Mystery of the Signal" --description "A strange signal from space"');
    return;
  }

  // Create plot from flags
  const spinner = output.spinner(`Creating plot thread: ${flags.name}`);

  try {
    const builder = extension.getPlotBuilder();

    // Build plot data
    const plotData: PlotYAML = {
      name: flags.name as string,
      type: ((flags.type as string) || 'subplot') as PlotYAML['type'],
      status: ((flags.status as string) || 'planned') as PlotYAML['status'],
      priority: (flags.priority as number) || 3,
      description: (flags.description as string) || '',
      beats: [],
    };

    // Create the file
    const filePath = await builder.create(plotData);

    // Sync to database if project is initialized
    const sync = extension.getPlotSync();
    await sync.syncPlotFile(filePath);

    spinner.stop('Plot thread created successfully!');
    output.newline();
    output.success(`Plot thread created: ${flags.name}`);
    output.newline();
    output.keyValue({
      'File': filePath,
      'Type': plotData.type,
      'Status': plotData.status,
      'Priority': plotData.priority.toString(),
      'Database': 'synced',
    });
    output.newline();
    output.info('Next steps:');
    output.list([
      `Edit ${filePath.split(/[\\/]/).pop()} to add beats and details`,
      `/novel show plot "${flags.name}"`,
      `/novel list plots`,
    ], '→');
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Failed to create plot thread: ${(error as Error).message}`);
  }
}
