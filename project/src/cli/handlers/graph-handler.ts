/**
 * Graph CLI Handler
 * Handles the `graph` command and all its subcommands.
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { NovelWriterExtension } from '../../index.js';
import type { NarrativeGraphService } from '../../services/narrative-graph-service.js';

/**
 * Entry point for the `graph` command.
 *
 * @param args           - Parsed CLI arguments
 * @param _projectPath   - Absolute path to the novel project directory
 * @param output         - Output formatter
 * @param extension      - NovelWriterExtension instance
 */
export async function handleGraphCommand(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'rebuild':
      await handleRebuild(args, output, extension);
      break;
    case 'show':
      await handleShow(args, output, extension);
      break;
    case 'neighbors':
      await handleNeighbors(args, output, extension);
      break;
    case 'path':
      await handlePath(args, output, extension);
      break;
    default:
      output.error(`Unknown graph subcommand: "${subcommand ?? ''}"`);
      output.info('Available subcommands: rebuild, show, neighbors, path');
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Resolve projectId from extension or fallback. */
function resolveProjectId(extension?: NovelWriterExtension): string {
  if (!extension) return '1';
  return (extension as unknown as { projectId?: string | number }).projectId?.toString() ?? '1';
}

/** Extract NarrativeGraphService from extension. */
function getGraphService(extension?: NovelWriterExtension): NarrativeGraphService {
  if (!extension) {
    throw new Error('No active project. Run /novel init first.');
  }
  const ext = extension as unknown as {
    getNarrativeGraphService?: () => NarrativeGraphService;
  };
  if (typeof ext.getNarrativeGraphService !== 'function') {
    throw new Error('NarrativeGraphService not available on this extension instance.');
  }
  return ext.getNarrativeGraphService();
}

// ── subcommand handlers ───────────────────────────────────────────────────────

/** `graph rebuild` */
async function handleRebuild(
  _args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  try {
    const svc = getGraphService(extension);
    const projectId = resolveProjectId(extension);

    output.info('Rebuilding narrative graph…');
    const result = await svc.rebuild(projectId);

    output.success(`Graph rebuilt: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
  } catch (err) {
    output.error(`Failed to rebuild graph: ${(err as Error).message}`);
  }
}

/** `graph show <nodeId>` */
async function handleShow(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const id = args.positional[1] as string | undefined;
  if (!id) {
    output.error('Please provide a node ID: /novel graph show <nodeId>');
    return;
  }

  try {
    const svc = getGraphService(extension);
    const node = await svc.getNode(id);

    if (!node) {
      output.error(`Node not found: ${id}`);
      return;
    }

    output.heading(`Node: ${node.label}`);
    output.keyValue({
      ID: node.id,
      Type: node.type,
      Label: node.label,
      Summary: node.summary ?? '(none)',
      'Source ID': node.sourceId ?? '(none)',
      Created: node.createdAt,
      Updated: node.updatedAt,
    });
  } catch (err) {
    output.error(`Failed to show node: ${(err as Error).message}`);
  }
}

/** `graph neighbors <nodeId>` */
async function handleNeighbors(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const id = args.positional[1] as string | undefined;
  if (!id) {
    output.error('Please provide a node ID: /novel graph neighbors <nodeId>');
    return;
  }

  try {
    const svc = getGraphService(extension);
    const neighbors = await svc.getNeighbors(id);

    if (neighbors.length === 0) {
      output.info(`No neighbors found for node: ${id}`);
      return;
    }

    output.heading(`Neighbors of ${id} (${neighbors.length})`);
    output.newline();
    for (const { node, edge } of neighbors) {
      output.info(`• [${node.type}] ${node.label} — ${node.id}`);
      output.dim(`  Edge: ${edge.type} (weight: ${edge.weight})`);
    }
  } catch (err) {
    output.error(`Failed to get neighbors: ${(err as Error).message}`);
  }
}

/** `graph path --from <nodeId> --to <nodeId>` */
async function handlePath(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const fromId = args.flags['from'] as string | undefined;
  const toId = args.flags['to'] as string | undefined;

  if (!fromId) {
    output.error('Please provide --from <nodeId>');
    return;
  }
  if (!toId) {
    output.error('Please provide --to <nodeId>');
    return;
  }

  try {
    const svc = getGraphService(extension);
    const path = await svc.findPath(fromId, toId);

    if (!path) {
      output.info(`No path found between ${fromId} and ${toId}`);
      return;
    }

    output.heading(`Path: ${fromId} → ${toId}`);
    output.newline();
    path.forEach((nodeId, idx) => {
      output.info(`${idx + 1}. ${nodeId}`);
    });
    output.info(`Total hops: ${path.length - 1}`);
  } catch (err) {
    output.error(`Failed to find path: ${(err as Error).message}`);
  }
}
