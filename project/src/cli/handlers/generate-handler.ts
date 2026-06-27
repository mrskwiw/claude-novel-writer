/**
 * AI Generation CLI Handlers
 */

import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import type { SynopsisLength } from '../../types/novel.js';
import { NovelWriterExtension } from '../../index.js';
import type { ParsedArgs, OutputFormatter } from '../types.js';
import { GenerationManager } from '../../ai/generation-manager.js';
import { ClaudeClient } from '../../ai/claude-client.js';
import { handleGenerateOpeningLines } from './craft-handler.js';

export async function handleGenerateCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  if (!ClaudeClient.isConfigured()) {
    output.info('No ANTHROPIC_API_KEY — running in context-prompt mode.');
    output.info('Claude Code will generate content from the assembled context below.');
    output.newline();
  }

  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'character':
      await handleGenerateCharacter(args, projectPath, output, injectedExtension);
      break;
    case 'location':
      await handleGenerateLocation(args, projectPath, output, injectedExtension);
      break;
    case 'continue':
      await handleGenerateContinuation(args, projectPath, output, injectedExtension);
      break;
    case 'dialogue':
      await handleGenerateDialogue(args, projectPath, output, injectedExtension);
      break;
    case 'describe':
      await handleGenerateDescription(args, projectPath, output, injectedExtension);
      break;
    case 'plot':
      await handleGeneratePlot(args, projectPath, output, injectedExtension);
      break;
    case 'next-sentence':
      await handleGenerateNextSentence(args, projectPath, output, injectedExtension);
      break;
    case 'synopsis':
      await handleGenerateSynopsis(args, projectPath, output, injectedExtension);
      break;
    case 'summary':
      await handleGenerateSummary(args, projectPath, output, injectedExtension);
      break;
    case 'pitch':
      await handleGeneratePitch(args, projectPath, output, injectedExtension);
      break;
    case 'query-letter':
      await handleGenerateQueryLetter(args, projectPath, output, injectedExtension);
      break;
    case 'comps':
      await handleGenerateComps(args, projectPath, output, injectedExtension);
      break;
    case 'opening-lines':
      await handleGenerateOpeningLines(args, projectPath, output, injectedExtension);
      break;
    case 'name':
      await handleGenerateName(args, projectPath, output, injectedExtension);
      break;
    case 'premise':
      await handleGeneratePremise(args, projectPath, output, injectedExtension);
      break;
    case 'sketch':
      await handleGenerateSketch(args, projectPath, output, injectedExtension);
      break;
    default:
      output.error('Unknown generation type. Use: character, location, continue, dialogue, describe, plot, next-sentence, synopsis, summary, pitch, query-letter, comps, opening-lines, name, premise, sketch');
  }
}

/**
 * Handle `generate summary --chapter N` — summarize a chapter (≤5 sentences) for
 * story-context memory. Uses the live API when ANTHROPIC_API_KEY is set,
 * otherwise hands the prompt to the Claude Code session (passthrough).
 */
