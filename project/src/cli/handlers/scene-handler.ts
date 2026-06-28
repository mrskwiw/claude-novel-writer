/**
 * Scene Command Handlers
 * Handles scene management within chapters
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import { NovelWriterExtension } from '../../index.js';
import type { SceneMetadata } from '../../builders/scene-builder.js';
import { SceneBuilder } from '../../builders/scene-builder.js';
import { join } from 'path';
import { existsSync } from 'fs';

export async function handleSceneCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'add':
      await handleSceneAdd(args, projectPath, output);
      break;
    case 'list':
      await handleSceneList(args, projectPath, output);
      break;
    case 'edit':
      await handleSceneEdit(args, projectPath, output);
      break;
    case 'delete':
      await handleSceneDelete(args, projectPath, output);
      break;
    case 'reorder':
      await handleSceneReorder(args, projectPath, output);
      break;
    case 'stats':
      await handleSceneStats(args, projectPath, output);
      break;
    case 'sync':
      await handleSceneSync(args, projectPath, output);
      break;
    case 'tension-arc':
      await handleTensionArc(args, projectPath, output);
      break;
    case 'beats':
      await handleSceneBeats(args, projectPath, output);
      break;
    default:
      output.error('Unknown scene subcommand. Use: add, list, edit, delete, reorder, stats, sync, tension-arc, beats');
  }
}

/**
 * Get chapter file path from chapter number
 */
async function getChapterFilePath(
  chapterNumber: number | string,
  projectPath: string
): Promise<string | null> {
  const targetNum = parseInt(String(chapterNumber), 10);
  const extension = new NovelWriterExtension(projectPath);
  const chapterBuilder = extension.getChapterBuilder();
  const chapterPaths = await chapterBuilder.list();

  // Find chapter by number in filename. Use the SAME extraction as
  // ChapterSync.extractChapterNumber (first digit run anywhere) so both the
  // documented `chapter-NN-title.md` form and the bare `NN-title.md` form
  // resolve — previously this anchored the number at the start (`/^0*(\d+)/`)
  // and silently failed on `chapter-NN-title.md`. (BUGS.md SCENE-01)
  for (const path of chapterPaths) {
    const filename = path.split(/[/\\]/).pop() || '';
    const match = filename.match(/(\d+)/);
    if (match && parseInt(match[1], 10) === targetNum) {
      return path;
    }
  }

  return null;
}

/**
 * Handle scene add command
 */
async function handleSceneAdd(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    // Validate chapter number
    const chapterNumber = args.flags.chapter as number | undefined;
    if (!chapterNumber) {
      output.error('Chapter number required. Use --chapter <number>');
      return;
    }

    // Get chapter file path
    const chapterPath = await getChapterFilePath(chapterNumber, projectPath);
    if (!chapterPath) {
      output.error(`Chapter ${chapterNumber} not found. Check that chapters/ has a file whose name contains the chapter number (e.g. chapter-NN-title.md or NN-title.md).`);
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    // Validate tension level
    const tensionLevel = args.flags.tension as number | undefined;
    if (tensionLevel !== undefined && (tensionLevel < 1 || tensionLevel > 10)) {
      output.error('Tension level must be between 1 and 10');
      return;
    }

    // Build scene data
    const sceneData: Omit<SceneMetadata, 'sceneNumber'> & { insertAfterScene?: number } = {};
    if (args.flags.title) sceneData.title = args.flags.title as string;
    if (args.flags.pov) sceneData.pov = args.flags.pov as string;
    if (args.flags.location) sceneData.location = args.flags.location as string;
    if (args.flags.time) sceneData.timeOfDay = args.flags.time as string;
    if (args.flags.purpose) sceneData.purpose = args.flags.purpose as string;
    if (args.flags.tone) sceneData.emotionalTone = args.flags.tone as string;
    if (tensionLevel) sceneData.tensionLevel = tensionLevel;
    if (args.flags.after) sceneData.insertAfterScene = args.flags.after as number;

    // Get content
    const content = args.flags.content as string | undefined;

    // Add scene
    const metadata = await sceneBuilder.addScene(sceneData, content);

    output.success(`Scene ${metadata.sceneNumber} added to chapter ${chapterNumber}!`);
    if (metadata.title) output.info(`Title: ${metadata.title}`);
    if (metadata.pov) output.info(`POV: ${metadata.pov}`);
    if (metadata.location) output.info(`Location: ${metadata.location}`);
    if (metadata.tensionLevel) output.info(`Tension: ${metadata.tensionLevel}/10`);
  } catch (error) {
    output.error(`Failed to add scene: ${(error as Error).message}`);
  }
}

