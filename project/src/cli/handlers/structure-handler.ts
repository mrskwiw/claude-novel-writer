/**
 * Story Structure Command Handlers
 *
 * Subcommands:
 *  - `list`   — list available beat templates (no project required)
 *  - `apply`  — write a word-count-resolved structure plan to structure/<id>.yml
 *  - `status` — compare an applied plan's beats against the drafted manuscript
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { MCPClient } from '../../core/database.js';
import { NovelWriterExtension } from '../../index.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile, readdir } from 'fs/promises';
import YAML from 'yaml';
import {
  getTemplate,
  listTemplates,
  buildAppliedPlan,
  computeStructureStatus,
  templateFromPlan,
  type AppliedStructurePlan,
  type BeatStatus,
} from '../../data/structure-templates.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Access the injected MCP client without widening to `any`. */
function getMcp(extension: NovelWriterExtension): MCPClient {
  return (extension as unknown as { mcpClient: MCPClient }).mcpClient;
}

/** Ensure the project database exists; report and return false if not. */
function requireProject(projectPath: string, output: OutputFormatter): boolean {
  const dbPath = join(projectPath, '.novel', 'data.db');
  if (!existsSync(dbPath)) {
    output.error('Project not initialized. Run `/novel init` first.');
    return false;
  }
  return true;
}

/** List applied plan files under structure/. */
async function findPlanFiles(projectPath: string): Promise<string[]> {
  const dir = join(projectPath, 'structure');
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => join(dir, f));
}

/** Display label for a beat's pacing status. */
function statusLabel(b: BeatStatus): string {
  if (b.label === 'due') return '● due now';
  if (b.reached) return '✓ reached';
  return '○ upcoming';
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function handleStructureCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'list':
      handleStructureList(output);
      break;
    case 'apply':
      await handleStructureApply(args, projectPath, output, injectedExtension);
      break;
    case 'status':
      await handleStructureStatus(args, projectPath, output, injectedExtension);
      break;
    default:
      output.error('Unknown structure subcommand. Use: list, apply, status');
  }
}

// ─── list ─────────────────────────────────────────────────────────────────────

function handleStructureList(output: OutputFormatter): void {
  const templates = listTemplates();

  output.info('=== Story Structure Templates ===');
  output.newline();

  for (const t of templates) {
    output.success(`${t.name}  (${t.id})`);
    output.dim(`  ${t.description}`);
    output.dim(`  Beats: ${t.beats.length} | Source: ${t.source}`);
    output.newline();
  }

  output.info(`Total: ${templates.length} templates`);
  output.dim('Apply one with: /novel structure apply <template>');
}

// ─── apply ────────────────────────────────────────────────────────────────────

