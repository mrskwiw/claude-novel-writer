/**
 * Draft CLI Handler — SPEC-06 Drafting Support Tools
 *
 * Handles:
 *   /novel draft tk-list [--chapter N]
 *   /novel draft chapter-check <N>
 */

import { DraftScanner } from '../../analysis/draft-scanner.js';
import type { ParsedArgs, OutputFormatter } from '../types.js';

/**
 * Entry point for the `draft` command and its subcommands.
 *
 * @param args        - Parsed CLI arguments
 * @param projectPath - Absolute path to the novel project directory
 * @param output      - Output formatter
 */
export async function handleDraftCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'tk-list':
      await handleTkList(args, projectPath, output);
      break;
    case 'chapter-check':
      await handleChapterCheck(args, projectPath, output);
      break;
    default:
      output.error(`Unknown draft subcommand: "${subcommand ?? ''}"`);
      output.info('Available subcommands: tk-list, chapter-check');
  }
}

// ── subcommand handlers ──────────────────────────────────────────────────────

/**
 * `draft tk-list [--chapter N]`
 *
 * Lists all placeholder markers found in chapter files.
 */
async function handleTkList(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const chapterFlag = args.flags['chapter'] as number | undefined;
  const chapterFilter =
    chapterFlag !== undefined ? Number(chapterFlag) : undefined;

  const scanner = new DraftScanner(projectPath);

  try {
    const marks = await scanner.findPlaceholders(chapterFilter);

    if (marks.length === 0) {
      output.info(
        chapterFilter !== undefined
          ? `No placeholder markers found in chapter ${chapterFilter}.`
          : 'No placeholder markers found.'
      );
      return;
    }

    const header =
      chapterFilter !== undefined
        ? `Placeholder markers in chapter ${chapterFilter} (${marks.length})`
        : `Placeholder markers (${marks.length})`;

    output.heading(header);
    output.newline();

    let currentFile = '';
    for (const mark of marks) {
      if (mark.chapterFilename !== currentFile) {
        currentFile = mark.chapterFilename;
        output.info(`\n${currentFile}`);
      }
      const noteStr = mark.note ? `: ${mark.note}` : '';
      output.dim(
        `  Line ${mark.lineNumber} [${mark.marker}${noteStr}]  — ${mark.context}`
      );
    }
  } catch (err) {
    output.error(`Failed to scan for placeholders: ${(err as Error).message}`);
  }
}

/**
 * `draft chapter-check <N>`
 *
 * Runs a structural checklist on the specified chapter.
 */
async function handleChapterCheck(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const chapterArg = args.flags['chapter'] ?? args.positional[0];
  if (chapterArg === undefined) {
    output.error('Please provide a chapter number: novel-writer draft chapter-check <N>');
    return;
  }

  const chapterNumber = parseInt(String(chapterArg), 10);
  if (isNaN(chapterNumber) || chapterNumber < 1) {
    output.error(`Invalid chapter number: "${chapterArg}"`);
    return;
  }

  try {
    const checklist = await DraftScanner.checkChapter(projectPath, chapterNumber);
    output.info(checklist);
  } catch (err) {
    output.error(`Failed to check chapter: ${(err as Error).message}`);
  }
}
