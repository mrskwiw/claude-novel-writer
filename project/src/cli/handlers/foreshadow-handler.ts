/**
 * Foreshadow Command Handlers — PROC-03
 *
 * Handles the `foreshadow` subcommands: add, list, payoff.
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import { ForeshadowingService } from '../../services/foreshadowing-service.js';
import type { MCPClient } from '../../core/database.js';
import { DirectSQLiteClient } from '../../core/database.js';
import { join } from 'path';
import { existsSync } from 'fs';

/** Retrieve projectId and MCPClient for the project at `projectPath`. */
async function resolveProject(
  projectPath: string
): Promise<{ projectId: string; client: MCPClient }> {
  const dbPath = join(projectPath, '.novel', 'data.db');
  const client: MCPClient = new DirectSQLiteClient(dbPath);

  const rows = await client.readQuery(
    'SELECT id FROM projects ORDER BY id LIMIT 1',
    []
  );

  if (rows.length === 0) {
    throw new Error('Project not found in database. Run `novel-writer init` first.');
  }

  return { projectId: String(rows[0].id), client };
}

export async function handleForeshadowCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const dbPath = join(projectPath, '.novel', 'data.db');
  if (!existsSync(dbPath)) {
    output.error('Project not initialized. Run `/novel init` first.');
    return;
  }

  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'add':
      await handleForeshadowAdd(args, projectPath, output);
      break;
    case 'list':
      await handleForeshadowList(args, projectPath, output);
      break;
    case 'payoff':
      await handleForeshadowPayoff(args, projectPath, output);
      break;
    default:
      await handleForeshadowList(args, projectPath, output);
  }
}

/**
 * Handle `foreshadow add --content "X" [--chapter N] [--scene N]`
 */
async function handleForeshadowAdd(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const content = args.flags.content as string | undefined;
    if (!content || content.trim().length === 0) {
      output.error('Content is required. Use --content "description"');
      return;
    }

    const chapterArg = args.flags.chapter as number | undefined;
    const sceneArg = args.flags.scene as number | undefined;

    const { projectId, client } = await resolveProject(projectPath);
    const service = new ForeshadowingService(client);

    const note = await service.add(projectId, content, {
      chapterId: chapterArg,
      sceneId: sceneArg,
    });

    output.success('Foreshadowing note planted!');
    output.dim(`  ID:      ${note.id}`);
    output.dim(`  Content: ${note.content}`);
    if (note.chapterId !== undefined) {
      output.dim(`  Chapter: ${note.chapterId}`);
    }
    if (note.sceneId !== undefined) {
      output.dim(`  Scene:   ${note.sceneId}`);
    }
    output.dim(`  Status:  ${note.status}`);
  } catch (error) {
    output.error(`Failed to add foreshadowing note: ${(error as Error).message}`);
  }
}

/**
 * Handle `foreshadow list [--status planted|paid_off|forgotten]`
 */
async function handleForeshadowList(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const statusFilter = args.flags.status as string | undefined;

    const { projectId, client } = await resolveProject(projectPath);
    const service = new ForeshadowingService(client);

    let notes;
    if (statusFilter === 'forgotten') {
      notes = await service.listForgotten(projectId);
    } else {
      notes = await service.list(projectId, statusFilter);
    }

    if (notes.length === 0) {
      const qualifier = statusFilter ? ` with status "${statusFilter}"` : '';
      output.info(`No foreshadowing notes found${qualifier}.`);
      return;
    }

    const label = statusFilter
      ? `Foreshadowing Notes (${statusFilter})`
      : 'All Foreshadowing Notes';
    output.info(`=== ${label} ===\n`);

    for (const note of notes) {
      const chapterStr = note.chapterId !== undefined ? ` | Ch. ${note.chapterId}` : '';
      const payoffStr =
        note.payoffChapterId !== undefined ? ` → payoff Ch. ${note.payoffChapterId}` : '';
      output.info(`[${note.status.toUpperCase()}] ${note.content}${chapterStr}${payoffStr}`);
      output.dim(`  id: ${note.id}`);
    }
  } catch (error) {
    output.error(`Failed to list foreshadowing notes: ${(error as Error).message}`);
  }
}

/**
 * Handle `foreshadow payoff --id <id> [--chapter N]`
 */
async function handleForeshadowPayoff(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const id = args.flags.id as string | undefined;
    if (!id || id.trim().length === 0) {
      output.error('Note ID is required. Use --id <id>');
      return;
    }

    const chapterArg = args.flags.chapter as number | undefined;

    const { projectId: _projectId, client } = await resolveProject(projectPath);
    const service = new ForeshadowingService(client);

    await service.markPaidOff(id.trim(), chapterArg);

    output.success('Foreshadowing note marked as paid off!');
    if (chapterArg !== undefined) {
      output.dim(`  Payoff chapter: ${chapterArg}`);
    }
  } catch (error) {
    output.error(`Failed to mark payoff: ${(error as Error).message}`);
  }
}