async function handleGenerateSummary(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const chapterNum = args.flags['chapter'] as number | undefined;
    if (chapterNum === undefined) {
      output.error('Specify the chapter to summarize: /novel generate summary --chapter N');
      return;
    }

    // Resolve the chapter file by leading numeric prefix.
    const { readdir, readFile } = await import('fs/promises');
    const chaptersDir = join(projectPath, 'chapters');
    let entries: string[];
    try {
      entries = (await readdir(chaptersDir)).filter((f) => f.endsWith('.md'));
    } catch {
      output.error(`chapters/ directory not found at ${chaptersDir}`);
      return;
    }
    const padded = String(chapterNum).padStart(2, '0');
    const match = entries.find(
      (f) => f.startsWith(padded) || f.includes(`-${padded}`) || f.includes(`-${chapterNum}`)
    );
    if (!match) {
      output.error(`No chapter file found for chapter ${chapterNum} in ${chaptersDir}`);
      return;
    }

    const raw = await readFile(join(chaptersDir, match), 'utf-8');
    // Pull the title from frontmatter if present, then strip frontmatter + markup.
    const titleMatch = raw.match(/^title:\s*["']?(.+?)["']?\s*$/m);
    const title = titleMatch ? titleMatch[1] : undefined;
    const prose = raw
      .replace(/^---\n[\s\S]*?\n---\n/, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .trim();

    if (!prose) {
      output.error(`Chapter ${chapterNum} has no prose to summarize yet.`);
      return;
    }

    // Resolve the real project id (avoids the projectId=1 default).
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    if (extension.getProjectId() === undefined) {
      await extension.loadProjectId();
    }
    const mcpClient = (extension as unknown as { mcpClient: import('../../core/database.js').MCPClient }).mcpClient;
    const projectId = extension.getProjectId() ?? 1;

    const generator = new GenerationManager(mcpClient, projectId);
    const result = await generator.generateChapterSummary(prose, title);

    if (result.passthrough) {
      output.heading(`Chapter ${chapterNum} summary — generate it below`);
      output.info('No ANTHROPIC_API_KEY set, so this session will write the summary.');
      output.newline();
      output.code(result.content);
      output.newline();
      output.info(
        `Then add it to the chapter as a \`summary: "..."\` frontmatter field in ` +
        `chapters/${match}, and run: novel-writer sync chapters`
      );
    } else {
      output.success(`Chapter ${chapterNum} summary:`);
      output.newline();
      output.code(result.content);
      output.newline();
      output.info(
        `Save it: add \`summary: "${result.content.replace(/"/g, "'").slice(0, 60)}..."\` to ` +
        `chapters/${match} frontmatter, then run: novel-writer sync chapters`
      );
    }
  } catch (err) {
    output.error(`Summary generation failed: ${(err as Error).message}`);
  }
}

async function handleGenerateCharacter(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const description = args.flags['description'] as string;

    if (!description) {
      output.error('Please provide a character description with --description');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = (extension as any).projectId || 1;

    const generator = new GenerationManager(mcpClient, projectId);

    output.info(`Generating character profile: "${description}"`);
    output.newline();

    const result = await generator.generateCharacter(description, {
      temperature: args.flags['temperature'] as number,
    });

    output.success('Generated Character Profile:');
    output.newline();
    output.code(result.content);
    output.newline();

    if (result.reasoning) {
      output.dim(`💡 ${result.reasoning}`);
      output.newline();
    }

    // Save if requested
    if (args.flags['save']) {
      const characterName = description.split(' ').slice(0, 2).join('-').toLowerCase();
      const outputPath = (args.flags['output'] as string) ||
                        join(projectPath, 'characters', `${characterName}.yml`);

      await writeFile(outputPath, result.content, 'utf-8');
      output.success(`Saved to: ${outputPath}`);
      output.dim('Tip: Review and edit the profile, then sync with /novel sync characters');
    } else {
      output.dim('Tip: Add --save to save this profile to a file');
    }

  } catch (error) {
    output.error(`Failed to generate character: ${(error as Error).message}`);
  }
}

async function handleGenerateLocation(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const description = args.flags['description'] as string;

    if (!description) {
      output.error('Please provide a location description with --description');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = (extension as any).projectId || 1;

    const generator = new GenerationManager(mcpClient, projectId);

    output.info(`Generating location: "${description}"`);
    output.newline();

    const result = await generator.generateLocation(description);

    output.success('Generated Location:');
    output.newline();
    output.code(result.content);
    output.newline();

    if (result.reasoning) {
      output.dim(`💡 ${result.reasoning}`);
      output.newline();
    }

    if (args.flags['save']) {
      const locationName = description.split(' ').slice(0, 2).join('-').toLowerCase();
      const outputPath = (args.flags['output'] as string) ||
                        join(projectPath, 'locations', `${locationName}.yml`);

      await writeFile(outputPath, result.content, 'utf-8');
      output.success(`Saved to: ${outputPath}`);
      output.dim('Tip: Review and edit, then sync with /novel sync locations');
    }

  } catch (error) {
    output.error(`Failed to generate location: ${(error as Error).message}`);
  }
}

async function handleGenerateContinuation(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const sceneId = args.flags['scene'] as number;

    if (!sceneId) {
      output.error('Please provide a scene ID with --scene');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = (extension as any).projectId || 1;

    const generator = new GenerationManager(mcpClient, projectId);

    output.info(`Generating continuation suggestions for scene ${sceneId}...`);
    output.newline();

    // Mock current text for now
    const currentText = "She looked out the window at the approaching storm.";

    const result = await generator.suggestSceneContinuation(currentText, sceneId, {
      pov: args.flags['pov'] as string,
      style: args.flags['style'] as 'descriptive' | 'action' | 'dialogue' | 'introspective',
    });

    output.success('Continuation Suggestions:');
    output.newline();

    output.info('Option 1:');
    output.dim(result.content);
    output.newline();

    if (result.alternatives) {
      result.alternatives.forEach((alt, i) => {
        output.info(`Option ${i + 2}:`);
        output.dim(alt);
        output.newline();
      });
    }

    if (result.reasoning) {
      output.dim(`💡 ${result.reasoning}`);
    }

  } catch (error) {
    output.error(`Failed to generate continuation: ${(error as Error).message}`);
  }
}

async function handleGenerateDialogue(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const characterName = args.flags['character'] as string;
    const dialogue = args.flags['description'] as string;

    if (!characterName || !dialogue) {
      output.error('Please provide --character and --description (dialogue text)');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = (extension as any).projectId || 1;

    const generator = new GenerationManager(mcpClient, projectId);

    output.info(`Enhancing dialogue for ${characterName}...`);
    output.newline();

    const result = await generator.enhanceDialogue(dialogue, characterName);

    output.success('Enhanced Dialogue:');
    output.newline();
    output.dim(`"${result.content}"`);
    output.newline();

    if (result.reasoning) {
      output.dim(`💡 ${result.reasoning}`);
    }

  } catch (error) {
    output.error(`Failed to enhance dialogue: ${(error as Error).message}`);
  }
}

async function handleGenerateDescription(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const text = args.flags['description'] as string;
    const pov = args.flags['pov'] as string;

    if (!text) {
      output.error('Please provide text to expand with --description');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = (extension as any).projectId || 1;

    const generator = new GenerationManager(mcpClient, projectId);

    output.info(`Expanding description${pov ? ` (POV: ${pov})` : ''}...`);
    output.newline();

    const result = await generator.expandDescription(text, pov);

    output.success('Expanded Description:');
    output.newline();
    output.dim(result.content);
    output.newline();

    if (result.reasoning) {
      output.dim(`💡 ${result.reasoning}`);
    }

  } catch (error) {
    output.error(`Failed to expand description: ${(error as Error).message}`);
  }
}

async function handleGenerateNextSentence(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const sceneId = args.flags['scene'] as number;

    if (!sceneId) {
      output.error('Please provide a scene ID with --scene');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = (extension as any).projectId || 1;

    const generator = new GenerationManager(mcpClient, projectId);

    output.info(`Generating next sentence for scene ${sceneId}...`);
    output.newline();

    const result = await generator.generateNextSentence(String(projectId), sceneId);

    output.success('One true sentence:');
    output.newline();
    output.dim(result.content);
    output.newline();

    if (result.reasoning) {
      output.dim(`💡 ${result.reasoning}`);
    }
  } catch (error) {
    output.error(`Failed to generate next sentence: ${(error as Error).message}`);
  }
}

async function handleGeneratePlot(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const threadName = args.flags['description'] as string;

    if (!threadName) {
      output.error('Please provide plot thread name with --description');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = (extension as any).projectId || 1;

    const generator = new GenerationManager(mcpClient, projectId);

    output.info(`Generating plot development suggestions for: "${threadName}"`);
    output.newline();

    const result = await generator.suggestPlotDevelopment(threadName, 'active');

    output.success('Plot Development Suggestions:');
    output.newline();

    output.info('Option 1:');
    output.dim(result.content);
    output.newline();

    if (result.alternatives) {
      result.alternatives.forEach((alt, i) => {
        output.info(`Option ${i + 2}:`);
        output.dim(alt);
        output.newline();
      });
    }

    if (result.reasoning) {
      output.dim(`💡 ${result.reasoning}`);
    }

  } catch (error) {
    output.error(`Failed to generate plot suggestions: ${(error as Error).message}`);
  }
}

async function handleGenerateSynopsis(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const rawLength = (args.flags['length'] as string) || 'short';
    const validLengths: SynopsisLength[] = ['short', 'medium', 'long'];
    if (!validLengths.includes(rawLength as SynopsisLength)) {
      output.error(`Invalid --length. Choose one of: short, medium, long`);
      return;
    }
    const length = rawLength as SynopsisLength;

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = String((extension as any).projectId || 1);

    const generator = new GenerationManager(mcpClient, Number(projectId));

    output.info(`Generating ${length} synopsis...`);
    output.newline();

    const result = await generator.generateSynopsis(projectId, length);

    output.success(`${length.charAt(0).toUpperCase() + length.slice(1)} Synopsis:`);
    output.newline();
    output.dim(result.content);
    output.newline();

    if (result.reasoning) {
      output.dim(`💡 ${result.reasoning}`);
      output.newline();
    }

    if (args.flags['save']) {
      const exportDir = join(projectPath, 'export');
      await mkdir(exportDir, { recursive: true });
      const outputPath = join(exportDir, `synopsis-${length}.md`);
      await writeFile(outputPath, result.content, 'utf-8');
      output.success(`Saved to: ${outputPath}`);
    } else {
      output.dim('Tip: Add --save to save this synopsis to export/synopsis-[length].md');
    }
  } catch (error) {
    output.error(`Failed to generate synopsis: ${(error as Error).message}`);
  }
}

async function handleGeneratePitch(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = String((extension as any).projectId || 1);

    const generator = new GenerationManager(mcpClient, Number(projectId));

    output.info('Generating 25-word elevator pitch...');
    output.newline();

    const result = await generator.generatePitch(projectId);

    output.success('Elevator Pitch:');
    output.newline();
    output.dim(result.content);
    output.newline();

    if (result.reasoning) {
      output.dim(`💡 ${result.reasoning}`);
    }
  } catch (error) {
    output.error(`Failed to generate pitch: ${(error as Error).message}`);
  }
}

