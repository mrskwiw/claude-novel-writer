/**
 * Research CLI Handler — SPEC-04
 *
 * Handles the `research` command and all its subcommands:
 *   add, list, show, link, verify-list, sync
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { NovelWriterExtension } from '../../index.js';
import { ResearchService } from '../../services/research-service.js';

/**
 * Entry point for the `research` command.
 */
export async function handleResearchCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'add':
      await handleAdd(args, projectPath, output, extension);
      break;
    case 'list':
      await handleList(args, projectPath, output, extension);
      break;
    case 'show':
      await handleShow(args, projectPath, output, extension);
      break;
    case 'link':
      await handleLink(args, projectPath, output, extension);
      break;
    case 'verify-list':
      await handleVerifyList(args, projectPath, output, extension);
      break;
    case 'sync':
      await handleSync(output);
      break;
    default:
      output.error(`Unknown research subcommand: "${subcommand ?? ''}"`);
      output.info('Available subcommands: add, list, show, link, verify-list, sync');
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Extract ResearchService from an extension or throw if unavailable. */
function getService(extension?: NovelWriterExtension): ResearchService {
  if (!extension) {
    throw new Error('No active project. Run /novel init first.');
  }
  return (extension as unknown as { getResearchService(): ResearchService }).getResearchService();
}

/** Resolve projectId string from extension or fallback to "1". */
function resolveProjectId(extension?: NovelWriterExtension): string {
  if (!extension) return '1';
  return (
    (extension as unknown as { projectId?: string | number }).projectId?.toString() ?? '1'
  );
}

/** Parse a comma-separated tag flag value into an array. */
function parseTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap((v) => String(v).split(',').map((s) => s.trim())).filter(Boolean);
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Truncate a string to `max` chars, appending '…' if needed. */
function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

// ── subcommand handlers ───────────────────────────────────────────────────────

/**
 * `research add --title "X" [--url "Y"] [--notes "Z"] [--tag "A,B"]`
 */
async function handleAdd(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const title =
    (args.flags['title'] as string | undefined) ??
    (args.positional[1] as string | undefined);

  if (!title) {
    output.error('Please provide a title: /novel research add --title "X"');
    return;
  }

  const tags = parseTags(args.flags['tag']);
  const url = args.flags['url'] as string | undefined;
  const notes = args.flags['notes'] as string | undefined;

  try {
    const svc = getService(extension);
    const projectId = resolveProjectId(extension);
    const note = await svc.add(projectId, title, { url, notes, tags });

    output.success(`Research note created: ${note.id}`);
    output.keyValue({
      ID: note.id,
      Title: note.title,
      ...(url ? { URL: url } : {}),
      Tags: tags.length > 0 ? tags.join(', ') : '(none)',
      Verified: 'no',
    });
  } catch (err) {
    output.error(`Failed to add research note: ${(err as Error).message}`);
  }
}

/**
 * `research list [--tag X]`
 */
async function handleList(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const tag = args.flags['tag'] as string | undefined;

  try {
    const svc = getService(extension);
    const projectId = resolveProjectId(extension);
    const notes = await svc.list(projectId, tag);

    if (notes.length === 0) {
      output.info('No research notes found.');
      return;
    }

    output.heading(`Research Notes (${notes.length})`);
    output.newline();

    const tableData = notes.map((n) => ({
      ID: n.id.slice(0, 8),
      Title: truncate(n.title, 40),
      URL: n.url ? truncate(n.url, 40) : '—',
      Tags: n.tags.length > 0 ? n.tags.join(', ') : '—',
      Verified: n.verified ? 'yes' : 'no',
    }));

    output.table(tableData, ['ID', 'Title', 'URL', 'Tags', 'Verified']);
  } catch (err) {
    output.error(`Failed to list research notes: ${(err as Error).message}`);
  }
}

/**
 * `research show <id>`
 */
async function handleShow(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const id = args.positional[1] as string | undefined;
  if (!id) {
    output.error('Please provide a note id: /novel research show <id>');
    return;
  }

  try {
    const svc = getService(extension);
    const note = await svc.getById(id);
    if (!note) {
      output.error(`Research note not found: ${id}`);
      return;
    }

    output.heading(`Research: ${note.title}`);
    output.keyValue({
      ID: note.id,
      URL: note.url ?? '—',
      Tags: note.tags.length > 0 ? note.tags.join(', ') : '(none)',
      Verified: note.verified ? 'yes' : 'no',
      Created: note.createdAt,
      Updated: note.updatedAt,
      ...(note.notes ? { Notes: note.notes } : {}),
    });
  } catch (err) {
    output.error(`Failed to show research note: ${(err as Error).message}`);
  }
}

/**
 * `research link <id> --chapter N [--note "X"]`
 */
async function handleLink(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const id = args.positional[1] as string | undefined;
  const chapterNum = args.flags['chapter'] as number | undefined;
  const linkNote = args.flags['note'] as string | undefined;

  if (!id) {
    output.error('Please provide a note id: /novel research link <id> --chapter N');
    return;
  }
  if (chapterNum === undefined) {
    output.error('Please provide --chapter N to specify the chapter');
    return;
  }

  try {
    const svc = getService(extension);
    await svc.link(id, { chapterId: chapterNum }, linkNote);
    output.success(`Research note ${id} linked to chapter ${chapterNum}`);
  } catch (err) {
    output.error(`Failed to link research note: ${(err as Error).message}`);
  }
}

/**
 * `research verify-list [--chapter N]`
 */
async function handleVerifyList(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  _extension?: NovelWriterExtension
): Promise<void> {
  const chapterFilter = args.flags['chapter'] as number | undefined;

  try {
    // ResearchService can be constructed directly (no MCPClient needed for file scanning)
    // We use a dummy client since findVerifyMarkers only touches the filesystem.
    const dummyClient = {
      readQuery: async () => [],
      writeQuery: async () => ({ affected_rows: 0 }),
      listTables: async () => [],
      describeTable: async () => [],
    };
    const svc = new ResearchService(dummyClient);
    const marks = await svc.findVerifyMarkers(projectPath, chapterFilter);

    if (marks.length === 0) {
      output.info('No [VERIFY:] markers found in chapter files.');
      return;
    }

    output.heading(`[VERIFY:] Markers (${marks.length})`);
    output.newline();

    for (const mark of marks) {
      output.info(`• ${mark.chapterFilename}:${mark.lineNumber}`);
      output.dim(`  Claim : ${mark.claim}`);
      output.dim(`  Line  : ${truncate(mark.context.trim(), 80)}`);
    }
  } catch (err) {
    output.error(`Failed to scan for [VERIFY:] markers: ${(err as Error).message}`);
  }
}

/**
 * `research sync` — placeholder for future YAML-based sync workflow.
 */
async function handleSync(output: OutputFormatter): Promise<void> {
  output.info('Research sync: no YAML source files are used for research notes.');
  output.info('Use /novel research add to capture notes directly.');
}