/**
 * Handle scene list command
 */
async function handleSceneList(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const chapterNumber = args.flags.chapter as number | undefined;
    if (!chapterNumber) {
      output.error('Chapter number required. Use --chapter <number>');
      return;
    }

    const chapterPath = await getChapterFilePath(chapterNumber, projectPath);
    if (!chapterPath) {
      output.error(`Chapter ${chapterNumber} not found. Check that chapters/ has a file whose name contains the chapter number (e.g. chapter-NN-title.md or NN-title.md).`);
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    const sceneBuilder = extension.getSceneBuilder(chapterPath);
    const scenes = await sceneBuilder.parseScenes();

    if (scenes.length === 0) {
      output.info(`Chapter ${chapterNumber} has no scenes yet`);
      return;
    }

    output.info(`=== Scenes in Chapter ${chapterNumber} ===`);
    output.newline();

    for (const scene of scenes) {
      const meta = scene.metadata;
      const wordCount = sceneBuilder.countSceneWords(scene.content);

      output.success(`Scene ${meta.sceneNumber}${meta.title ? `: ${meta.title}` : ''}`);

      const details: string[] = [];
      if (meta.pov) details.push(`POV: ${meta.pov}`);
      if (meta.location) details.push(`Location: ${meta.location}`);
      if (meta.timeOfDay) details.push(`Time: ${meta.timeOfDay}`);
      if (meta.tensionLevel) details.push(`Tension: ${meta.tensionLevel}/10`);
      details.push(`Words: ${wordCount}`);

      if (details.length > 0) {
        output.dim(`  ${details.join(' | ')}`);
      }

      if (meta.purpose) {
        output.dim(`  Purpose: ${meta.purpose}`);
      }

      output.newline();
    }

    const stats = await sceneBuilder.getSceneStats();
    output.info(`Total: ${stats.totalScenes} scenes, ${stats.totalWords} words`);
    output.dim(`Average: ${Math.round(stats.averageWordsPerScene)} words/scene`);
  } catch (error) {
    output.error(`Failed to list scenes: ${(error as Error).message}`);
  }
}

/**
 * Handle scene edit command
 */
async function handleSceneEdit(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const chapterNumber = args.flags.chapter as number | undefined;
    const sceneNumber = args.flags.scene as number | undefined;

    if (!chapterNumber) {
      output.error('Chapter number required. Use --chapter <number>');
      return;
    }

    if (!sceneNumber) {
      output.error('Scene number required. Use --scene <number>');
      return;
    }

    const chapterPath = await getChapterFilePath(chapterNumber, projectPath);
    if (!chapterPath) {
      output.error(`Chapter ${chapterNumber} not found. Check that chapters/ has a file whose name contains the chapter number (e.g. chapter-NN-title.md or NN-title.md).`);
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    // Validate tension level
    const tensionLevel = args.flags.tension as number | undefined;
    if (tensionLevel !== undefined && (tensionLevel < 1 || tensionLevel > 10)) {
      output.error('Tension level must be between 1 and 10');
      return;
    }

    // Build updates
    const updates: Partial<Omit<SceneMetadata, 'sceneNumber'>> = {};
    if (args.flags.title !== undefined) updates.title = args.flags.title as string;
    if (args.flags.pov !== undefined) updates.pov = args.flags.pov as string;
    if (args.flags.location !== undefined) updates.location = args.flags.location as string;
    if (args.flags.time !== undefined) updates.timeOfDay = args.flags.time as string;
    if (args.flags.purpose !== undefined) updates.purpose = args.flags.purpose as string;
    if (args.flags.tone !== undefined) updates.emotionalTone = args.flags.tone as string;
    if (tensionLevel !== undefined) updates.tensionLevel = tensionLevel;

    if (Object.keys(updates).length === 0) {
      output.error('No updates specified. Use --title, --pov, --location, --tension, etc.');
      return;
    }

    await sceneBuilder.updateSceneMetadata(sceneNumber, updates);

    output.success(`Scene ${sceneNumber} in chapter ${chapterNumber} updated!`);

    const updatedFields = Object.keys(updates);
    output.dim(`Updated: ${updatedFields.join(', ')}`);
  } catch (error) {
    output.error(`Failed to edit scene: ${(error as Error).message}`);
  }
}