async function handleGenerateQueryLetter(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = String((extension as any).projectId || 1);

    const generator = new GenerationManager(mcpClient, Number(projectId));

    // Parse optional comp titles from --comps "Title by Author, ..."
    const compsRaw = args.flags['comps'] as string | undefined;
    const compTitles = compsRaw
      ? compsRaw.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    output.info('Generating query letter...');
    output.newline();

    const result = await generator.generateQueryLetter(projectId, compTitles);

    output.success('Query Letter:');
    output.newline();
    output.dim(result.content);
    output.newline();

    if (result.reasoning) {
      output.dim(`💡 ${result.reasoning}`);
    }
  } catch (error) {
    output.error(`Failed to generate query letter: ${(error as Error).message}`);
  }
}

async function handleGenerateComps(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = String((extension as any).projectId || 1);

    const generator = new GenerationManager(mcpClient, Number(projectId));

    output.info('Suggesting comparative titles (2020–2025)...');
    output.newline();

    const result = await generator.generateComps(projectId);

    output.success('Comparative Titles:');
    output.newline();
    output.dim(result.content);
    output.newline();

    if (result.reasoning) {
      output.dim(`💡 ${result.reasoning}`);
    }
  } catch (error) {
    output.error(`Failed to generate comp titles: ${(error as Error).message}`);
  }
}

