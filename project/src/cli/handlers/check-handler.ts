/**
 * Check Command Handlers
 * Handles consistency checking commands
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import { NovelWriterExtension } from '../../index.js';
import { DirectSQLiteClient } from '../../core/database.js';
import type { ConsistencyIssue } from '../../types/novel.js';
import { join } from 'path';
import { existsSync } from 'fs';

async function makeExtension(projectPath: string): Promise<NovelWriterExtension> {
  const dbPath = join(projectPath, '.novel', 'data.db');
  const client = new DirectSQLiteClient(dbPath);
  const rows = await client.readQuery<{ id: number }>('SELECT id FROM projects LIMIT 1');
  const projectId = rows[0]?.id ?? 1;
  const ext = new NovelWriterExtension(projectPath, client);
  ext.setProjectId(projectId);
  return ext;
}

export async function handleCheckCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0] ?? 'consistency';

  switch (subcommand) {
    case 'consistency':
      await handleConsistencyCheck(args, projectPath, output);
      break;
    case 'characters':
      await handleCharacterCheck(args, projectPath, output);
      break;
    case 'timeline':
      await handleTimelineCheck(args, projectPath, output);
      break;
    case 'world-rules':
      await handleWorldRulesCheck(args, projectPath, output);
      break;
    case 'plot-threads':
      await handlePlotThreadsCheck(args, projectPath, output);
      break;
    case 'list':
      await handleListIssues(args, projectPath, output);
      break;
    case 'resolve':
      await handleResolveIssue(args, projectPath, output);
      break;
    case 'acknowledge':
      await handleAcknowledgeIssue(args, projectPath, output);
      break;
    case 'false-positive':
      await handleFalsePositive(args, projectPath, output);
      break;
    default:
      output.error(`Unknown check subcommand: ${subcommand}`);
      output.info('Available: consistency, characters, timeline, world-rules, plot-threads, list, resolve, acknowledge, false-positive');
  }
}

/**
 * Run all consistency checks
 */
async function handleConsistencyCheck(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    // Check if project initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    output.info('Running consistency checks...');
    output.newline();

    const extension = await makeExtension(projectPath);
    const checker = extension.getConsistencyChecker();

    // Run all checks
    const result = await checker.checkAll();

    // Display results
    displayCheckResults(result, output, args.flags.verbose as boolean);

    // Show summary
    output.newline();
    const total = result.errors + result.warnings + result.info;
    if (total === 0) {
      output.success('✓ No consistency issues found!');
    } else {
      output.info(`Total issues found: ${total}`);
      if (result.errors > 0) {
        output.error(`  Errors: ${result.errors}`);
      }
      if (result.warnings > 0) {
        output.dim(`  Warnings: ${result.warnings}`);
      }
      if (result.info > 0) {
        output.dim(`  Info: ${result.info}`);
      }
    }
  } catch (error) {
    output.error(`Failed to run consistency check: ${(error as Error).message}`);
  }
}

/**
 * Check character consistency only
 */
async function handleCharacterCheck(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    output.info('Checking character consistency...');
    output.newline();

    const extension = await makeExtension(projectPath);
    const checker = extension.getConsistencyChecker();

    // Get character-specific issues
    const issues = await checker.getOpenIssues();
    const characterIssues = issues.filter(i => i.issueType === 'character_attribute');

    if (characterIssues.length === 0) {
      output.success('✓ No character consistency issues found!');
    } else {
      displayIssues(characterIssues, output, args.flags.verbose as boolean);
      output.newline();
      output.info(`Found ${characterIssues.length} character consistency issue(s)`);
    }
  } catch (error) {
    output.error(`Failed to check characters: ${(error as Error).message}`);
  }
}

/**
 * Check timeline consistency only
 */
