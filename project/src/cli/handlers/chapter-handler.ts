/**
 * Chapter command handler
 */

import type { ParsedArgs } from '../types.js';
import type { OutputFormatter } from '../output.js';
import { ChapterBuilder } from '../../builders/chapter-builder.js';
import { ChapterSync } from '../../sync/chapter-sync.js';
import { DirectSQLiteClient } from '../../core/database.js';
import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import YAML from 'yaml';

// ─── DB row types ─────────────────────────────────────────────────────────────

interface ChapterCheckRow {
  id: number;
  chapter_number: number;
  title: string | null;
  summary: string | null;
  notes: string | null;
  scene_count: number;
  avg_tension: number | null;
  total_words: number;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function handleChapterCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const subcommand = args.subcommand;

  if (!subcommand) {
    output.error('No subcommand provided. Use: create, list, sync, or stats');
    return;
  }

  switch (subcommand) {
    case 'create':
      await handleCreate(args, projectPath, output);
      break;
    case 'list':
      await handleList(args, projectPath, output);
      break;
    case 'sync':
      await handleSync(args, projectPath, output);
      break;
    case 'stats':
      await handleStats(args, projectPath, output);
      break;
    case 'check':
      await handleCheck(args, projectPath, output);
      break;
    default:
      output.error(`Unknown subcommand: ${subcommand}`);
  }
}

/**
 * Handle chapter create
 */
async function handleCreate(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const builder = new ChapterBuilder({ projectPath });

  // Interactive mode
  if (args.flags.interactive) {
    output.info('Starting interactive chapter creation...\n');

    const filePath = await builder.createInteractive(async (prompt, options) => {
      // This would integrate with Claude Code's prompt system
      // For now, throw error as we need the prompt integration
      throw new Error(
        'Interactive mode requires prompt integration - use non-interactive mode for now'
      );
    });

    output.success(`Chapter created: ${basename(filePath)}`);
    return;
  }

  // Non-interactive mode - requires title
  const title = args.flags.title as string;
  if (!title) {
    output.error('Chapter title is required (use --title or -t)');
    return;
  }

  // Get chapter number (auto-increment if not provided)
  let chapterNumber = args.flags.number as number | undefined;
  if (!chapterNumber) {
    chapterNumber = await builder.getNextChapterNumber();
    output.info(`Using chapter number: ${chapterNumber}`);
  }

  // Use template if specified
  if (args.flags.template) {
    const templateName = args.flags.template as string;
    try {
      const filePath = await builder.createFromTemplate(
        chapterNumber,
        title,
        templateName
      );
      output.success(`Chapter created from template: ${basename(filePath)}`);
    } catch (error: unknown) {
      output.error(`Failed to create chapter: ${(error as Error).message}`);
    }
    return;
  }

  // Create with metadata
  try {
    const metadata = {
      title,
      status: ((args.flags.status as string) || 'drafted') as 'planned' | 'drafted' | 'revised' | 'polished' | 'final',
      povCharacter: args.flags.pov as string | undefined,
    };

    const filePath = await builder.create(chapterNumber, metadata);
    output.success(`Chapter created: ${basename(filePath)}`);
    output.info(`Path: ${filePath}`);
  } catch (error: unknown) {
    output.error(`Failed to create chapter: ${(error as Error).message}`);
  }
}

/**
 * Handle chapter list
 */
async function handleList(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const builder = new ChapterBuilder({ projectPath });

  try {
    const chapters = await builder.list();

    if (chapters.length === 0) {
      output.warning('No chapters found');
      return;
    }

    output.info(`Found ${chapters.length} chapter(s):\n`);

    // Read and display chapter metadata
    for (const filePath of chapters) {
      const content = await readFile(filePath, 'utf-8');
      const metadata = parseChapterFrontmatter(content);
      const wordCount = countWords(content);

      const filename = basename(filePath);
      const chapterMatch = filename.match(/^(\d+)/);
      const chapterNum = chapterMatch ? chapterMatch[1] : '?';

      output.info(`Chapter ${chapterNum}: ${(metadata.title as string | undefined) ?? 'Untitled'}`);
      output.dim(`  Status: ${(metadata.status as string | undefined) ?? 'drafted'} | Words: ${wordCount}`);
      if (metadata.povCharacter) {
        output.dim(`  POV: ${metadata.povCharacter as string}`);
      }
      if (metadata.summary) {
        output.dim(`  Summary: ${metadata.summary as string}`);
      }
      output.info(''); // Blank line
    }
  } catch (error: unknown) {
    output.error(`Failed to list chapters: ${(error as Error).message}`);
  }
}

/**
 * Handle chapter sync
 */
async function handleSync(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const builder = new ChapterBuilder({ projectPath });

  try {
    const chapters = await builder.list();

    if (chapters.length === 0) {
      output.warning('No chapters to sync');
      return;
    }

    output.info(`Syncing ${chapters.length} chapter(s)...\n`);

    // Note: This requires a project ID from the database
    // For now, show what would be synced
    for (const filePath of chapters) {
      const filename = basename(filePath);
      output.info(`Would sync: ${filename}`);
    }

    output.warning(
      '\nNote: Chapter sync requires initialized project database'
    );
    output.info('Run `/novel init` first to enable database sync');
  } catch (error: unknown) {
    output.error(`Failed to sync chapters: ${(error as Error).message}`);
  }
}

/**
 * Handle chapter stats
 */
