/**
 * Agent Query Tracker CLI Handler — PROC-10
 *
 * Handles the `query` command and all its subcommands:
 *   add, list, update, stats, export-package
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { NovelWriterExtension } from '../../index.js';
import {
  QueryTrackerService,
  type QueryStatus,
} from '../../services/query-tracker-service.js';

/** All valid QueryStatus values — used for validation. */
const VALID_STATUSES: QueryStatus[] = [
  'sent',
  'pending',
  'rejected',
  'partial_request',
  'full_request',
  'offer',
  'closed',
];

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Entry point for the `query` command.
 */
export async function handleQueryCommand(
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
    case 'update':
      await handleUpdate(args, projectPath, output, extension);
      break;
    case 'stats':
      await handleStats(args, projectPath, output, extension);
      break;
    case 'export-package':
      await handleExportPackage(args, projectPath, output, extension);
      break;
    default:
      output.error(`Unknown query subcommand: "${subcommand ?? ''}"`);
      output.info(
        'Available subcommands: add, list, update, stats, export-package'
      );
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Extract QueryTrackerService from an extension or throw if unavailable. */
function getService(extension?: NovelWriterExtension): QueryTrackerService {
  if (!extension) {
    throw new Error('No active project. Run /novel init first.');
  }
  return (
    extension as unknown as { getQueryTrackerService(): QueryTrackerService }
  ).getQueryTrackerService();
}

/** Resolve projectId string from extension or fallback to "1". */
function resolveProjectId(extension?: NovelWriterExtension): string {
  if (!extension) return '1';
  return (
    (extension as unknown as { projectId?: string | number }).projectId?.toString() ?? '1'
  );
}

/** Parse a comma-separated materials flag value into an array. */
function parseMaterials(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw))
    return raw
      .flatMap((v) => String(v).split(',').map((s) => s.trim()))
      .filter(Boolean);
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Truncate a string to `max` chars, appending '…' if needed. */
function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

/** Format a QueryStatus for display. */
function fmtStatus(status: QueryStatus): string {
  return status.replace(/_/g, ' ');
}

// ── subcommand handlers ───────────────────────────────────────────────────────

/**
 * `query add --agent "Name" --agency "X" [--date "2026-05-01"] [--materials "query,synopsis"]`
 */
async function handleAdd(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const agentName =
    (args.flags['agent'] as string | undefined) ??
    (args.positional[1] as string | undefined);

  if (!agentName) {
    output.error(
      'Please provide an agent name: /novel query add --agent "Name"'
    );
    return;
  }

  const agency = args.flags['agency'] as string | undefined;
  const queryDate = args.flags['date'] as string | undefined;
  const materials = parseMaterials(args.flags['materials']);
  const notes = args.flags['notes'] as string | undefined;

  try {
    const svc = getService(extension);
    const projectId = resolveProjectId(extension);
    const query = await svc.addQuery(projectId, agentName, {
      agency,
      queryDate,
      materialsSent: materials,
      notes,
    });

    output.success(`Query recorded: ${query.id}`);
    output.keyValue({
      ID: query.id,
      Agent: query.agentName,
      Agency: query.agency ?? '—',
      Date: query.queryDate,
      Status: fmtStatus(query.status),
      Materials: materials.length > 0 ? materials.join(', ') : '(none)',
      ...(notes ? { Notes: notes } : {}),
    });
  } catch (err) {
    output.error(`Failed to add query: ${(err as Error).message}`);
  }
}

/**
 * `query list [--status pending]`
 */