async function handleStructureApply(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const templateId = (args.flags.template as string | undefined) ?? args.positional[1];

    if (!templateId) {
      output.error('Template required. Use: /novel structure apply <template>');
      output.dim(`Available: ${listTemplates().map((t) => t.id).join(', ')}`);
      return;
    }

    const template = getTemplate(templateId);
    if (!template) {
      output.error(`Unknown template: ${templateId}`);
      output.dim(`Available: ${listTemplates().map((t) => t.id).join(', ')}`);
      return;
    }

    if (!requireProject(projectPath, output)) return;

    const extension = injectedExtension ?? new NovelWriterExtension(projectPath);
    if (!extension.hasProjectId()) {
      const id = await extension.loadProjectId();
      if (id === undefined) {
        output.error('Project not found in database. Run `/novel init` first.');
        return;
      }
    }

    // Resolve target word count: explicit --words flag wins, else project value.
    const wordsOverride = args.flags.words;
    let targetWordCount: number;
    if (wordsOverride !== undefined && wordsOverride !== null) {
      targetWordCount = Number(wordsOverride);
    } else {
      const mcp = getMcp(extension);
      const rows = await mcp.readQuery<{ target_word_count: number | null }>(
        'SELECT target_word_count FROM projects WHERE id = ?',
        [extension.getProjectId()]
      );
      targetWordCount = Number(rows[0]?.target_word_count ?? 0);
    }

    if (!Number.isFinite(targetWordCount) || targetWordCount <= 0) {
      output.error(
        'Project has no target word count set. Set one at init, or pass --words <count>.'
      );
      return;
    }

    const plan = buildAppliedPlan(template, targetWordCount);

    const dir = join(projectPath, 'structure');
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${template.id}.yml`);
    await writeFile(filePath, YAML.stringify(plan), 'utf-8');

    output.success(`Structure plan applied: ${filePath}`);
    output.info(`Template: ${template.name}`);
    output.info(`Target word count: ${targetWordCount}`);
    output.newline();

    const rows = plan.beats.map((b) => ({
      Beat: b.name,
      'Pos %': `${Math.round(b.position * 100)}%`,
      'Target Word': b.targetWord,
    }));
    output.table(rows);
  } catch (error) {
    output.error(`Failed to apply structure: ${(error as Error).message}`);
  }
}

// ─── status ───────────────────────────────────────────────────────────────────

async function handleStructureStatus(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    if (!requireProject(projectPath, output)) return;

    // Resolve which applied plan to inspect.
    const templateFlag = args.flags.template as string | undefined;
    let planPath: string;

    if (templateFlag) {
      planPath = join(projectPath, 'structure', `${templateFlag}.yml`);
      if (!existsSync(planPath)) {
        output.error(`No applied plan for "${templateFlag}".`);
        output.dim(`Run: /novel structure apply ${templateFlag}`);
        return;
      }
    } else {
      const plans = await findPlanFiles(projectPath);
      if (plans.length === 0) {
        output.error('No structure plan applied. Run `/novel structure apply <template>` first.');
        return;
      }
      if (plans.length > 1) {
        output.error('Multiple structure plans found. Specify one with --template <id>.');
        return;
      }
      planPath = plans[0];
    }

    const plan = YAML.parse(await readFile(planPath, 'utf-8')) as AppliedStructurePlan;

    const extension = injectedExtension ?? new NovelWriterExtension(projectPath);
    if (!extension.hasProjectId()) {
      const id = await extension.loadProjectId();
      if (id === undefined) {
        output.error('Project not found in database. Run `/novel init` first.');
        return;
      }
    }

    // Total drafted words so far (sum of chapter word counts).
    const mcp = getMcp(extension);
    const wordRows = await mcp.readQuery<{ total: number | null }>(
      'SELECT COALESCE(SUM(word_count), 0) AS total FROM chapters WHERE project_id = ?',
      [extension.getProjectId()]
    );
    const currentWords = Number(wordRows[0]?.total ?? 0);

    const template = getTemplate(plan.template) ?? templateFromPlan(plan);
    const report = computeStructureStatus(template, plan.targetWordCount, currentWords);

    output.heading(`Structure Status — ${plan.templateName}`);
    output.info(
      `Target: ${plan.targetWordCount} words | Drafted: ${currentWords} words ` +
        `(${(report.fractionComplete * 100).toFixed(1)}%)`
    );
    output.newline();

    const rows = report.beats.map((b) => ({
      Beat: b.beat.name,
      'Pos %': `${Math.round(b.beat.position * 100)}%`,
      'Target Word': b.targetWord,
      Status: statusLabel(b),
    }));
    output.table(rows);
    output.newline();

    output.info(
      `Beats that should have landed by now: ${report.reachedCount}/${report.beats.length}`
    );

    if (report.nextBeat) {
      output.info(
        `Next beat: ${report.nextBeat.beat.name} at ${report.nextBeat.targetWord} words ` +
          `(${report.wordsToNextBeat} words to go)`
      );
    } else {
      output.success('All beats reached — the manuscript has passed the final beat target.');
    }

    // Flag pacing relative to the drafted position.
    const dueNow = report.beats.filter((b) => b.label === 'due');
    if (dueNow.length > 0) {
      output.warning(`On the mark now (within tolerance): ${dueNow.map((b) => b.beat.name).join(', ')}`);
    }

    const overdue = report.beats.filter((b) => b.label === 'passed');
    if (overdue.length > 0) {
      output.dim(
        `Already behind the drafted position (should be written): ${overdue
          .map((b) => b.beat.name)
          .join(', ')}`
      );
    }
  } catch (error) {
    output.error(`Failed to read structure status: ${(error as Error).message}`);
  }
}