/**
 * Handle scene delete command
 */
async function handleSceneDelete(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const chapterNumber = args.flags.chapter as number | undefined;
    const sceneNumber = args.flags.scene as number | undefined;

    if (!chapterNumber) {
      output.error('Chapter number required. Use --chapter <number>');
      return;
    }

    if (!sceneNumber) {
      output.error('Scene number required. Use --scene <number>');
      return;
    }

    const chapterPath = await getChapterFilePath(chapterNumber, projectPath);
    if (!chapterPath) {
      output.error(`Chapter ${chapterNumber} not found. Check that chapters/ has a file whose name contains the chapter number (e.g. chapter-NN-title.md or NN-title.md).`);
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    await sceneBuilder.deleteScene(sceneNumber);

    output.success(`Scene ${sceneNumber} deleted from chapter ${chapterNumber}`);
    output.dim('Remaining scenes have been renumbered');
  } catch (error) {
    output.error(`Failed to delete scene: ${(error as Error).message}`);
  }
}

/**
 * Handle scene reorder command
 */
async function handleSceneReorder(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const chapterNumber = args.flags.chapter as number | undefined;
    const orderString = args.flags.order as string | undefined;

    if (!chapterNumber) {
      output.error('Chapter number required. Use --chapter <number>');
      return;
    }

    if (!orderString) {
      output.error('Scene order required. Use --order "3,1,2"');
      return;
    }

    const chapterPath = await getChapterFilePath(chapterNumber, projectPath);
    if (!chapterPath) {
      output.error(`Chapter ${chapterNumber} not found. Check that chapters/ has a file whose name contains the chapter number (e.g. chapter-NN-title.md or NN-title.md).`);
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    const sceneBuilder = extension.getSceneBuilder(chapterPath);

    // Parse order
    const newOrder = orderString.split(',').map(s => parseInt(s.trim()));

    if (newOrder.some(n => isNaN(n))) {
      output.error('Invalid order format. Use comma-separated numbers, e.g., "3,1,2"');
      return;
    }

    await sceneBuilder.reorderScenes(newOrder);

    output.success(`Scenes reordered in chapter ${chapterNumber}`);
    output.dim(`New order: ${newOrder.join(', ')}`);
  } catch (error) {
    output.error(`Failed to reorder scenes: ${(error as Error).message}`);
  }
}

/**
 * Handle scene stats command
 */
async function handleSceneStats(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const chapterNumber = args.flags.chapter as number | undefined;

    if (!chapterNumber) {
      output.error('Chapter number required. Use --chapter <number>');
      return;
    }

    const chapterPath = await getChapterFilePath(chapterNumber, projectPath);
    if (!chapterPath) {
      output.error(`Chapter ${chapterNumber} not found. Check that chapters/ has a file whose name contains the chapter number (e.g. chapter-NN-title.md or NN-title.md).`);
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    const sceneBuilder = extension.getSceneBuilder(chapterPath);
    const stats = await sceneBuilder.getSceneStats();

    output.info(`=== Scene Statistics for Chapter ${chapterNumber} ===`);
    output.newline();

    output.info(`Total scenes: ${stats.totalScenes}`);
    output.info(`Total words: ${stats.totalWords}`);
    output.info(`Average words/scene: ${Math.round(stats.averageWordsPerScene)}`);
    output.newline();

    if (stats.scenes.length > 0) {
      output.info('Per-scene breakdown:');
      stats.scenes.forEach(scene => {
        output.dim(`  Scene ${scene.sceneNumber}: ${scene.wordCount} words`);
      });
    }
  } catch (error) {
    output.error(`Failed to get scene stats: ${(error as Error).message}`);
  }
}

