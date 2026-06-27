/**
 * Report Command Handler
 *
 * Renders a compact, one-screen manuscript-health dashboard by composing the
 * project's existing analyzers. Every section is independently guarded with its
 * own try/catch so that a single failing data source degrades gracefully
 * instead of crashing the whole report. The handler is strictly read-only — it
 * never writes to the database or to disk.
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import { NovelWriterExtension } from '../../index.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { DevelopmentalAnalyzer } from '../../analysis/developmental-analyzer.js';
import { StyleTargetAnalyzer } from '../../analysis/style-target-analyzer.js';
import { DraftScanner } from '../../analysis/draft-scanner.js';

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Handle `/novel report`.
 *
 * Resolves the project id once, then renders each dashboard section behind its
 * own guard. Sections that depend on the database degrade to a dim notice when
 * the project is uninitialised or the data source throws.
 */
export async function handleReportCommand(
  _args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  output.heading('Manuscript Health Report');
  output.newline();

  const ext = new NovelWriterExtension(projectPath);

  // Resolve the project id up-front. A missing db / project simply means the
  // DB-backed sections render a graceful "no data" line.
  let projectId: number | undefined;
  const dbExists = existsSync(join(projectPath, '.novel', 'data.db'));
  if (dbExists) {
    try {
      projectId = ext.getProjectId() ?? (await ext.loadProjectId());
    } catch {
      projectId = undefined;
    }
  }
  if (projectId !== undefined) ext.setProjectId(projectId);

  await renderTensionSparkline(ext, projectId, output);
  await renderPlotThreads(ext, projectId, output);
  await renderPromises(ext, projectId, output);
  await renderScenePurpose(ext, projectId, output);
  await renderStyleTargets(projectPath, output);
  await renderDraftMarkers(projectPath, output);

  output.newline();
  output.dim('Read-only rollup. Run `/novel analyze ...` or `/novel check` for detail.');
}

// ─── Sections ────────────────────────────────────────────────────────────────

/**
 * Tension arc rendered as a single-line sparkline across all chapters.
 * Reuses the PacingAnalyzer's per-chapter tension averages.
 */
async function renderTensionSparkline(
  ext: NovelWriterExtension,
  projectId: number | undefined,
  output: OutputFormatter
): Promise<void> {
  output.info('── Tension Arc ─────────────────────────');
  if (projectId === undefined) {
    output.dim('  No project data (run `/novel init` first).');
    output.newline();
    return;
  }
  try {
    const arc = await ext.getPacingAnalyzer().analyzeTensionArc();
    if (arc.length === 0) {
      output.dim('  No chapters yet.');
      output.newline();
      return;
    }
    const spark = buildSparkline(arc.map((c) => c.avgTension));
    const avg = arc.reduce((s, c) => s + c.avgTension, 0) / arc.length;
    const peak = arc.reduce((m, c) => (c.avgTension > m.avgTension ? c : m), arc[0]);
    const trough = arc.reduce((m, c) => (c.avgTension < m.avgTension ? c : m), arc[0]);
    output.info(`  ${spark}`);
    output.dim(
      `  ${arc.length} chapters · avg ${avg.toFixed(1)} · ` +
      `peak ch${peak.chapterNumber} (${peak.avgTension.toFixed(1)}) · ` +
      `low ch${trough.chapterNumber} (${trough.avgTension.toFixed(1)})`
    );
  } catch (err) {
    output.dim(`  Tension arc unavailable: ${(err as Error).message}`);
  }
  output.newline();
}

/** Count of currently-open / active plot threads. */
async function renderPlotThreads(
  ext: NovelWriterExtension,
  projectId: number | undefined,
  output: OutputFormatter
): Promise<void> {
  output.info('── Plot Threads ────────────────────────');
  if (projectId === undefined) {
    output.dim('  No project data.');
    output.newline();
    return;
  }
  try {
    const threads = await ext.getActivePlotThreads();
    const count = Array.isArray(threads) ? threads.length : 0;
    if (count === 0) {
      output.success('  No open plot threads.');
    } else {
      output.info(`  ${count} open plot thread${count === 1 ? '' : 's'}.`);
    }
  } catch (err) {
    output.dim(`  Plot threads unavailable: ${(err as Error).message}`);
  }
  output.newline();
}

