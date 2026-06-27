/**
 * Canon CLI Handler
 * Handles the `canon` command and all its subcommands.
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { NovelWriterExtension } from '../../index.js';
import type { CanonItem } from '../../types/canon.js';
import type { CanonService } from '../../services/canon-service.js';

/**
 * Entry point for the `canon` command.
 *
 * @param args           - Parsed CLI arguments
 * @param _projectPath   - Absolute path to the novel project directory
 * @param output         - Output formatter
 * @param extension      - NovelWriterExtension instance
 */
export async function handleCanonCommand(
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
    case 'conflicts':
      await handleConflicts(args, output, extension);
      break;
    case 'promote':
      await handlePromote(args, output, extension);
      break;
    default:
      output.error(`Unknown canon subcommand: "${subcommand ?? ''}"`);
      output.info('Available subcommands: create, list, show, conflicts, promote');
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Resolve projectId from extension or fallback. */
function resolveProjectId(extension?: NovelWriterExtension): string {
  if (!extension) return '1';
  return (extension as unknown as { projectId?: string | number }).projectId?.toString() ?? '1';
}

/** Extract CanonService from extension. */
function getCanonService(extension?: NovelWriterExtension): CanonService {
  if (!extension) {
    throw new Error('No active project. Run /novel init first.');
  }
  const ext = extension as unknown as {
    getCanonService?: () => CanonService;
  };
  if (typeof ext.getCanonService !== 'function') {
    throw new Error('CanonService not available on this extension instance.');
  }
  return ext.getCanonService();
}

/**
 * Resolve the `<id>` positional argument regardless of how the subcommand was
 * dispatched. Handles every layout we see:
 *   - subcommand set, positional = ['<id>']            → id at [0]
 *   - subcommand set, positional = ['show', '<id>']    → drop the repeated token
 *   - subcommand unset (fallthrough), positional = ['show', '<id>'] → id at [1]
 */
function positionalId(args: ParsedArgs): string | undefined {
  if (!args.subcommand) {
    // "show"/"promote" was consumed from positional[0]; the id follows it.
    return args.positional[1] as string | undefined;
  }
  // Drop a leading positional that merely repeats the subcommand token.
  const rest = args.positional.filter((p, i) => !(i === 0 && p === args.subcommand));
  return rest[0] as string | undefined;
}

// ── subcommand handlers ───────────────────────────────────────────────────────

/** `canon create --type <type> --subject <s> --predicate <p> [--object <o>] --description <d>` */
async function handleCreate(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const type = args.flags['type'] as CanonItem['type'] | undefined;
  const subject = args.flags['subject'] as string | undefined;
  const predicate = args.flags['predicate'] as string | undefined;
  const description = args.flags['description'] as string | undefined;
  const object = args.flags['object'] as string | undefined;

  if (!type) {
    output.error('Please provide --type: fact | rule | situation | assertion');
    return;
  }
  if (!subject) {
    output.error('Please provide --subject');
    return;
  }
  if (!predicate) {
    output.error('Please provide --predicate');
    return;
  }
  if (!description) {
    output.error('Please provide --description');
    return;
  }

  const validTypes: CanonItem['type'][] = ['fact', 'rule', 'situation', 'assertion'];
  if (!validTypes.includes(type)) {
    output.error(`Invalid type "${type}". Use: ${validTypes.join(', ')}`);
    return;
  }

  try {
    const svc = getCanonService(extension);
    const projectId = resolveProjectId(extension);
    const scope = { appliesTo: 'entire_project' as const };
    const source = { sourceType: 'user_declared' as const };
    const confidence = 1;

    let result: { item: CanonItem; conflict: import('../../types/canon.js').CanonConflict | null };

    if (type === 'fact') {
      if (!object) {
        output.error('Facts require --object');
        return;
      }
      result = await svc.createFact(projectId, { subject, predicate, object, description, scope, source, confidence });
    } else if (type === 'rule') {
      result = await svc.createRule(projectId, { subject, predicate, object, description, scope, source, confidence });
    } else if (type === 'situation') {
      result = await svc.createSituation(projectId, { subject, predicate, object, description, scope, source, confidence });
    } else {
      result = await svc.createAssertion(projectId, { subject, predicate, object, description, scope, source, confidence });
    }

    output.success(`Canon item created: ${result.item.id}`);
    output.info(`Type: ${result.item.type} | ${result.item.subject} ${result.item.predicate}${result.item.object ? ` ${result.item.object}` : ''}`);
    if (result.conflict) {
      output.warning(`Conflict detected! Severity: ${result.conflict.severity}`);
      output.warning(result.conflict.explanation);
    }
  } catch (err) {
    output.error(`Failed to create canon item: ${(err as Error).message}`);
  }
}

/** `canon list` */
async function handleList(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  try {
    const svc = getCanonService(extension);
    const projectId = resolveProjectId(extension);
    const items = await svc.listActiveCanon(projectId);

    if (items.length === 0) {
      output.info('No active canon items found.');
      return;
    }

    output.heading(`Active Canon (${items.length})`);
    output.newline();
    for (const item of items) {
      const stmt = `${item.subject} ${item.predicate}${item.object ? ` ${item.object}` : ''}`;
      output.info(`• [${item.type}/${item.strength}] ${stmt}`);
      output.dim(`  ${item.description} — ${item.id}`);
    }
  } catch (err) {
    output.error(`Failed to list canon: ${(err as Error).message}`);
  }
}

/** `canon show <id>` */
async function handleShow(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const id = positionalId(args);
  if (!id) {
    output.error('Please provide a canon item ID: /novel canon show <id>');
    return;
  }

  try {
    const svc = getCanonService(extension);
    const projectId = resolveProjectId(extension);
    // Fetch via listActiveCanon then find — CanonService exposes no getById publicly,
    // but we can retrieve from listBySubject as a fallback.
    const items = await svc.listActiveCanon(projectId);
    const item = items.find(i => i.id === id);

    if (!item) {
      output.error(`Canon item not found: ${id}`);
      return;
    }

    output.heading(`Canon Item: ${item.subject} ${item.predicate}`);
    output.keyValue({
      ID: item.id,
      Type: item.type,
      Strength: item.strength,
      Status: item.status,
      Subject: item.subject,
      Predicate: item.predicate,
      Object: item.object ?? '(none)',
      Description: item.description,
      Confidence: item.confidence,
      Created: item.createdAt,
      Updated: item.updatedAt,
    });
  } catch (err) {
    output.error(`Failed to show canon item: ${(err as Error).message}`);
  }
}

/** `canon conflicts` */
async function handleConflicts(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  try {
    const svc = getCanonService(extension);
    const projectId = resolveProjectId(extension);
    const conflicts = await svc.listConflicts(projectId);

    if (conflicts.length === 0) {
      output.success('No open canon conflicts found.');
      return;
    }

    output.heading(`Open Conflicts (${conflicts.length})`);
    output.newline();
    for (const conflict of conflicts) {
      output.warning(`[${conflict.severity}] ${conflict.conflictType}`);
      output.info(`  ${conflict.explanation}`);
      output.dim(`  Items: ${conflict.itemA} vs ${conflict.itemB}`);
    }
  } catch (err) {
    output.error(`Failed to list conflicts: ${(err as Error).message}`);
  }
}

/** `canon promote <id>` */
async function handlePromote(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const id = positionalId(args);
  if (!id) {
    output.error('Please provide a canon item ID: /novel canon promote <id>');
    return;
  }

  try {
    const svc = getCanonService(extension);
    await svc.promoteAssertion(id);
    output.success(`Canon item ${id} promoted to hard fact.`);
  } catch (err) {
    output.error(`Failed to promote canon item: ${(err as Error).message}`);
  }
}
