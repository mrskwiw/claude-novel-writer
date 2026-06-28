/**
 * Revise CLI Handler — mechanical prose fixes
 *
 * Handles:
 *   /novel revise <chapter>                     (dry run — preview only)
 *   /novel revise <chapter> --apply cat1,cat2   (apply listed categories)
 *   /novel revise <chapter> --all               (apply every safe category)
 *
 * `<chapter>` may be a chapter number (matched against the leading numeric
 * prefix of files in `chapters/`) or a literal `.md` filename.
 */

import { readdir } from 'fs/promises';
import { join } from 'path';
import {
  ProseFixer,
  ALL_CATEGORIES,
  isReviseCategory,
  type ReviseCategory,
  type ReviseChange,
} from '../../analysis/prose-fixer.js';
import type { ParsedArgs, OutputFormatter } from '../types.js';

const SNAPSHOT_TIP =
  'Tip: snapshot first so you can undo — novel revision snapshot --label "pre-revise"';

/**
 * Entry point for the `revise` command.
 *
 * @param args        - Parsed CLI arguments
 * @param projectPath - Absolute path to the novel project directory
 * @param output      - Output formatter
 */
export async function handleReviseCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  // The parser treats the first non-dash token as a subcommand, so the chapter
  // identifier can arrive as --chapter, the subcommand, or a positional arg.
  const chapterArg =
    (args.flags['chapter'] as string | number | undefined) ??
    args.subcommand ??
    args.positional[0];

  if (chapterArg === undefined || String(chapterArg).trim() === '') {
    output.error('Please provide a chapter: novel revise <chapter> [--apply cat1,cat2 | --all]');
    output.info(`Categories: ${ALL_CATEGORIES.join(', ')}`);
    return;
  }

  // Resolve which categories to apply (empty array = dry run).
  const applyFlag = args.flags['apply'];
  const allFlag = args.flags['all'] === true;

  let categories: ReviseCategory[];
  const isApplyMode = allFlag || applyFlag !== undefined;

  if (allFlag) {
    categories = [...ALL_CATEGORIES];
  } else if (applyFlag !== undefined) {
    const requested = String(applyFlag)
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    const invalid = requested.filter((c) => !isReviseCategory(c));
    if (invalid.length > 0) {
      output.error(`Unknown categor${invalid.length === 1 ? 'y' : 'ies'}: ${invalid.join(', ')}`);
      output.info(`Valid categories: ${ALL_CATEGORIES.join(', ')}`);
      return;
    }
    if (requested.length === 0) {
      output.error('No categories supplied to --apply.');
      output.info(`Valid categories: ${ALL_CATEGORIES.join(', ')}`);
      return;
    }
    categories = requested.filter(isReviseCategory);
  } else {
    // Dry run previews every category so the author sees the full picture.
    categories = [...ALL_CATEGORIES];
  }

  // Resolve the chapter file.
  let chapterFile: string;
  try {
    const resolved = await resolveChapterFile(projectPath, String(chapterArg));
    if (resolved === undefined) {
      output.error(`No chapter file found for "${chapterArg}".`);
      output.info('Expected a chapter number (e.g. 3) or a filename in chapters/ (e.g. 03-opening.md).');
      return;
    }
    chapterFile = resolved;
  } catch (err) {
    output.error(`Failed to read chapters directory: ${(err as Error).message}`);
    return;
  }

  // Run the fixer.
  try {
    const fixer = new ProseFixer(projectPath);
    const result = await fixer.reviseChapter(chapterFile, categories, {
      apply: isApplyMode,
    });

    output.heading(
      isApplyMode ? `Revise (apply): ${chapterFile}` : `Revise (dry run): ${chapterFile}`
    );
    output.newline();

    if (result.totalFixes === 0) {
      output.success('No mechanical issues found — nothing to change.');
      return;
    }

    renderChanges(result.changes, output);
    renderSummary(result.counts, result.totalFixes, result.changedLines, output);

    if (isApplyMode) {
      output.newline();
      output.success(
        `Applied ${result.totalFixes} fix(es) across ${result.changedLines} line(s). File written.`
      );
    } else {
      output.newline();
      output.info('Dry run — no files changed.');
      output.info('Re-run with --apply <categories> or --all to write these fixes.');
      output.warning(SNAPSHOT_TIP);
    }
  } catch (err) {
    output.error(`Failed to revise chapter: ${(err as Error).message}`);
  }
}

// ── rendering ─────────────────────────────────────────────────────────────────

/** Print a unified-diff-style preview of every changed line. */
function renderChanges(changes: ReviseChange[], output: OutputFormatter): void {
  for (const change of changes) {
    output.dim(`  Line ${change.line}  [${change.categories.join(', ')}]`);
    output.info(`  - ${change.before}`);
    output.info(`  + ${change.after}`);
  }
}

/** Print per-category counts and the totals. */
function renderSummary(
  counts: Record<ReviseCategory, number>,
  totalFixes: number,
  changedLines: number,
  output: OutputFormatter
): void {
  output.newline();
  output.heading('Summary');
  for (const category of ALL_CATEGORIES) {
    if (counts[category] > 0) {
      output.info(`  ${category}: ${counts[category]}`);
    }
  }
  output.dim(`  Total: ${totalFixes} fix(es) across ${changedLines} line(s)`);
}

// ── chapter resolution ────────────────────────────────────────────────────────

/**
 * Resolve a chapter identifier to a `.md` filename inside `chapters/`.
 *
 * @returns The basename of the matching file, or `undefined` if none matches.
 *          A literal `.md` argument is returned as-is when the file exists.
 */
async function resolveChapterFile(
  projectPath: string,
  identifier: string
): Promise<string | undefined> {
  const chaptersDir = join(projectPath, 'chapters');
  const entries = await readdir(chaptersDir);
  const mdFiles = entries.filter((f) => f.endsWith('.md')).sort();

  // Direct filename match.
  if (identifier.endsWith('.md')) {
    return mdFiles.includes(identifier) ? identifier : undefined;
  }

  // Numeric chapter-number match against the leading numeric prefix.
  const asNumber = parseInt(identifier, 10);
  if (!Number.isNaN(asNumber)) {
    return mdFiles.find((f) => {
      const match = f.match(/^(\d+)/);
      return match !== null && parseInt(match[1], 10) === asNumber;
    });
  }

  return undefined;
}
