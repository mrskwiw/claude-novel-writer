/**
 * Idea CLI Handler
 * Handles the `idea` command and all its subcommands.
 */

import { join } from 'path';
import { IdeaBuilder } from '../../builders/idea-builder.js';
import { IdeaSync } from '../../sync/idea-sync.js';
import { NovelWriterExtension } from '../../index.js';
import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { IdeaFilter } from '../../builders/idea-builder.js';

/**
 * Entry point for the `idea` command.
 *
 * @param args               - Parsed CLI arguments
 * @param projectPath        - Absolute path to the novel project directory
 * @param output             - Output formatter
 * @param injectedExtension  - Optional pre-constructed extension (for testing)
 */
export async function handleIdeaCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'add':
      await handleAdd(args, projectPath, output, injectedExtension);
      break;
    case 'list':
      await handleList(args, projectPath, output);
      break;
    case 'show':
      await handleShow(args, projectPath, output);
      break;
    case 'link':
      await handleLink(args, projectPath, output, injectedExtension);
      break;
    case 'explore':
      await handleExplore(args, output);
      break;
    case 'use':
      await handleStatusChange(args, projectPath, output, 'used', injectedExtension);
      break;
    case 'discard':
      await handleStatusChange(args, projectPath, output, 'discarded', injectedExtension);
      break;
    case 'sync':
      await handleSync(args, projectPath, output, injectedExtension);
      break;
    default:
      output.error(`Unknown idea subcommand: "${subcommand ?? ''}"`);
      output.info('Available subcommands: add, list, show, link, explore, use, discard, sync');
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Resolve projectId from an injected extension or fall back to 1. */
function resolveProjectId(injectedExtension?: NovelWriterExtension): number {
  if (!injectedExtension) return 1;
  // Access private projectId via cast — extension doesn't expose it publicly
  return (injectedExtension as unknown as { projectId?: number }).projectId ?? 1;
}

/** Build the standard ideas directory path. */
function ideasDir(projectPath: string): string {
  return join(projectPath, '.novel', 'ideas');
}

/** Normalise a tags flag value to a string array. */
function parseTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  return [String(raw)];
}

// ── subcommand handlers ──────────────────────────────────────────────────────

/** `idea add <content> [--tag <tag>]` */
async function handleAdd(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const content = (args.positional[1] as string | undefined) ?? (args.flags['content'] as string | undefined);
  if (!content) {
    output.error('Please provide idea content: /novel idea add "<content>"');
    return;
  }

  const tags = parseTags(args.flags['tag']);
  const builder = new IdeaBuilder(projectPath);

  try {
    const idea = await builder.quickAdd(content, tags);

    // Sync to DB
    const extension = injectedExtension ?? new NovelWriterExtension(projectPath);
    const projectId = resolveProjectId(extension);
    const mcpClient = (extension as unknown as { mcpClient: import('../../core/database.js').MCPClient }).mcpClient;
    const sync = new IdeaSync(mcpClient, projectId);
    await sync.syncIdea({ ...idea, projectId });

    output.success(`Idea captured: ${idea.ideaKey}`);
    output.info(`Content: ${idea.content}`);
    if (tags.length > 0) {
      output.info(`Tags: ${tags.join(', ')}`);
    }
  } catch (err) {
    output.error(`Failed to add idea: ${(err as Error).message}`);
  }
}

/** `idea list [--tag <tag>] [--status active|used|discarded]` */
async function handleList(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const filter: IdeaFilter = {};
  if (args.flags['tag']) filter.tag = args.flags['tag'] as string;
  if (args.flags['status']) filter.status = args.flags['status'] as IdeaFilter['status'];

  const builder = new IdeaBuilder(projectPath);
  try {
    const ideas = await builder.list(filter);
    if (ideas.length === 0) {
      output.info('No ideas found.');
      return;
    }

    output.heading(`Ideas (${ideas.length})`);
    output.newline();
    for (const idea of ideas) {
      const snippet = idea.content.length > 60 ? `${idea.content.slice(0, 60)}…` : idea.content;
      const tagsStr = idea.tags.length > 0 ? ` [${idea.tags.join(', ')}]` : '';
      output.info(`• ${idea.ideaKey} [${idea.status}]${tagsStr}`);
      output.dim(`  ${snippet}`);
    }
  } catch (err) {
    output.error(`Failed to list ideas: ${(err as Error).message}`);
  }
}

/** `idea show <key>` */
async function handleShow(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const key = (args.positional[1] as string | undefined) ?? (args.flags['key'] as string | undefined);
  if (!key) {
    output.error('Please provide an idea key: /novel idea show <key>');
    return;
  }

  const builder = new IdeaBuilder(projectPath);
  try {
    const idea = await builder.get(key);
    if (!idea) {
      output.error(`Idea not found: ${key}`);
      return;
    }

    output.heading(`Idea: ${idea.ideaKey}`);
    output.keyValue({
      Status: idea.status,
      Tags: idea.tags.join(', ') || '(none)',
      Content: idea.content,
      ...(idea.linkedEntityType ? { 'Linked to': `${idea.linkedEntityType}: ${idea.linkedEntityName ?? ''}` } : {}),
      ...(idea.notes ? { Notes: idea.notes } : {}),
      Created: idea.createdAt ?? '—',
      Updated: idea.updatedAt ?? '—',
    });
  } catch (err) {
    output.error(`Failed to show idea: ${(err as Error).message}`);
  }
}