async function handleList(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const statusFlag = args.flags['status'] as string | undefined;

  if (statusFlag && !VALID_STATUSES.includes(statusFlag as QueryStatus)) {
    output.error(
      `Invalid status "${statusFlag}". Valid values: ${VALID_STATUSES.join(', ')}`
    );
    return;
  }

  try {
    const svc = getService(extension);
    const projectId = resolveProjectId(extension);
    const queries = await svc.listQueries(
      projectId,
      statusFlag ? { status: statusFlag as QueryStatus } : undefined
    );

    if (queries.length === 0) {
      output.info('No queries found.');
      return;
    }

    const label = statusFlag ? ` (status: ${fmtStatus(statusFlag as QueryStatus)})` : '';
    output.heading(`Agent Queries${label} — ${queries.length}`);
    output.newline();

    const tableData = queries.map((q) => ({
      ID: q.id.slice(0, 8),
      Agent: truncate(q.agentName, 25),
      Agency: truncate(q.agency ?? '—', 20),
      Date: q.queryDate,
      Status: fmtStatus(q.status),
      Response: q.responseDate ?? '—',
    }));

    output.table(tableData, ['ID', 'Agent', 'Agency', 'Date', 'Status', 'Response']);
  } catch (err) {
    output.error(`Failed to list queries: ${(err as Error).message}`);
  }
}

/**
 * `query update --id N --status rejected [--response-date "2026-06-01"] [--notes "..."]`
 */
async function handleUpdate(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const id = args.flags['id'] as string | undefined;
  if (!id) {
    output.error('Please provide a query id: /novel query update --id <id>');
    return;
  }

  const statusFlag = args.flags['status'] as string | undefined;
  const responseDateFlag = args.flags['response-date'] as string | undefined;
  const notes = args.flags['notes'] as string | undefined;

  if (statusFlag && !VALID_STATUSES.includes(statusFlag as QueryStatus)) {
    output.error(
      `Invalid status "${statusFlag}". Valid values: ${VALID_STATUSES.join(', ')}`
    );
    return;
  }

  if (!statusFlag && !responseDateFlag && notes === undefined) {
    output.error(
      'Provide at least one field to update: --status, --response-date, or --notes'
    );
    return;
  }

  try {
    const svc = getService(extension);
    await svc.updateQuery(id, {
      ...(statusFlag ? { status: statusFlag as QueryStatus } : {}),
      ...(responseDateFlag ? { responseDate: responseDateFlag } : {}),
      ...(notes !== undefined ? { notes } : {}),
    });

    output.success(`Query ${id} updated successfully`);
    const updated: Record<string, string> = { ID: id };
    if (statusFlag) updated['New Status'] = fmtStatus(statusFlag as QueryStatus);
    if (responseDateFlag) updated['Response Date'] = responseDateFlag;
    if (notes !== undefined) updated['Notes'] = truncate(notes, 60);
    output.keyValue(updated);
  } catch (err) {
    output.error(`Failed to update query: ${(err as Error).message}`);
  }
}

/**
 * `query stats`
 */
async function handleStats(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  try {
    const svc = getService(extension);
    const projectId = resolveProjectId(extension);
    const stats = await svc.getStats(projectId);

    output.heading('Query Submission Dashboard');
    output.newline();

    output.keyValue({
      'Total Queries': String(stats.total),
      'Avg Response Time':
        stats.avgResponseDays !== null
          ? `${stats.avgResponseDays} days`
          : '—',
      'Success Rate':
        stats.successRate !== null
          ? `${(stats.successRate * 100).toFixed(1)}%`
          : '—',
    });

    output.newline();
    output.info('Status breakdown:');

    const breakdownData = Object.entries(stats.byStatus).map(([status, count]) => ({
      Status: fmtStatus(status as QueryStatus),
      Count: String(count),
    }));
    output.table(breakdownData, ['Status', 'Count']);
  } catch (err) {
    output.error(`Failed to retrieve stats: ${(err as Error).message}`);
  }
}

/**
 * `query export-package --agent "Name"`
 */
async function handleExportPackage(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const agentName =
    (args.flags['agent'] as string | undefined) ??
    (args.positional[1] as string | undefined);

  if (!agentName) {
    output.error(
      'Please provide an agent name: /novel query export-package --agent "Name"'
    );
    return;
  }

  try {
    const svc = getService(extension);
    const projectId = resolveProjectId(extension);
    const filePath = await svc.exportQueryPackage(projectId, projectPath, agentName);

    output.success(`Query package created: ${filePath}`);
    output.info('Fill in the Query Letter section before sending to the agent.');
  } catch (err) {
    output.error(`Failed to export query package: ${(err as Error).message}`);
  }
}