/**
 * Handle scene sync command
 */
async function handleSceneSync(
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

    const chapterNumber = args.flags.chapter as number | undefined;

    if (!chapterNumber) {
      output.error('Chapter number required. Use --chapter <number>');
      return;
    }

    const chapterPath = await getChapterFilePath(chapterNumber, projectPath);
    if (!chapterPath) {
      output.error(`Chapter ${chapterNumber} not found. Check that chapters/ has a file whose name contains the chapter number (e.g. chapter-NN-title.md or NN-title.md).`);
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const sceneSync = extension.getSceneSync();

    await sceneSync.syncChapterScenes(chapterPath, {
      resolveCharacterNames: true,
      resolveLocationNames: true,
    });

    output.success(`Scenes from chapter ${chapterNumber} synced to database`);
  } catch (error) {
    output.error(`Failed to sync scenes: ${(error as Error).message}`);
  }
}

/**
 * Handle tension arc command
 */
async function handleTensionArc(
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

    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const sceneSync = extension.getSceneSync();

    const tensionArc = await sceneSync.getTensionArc();

    if (tensionArc.length === 0) {
      output.info('No scenes with tension levels found');
      output.dim('Add tension levels to scenes and sync to database');
      return;
    }

    output.info('=== Tension Arc ===');
    output.newline();

    let currentChapter = 0;
    for (const point of tensionArc) {
      if (point.chapterNumber !== currentChapter) {
        if (currentChapter > 0) output.newline();
        output.success(`Chapter ${point.chapterNumber}:`);
        currentChapter = point.chapterNumber;
      }

      const tensionBar = '█'.repeat(point.tensionLevel) + '░'.repeat(10 - point.tensionLevel);
      output.dim(`  Scene ${point.sceneNumber}: ${tensionBar} ${point.tensionLevel}/10`);
    }
  } catch (error) {
    output.error(`Failed to get tension arc: ${(error as Error).message}`);
  }
}

/**
 * Handle: scene beats [generate|list|sync|clear] --chapter N --scene N [--beats N]
 *
 * Sub-actions:
 *   generate  — call LLM to create beats, write to chapter file
 *   list      — display beats stored in the chapter file
 *   sync      — push beats from file into scene_beats DB table
 *   clear     — remove all beats from the scene marker
 */