async function handleTimelineCheck(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    output.info('Checking timeline consistency...');
    output.newline();

    const extension = await makeExtension(projectPath);
    const checker = extension.getConsistencyChecker();

    const issues = await checker.getOpenIssues();
    const timelineIssues = issues.filter(i => i.issueType === 'timeline');

    if (timelineIssues.length === 0) {
      output.success('✓ No timeline consistency issues found!');
    } else {
      displayIssues(timelineIssues, output, args.flags.verbose as boolean);
      output.newline();
      output.info(`Found ${timelineIssues.length} timeline consistency issue(s)`);
    }
  } catch (error) {
    output.error(`Failed to check timeline: ${(error as Error).message}`);
  }
}

/**
 * Check world rules using AI-assisted violation detection.
 * Scans chapter text against all hard world rules and reports any violations.
 */
async function handleWorldRulesCheck(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    output.info('Scanning chapters for world rule violations (AI-assisted)…');
    output.newline();

    const extension = await makeExtension(projectPath);
    const checker = extension.getConsistencyChecker();

    // Run AI-assisted scan and store results
    const violations = await checker.checkWorldRuleViolations();

    if (violations.length === 0) {
      output.success('✓ No world rule violations found.');
    } else {
      // Table header
      output.info(`Found ${violations.length} world rule violation(s):`);
      output.newline();

      // Display each violation as a formatted entry
      for (const issue of violations) {
        const icon = '❌';
        const idStr = issue.id ? `#${issue.id} ` : '';
        output.info(`${icon} ${idStr}[world_rule]`);
        output.dim(`  ${issue.description}`);
        if (args.flags.verbose && issue.chapterId) {
          output.dim(`  Chapter ID: ${issue.chapterId}`);
        }
        output.newline();
      }

      output.dim('Use `/novel check resolve --id <id>` to mark as resolved');
      output.dim('Use `/novel check acknowledge --id <id>` to flag as intentional');
    }
  } catch (error) {
    output.error(`Failed to check world rules: ${(error as Error).message}`);
  }
}

/**
 * Check plot threads
 */
async function handlePlotThreadsCheck(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    output.info('Checking plot threads...');
    output.newline();

    const extension = await makeExtension(projectPath);
    const checker = extension.getConsistencyChecker();

    const issues = await checker.getOpenIssues();
    const plotIssues = issues.filter(i => i.issueType === 'continuity');

    if (plotIssues.length === 0) {
      output.success('✓ No unresolved plot thread issues found!');
    } else {
      displayIssues(plotIssues, output, args.flags.verbose as boolean);
      output.newline();
      output.info(`Found ${plotIssues.length} plot thread issue(s)`);
    }
  } catch (error) {
    output.error(`Failed to check plot threads: ${(error as Error).message}`);
  }
}

/**
 * List existing consistency issues
 */
async function handleListIssues(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const extension = await makeExtension(projectPath);
    const checker = extension.getConsistencyChecker();

    const severity = args.flags.severity as 'info' | 'warning' | 'error' | undefined;
    const issues = await checker.getOpenIssues(severity);

    if (issues.length === 0) {
      if (severity) {
        output.success(`✓ No ${severity} issues found!`);
      } else {
        output.success('✓ No open issues found!');
      }
      return;
    }

    output.info(`=== Open Consistency Issues${severity ? ` (${severity})` : ''} ===`);
    output.newline();

    displayIssues(issues, output, args.flags.verbose as boolean);

    output.newline();
    output.info(`Total: ${issues.length} issue(s)`);
    output.dim('Use /novel check resolve --id <id> to mark as resolved');
    output.dim('Use /novel check acknowledge --id <id> to acknowledge intentional inconsistency');
  } catch (error) {
    output.error(`Failed to list issues: ${(error as Error).message}`);
  }
}

/**
 * Resolve an issue
 */
async function handleResolveIssue(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const issueId = args.flags.id as number | undefined;
    if (!issueId) {
      output.error('Issue ID required. Use --id <number>');
      return;
    }

    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const extension = await makeExtension(projectPath);
    const checker = extension.getConsistencyChecker();

    const notes = args.flags.notes as string | undefined;
    await checker.resolveIssue(issueId, notes);

    output.success(`Issue #${issueId} marked as resolved`);
    if (notes) {
      output.dim(`Notes: ${notes}`);
    }
  } catch (error) {
    output.error(`Failed to resolve issue: ${(error as Error).message}`);
  }
}