async function handleStats(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const builder = new ChapterBuilder({ projectPath });

  try {
    const chapters = await builder.list();

    if (chapters.length === 0) {
      output.warning('No chapters found');
      return;
    }

    let totalWords = 0;
    const statusCounts: Record<string, number> = {};

    for (const filePath of chapters) {
      const content = await readFile(filePath, 'utf-8');
      const metadata = parseChapterFrontmatter(content);
      const wordCount = countWords(content);

      totalWords += wordCount;

      const status = (metadata.status as string | undefined) ?? 'drafted';
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }

    output.info('=== Chapter Statistics ===\n');
    output.info(`Total chapters: ${chapters.length}`);
    output.info(`Total words: ${totalWords.toLocaleString()}`);
    output.info(
      `Average words per chapter: ${Math.round(totalWords / chapters.length)}`
    );

    output.info('\nChapters by status:');
    for (const [status, count] of Object.entries(statusCounts)) {
      output.info(`  ${status}: ${count}`);
    }
  } catch (error: unknown) {
    output.error(`Failed to calculate stats: ${(error as Error).message}`);
  }
}

/**
 * Handle chapter check — quality checklist for a chapter
 */
async function handleCheck(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const chapterNum = args.flags.chapter as number | undefined;

  if (!chapterNum) {
    output.error('Please provide a chapter number with --chapter (e.g. --chapter 3)');
    return;
  }

  const dbPath = join(projectPath, '.novel', 'data.db');
  if (!existsSync(dbPath)) {
    output.error('Project not initialized. Run `/novel init` first.');
    return;
  }

  const mcpClient = new DirectSQLiteClient(dbPath);

  try {
    // Discover projectId from the first project row
    const projects = await mcpClient.readQuery<{ id: number }>(
      'SELECT id FROM projects LIMIT 1',
      []
    );

    if (projects.length === 0) {
      output.error('No project found in database. Run `/novel init` first.');
      return;
    }

    const projectId: number = projects[0].id;

    // Fetch chapter with scene stats in one query
    const rows = await mcpClient.readQuery<ChapterCheckRow>(
      `SELECT c.id, c.chapter_number, c.title, c.summary, c.notes,
              COUNT(s.id) as scene_count,
              AVG(s.tension_level) as avg_tension,
              COALESCE(SUM(s.word_count), 0) as total_words
       FROM chapters c
       LEFT JOIN scenes s ON s.chapter_id = c.id
       WHERE c.chapter_number = ? AND c.project_id = ?
       GROUP BY c.id`,
      [chapterNum, projectId]
    );

    if (rows.length === 0) {
      output.error(`Chapter ${chapterNum} not found in database. Run \`/novel chapter sync\` first.`);
      return;
    }

    const chapter = rows[0];
    const title = chapter.title || 'Untitled';
    const sceneCount = Number(chapter.scene_count) || 0;
    const avgTension = Number(chapter.avg_tension) || 0;
    const wordCount = Number(chapter.total_words) || 0;

    // Check: has conflict (any scene with tension_level >= 5)
    const hasConflict = avgTension >= 5;

    // Check: purpose declared
    const hasPurpose = Boolean(chapter.notes && String(chapter.notes).trim().length > 0);

    // Check: character change (look for change indicators in summary)
    const changeIndicators = ['changed', 'realised', 'realized', 'decided', 'grew', 'learned', 'lost', 'found', 'transformed', 'broke', 'overcame', 'accepted', 'admitted', 'confessed'];
    const summaryText = (chapter.summary || '').toLowerCase();
    const hasCharacterChange = changeIndicators.some(word => summaryText.includes(word));

    const tick = (cond: boolean) => (cond ? '✓' : '✗');

    output.info(`Chapter ${chapterNum}: "${title}" — Checklist`);
    output.info('─'.repeat(50));
    output.dim(`${tick(hasPurpose)}  Purpose declared: ${hasPurpose ? String(chapter.notes).slice(0, 60) : 'NOT SET'}`);
    output.dim(`${tick(hasConflict)}  Has conflict: ${hasConflict ? `avg tension ${avgTension.toFixed(1)}/10` : 'no scenes with tension >= 5'}`);
    output.dim(`${tick(hasCharacterChange)}  Character change: ${hasCharacterChange ? 'indicators found in summary' : 'manual check required'}`);
    output.dim(`${tick(sceneCount > 0)}  Scene count: ${sceneCount} scene${sceneCount !== 1 ? 's' : ''}`);
    output.dim(`${tick(wordCount > 0)}  Word count: ~${wordCount.toLocaleString()} words`);

  } catch (error) {
    output.error(`Failed to check chapter: ${(error as Error).message}`);
  }
}

/**
 * Parse YAML frontmatter from chapter markdown
 */
function parseChapterFrontmatter(content: string): Record<string, unknown> {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    return {};
  }

  try {
    return YAML.parse(frontmatterMatch[1]);
  } catch {
    return {};
  }
}

/**
 * Count words in chapter (excluding frontmatter)
 */
function countWords(content: string): number {
  // Remove frontmatter
  let text = content.replace(/^---\n[\s\S]*?\n---\n/, '');

  // Remove markdown syntax
  text = text
    .replace(/^#{1,6}\s+/gm, '') // Headers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
    .replace(/\*([^*]+)\*/g, '$1') // Italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/`([^`]+)`/g, '$1'); // Code

  // Count words
  const words = text.trim().split(/\s+/);
  return words.filter((w) => w.length > 0).length;
}
