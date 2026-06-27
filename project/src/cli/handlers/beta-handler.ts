/**
 * Beta Reader CLI Handler — SPEC-11
 *
 * Handles the `beta` command and its subcommands:
 *   add, list, feedback, report, resolve
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { NovelWriterExtension } from '../../index.js';
import { BetaReaderService } from '../../services/beta-reader-service.js';
import type { BetaFeedbackType } from '../../types/novel.js';

const VALID_FEEDBACK_TYPES: BetaFeedbackType[] = [
  'pacing',
  'character',
  'plot',
  'clarity',
  'emotion',
  'other',
];

/**
 * Entry point for the `beta` command.
 */
export async function handleBetaCommand(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'add':
      await handleAdd(args, output, extension);
      break;
    case 'list':
      await handleList(args, output, extension);
      break;
    case 'feedback':
      await handleFeedback(args, output, extension);
      break;
    case 'report':
      await handleReport(args, output, extension);
      break;
    case 'resolve':
      await handleResolve(args, output, extension);
      break;
    default:
      output.error(`Unknown beta subcommand: "${subcommand ?? ''}"`);
      output.info('Available subcommands: add, list, feedback, report, resolve');
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Extract BetaReaderService from the extension or throw if unavailable. */
function getService(extension?: NovelWriterExtension): BetaReaderService {
  if (!extension) {
    throw new Error('No active project. Run /novel init first.');
  }
  return (extension as unknown as { getBetaReaderService(): BetaReaderService }).getBetaReaderService();
}

/** Resolve projectId string from extension or fallback to "1". */
function resolveProjectId(extension?: NovelWriterExtension): string {
  if (!extension) return '1';
  return (
    (extension as unknown as { projectId?: string | number }).projectId?.toString() ?? '1'
  );
}

/** Truncate a string to `max` chars, appending '…' if needed. */
function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

// ── subcommand handlers ───────────────────────────────────────────────────────

/**
 * `beta add --name "Alex" [--email "x@y.com"] [--chapters "1-10"]`
 */
async function handleAdd(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const name =
    (args.flags['name'] as string | undefined) ??
    (args.positional[1] as string | undefined);

  if (!name) {
    output.error('Please provide a reader name: /novel beta add --name "Alex"');
    return;
  }

  const email = args.flags['email'] as string | undefined;
  const chaptersRaw = args.flags['chapters'] as string | undefined;
  const chapters = chaptersRaw
    ? chaptersRaw.split(',').map((c) => c.trim()).filter(Boolean)
    : undefined;

  try {
    const svc = getService(extension);
    const projectId = resolveProjectId(extension);
    const reader = await svc.addReader(projectId, name, { email, chapters });

    output.success(`Beta reader added: ${reader.id}`);
    output.keyValue({
      ID: reader.id,
      Name: reader.name,
      Email: reader.email ?? '—',
      Chapters: reader.chapters.length > 0 ? reader.chapters.join(', ') : '(all)',
      Status: reader.status,
    });
  } catch (err) {
    output.error(`Failed to add beta reader: ${(err as Error).message}`);
  }
}

/**
 * `beta list` — table: name, email, chapters, status, feedback count
 */
async function handleList(
  _args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  try {
    const svc = getService(extension);
    const projectId = resolveProjectId(extension);

    const [readers, allFeedback] = await Promise.all([
      svc.listReaders(projectId),
      svc.listFeedback(projectId),
    ]);

    if (readers.length === 0) {
      output.info('No beta readers found. Use /novel beta add to add one.');
      return;
    }

    // Build feedback count per reader
    const feedbackCounts = new Map<string, number>();
    for (const fb of allFeedback) {
      feedbackCounts.set(fb.readerId, (feedbackCounts.get(fb.readerId) ?? 0) + 1);
    }

    output.heading(`Beta Readers (${readers.length})`);
    output.newline();

    const tableData = readers.map((r) => ({
      Name: truncate(r.name, 20),
      Email: r.email ? truncate(r.email, 30) : '—',
      Chapters: r.chapters.length > 0 ? r.chapters.join(', ') : '(all)',
      Status: r.status,
      Feedback: feedbackCounts.get(r.id) ?? 0,
    }));

    output.table(tableData, ['Name', 'Email', 'Chapters', 'Status', 'Feedback']);
  } catch (err) {
    output.error(`Failed to list beta readers: ${(err as Error).message}`);
  }
}

/**
 * `beta feedback --reader "Alex" --chapter N --type pacing --note "..."`
 */
async function handleFeedback(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const readerName =
    (args.flags['reader'] as string | undefined) ??
    (args.flags['name'] as string | undefined);
  const chapterId = args.flags['chapter'] as number | undefined;
  const typeRaw = args.flags['type'] as string | undefined;
  const note = args.flags['note'] as string | undefined;

  if (!readerName) {
    output.error('Please provide --reader "Name"');
    return;
  }
  if (!typeRaw) {
    output.error(`Please provide --type (${VALID_FEEDBACK_TYPES.join(' | ')})`);
    return;
  }
  if (!VALID_FEEDBACK_TYPES.includes(typeRaw as BetaFeedbackType)) {
    output.error(
      `Invalid feedback type "${typeRaw}". Valid types: ${VALID_FEEDBACK_TYPES.join(', ')}`
    );
    return;
  }
  if (!note) {
    output.error('Please provide --note "feedback text"');
    return;
  }

  try {
    const svc = getService(extension);
    const projectId = resolveProjectId(extension);
    const feedback = await svc.addFeedback(
      projectId,
      readerName,
      chapterId,
      typeRaw as BetaFeedbackType,
      note
    );

    output.success(`Feedback recorded: ${feedback.id}`);
    output.keyValue({
      ID: feedback.id,
      Reader: readerName,
      Chapter: feedback.chapterId !== undefined ? String(feedback.chapterId) : '—',
      Type: feedback.feedbackType,
      Note: truncate(feedback.note, 60),
      Resolved: 'no',
    });
  } catch (err) {
    output.error(`Failed to record feedback: ${(err as Error).message}`);
  }
}

/**
 * `beta report` — aggregated report by chapter and by type; show unresolved count
 */
async function handleReport(
  _args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  try {
    const svc = getService(extension);
    const projectId = resolveProjectId(extension);
    const report = await svc.generateReport(projectId);

    output.heading('Beta Reader Report');
    output.newline();

    output.keyValue({
      'Total Readers': report.totalReaders,
      'Total Feedback': report.totalFeedback,
      'Unresolved': report.unresolved,
    });

    output.newline();
    output.heading('Feedback by Type');
    output.newline();

    const byTypeTable = Object.entries(report.byType).map(([type, count]) => ({
      Type: type,
      Count: count,
    }));
    output.table(byTypeTable, ['Type', 'Count']);

    const chapterNumbers = Object.keys(report.byChapter)
      .map(Number)
      .sort((a, b) => a - b);

    if (chapterNumbers.length > 0) {
      output.newline();
      output.heading('Feedback by Chapter');
      output.newline();

      const byChapterTable = chapterNumbers.map((n) => {
        const data = report.byChapter[n];
        return {
          Chapter: n,
          Count: data.count,
          Types: Object.entries(data.types)
            .map(([t, c]) => `${t}:${c}`)
            .join(', '),
        };
      });
      output.table(byChapterTable, ['Chapter', 'Count', 'Types']);
    }
  } catch (err) {
    output.error(`Failed to generate report: ${(err as Error).message}`);
  }
}

/**
 * `beta resolve --id <feedback-id>`
 */
async function handleResolve(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const id =
    (args.flags['id'] as string | undefined) ??
    (args.positional[1] as string | undefined);

  if (!id) {
    output.error('Please provide a feedback id: /novel beta resolve --id <id>');
    return;
  }

  try {
    const svc = getService(extension);
    await svc.resolveFeedback(id);
    output.success(`Feedback ${id} marked as resolved.`);
  } catch (err) {
    output.error(`Failed to resolve feedback: ${(err as Error).message}`);
  }
}
