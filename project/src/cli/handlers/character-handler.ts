/**
 * Character Command Handlers
 * Handles character management commands
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import { NovelWriterExtension } from '../../index.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile, unlink } from 'fs/promises';
import YAML from 'yaml';
import type { CharacterYAML } from '../../types/novel.js';
import type { CharacterArc } from '../../types/novel.js';
import type { CharacterBuilder } from '../../builders/character-builder.js';

export async function handleCharacterCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'create':
      await handleCharacterCreate(args, projectPath, output, injectedExtension);
      break;
    case 'list':
      await handleCharacterList(args, projectPath, output);
      break;
    case 'show':
      await handleCharacterShow(args, projectPath, output);
      break;
    case 'edit':
      await handleCharacterEdit(args, projectPath, output, injectedExtension);
      break;
    case 'delete':
      await handleCharacterDelete(args, projectPath, output);
      break;
    case 'sync':
      await handleCharacterSync(args, projectPath, output, injectedExtension);
      break;
    case 'scenes':
      await handleCharacterScenes(args, projectPath, output, injectedExtension);
      break;
    case 'arc':
      await handleCharacterArc(args, projectPath, output, injectedExtension);
      break;
    case 'states':
      await handleCharacterStates(args, projectPath, output, injectedExtension);
      break;
    default:
      output.error('Unknown character subcommand. Use: create, list, show, edit, delete, sync, scenes, arc, states');
  }
}

/**
 * Handle character create command
 */