/** Count of open promises and those flagged overdue by the promise health report. */
async function renderPromises(
  ext: NovelWriterExtension,
  projectId: number | undefined,
  output: OutputFormatter
): Promise<void> {
  output.info('── Narrative Promises ──────────────────');
  if (projectId === undefined) {
    output.dim('  No project data.');
    output.newline();
    return;
  }
  try {
    const service = ext.getPromiseService();
    const pid = String(projectId);
    const open = await service.listOpen(pid);
    let overdue = 0;
    try {
      const health = await service.reportHealth(pid);
      overdue = health.filter((h) => h.status === 'overdue').length;
    } catch {
      // Health is best-effort; fall back to just the open count.
    }
    if (open.length === 0) {
      output.success('  No unresolved promises.');
    } else {
      const overdueNote = overdue > 0 ? ` (${overdue} overdue)` : '';
      output.info(`  ${open.length} unresolved promise${open.length === 1 ? '' : 's'}${overdueNote}.`);
      if (overdue > 0) {
        output.warning(`  ${overdue} promise${overdue === 1 ? '' : 's'} past their expected payoff window.`);
      }
    }
  } catch (err) {
    output.dim(`  Promises unavailable: ${(err as Error).message}`);
  }
  output.newline();
}

/** Count of scenes lacking a declared `purpose` field. */
async function renderScenePurpose(
  ext: NovelWriterExtension,
  projectId: number | undefined,
  output: OutputFormatter
): Promise<void> {
  output.info('── Scene Purpose ───────────────────────');
  if (projectId === undefined) {
    output.dim('  No project data.');
    output.newline();
    return;
  }
  try {
    // The MCP client is injected on the extension; reuse it for the analyzer
    // (matches the pattern in analyze-handler.ts).
    const mcpClient = (ext as unknown as { mcpClient: import('../../core/database.js').MCPClient }).mcpClient;
    const analyzer = new DevelopmentalAnalyzer(mcpClient);
    const audits = await analyzer.auditScenePurposes(String(projectId));
    if (audits.length === 0) {
      output.dim('  No scenes yet.');
    } else {
      const missing = audits.filter((a) => !a.hasPurpose).length;
      if (missing === 0) {
        output.success(`  All ${audits.length} scene${audits.length === 1 ? '' : 's'} declare a purpose.`);
      } else {
        output.warning(`  ${missing} of ${audits.length} scene${audits.length === 1 ? '' : 's'} missing a purpose.`);
      }
    }
  } catch (err) {
    output.dim(`  Scene purpose unavailable: ${(err as Error).message}`);
  }
  output.newline();
}

/** Sum of per-chapter metric warnings against the project's style targets. */
async function renderStyleTargets(
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  output.info('── Style Targets ───────────────────────');
  try {
    const reports = await new StyleTargetAnalyzer(projectPath).analyzeAll();
    if (reports.length === 0) {
      output.dim('  No chapter files to measure.');
      output.newline();
      return;
    }
    const totalWarnings = reports.reduce((s, r) => s + r.warnings, 0);
    const chaptersOver = reports.filter((r) => r.warnings > 0).length;
    if (totalWarnings === 0) {
      output.success(`  All ${reports.length} chapter${reports.length === 1 ? '' : 's'} within style targets.`);
    } else {
      output.warning(
        `  ${totalWarnings} metric${totalWarnings === 1 ? '' : 's'} outside target across ` +
        `${chaptersOver} of ${reports.length} chapter${reports.length === 1 ? '' : 's'}.`
      );
    }
  } catch (err) {
    output.dim(`  Style targets unavailable: ${(err as Error).message}`);
  }
  output.newline();
}

/** Total count of unresolved [TK] placeholder markers across all chapters. */
async function renderDraftMarkers(
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  output.info('── Draft Markers ───────────────────────');
  try {
    const marks = await new DraftScanner(projectPath).findPlaceholders();
    const tkCount = marks.filter((m) => m.marker === 'TK').length;
    if (tkCount === 0) {
      output.success('  No open [TK] markers.');
    } else {
      const files = new Set(marks.filter((m) => m.marker === 'TK').map((m) => m.chapterFilename)).size;
      output.warning(`  ${tkCount} [TK] marker${tkCount === 1 ? '' : 's'} across ${files} file${files === 1 ? '' : 's'}.`);
    }
  } catch (err) {
    output.dim(`  Draft markers unavailable: ${(err as Error).message}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SPARK_LEVELS = '▁▂▃▄▅▆▇█';

/**
 * Render a list of tension values (each on a 0–10 scale) as a compact
 * single-line sparkline. Values are clamped to [0, 10] and mapped onto the
 * eight block-height glyphs.
 */
function buildSparkline(values: number[]): string {
  if (values.length === 0) return '(no data)';
  return values
    .map((v) => {
      const clamped = Math.min(10, Math.max(0, v));
      const idx = Math.min(
        SPARK_LEVELS.length - 1,
        Math.round((clamped / 10) * (SPARK_LEVELS.length - 1))
      );
      return SPARK_LEVELS[idx];
    })
    .join('');
}
