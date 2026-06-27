/**
 * Series Management CLI Handler — PROC-11
 *
 * Handles the `series` command and all its subcommands:
 *   create, add-book, list, bible (add | list), threads, check
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { NovelWriterExtension } from '../../index.js';
import { SeriesManager } from '../../services/series-manager.js';

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Entry point for the `series` command.
 */
export async function handleSeriesCommand(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'create':
      await handleCreate(args, output, extension);
      break;
    case 'add-book':
      await handleAddBook(args, output, extension);
      break;
    case 'list':
      await handleList(args, output, extension);
      break;
    case 'bible': {
      const bibleAction = args.positional[1];
      if (bibleAction === 'add') {
        await handleBibleAdd(args, output, extension);
      } else if (bibleAction === 'list') {
        await handleBibleList(args, output, extension);
      } else {
        output.error(`Unknown bible action: "${bibleAction ?? ''}". Use "add" or "list".`);
      }
      break;
    }
    case 'threads':
      await handleThreads(args, output, extension);
      break;
    case 'check':
      await handleCheck(args, output, extension);
      break;
    default:
      output.error(`Unknown series subcommand: "${subcommand ?? ''}"`);
      output.info('Available subcommands: create, add-book, list, bible, threads, check');
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Extract SeriesManager from the extension or throw. */
function getManager(extension?: NovelWriterExtension): SeriesManager {
  if (!extension) {
    throw new Error('No active project. Run /novel init first.');
  }
  return (
    extension as unknown as { getSeriesManager(): SeriesManager }
  ).getSeriesManager();
}

/** Resolve projectId string from extension or fallback to '1'. */
function resolveProjectId(extension?: NovelWriterExtension): string {
  if (!extension) return '1';
  return (
    (extension as unknown as { projectId?: string | number }).projectId?.toString() ?? '1'
  );
}

/** Parse a comma-separated book-numbers flag into an array of integers. */
function parseBookNumbers(raw: unknown): number[] {
  if (!raw) return [];
  const str = String(raw);
  return str
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}

/** Truncate a string to `max` chars. */
function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

// ── subcommand handlers ───────────────────────────────────────────────────────

/**
 * `series create --title "The Mira Chronicles" [--description "X"]`
 */
async function handleCreate(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const title =
    (args.flags['title'] as string | undefined) ??
    (args.positional[1] as string | undefined);

  if (!title) {
    output.error('Please provide a series title: /novel series create --title "Name"');
    return;
  }

  const description = args.flags['description'] as string | undefined;

  try {
    const mgr = getManager(extension);
    const series = await mgr.createSeries(title, description);

    output.success(`Series created: ${series.id}`);
    output.keyValue({
      ID: series.id,
      Title: series.title,
      Description: series.description ?? '—',
      Created: series.createdAt.slice(0, 10),
    });
  } catch (err) {
    output.error(`Failed to create series: ${(err as Error).message}`);
  }
}

/**
 * `series add-book --series <id> --book 2 --title "The Second Door" [--project <projectId>]`
 */
async function handleAddBook(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const seriesId = args.flags['series'] as string | undefined;
  if (!seriesId) {
    output.error('Please provide a series id: --series <id>');
    return;
  }

  const bookNumberRaw = args.flags['book'];
  const bookNumber =
    typeof bookNumberRaw === 'number'
      ? bookNumberRaw
      : parseInt(String(bookNumberRaw ?? ''), 10);

  if (isNaN(bookNumber) || bookNumber < 1) {
    output.error('Please provide a valid book number: --book 2');
    return;
  }

  const title =
    (args.flags['title'] as string | undefined) ??
    (args.positional[1] as string | undefined);

  if (!title) {
    output.error('Please provide a book title: --title "The Second Door"');
    return;
  }

  const projectId =
    (args.flags['project'] as string | undefined) ?? resolveProjectId(extension);

  try {
    const mgr = getManager(extension);
    await mgr.addBook(seriesId, projectId, bookNumber, title);

    output.success(`Book ${bookNumber} added to series ${seriesId}`);
    output.keyValue({
      Series: seriesId,
      'Book Number': String(bookNumber),
      Title: title,
      'Project ID': projectId,
    });
  } catch (err) {
    output.error(`Failed to add book: ${(err as Error).message}`);
  }
}

/**
 * `series list`
 */
async function handleList(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  try {
    const mgr = getManager(extension);
    const allSeries = await mgr.listSeries();

    if (allSeries.length === 0) {
      output.info('No series found. Create one with /novel series create --title "Name".');
      return;
    }

    output.heading(`All Series — ${allSeries.length}`);
    output.newline();

    // Fetch book counts in parallel
    const bookCounts = await Promise.all(
      allSeries.map((s) => mgr.getSeriesBooks(s.id).then((books) => books.length))
    );

    const tableData = allSeries.map((s, i) => ({
      ID: s.id.slice(0, 8),
      Title: truncate(s.title, 35),
      Books: String(bookCounts[i]),
      Description: truncate(s.description ?? '—', 40),
      Created: s.createdAt.slice(0, 10),
    }));

    output.table(tableData, ['ID', 'Title', 'Books', 'Description', 'Created']);
  } catch (err) {
    output.error(`Failed to list series: ${(err as Error).message}`);
  }
}

/**
 * `series bible add --series <id> --category character --key "Mira.age_in_book_1" --value "23"`
 */
async function handleBibleAdd(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const seriesId = args.flags['series'] as string | undefined;
  if (!seriesId) {
    output.error('Please provide a series id: --series <id>');
    return;
  }

  const category = args.flags['category'] as string | undefined;
  if (!category) {
    output.error('Please provide a category: --category character|world|timeline|theme|other');
    return;
  }

  const entryKey = args.flags['key'] as string | undefined;
  if (!entryKey) {
    output.error('Please provide an entry key: --key "Mira.age_in_book_1"');
    return;
  }

  const value = args.flags['value'] as string | undefined;
  if (!value) {
    output.error('Please provide a value: --value "23"');
    return;
  }

  const notes = args.flags['notes'] as string | undefined;
  const appliesToBooks = parseBookNumbers(args.flags['applies-to']);

  try {
    const mgr = getManager(extension);
    const entry = await mgr.addBibleEntry(seriesId, category, entryKey, value, {
      notes,
      appliesToBooks,
    });

    output.success(`Bible entry added: ${entry.id}`);
    output.keyValue({
      ID: entry.id,
      Series: entry.seriesId,
      Category: entry.category,
      Key: entry.entryKey,
      Value: entry.value,
      'Applies To Books':
        entry.appliesToBooks.length > 0
          ? entry.appliesToBooks.join(', ')
          : 'all',
      ...(entry.notes ? { Notes: entry.notes } : {}),
    });
  } catch (err) {
    output.error(`Failed to add bible entry: ${(err as Error).message}`);
  }
}

/**
 * `series bible list --series <id> [--category character]`
 */
async function handleBibleList(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const seriesId = args.flags['series'] as string | undefined;
  if (!seriesId) {
    output.error('Please provide a series id: --series <id>');
    return;
  }

  const category = args.flags['category'] as string | undefined;

  try {
    const mgr = getManager(extension);
    const entries = await mgr.listBibleEntries(seriesId, category);

    if (entries.length === 0) {
      const label = category ? ` for category "${category}"` : '';
      output.info(`No bible entries found${label}.`);
      return;
    }

    const heading = category
      ? `Series Bible — ${category} (${entries.length})`
      : `Series Bible — ${entries.length} entries`;

    output.heading(heading);
    output.newline();

    // Group by category for nicer display
    const byCategory = new Map<string, typeof entries>();
    for (const e of entries) {
      if (!byCategory.has(e.category)) byCategory.set(e.category, []);
      byCategory.get(e.category)!.push(e);
    }

    for (const [cat, catEntries] of byCategory.entries()) {
      output.section(cat.toUpperCase(), '');
      const tableData = catEntries.map((e) => ({
        Key: truncate(e.entryKey, 30),
        Value: truncate(e.value, 40),
        'Applies To': e.appliesToBooks.length > 0 ? e.appliesToBooks.join(',') : 'all',
        Notes: truncate(e.notes ?? '—', 25),
      }));
      output.table(tableData, ['Key', 'Value', 'Applies To', 'Notes']);
      output.newline();
    }
  } catch (err) {
    output.error(`Failed to list bible entries: ${(err as Error).message}`);
  }
}

/**
 * `series threads --series <id>`
 */
async function handleThreads(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const seriesId = args.flags['series'] as string | undefined;
  if (!seriesId) {
    output.error('Please provide a series id: --series <id>');
    return;
  }

  try {
    const mgr = getManager(extension);
    const threads = await mgr.trackCrossBookThreads(seriesId);

    if (threads.length === 0) {
      output.info('No cross-book unresolved threads found.');
      return;
    }

    output.heading(`Cross-Book Threads — ${threads.length} unresolved`);
    output.newline();

    const tableData = threads.map((t) => ({
      Thread: truncate(t.threadTitle, 40),
      'Opened In Book': String(t.openedInBook),
      'Resolved In Book': t.resolvedInBook !== undefined ? String(t.resolvedInBook) : '—',
      Orphan: t.isOrphan ? 'YES' : 'no',
    }));

    output.table(tableData, ['Thread', 'Opened In Book', 'Resolved In Book', 'Orphan']);
  } catch (err) {
    output.error(`Failed to track threads: ${(err as Error).message}`);
  }
}

/**
 * `series check --series <id>`
 */
async function handleCheck(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const seriesId = args.flags['series'] as string | undefined;
  if (!seriesId) {
    output.error('Please provide a series id: --series <id>');
    return;
  }

  try {
    const mgr = getManager(extension);
    const issues = await mgr.checkSeriesConsistency(seriesId);

    if (issues.length === 0) {
      output.success('No consistency issues found across series books.');
      return;
    }

    output.heading(`Series Consistency Issues — ${issues.length}`);
    output.newline();

    for (const issue of issues) {
      output.warning(issue.issue);
      output.dim(`  Bible: ${issue.book1}  |  Book: ${issue.book2}`);
      output.newline();
    }
  } catch (err) {
    output.error(`Failed to check series consistency: ${(err as Error).message}`);
  }
}