// ── PROC-01: Ideation extras ─────────────────────────────────────────────────

/**
 * Handle `generate name [--culture X] [--gender X] [--count N] [--type X]`
 *
 * Generates character name options with cultural context and meaning.
 */
async function handleGenerateName(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = (extension as any).projectId || 1;

    const generator = new GenerationManager(mcpClient, projectId);

    const culture = args.flags['culture'] as string | undefined;
    const gender = args.flags['gender'] as 'male' | 'female' | 'neutral' | undefined;
    const count = args.flags['count'] as number | undefined;
    const type = args.flags['type'] as 'first' | 'last' | 'full' | undefined;

    const label = [
      count ?? 5,
      gender ?? 'any gender',
      culture ? `${culture}-origin` : 'any culture',
      `${type ?? 'full'} names`,
    ].join(' ');

    output.info(`Generating ${label}...`);
    output.newline();

    const result = await generator.generateName({ culture, gender, count, type });

    output.success('Name Options:');
    output.newline();
    output.dim(result.content);
    output.newline();

    if (result.reasoning) {
      output.dim(`Tip: ${result.reasoning}`);
    }
  } catch (error) {
    output.error(`Failed to generate names: ${(error as Error).message}`);
  }
}

/**
 * Handle `generate premise --idea "X"`
 *
 * Workshops a partial premise through five structured development questions.
 */
async function handleGeneratePremise(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const idea = (args.flags['idea'] as string | undefined) ?? (args.positional[1] as string | undefined);

    if (!idea) {
      output.error('Please provide your premise idea with --idea "..."');
      return;
    }

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = String((extension as any).projectId || 1);

    const generator = new GenerationManager(mcpClient, Number(projectId));

    output.info(`Workshopping premise: "${idea}"`);
    output.newline();

    const result = await generator.workshopPremise(projectId, idea);

    output.success('Premise Development Worksheet:');
    output.newline();
    output.dim(result.content);
    output.newline();

    if (result.reasoning) {
      output.dim(`Tip: ${result.reasoning}`);
    }
  } catch (error) {
    output.error(`Failed to workshop premise: ${(error as Error).message}`);
  }
}

/**
 * Handle `generate sketch [--role X] [--genre X] [--notes X]`
 *
 * Generates a lightweight character sketch to quickly capture an idea.
 */
async function handleGenerateSketch(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const role = args.flags['role'] as string | undefined;
    const genre = args.flags['genre'] as string | undefined;
    const notes = args.flags['notes'] as string | undefined;

    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = (extension as any).projectId || 1;

    const generator = new GenerationManager(mcpClient, projectId);

    output.info(`Generating character sketch${role ? ` for ${role}` : ''}...`);
    output.newline();

    const result = await generator.generateCharacterSketch({ role, genre, notes });

    output.success('Character Sketch:');
    output.newline();
    output.dim(result.content);
    output.newline();

    if (result.reasoning) {
      output.dim(`Tip: ${result.reasoning}`);
    }
  } catch (error) {
    output.error(`Failed to generate character sketch: ${(error as Error).message}`);
  }
}