/** `idea link <key> --to <type> --name <name>` */
async function handleLink(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const key = (args.positional[1] as string | undefined) ?? (args.flags['key'] as string | undefined);
  const entityType = args.flags['to'] as string | undefined;
  const entityName = args.flags['name'] as string | undefined;

  if (!key) {
    output.error('Please provide an idea key: /novel idea link <key> --to <type> --name <name>');
    return;
  }
  if (!entityType) {
    output.error('Please provide --to <character|plot|location|scene|world-rule>');
    return;
  }
  if (!entityName) {
    output.error('Please provide --name <entity name>');
    return;
  }

  const validTypes = ['character', 'plot', 'location', 'scene', 'world-rule'] as const;
  type ValidType = (typeof validTypes)[number];
  if (!validTypes.includes(entityType as ValidType)) {
    output.error(`Invalid entity type "${entityType}". Use: ${validTypes.join(', ')}`);
    return;
  }

  const builder = new IdeaBuilder(projectPath);
  try {
    await builder.link(key, entityType as ValidType, entityName);

    // Sync updated file to DB
    const idea = await builder.get(key);
    if (idea) {
      const extension = injectedExtension ?? new NovelWriterExtension(projectPath);
      const projectId = resolveProjectId(extension);
      const mcpClient = (extension as unknown as { mcpClient: import('../../core/database.js').MCPClient }).mcpClient;
      const sync = new IdeaSync(mcpClient, projectId);
      await sync.syncIdea({ ...idea, projectId });
    }

    output.success(`Idea ${key} linked to ${entityType}: ${entityName}`);
  } catch (err) {
    output.error(`Failed to link idea: ${(err as Error).message}`);
  }
}

/** `idea explore --prompt "<text>"` — prints a brainstorm prompt; does NOT call the API */
async function handleExplore(
  args: ParsedArgs,
  output: OutputFormatter
): Promise<void> {
  const prompt = (args.flags['prompt'] as string | undefined) ?? (args.positional[1] as string | undefined);

  if (!prompt) {
    output.error('Please provide a brainstorm prompt: /novel idea explore --prompt "<text>"');
    return;
  }

  output.heading('Brainstorm Prompt');
  output.newline();
  output.info('Copy the following into a new Claude conversation to brainstorm:');
  output.newline();
  output.code(
    [
      `You are assisting a novelist with creative brainstorming.`,
      ``,
      `BRAINSTORM PROMPT: "${prompt}"`,
      ``,
      `Generate 5 distinct, creative ideas or directions related to this prompt.`,
      `Each idea should be a concrete, actionable story element (character trait, plot twist,`,
      `location detail, etc.). Be surprising — the ideas you can't see coming are often best.`,
      ``,
      `Format as a numbered list. Keep each idea to 1-3 sentences.`,
    ].join('\n'),
    'text'
  );
}

/** `idea use <key>` and `idea discard <key>` */
async function handleStatusChange(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  status: 'used' | 'discarded',
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const key = (args.positional[1] as string | undefined) ?? (args.flags['key'] as string | undefined);
  if (!key) {
    output.error(`Please provide an idea key: /novel idea ${status} <key>`);
    return;
  }

  const builder = new IdeaBuilder(projectPath);
  try {
    await builder.updateStatus(key, status);

    // Sync updated file to DB
    const idea = await builder.get(key);
    if (idea) {
      const extension = injectedExtension ?? new NovelWriterExtension(projectPath);
      const projectId = resolveProjectId(extension);
      const mcpClient = (extension as unknown as { mcpClient: import('../../core/database.js').MCPClient }).mcpClient;
      const sync = new IdeaSync(mcpClient, projectId);
      await sync.syncIdea({ ...idea, projectId });
    }

    output.success(`Idea ${key} marked as ${status}`);
  } catch (err) {
    output.error(`Failed to update idea: ${(err as Error).message}`);
  }
}

/** `idea sync` — syncs all YAML files in the ideas directory to the DB */
async function handleSync(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const dir = ideasDir(projectPath);

  try {
    const extension = injectedExtension ?? new NovelWriterExtension(projectPath);
    const projectId = resolveProjectId(extension);
    const mcpClient = (extension as unknown as { mcpClient: import('../../core/database.js').MCPClient }).mcpClient;
    const sync = new IdeaSync(mcpClient, projectId);
    const count = await sync.syncAllFromDirectory(dir);

    output.success(`Synced ${count} idea${count !== 1 ? 's' : ''} to database`);
  } catch (err) {
    output.error(`Sync failed: ${(err as Error).message}`);
  }
}
