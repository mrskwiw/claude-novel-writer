/**
 * Context CLI Handler
 * Handles the `context` command and all its subcommands.
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { NovelWriterExtension } from '../../index.js';
import type { ContextContractService } from '../../services/context-contract-service.js';

/**
 * Entry point for the `context` command.
 *
 * @param args           - Parsed CLI arguments
 * @param _projectPath   - Absolute path to the novel project directory
 * @param output         - Output formatter
 * @param extension      - NovelWriterExtension instance
 */
export async function handleContextCommand(
  args: ParsedArgs,
  _projectPath: string,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'contracts':
      await handleContracts(args, output, extension);
      break;
    case 'show-contract':
      await handleShowContract(args, output, extension);
      break;
    case 'build':
      await handleBuild(args, output, extension);
      break;
    default:
      output.error(`Unknown context subcommand: "${subcommand ?? ''}"`);
      output.info('Available subcommands: contracts, show-contract, build');
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Extract ContextContractService from extension. */
function getContractService(extension?: NovelWriterExtension): ContextContractService {
  if (!extension) {
    throw new Error('No active project. Run /novel init first.');
  }
  const ext = extension as unknown as {
    getContextContractService?: () => ContextContractService;
  };
  if (typeof ext.getContextContractService !== 'function') {
    throw new Error('ContextContractService not available on this extension instance.');
  }
  return ext.getContextContractService();
}

// ── subcommand handlers ───────────────────────────────────────────────────────

/** `context contracts` — list all registered context contracts */
async function handleContracts(
  _args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  try {
    const svc = getContractService(extension);
    const contracts = svc.listAll();

    if (contracts.length === 0) {
      output.info('No context contracts registered.');
      return;
    }

    output.heading(`Context Contracts (${contracts.length})`);
    output.newline();
    for (const contract of contracts) {
      output.info(`• ${contract.name} — ${contract.id}`);
      output.dim(`  ${contract.description}`);
      output.dim(`  Operation: ${contract.operationType} | Max tokens: ${contract.maxTokens} | Deterministic: ${contract.deterministic}`);
    }
  } catch (err) {
    output.error(`Failed to list contracts: ${(err as Error).message}`);
  }
}

/** `context show-contract <id>` */
async function handleShowContract(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const id = (args.positional[1] as string | undefined) ?? (args.flags['contract'] as string | undefined);
  if (!id) {
    output.error('Please provide a contract ID: /novel context show-contract <id>');
    return;
  }

  try {
    const svc = getContractService(extension);
    const contract = svc.getById(id);

    if (!contract) {
      output.error(`Context contract not found: ${id}`);
      return;
    }

    output.heading(`Contract: ${contract.name}`);
    output.keyValue({
      ID: contract.id,
      'Operation Type': contract.operationType,
      Description: contract.description,
      'Max Tokens': contract.maxTokens,
      'Ordering Policy': contract.orderingPolicy,
      'Truncation Strategy': contract.truncationPolicy.strategy,
      Deterministic: contract.deterministic ? 'yes' : 'no',
      'Required Contexts': contract.required.map(r => r.type).join(', ') || '(none)',
      'Optional Contexts': contract.optional.map(r => r.type).join(', ') || '(none)',
    });
  } catch (err) {
    output.error(`Failed to show contract: ${(err as Error).message}`);
  }
}

/** `context build --contract <id> [--scene <id>] [--chapter <id>] [--task <text>]` */
async function handleBuild(
  args: ParsedArgs,
  output: OutputFormatter,
  extension?: NovelWriterExtension
): Promise<void> {
  const contractId = args.flags['contract'] as string | undefined;
  if (!contractId) {
    output.error('Please provide --contract <id>');
    return;
  }

  if (!extension) {
    output.error('No active project. Run /novel init first.');
    return;
  }
  const projectId = extension.getProjectId();
  if (projectId === undefined) {
    output.error('No project loaded for this directory.');
    return;
  }

  const sceneId = args.flags['scene'] as number | undefined;
  const chapterId = args.flags['chapter'] as number | undefined;
  const task = args.flags['task'] as string | undefined;

  try {
    const engine = extension.getContextPolicyEngine();
    const result = await engine.buildContext({
      projectId: String(projectId),
      contractId,
      currentSceneId: sceneId !== undefined ? String(sceneId) : undefined,
      currentChapterId: chapterId !== undefined ? String(chapterId) : undefined,
      userTask: task,
      queryText: task,
    });

    output.heading(`Context — ${contractId}`);
    output.dim(`${result.blocks.length} blocks · ${result.totalTokens} tokens · fingerprint ${result.deterministicFingerprint.slice(0, 12)}`);
    output.newline();

    if (result.blocks.length === 0) {
      output.info('No context blocks assembled (no matching data yet, or required fetchers unavailable).');
    } else {
      for (const block of result.blocks) {
        output.info(`── ${block.title} [${block.type}] (${block.tokenCount} tok)`);
        output.dim(block.content.length > 500 ? `${block.content.slice(0, 500)}…` : block.content);
        output.newline();
      }
    }

    if (result.omitted.length > 0) {
      output.dim(`Omitted ${result.omitted.length} block(s) to fit the token budget.`);
    }
    for (const warning of result.warnings) {
      output.warning(`${warning.code}: ${warning.message}`);
    }
  } catch (err) {
    output.error(`Failed to build context: ${(err as Error).message}`);
  }
}
