/**
 * Revision CLI Handler
 * Handles the `revision` command and all its subcommands.
 */

import { SnapshotManager } from '../../revision/snapshot-manager.js';
import type { ParsedArgs, OutputFormatter } from '../types.js';

/**
 * Entry point for the `revision` command.
 *
 * @param args        - Parsed CLI arguments
 * @param projectPath - Absolute path to the novel project directory
 * @param output      - Output formatter
 */
export async function handleRevisionCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'snapshot':
      await handleSnapshot(args, projectPath, output);
      break;
    case 'list':
      await handleList(projectPath, output);
      break;
    case 'show':
      await handleShow(args, projectPath, output);
      break;
    case 'diff':
      await handleDiff(args, projectPath, output);
      break;
    case 'restore':
      await handleRestore(args, projectPath, output);
      break;
    case 'auto-snapshot':
      handleAutoSnapshotInfo(output);
      break;
    default:
      output.error(`Unknown revision subcommand: "${subcommand ?? ''}"`);
      output.info(
        'Available subcommands: snapshot, list, show, diff, restore, auto-snapshot'
      );
  }
}

// ── subcommand handlers ──────────────────────────────────────────────────────

/**
 * `revision snapshot [label]`
 * Creates a new snapshot. If no label is provided, defaults to "auto".
 */
async function handleSnapshot(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const label =
    (args.positional[1] as string | undefined) ?? 'auto';

  const manager = new SnapshotManager(projectPath);
  try {
    const meta = await manager.create(label);
    output.success(
      `Snapshot created: ${meta.label} (${meta.chapterCount} chapter${meta.chapterCount !== 1 ? 's' : ''}, ${meta.totalWordCount} words)`
    );
  } catch (err) {
    output.error(`Failed to create snapshot: ${(err as Error).message}`);
  }
}

/**
 * `revision list`
 * Prints a table of all snapshots sorted newest-first.
 */
async function handleList(
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const manager = new SnapshotManager(projectPath);
  try {
    const snapshots = await manager.list();

    if (snapshots.length === 0) {
      output.info('No snapshots found. Use `/novel revision snapshot` to create one.');
      return;
    }

    output.heading(`Snapshots (${snapshots.length})`);
    output.newline();

    // Header
    output.info(
      padRight('Label', 30) +
      padRight('Date', 28) +
      padRight('Chapters', 10) +
      'Words'
    );
    output.dim('─'.repeat(78));

    for (const s of snapshots) {
      output.info(
        padRight(s.label, 30) +
        padRight(s.createdAt, 28) +
        padRight(String(s.chapterCount), 10) +
        String(s.totalWordCount)
      );
    }
  } catch (err) {
    output.error(`Failed to list snapshots: ${(err as Error).message}`);
  }
}

/**
 * `revision show <label>`
 * Prints full metadata for a named snapshot.
 */
async function handleShow(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const label = args.positional[1] as string | undefined;
  if (!label) {
    output.error('Please provide a snapshot label: /novel revision show <label>');
    return;
  }

  const manager = new SnapshotManager(projectPath);
  try {
    const snapshots = await manager.list();
    const snap = snapshots.find(s => s.label === label);

    if (!snap) {
      output.error(`Snapshot not found: "${label}"`);
      return;
    }

    output.heading(`Snapshot: ${snap.label}`);
    output.keyValue({
      Created: snap.createdAt,
      Chapters: snap.chapterCount,
      'Total words': snap.totalWordCount,
    });

    if (Object.keys(snap.chapterWordCounts).length > 0) {
      output.newline();
      output.info('Chapter word counts:');
      for (const [filename, wc] of Object.entries(snap.chapterWordCounts)) {
        output.dim(`  ${filename}: ${wc} words`);
      }
    }
  } catch (err) {
    output.error(`Failed to show snapshot: ${(err as Error).message}`);
  }
}

/**
 * `revision diff <from> <to> [--chapter <filename>]`
 * Prints a line diff of a chapter between two snapshots.
 */
async function handleDiff(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const fromLabel = args.positional[1] as string | undefined;
  const toLabel = args.positional[2] as string | undefined;
  const chapter = args.flags['chapter'] as string | undefined;

  if (!fromLabel || !toLabel) {
    output.error(
      'Usage: /novel revision diff <from> <to> [--chapter <filename>]'
    );
    return;
  }

  if (!chapter) {
    output.error(
      'Please specify a chapter file with --chapter <filename> (e.g. --chapter chapter-01.md)'
    );
    return;
  }

  const manager = new SnapshotManager(projectPath);
  try {
    const diffOutput = await manager.diff(fromLabel, toLabel, chapter);
    output.heading(`Diff: ${fromLabel} → ${toLabel} [${chapter}]`);
    output.newline();
    output.code(diffOutput, 'diff');
  } catch (err) {
    output.error(`Diff failed: ${(err as Error).message}`);
  }
}

/**
 * `revision restore <label>`
 * Overwrites chapters/ with the named snapshot.
 */
async function handleRestore(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const label = args.positional[1] as string | undefined;
  if (!label) {
    output.error('Please provide a snapshot label: /novel revision restore <label>');
    return;
  }

  const manager = new SnapshotManager(projectPath);
  try {
    await manager.restore(label);
    output.success(`Restored ${label}`);
  } catch (err) {
    output.error(`Restore failed: ${(err as Error).message}`);
  }
}

/**
 * `revision auto-snapshot`
 * Displays information about the auto-snapshot feature.
 */
function handleAutoSnapshotInfo(output: OutputFormatter): void {
  output.heading('Auto-Snapshot');
  output.newline();
  output.info(
    'Auto-snapshots are created automatically before every `sync from-db` operation. ' +
    'They are stored in `revisions/auto-before-from-db-*/` and can be restored with ' +
    '`revision restore --label <label>`.'
  );
  output.newline();
  output.info('To restore an auto-snapshot:');
  output.info('  1. Run `/novel revision list` to see available snapshots.');
  output.info('  2. Run `/novel revision restore <label>` with the desired snapshot label.');
}

// ── utilities ────────────────────────────────────────────────────────────────

/** Right-pad a string to a fixed width for tabular output. */
function padRight(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}
