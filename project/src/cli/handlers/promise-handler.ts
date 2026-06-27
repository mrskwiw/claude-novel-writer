/**
 * Promise CLI Handler
 * Handles the `promise` command and all its subcommands.
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { NovelWriterExtension } from '../../index.js';
import type { PromiseService } from '../../services/promise-service.js';
import type { PromiseType } from '../../types/promise.js';

/**
 * Entry point for the `promise` command.
 *
 * @param args           - Parsed CLI arguments
 * @param _projectPath   - Absolute path to the novel project directory
 * @param output         - Output formatter
 * @param extension      - NovelWriterExtension instance
 */
export async function handlePromiseCommand(
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
    case 'list':
      await handleList(args, output, extension);
      break;
    case 'show':
      await handleShow(args, output, extension);
      break;
    case 'payoff':
      await handlePayoff(args, output, extension);
      break;
    case 'health':
      await handleHealth(args, output, extension);
      break;
    default:
      output.error(`Unknown promise subcommand: "${subcommand ?? ''}"`);
      output.info('Available subcommands: create, list, show, payoff, health');
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Resolve projectId from extension or fallback. */
function resolveProjectId(extension?: NovelWriterExtension): string {
  if (!extension) return '1';
  return (extension as unknown as { projectId?: string | number }).projectId?.toString() ?? '1';
}

/** Extract PromiseService from extension. */
function getPromiseService(extension?: NovelWriterExtension): PromiseService {
  if (!extension) {
    throw new Error('No active project. Run /novel init first.');
  }
  const ext = extension as unknown as {
    getPromiseService?: () => PromiseService;
  };
  if (typeof ext.getPromiseService !== 'function') {
    throw new Error('PromiseService not available on this extension instance.');
  }
  return ext.getPromiseService();
}

// ── subcommand handlers ───────────────────────────────────────────────────────

/** `promise create --type <type> --title <title> --description <d> [--importance <n>]` */
async function handleCreate(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const type = args.flags['type'] as PromiseType | undefined;
  const title = args.flags['title'] as string | undefined;
  const description = args.flags['description'] as string | undefined;
  const importance = args.flags['importance'] !== undefined ? Number(args.flags['importance']) : 5;

  if (!type) {
    output.error('Please provide --type (mystery | foreshadowing | chekhov_gun | relationship_tension | character_arc | worldbuilding_question | plot_question | thematic_question)');
    return;
  }
  if (!title) {
    output.error('Please provide --title');
    return;
  }
  if (!description) {
    output.error('Please provide --description');
    return;
  }

  try {
    const svc = getPromiseService(extension);
    const projectId = resolveProjectId(extension);
    const source = { sourceType: 'user_declared' as const };

    const promise = await svc.createPromise(projectId, {
      type,
      title,
      description,
      importance,
      readerVisibility: 5,
      introducedAt: { chapterId: undefined },
      relatedCharacters: [],
      relatedPlotThreads: [],
      relatedThemes: [],
      source,
    });

    output.success(`Narrative promise created: ${promise.id}`);
    output.info(`Title: ${promise.title}`);
    output.info(`Type: ${promise.type} | Importance: ${promise.importance}`);
  } catch (err) {
    output.error(`Failed to create promise: ${(err as Error).message}`);
  }
}

/** `promise list` */
async function handleList(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  try {
    const svc = getPromiseService(extension);
    const projectId = resolveProjectId(extension);
    const promises = await svc.listOpen(projectId);

    if (promises.length === 0) {
      output.info('No open narrative promises found.');
      return;
    }

    output.heading(`Open Promises (${promises.length})`);
    output.newline();
    for (const p of promises) {
      output.info(`• [${p.type}] ${p.title} (importance: ${p.importance}) — ${p.id}`);
      const snippet = p.description.length > 70 ? `${p.description.slice(0, 70)}…` : p.description;
      output.dim(`  ${snippet}`);
    }
  } catch (err) {
    output.error(`Failed to list promises: ${(err as Error).message}`);
  }
}

/** `promise show <id>` */
async function handleShow(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const id = args.positional[1] as string | undefined;
  if (!id) {
    output.error('Please provide a promise ID: /novel promise show <id>');
    return;
  }

  try {
    const svc = getPromiseService(extension);
    const projectId = resolveProjectId(extension);
    const promises = await svc.listByProject(projectId);
    const promise = promises.find(p => p.id === id);

    if (!promise) {
      output.error(`Promise not found: ${id}`);
      return;
    }

    output.heading(`Promise: ${promise.title}`);
    output.keyValue({
      ID: promise.id,
      Type: promise.type,
      Status: promise.status,
      Importance: promise.importance,
      'Reader Visibility': promise.readerVisibility,
      Description: promise.description,
      'Related Characters': promise.relatedCharacters.join(', ') || '(none)',
      'Related Plots': promise.relatedPlotThreads.join(', ') || '(none)',
      Created: promise.createdAt,
      Updated: promise.updatedAt,
    });
  } catch (err) {
    output.error(`Failed to show promise: ${(err as Error).message}`);
  }
}

/** `promise payoff <id> --description <d> [--strength <n>] [--resolves]` */
async function handlePayoff(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const id = args.positional[1] as string | undefined;
  if (!id) {
    output.error('Please provide a promise ID: /novel promise payoff <id>');
    return;
  }

  const description = args.flags['description'] as string | undefined;
  if (!description) {
    output.error('Please provide --description for the payoff');
    return;
  }

  const strength = args.flags['strength'] !== undefined ? Number(args.flags['strength']) : 5;
  const resolves = Boolean(args.flags['resolves']);

  try {
    const svc = getPromiseService(extension);
    const payoff = await svc.addPayoff(id, {
      payoffAt: { chapterId: undefined },
      description,
      payoffStrength: strength,
      resolvesPromise: resolves,
    });

    output.success(`Payoff recorded: ${payoff.id}`);
    output.info(`Strength: ${payoff.payoffStrength} | Resolves: ${payoff.resolvesPromise ? 'yes' : 'no'}`);
  } catch (err) {
    output.error(`Failed to add payoff: ${(err as Error).message}`);
  }
}

/** `promise health` */
async function handleHealth(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  try {
    const svc = getPromiseService(extension);
    const projectId = resolveProjectId(extension);
    const health = await svc.reportHealth(projectId);

    if (health.length === 0) {
      output.info('No promise health data available.');
      return;
    }

    output.heading(`Promise Health Report (${health.length})`);
    output.newline();

    for (const h of health) {
      const icon = h.status === 'healthy' ? '✓' : h.status === 'aging' ? '⚠' : '✗';
      output.info(`${icon} [${h.status}] Promise ${h.promiseId}`);
      output.dim(`  ${h.explanation}`);
      if (h.recommendation) output.dim(`  → ${h.recommendation}`);
    }
  } catch (err) {
    output.error(`Failed to report health: ${(err as Error).message}`);
  }
}
