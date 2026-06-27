/**
 * Knowledge CLI Handler
 * Handles the `knowledge` command and all its subcommands.
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { NovelWriterExtension } from '../../index.js';
import type { KnowledgeObjectType } from '../../types/knowledge.js';

/**
 * Entry point for the `knowledge` command.
 *
 * @param args               - Parsed CLI arguments
 * @param _projectPath       - Absolute path to the novel project directory
 * @param output             - Output formatter
 * @param extension          - NovelWriterExtension instance
 */
export async function handleKnowledgeCommand(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'list':
      await handleList(args, output, extension);
      break;
    case 'show':
      await handleShow(args, output, extension);
      break;
    case 'search':
      await handleSearch(args, output, extension);
      break;
    default:
      output.error(`Unknown knowledge subcommand: "${subcommand ?? ''}"`);
      output.info('Available subcommands: list, show, search');
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Resolve projectId from extension or fallback. */
function resolveProjectId(extension?: NovelWriterExtension): string {
  if (!extension) return '1';
  return (extension as unknown as { projectId?: string | number }).projectId?.toString() ?? '1';
}

/** Extract KnowledgeService from extension. */
function getKnowledgeService(extension?: NovelWriterExtension) {
  if (!extension) {
    throw new Error('No active project. Run /novel init first.');
  }
  const ext = extension as unknown as {
    getKnowledgeService?: () => import('../../services/knowledge-service.js').KnowledgeService;
  };
  if (typeof ext.getKnowledgeService !== 'function') {
    throw new Error('KnowledgeService not available on this extension instance.');
  }
  return ext.getKnowledgeService();
}

// ── subcommand handlers ───────────────────────────────────────────────────────

/** `knowledge list [--type <type>] [--status <status>]` */
async function handleList(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  try {
    const svc = getKnowledgeService(extension);
    const projectId = resolveProjectId(extension);

    const typeFilter = args.flags['type'] as KnowledgeObjectType | undefined;
    const statusFilter = args.flags['status'] as 'active' | 'draft' | 'deprecated' | 'archived' | undefined;

    let objects;
    if (typeFilter) {
      objects = await svc.listByType(projectId, typeFilter);
    } else if (statusFilter) {
      objects = await svc.listByStatus(projectId, statusFilter);
    } else {
      objects = await svc.listByStatus(projectId, 'active');
    }

    if (objects.length === 0) {
      output.info('No knowledge objects found.');
      return;
    }

    output.heading(`Knowledge Objects (${objects.length})`);
    output.newline();
    for (const obj of objects) {
      const snippet = obj.summary
        ? (obj.summary.length > 60 ? `${obj.summary.slice(0, 60)}…` : obj.summary)
        : '(no summary)';
      output.info(`• [${obj.type}] ${obj.title} — ${obj.id}`);
      output.dim(`  ${snippet}`);
    }
  } catch (err) {
    output.error(`Failed to list knowledge objects: ${(err as Error).message}`);
  }
}

/** `knowledge show <id>` */
async function handleShow(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const id = args.positional[1] as string | undefined;
  if (!id) {
    output.error('Please provide a knowledge object ID: /novel knowledge show <id>');
    return;
  }

  try {
    const svc = getKnowledgeService(extension);
    const obj = await svc.getById(id);

    if (!obj) {
      output.error(`Knowledge object not found: ${id}`);
      return;
    }

    output.heading(`Knowledge Object: ${obj.title}`);
    output.keyValue({
      ID: obj.id,
      Type: obj.type,
      Status: obj.status,
      Confidence: obj.confidence,
      'Context Eligible': obj.contextEligible ? 'yes' : 'no',
      'Graph Eligible': obj.graphEligible ? 'yes' : 'no',
      Summary: obj.summary ?? '(none)',
      Created: obj.createdAt,
      Updated: obj.updatedAt,
    });
  } catch (err) {
    output.error(`Failed to show knowledge object: ${(err as Error).message}`);
  }
}

/** `knowledge search <query>` */
async function handleSearch(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const query = (args.positional[1] as string | undefined) ?? (args.flags['query'] as string | undefined);
  if (!query) {
    output.error('Please provide a search query: /novel knowledge search <query>');
    return;
  }

  try {
    const svc = getKnowledgeService(extension);
    const projectId = resolveProjectId(extension);
    const results = await svc.search(projectId, query);

    if (results.length === 0) {
      output.info(`No knowledge objects matched: "${query}"`);
      return;
    }

    output.heading(`Search Results for "${query}" (${results.length})`);
    output.newline();
    for (const obj of results) {
      output.info(`• [${obj.type}] ${obj.title} — ${obj.id}`);
      if (obj.summary) output.dim(`  ${obj.summary.length > 80 ? `${obj.summary.slice(0, 80)}…` : obj.summary}`);
    }
  } catch (err) {
    output.error(`Failed to search knowledge objects: ${(err as Error).message}`);
  }
}