/**
 * Acknowledge an issue
 */
async function handleAcknowledgeIssue(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const issueId = args.flags.id as number | undefined;
    if (!issueId) {
      output.error('Issue ID required. Use --id <number>');
      return;
    }

    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const extension = await makeExtension(projectPath);
    const checker = extension.getConsistencyChecker();

    const notes = args.flags.notes as string | undefined;
    await checker.acknowledgeIssue(issueId, notes);

    output.success(`Issue #${issueId} acknowledged`);
    output.dim('This issue is intentional and will not be flagged again');
    if (notes) {
      output.dim(`Notes: ${notes}`);
    }
  } catch (error) {
    output.error(`Failed to acknowledge issue: ${(error as Error).message}`);
  }
}

/**
 * Mark issue as false positive
 */
async function handleFalsePositive(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const issueId = args.flags.id as number | undefined;
    if (!issueId) {
      output.error('Issue ID required. Use --id <number>');
      return;
    }

    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const extension = await makeExtension(projectPath);
    const checker = extension.getConsistencyChecker();

    const notes = args.flags.notes as string | undefined;
    await checker.markFalsePositive(issueId, notes);

    output.success(`Issue #${issueId} marked as false positive`);
    if (notes) {
      output.dim(`Notes: ${notes}`);
    }
  } catch (error) {
    output.error(`Failed to mark false positive: ${(error as Error).message}`);
  }
}

/**
 * Display check results with formatted output
 */
function displayCheckResults(
  result: { issues: Partial<ConsistencyIssue>[]; errors: number; warnings: number; info: number },
  output: OutputFormatter,
  verbose: boolean
): void {
  // Group issues by severity
  const errors = result.issues.filter(i => i.severity === 'error');
  const warnings = result.issues.filter(i => i.severity === 'warning');
  const infos = result.issues.filter(i => i.severity === 'info');

  // Display errors first
  if (errors.length > 0) {
    output.error(`❌ Critical Issues (${errors.length}):`);
    output.newline();
    errors.forEach(issue => displayIssue(issue, output, verbose));
    output.newline();
  }

  // Then warnings
  if (warnings.length > 0) {
    output.dim(`⚠️  Warnings (${warnings.length}):`);
    output.newline();
    warnings.forEach(issue => displayIssue(issue, output, verbose));
    output.newline();
  }

  // Finally info
  if (infos.length > 0) {
    output.dim(`ℹ️  Info (${infos.length}):`);
    output.newline();
    infos.forEach(issue => displayIssue(issue, output, verbose));
  }
}

/**
 * Display list of issues
 */
function displayIssues(issues: Partial<ConsistencyIssue>[], output: OutputFormatter, verbose: boolean): void {
  issues.forEach(issue => displayIssue(issue, output, verbose));
}

/**
 * Display a single issue with formatting
 */
function displayIssue(issue: Partial<ConsistencyIssue>, output: OutputFormatter, verbose: boolean): void {
  // Severity icon
  const icon = issue.severity === 'error' ? '❌' :
               issue.severity === 'warning' ? '⚠️ ' :
               'ℹ️ ';

  // Issue ID (if from database)
  const idStr = issue.id ? `#${issue.id} ` : '';

  // Type badge
  const typeBadge = `[${issue.issueType}]`;

  output.info(`${icon} ${idStr}${typeBadge}`);
  output.dim(`  ${issue.description}`);

  if (verbose) {
    // Show additional details
    if (issue.chapterId) {
      output.dim(`  Chapter ID: ${issue.chapterId}`);
    }
    if (issue.sceneId) {
      output.dim(`  Scene ID: ${issue.sceneId}`);
    }
    if (issue.characterId) {
      output.dim(`  Character ID: ${issue.characterId}`);
    }
    if (issue.locationId) {
      output.dim(`  Location ID: ${issue.locationId}`);
    }
    if (issue.detectedAt) {
      const date = new Date(issue.detectedAt).toLocaleDateString();
      output.dim(`  Detected: ${date}`);
    }
  }

  output.newline();
}