async function handleSceneBeats(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `novel-writer init` first.');
      return;
    }

    const chapterNumber = parseInt(String(args.flags.chapter ?? args.positional[1] ?? ''), 10);
    const sceneNumber = parseInt(String(args.flags.scene ?? args.positional[2] ?? ''), 10);

    if (isNaN(chapterNumber) || chapterNumber < 1) {
      output.error('Chapter number required. Use --chapter <number>');
      return;
    }
    if (isNaN(sceneNumber) || sceneNumber < 1) {
      output.error('Scene number required. Use --scene <number>');
      return;
    }

    // Resolve the chapter file
    const chapterPath = await getChapterFilePath(chapterNumber, projectPath);
    if (!chapterPath) {
      output.error(`Chapter ${chapterNumber} not found. Check that chapters/ has a file whose name contains the chapter number (e.g. chapter-NN-title.md or NN-title.md).`);
      return;
    }

    const sceneBuilder = new SceneBuilder({ chapterFilePath: chapterPath });
    const scenes = await sceneBuilder.parseScenes();
    const scene = scenes.find((s) => s.metadata.sceneNumber === sceneNumber);
    if (!scene) {
      output.error(`Scene ${sceneNumber} not found in chapter ${chapterNumber}`);
      return;
    }

    // Determine action: generate | list | sync | clear
    // The action comes as the first positional after "beats", or from --action flag
    const action =
      (args.flags.action as string | undefined) ??
      args.positional[0] ?? // positional[0] is the sub-action when invoked as `scene beats generate ...`
      'generate';

    switch (action) {
      case 'list': {
        const beats = scene.metadata.beats ?? [];
        if (beats.length === 0) {
          output.info(`No beats found for scene ${sceneNumber}. Run generate first.`);
          return;
        }
        output.info(`=== Beats — Chapter ${chapterNumber}, Scene ${sceneNumber}: ${scene.metadata.title ?? ''} ===`);
        output.newline();
        for (const beat of beats) {
          output.info(`  ${beat.beatNumber}. ${beat.description}`);
        }
        output.newline();
        output.dim(`${beats.length} beat(s)`);
        break;
      }

      case 'clear': {
        await sceneBuilder.clearBeats(sceneNumber);
        output.success(`Beats cleared from chapter ${chapterNumber}, scene ${sceneNumber}`);
        break;
      }

      case 'sync': {
        const beats = scene.metadata.beats ?? [];
        if (beats.length === 0) {
          output.info('No beats in file to sync. Run generate first.');
          return;
        }
        const extension = new NovelWriterExtension(projectPath);
        await extension.loadProjectId();
        const sceneSync = extension.getSceneSync();

        // Find scene DB id
        const sceneId = await resolveSceneId(extension, chapterNumber, sceneNumber);
        if (!sceneId) {
          output.error('Scene not found in database. Run `novel-writer scene sync` first.');
          return;
        }
        await sceneSync.syncSceneBeats(sceneId, beats);
        output.success(`Synced ${beats.length} beat(s) to database`);
        break;
      }

      case 'generate':
      default: {
        const beatCount = parseInt(String(args.flags.beats ?? 5), 10);
        if (isNaN(beatCount) || beatCount < 1 || beatCount > 20) {
          output.error('Beat count must be between 1 and 20');
          return;
        }

        output.info(`Generating ${beatCount} beats for chapter ${chapterNumber}, scene ${sceneNumber}...`);
        if (scene.metadata.purpose) {
          output.dim(`  Purpose: ${scene.metadata.purpose}`);
        }
        output.newline();

        const extension = new NovelWriterExtension(projectPath);
        await extension.loadProjectId();
        const generator = extension.getBeatGenerator();

        const beats = await generator.generateBeats(scene.metadata, chapterNumber, {
          count: beatCount,
        });

        // Empty result means passthrough mode — no standalone API key is set.
        // Print the assembled context prompt so the active Claude Code session
        // can generate the beats and write them back to the chapter file.
        if (beats.length === 0) {
          const prompt = await generator.buildBeatPrompt(scene.metadata, chapterNumber, beatCount);
          output.newline();
          output.info('--- SCENE BEAT CONTEXT (no API key — Claude Code session handles generation) ---');
          output.newline();
          console.log(prompt);
          output.newline();
          output.info('--- END CONTEXT ---');
          output.newline();
          output.info(`Write beats into the chapter file as <!-- beat-N: description --> comments`);
          output.info(`inside the <!-- scene:${sceneNumber} --> block, then run:`);
          output.dim(`  novel-writer scene beats sync --chapter ${chapterNumber} --scene ${sceneNumber}`);
          return;
        }

        // Write beats into the chapter file
        await sceneBuilder.writeBeats(sceneNumber, beats);

        // Auto-sync to DB if scene exists in DB
        try {
          const sceneSync = extension.getSceneSync();
          const sceneId = await resolveSceneId(extension, chapterNumber, sceneNumber);
          if (sceneId) {
            await sceneSync.syncSceneBeats(sceneId, beats);
          }
        } catch {
          // Non-fatal — beats are written to file, DB sync is best-effort
        }

        output.success(`Generated ${beats.length} beat(s) for scene ${sceneNumber}:`);
        output.newline();
        for (const beat of beats) {
          output.info(`  ${beat.beatNumber}. ${beat.description}`);
        }
        output.newline();
        output.dim('Beats written to chapter file. Edit freely — they\'re just planning notes.');
        break;
      }
    }
  } catch (error) {
    output.error(`Failed to manage scene beats: ${(error as Error).message}`);
  }
}

/**
 * Resolve a scene's database ID from chapter and scene numbers.
 */
async function resolveSceneId(
  extension: NovelWriterExtension,
  chapterNumber: number,
  sceneNumber: number
): Promise<number | null> {
  try {
    const sceneSync = extension.getSceneSync();
    return await sceneSync.resolveSceneId(chapterNumber, sceneNumber);
  } catch {
    return null;
  }
}