async function handleCharacterCreate(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getCharacterBuilder();

    // Build character data from flags
    const characterData: Partial<CharacterYAML> = {};

    const name = args.flags.name as string | undefined;
    const role = args.flags.role as string | undefined;
    const summary = args.flags.summary as string | undefined;

    if (!name) {
      output.error('Character name required. Use --name <name>');
      return;
    }

    if (!role) {
      output.error('Character role required. Use --role <protagonist|antagonist|major|minor|background>');
      return;
    }

    if (!summary) {
      output.error('Character summary required. Use --summary "description"');
      return;
    }

    characterData.name = name;
    characterData.role = role as any;
    characterData.summary = summary;

    // Physical attributes
    const physical: Record<string, string> = {};
    if (args.flags.age) physical.age = args.flags.age as string;
    if (args.flags['eye-color']) physical.eyeColor = args.flags['eye-color'] as string;
    if (args.flags['hair-color']) physical.hairColor = args.flags['hair-color'] as string;
    if (args.flags.height) physical.height = args.flags.height as string;
    if (args.flags.build) physical.build = args.flags.build as string;

    if (Object.keys(physical).length > 0) {
      characterData.physical = physical;
    }

    // Personality
    if (args.flags.personality) {
      characterData.personality = {
        core: args.flags.personality as string,
      };
    }

    // Validate
    const errors = builder.validate(characterData as CharacterYAML);
    if (errors.length > 0) {
      output.error('Validation errors:');
      errors.forEach(err => output.error(`  - ${err}`));
      return;
    }

    // Create character file
    const filePath = await builder.create(characterData as CharacterYAML);

    output.success(`Character created: ${filePath}`);
    output.info(`Name: ${name}`);
    output.info(`Role: ${role}`);

    // Auto-sync to database if initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      const charSync = extension.getCharacterSync();
      await charSync.syncCharacterFile(filePath);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to create character: ${(error as Error).message}`);
  }
}

/**
 * Handle character list command
 */
async function handleCharacterList(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    const builder = extension.getCharacterBuilder();

    const characterFiles = await builder.list();

    if (characterFiles.length === 0) {
      output.info('No characters found');
      output.dim('Create your first character with: /novel character create');
      return;
    }

    output.info('=== Characters ===');
    output.newline();

    // Load and display each character
    for (const filePath of characterFiles) {
      const content = await readFile(filePath, 'utf-8');
      const character = YAML.parse(content) as CharacterYAML;

      output.success(`${character.name}`);
      output.dim(`  Role: ${character.role}`);

      if (character.summary && character.summary.length > 60) {
        output.dim(`  Summary: ${character.summary.substring(0, 60)}...`);
      } else if (character.summary) {
        output.dim(`  Summary: ${character.summary}`);
      }

      output.newline();
    }

    output.info(`Total: ${characterFiles.length} characters`);
  } catch (error) {
    output.error(`Failed to list characters: ${(error as Error).message}`);
  }
}

/**
 * Handle character show command
 */
async function handleCharacterShow(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const name = args.flags.name as string | undefined;
    const showAll = args.flags.all as boolean | undefined;

    if (!name) {
      output.error('Character name required. Use --name <name>');
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    const builder = extension.getCharacterBuilder();

    // Find character file
    const characterFile = await findCharacterFile(name, builder);
    if (!characterFile) {
      output.error(`Character not found: ${name}`);
      return;
    }

    // Load character
    const content = await readFile(characterFile, 'utf-8');
    const character = YAML.parse(content) as CharacterYAML;

    // Display character details
    output.info(`=== ${character.name} ===`);
    output.newline();

    output.success('Basic Information:');
    output.info(`  Role: ${character.role}`);
    if (character.fullName) output.info(`  Full Name: ${character.fullName}`);
    output.newline();

    if (character.summary) {
      output.success('Summary:');
      output.dim(`  ${character.summary}`);
      output.newline();
    }

    if (character.physical && Object.keys(character.physical).length > 0) {
      output.success('Physical Attributes:');
      Object.entries(character.physical).forEach(([key, value]) => {
        output.info(`  ${key}: ${value}`);
      });
      output.newline();
    }

    if (character.personality && Object.keys(character.personality).length > 0) {
      output.success('Personality:');
      Object.entries(character.personality).forEach(([key, value]) => {
        output.info(`  ${key}: ${value}`);
      });
      output.newline();
    }

    if (showAll) {
      if (character.background && Object.keys(character.background).length > 0) {
        output.success('Background:');
        Object.entries(character.background).forEach(([key, value]) => {
          output.info(`  ${key}: ${value}`);
        });
        output.newline();
      }

      if (character.skills && Object.keys(character.skills).length > 0) {
        output.success('Skills:');
        Object.entries(character.skills).forEach(([key, value]) => {
          output.info(`  ${key}: ${value}`);
        });
        output.newline();
      }

      if (character.voice) {
        output.success('Voice:');
        if (character.voice.patterns && character.voice.patterns.length > 0) {
          output.info('  Patterns:');
          character.voice.patterns.forEach(pattern => {
            output.dim(`    - ${pattern}`);
          });
        }
        if (character.voice.vocabulary) {
          output.info(`  Vocabulary: ${character.voice.vocabulary}`);
        }
        if (character.voice.quirks && character.voice.quirks.length > 0) {
          output.info('  Quirks:');
          character.voice.quirks.forEach(quirk => {
            output.dim(`    - ${quirk}`);
          });
        }
        output.newline();
      }

      if (character.arc) {
        output.success('Character Arc:');
        if (character.arc.startingState) output.info(`  Start: ${character.arc.startingState}`);
        if (character.arc.endingState) output.info(`  End: ${character.arc.endingState}`);
        if (character.arc.midpointCrisis) {
          output.info('  Midpoint Crisis:');
          output.dim(`    ${character.arc.midpointCrisis}`);
        }
        output.newline();
      }

      if (character.notes) {
        output.success('Notes:');
        output.dim(`  ${character.notes}`);
        output.newline();
      }
    } else {
      output.dim('Use --all to show complete details');
    }
  } catch (error) {
    output.error(`Failed to show character: ${(error as Error).message}`);
  }
}

/**
 * Handle character edit command
 */
async function handleCharacterEdit(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const name = args.flags.name as string | undefined;

    if (!name) {
      output.error('Character name required. Use --name <name>');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const builder = extension.getCharacterBuilder();

    // Find character file
    const characterFile = await findCharacterFile(name, builder);
    if (!characterFile) {
      output.error(`Character not found: ${name}`);
      return;
    }

    // Load character
    const content = await readFile(characterFile, 'utf-8');
    const character = YAML.parse(content) as CharacterYAML;

    // Apply updates
    let updated = false;

    if (args.flags.role) {
      character.role = args.flags.role as CharacterYAML['role'];
      updated = true;
    }

    if (args.flags.summary) {
      character.summary = args.flags.summary as string;
      updated = true;
    }

    // Physical updates
    if (args.flags.age || args.flags['eye-color'] || args.flags['hair-color'] ||
        args.flags.height || args.flags.build) {
      if (!character.physical) character.physical = {};

      if (args.flags.age) {
        character.physical.age = args.flags.age as string;
        updated = true;
      }
      if (args.flags['eye-color']) {
        character.physical.eyeColor = args.flags['eye-color'] as string;
        updated = true;
      }
      if (args.flags['hair-color']) {
        character.physical.hairColor = args.flags['hair-color'] as string;
        updated = true;
      }
      if (args.flags.height) {
        character.physical.height = args.flags.height as string;
        updated = true;
      }
      if (args.flags.build) {
        character.physical.build = args.flags.build as string;
        updated = true;
      }
    }

    if (args.flags.personality) {
      if (!character.personality) character.personality = {};
      character.personality.core = args.flags.personality as string;
      updated = true;
    }

    if (!updated) {
      output.error('No updates specified. Use --role, --summary, --age, etc.');
      return;
    }

    // Write updated character
    const yamlContent = YAML.stringify(character);
    await writeFile(characterFile, yamlContent, 'utf-8');

    output.success(`Character updated: ${name}`);

    // Auto-sync to database if initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (existsSync(dbPath)) {
      const charSync = extension.getCharacterSync();
      await charSync.syncCharacterFile(characterFile);
      output.success('Synced to database');
    }
  } catch (error) {
    output.error(`Failed to edit character: ${(error as Error).message}`);
  }
}

/**
 * Handle character delete command
 */
async function handleCharacterDelete(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const name = args.flags.name as string | undefined;

    if (!name) {
      output.error('Character name required. Use --name <name>');
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    const builder = extension.getCharacterBuilder();

    // Find character file
    const characterFile = await findCharacterFile(name, builder);
    if (!characterFile) {
      output.error(`Character not found: ${name}`);
      return;
    }

    // Delete file
    await unlink(characterFile);

    output.success(`Character deleted: ${name}`);
    output.dim('Note: Database entry not automatically removed. Use /novel sync to update.');
  } catch (error) {
    output.error(`Failed to delete character: ${(error as Error).message}`);
  }
}

/**
 * Handle character sync command
 */
async function handleCharacterSync(
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
    const charSync = extension.getCharacterSync();
    const builder = extension.getCharacterBuilder();

    if (name) {
      // Sync single character
      const characterFile = await findCharacterFile(name, builder);
      if (!characterFile) {
        output.error(`Character not found: ${name}`);
        return;
      }

      await charSync.syncCharacterFile(characterFile);
      output.success(`Character synced: ${name}`);
    } else {
      // Sync all characters
      const characterFiles = await builder.list();

      if (characterFiles.length === 0) {
        output.info('No characters to sync');
        return;
      }

      for (const file of characterFiles) {
        await charSync.syncCharacterFile(file);
      }

      output.success(`Synced ${characterFiles.length} characters to database`);
    }
  } catch (error) {
    output.error(`Failed to sync characters: ${(error as Error).message}`);
  }
}

/**
 * Handle character scenes command
 */
async function handleCharacterScenes(
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

    if (!name) {
      output.error('Character name required. Use --name <name>');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;

    // Find character ID by name
    const characters = await mcpClient.readQuery(
      'SELECT id, name FROM characters WHERE name LIKE ?',
      [`%${name}%`]
    );

    if (characters.length === 0) {
      output.error(`Character not found in database: ${name}`);
      output.dim('Make sure to sync characters first with: /novel character sync');
      return;
    }

    const characterId = characters[0].id;
    const characterName = characters[0].name;

    // Get scenes featuring this character
    const sceneSync = extension.getSceneSync();
    const scenes = await sceneSync.getScenesByCharacter(characterId);

    if (scenes.length === 0) {
      output.info(`No scenes found featuring ${characterName}`);
      return;
    }

    output.info(`=== Scenes featuring ${characterName} ===`);
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
    output.error(`Failed to get character scenes: ${(error as Error).message}`);
  }
}

/**
 * Format a single CharacterArc as a human-readable timeline string.
 */
function formatArcTimeline(arc: CharacterArc): string {
  if (arc.states.length === 0) {
    return `${arc.characterName}: no states recorded`;
  }

  const timeline = arc.states
    .map((s) => `Ch${s.chapterNumber}.S${s.sceneOrder} → ${s.state}`)
    .join(' → ');

  const lines: string[] = [`${arc.characterName}: ${timeline}`];

  if (!arc.isComplete) {
    lines.push('  ⚠ Arc incomplete (first and last states are the same)');
  }

  if (arc.staticRuns.length > 0) {
    const runList = arc.staticRuns.map((s) => `S${s}`).join(', ');
    lines.push(`  ⚠ Static runs starting at scene order(s): ${runList}`);
  }

  return lines.join('\n');
}

/**
 * Handle character arc command
 */
async function handleCharacterArc(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const name = args.flags.name as string | undefined;
    const compareName = args.flags.compare as string | undefined;

    if (!name) {
      output.error('Character name required. Use --name <name>');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const arcService = extension.getCharacterArcService();

    // Fetch the project id (stored as numeric but service expects string)
    const projectIdStr = String((extension as any).projectId ?? '');

    if (compareName) {
      // Side-by-side comparison
      const { a, b } = await arcService.compareArcs(projectIdStr, name, compareName);

      output.info(`=== Arc Comparison: ${name} vs ${compareName} ===`);
      output.newline();

      if (!a) {
        output.info(`${name}: no arc data found`);
      } else {
        output.info(formatArcTimeline(a));
      }

      output.newline();

      if (!b) {
        output.info(`${compareName}: no arc data found`);
      } else {
        output.info(formatArcTimeline(b));
      }
    } else {
      // Single arc
      const arc = await arcService.getArc(projectIdStr, name);

      if (!arc) {
        output.error(`No arc data found for "${name}". Sync scenes with character_states markers first.`);
        return;
      }

      output.info(`=== Character Arc: ${arc.characterName} ===`);
      output.newline();
      output.info(formatArcTimeline(arc));
    }
  } catch (error) {
    output.error(`Failed to retrieve character arc: ${(error as Error).message}`);
  }
}

/**
 * Handle character states command
 */
async function handleCharacterStates(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const chapter = args.flags.chapter as number | undefined;

    if (chapter === undefined || chapter === null) {
      output.error('Chapter number required. Use --chapter N');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const arcService = extension.getCharacterArcService();
    const projectIdStr = String((extension as any).projectId ?? '');

    const rows = await arcService.getSceneStates(projectIdStr, chapter);

    if (rows.length === 0) {
      output.info(`No character states recorded for chapter ${chapter}`);
      return;
    }

    output.info(`=== Character States — Chapter ${chapter} ===`);
    output.newline();

    // Simple table: character | state | scene
    const header = `${'Character'.padEnd(20)} ${'State'.padEnd(14)} Scene`;
    output.info(header);
    output.info('-'.repeat(header.length));

    for (const row of rows) {
      const line = `${row.characterName.padEnd(20)} ${row.state.padEnd(14)} ${row.sceneTitle || '(untitled)'}`;
      output.dim(line);
    }
  } catch (error) {
    output.error(`Failed to retrieve character states: ${(error as Error).message}`);
  }
}

/**
 * Helper: Find character file by name
 */
async function findCharacterFile(
  name: string,
  builder: CharacterBuilder
): Promise<string | null> {
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const normalizedInput = normalize(name);
  const files = await builder.list();

  let substringMatch: string | null = null;

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const character = YAML.parse(content) as CharacterYAML;
    const normalizedCharName = normalize(character.name);

    if (normalizedCharName === normalizedInput) {
      return file;
    }
    if (substringMatch === null && normalizedCharName.includes(normalizedInput)) {
      substringMatch = file;
    }
  }

  return substringMatch;
}

// Import writeFile for edit command
import { writeFile } from 'fs/promises';
