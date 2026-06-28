/**
 * Theme Command Handlers
 *
 * Theme / motif tracking. Themes are stored as plain YAML files under
 * `<project>/themes/<slug>.yml` (mirroring how characters/plots are stored) —
 * no database schema is involved. The `trace` subcommand runs a deterministic
 * motif-density scan over the chapter Markdown files.
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import YAML from 'yaml';
import {
  ThemeAnalyzer,
  slugifyTheme,
  parseMotifs,
  renderSparkline,
  type ThemeYAML,
  type ThemeTrace,
} from '../../analysis/theme-analyzer.js';

// ─── Dispatcher ────────────────────────────────────────────────────────────────

export async function handleThemeCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'add':
      await handleThemeAdd(args, projectPath, output);
      break;
    case 'list':
      await handleThemeList(projectPath, output);
      break;
    case 'trace':
      await handleThemeTrace(args, projectPath, output);
      break;
    default:
      output.error('Unknown theme subcommand. Use: add, list, trace');
  }
}

// ─── add ────────────────────────────────────────────────────────────────────────

/** Register a new theme with its motif words/phrases. */
async function handleThemeAdd(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const name = args.flags.name as string | undefined;
    const motifsRaw = args.flags.motifs as string | undefined;
    const description = args.flags.description as string | undefined;

    if (!name || name.trim().length === 0) {
      output.error('Theme name required. Use --name "isolation"');
      return;
    }
    if (!motifsRaw || motifsRaw.trim().length === 0) {
      output.error('Motifs required. Use --motifs "cold,mirror,silence,locked"');
      return;
    }

    const motifs = parseMotifs(motifsRaw);
    if (motifs.length === 0) {
      output.error('No valid motifs found. Provide a comma-separated list.');
      return;
    }

    const slug = slugifyTheme(name);
    if (!slug) {
      output.error('Theme name must contain at least one alphanumeric character.');
      return;
    }

    const dirPath = join(projectPath, 'themes');
    await mkdir(dirPath, { recursive: true });
    const filePath = join(dirPath, `${slug}.yml`);

    if (existsSync(filePath)) {
      output.error(`Theme already exists: ${slug}.yml (edit the file to change it)`);
      return;
    }

    const themeData: ThemeYAML = {
      name: name.trim(),
      motifs,
      ...(description ? { description: description.trim() } : {}),
    };

    await writeFile(filePath, YAML.stringify(themeData), 'utf-8');

    output.success(`Theme registered: ${filePath}`);
    output.info(`Name: ${themeData.name}`);
    output.info(`Motifs (${motifs.length}): ${motifs.join(', ')}`);
    output.dim('Run `novel theme trace` to scan your chapters for this theme.');
  } catch (error) {
    output.error(`Failed to add theme: ${(error as Error).message}`);
  }
}

// ─── list ────────────────────────────────────────────────────────────────────────

/** List every registered theme and its motifs. */
async function handleThemeList(
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const analyzer = new ThemeAnalyzer(projectPath);
    const themes = await analyzer.loadThemes();

    if (themes.length === 0) {
      output.info('No themes registered');
      output.dim('Register your first theme with: novel theme add --name "isolation" --motifs "cold,mirror,silence"');
      return;
    }

    output.info('=== 🎭 Themes ===');
    output.newline();

    for (const theme of themes) {
      output.success(theme.name);
      output.dim(`  Motifs (${theme.motifs.length}): ${theme.motifs.join(', ') || '(none)'}`);
      if (theme.description) {
        output.dim(`  ${theme.description}`);
      }
      output.newline();
    }

    output.info(`Total: ${themes.length} theme${themes.length !== 1 ? 's' : ''}`);
  } catch (error) {
    output.error(`Failed to list themes: ${(error as Error).message}`);
  }
}

// ─── trace ────────────────────────────────────────────────────────────────────────

/** Run the deterministic motif-density scan across all chapters. */
async function handleThemeTrace(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const analyzer = new ThemeAnalyzer(projectPath);
    const themeFilter = args.flags.theme as string | undefined;

    const allThemes = await analyzer.loadThemes();
    if (allThemes.length === 0) {
      output.info('No themes registered');
      output.dim('Register a theme first with: novel theme add --name "isolation" --motifs "cold,mirror"');
      return;
    }

    const traces = await analyzer.trace(themeFilter);
    if (traces.length === 0) {
      output.error(`Theme not found: ${themeFilter}`);
      output.dim(`Known themes: ${allThemes.map((t) => t.name).join(', ')}`);
      return;
    }

    for (let i = 0; i < traces.length; i++) {
      renderTrace(traces[i], output);
      if (i < traces.length - 1) output.newline();
    }
  } catch (error) {
    output.error(`Failed to trace theme: ${(error as Error).message}`);
  }
}

/** Render one theme's per-chapter density table, sparkline, gaps and spikes. */
function renderTrace(trace: ThemeTrace, output: OutputFormatter): void {
  output.info(`=== 🎭 ${trace.theme.name} ===`);
  output.dim(`  Motifs: ${trace.theme.motifs.join(', ')}`);
  output.newline();

  if (trace.chapters.length === 0) {
    output.warning('No chapter files found in chapters/. Nothing to trace.');
    return;
  }

  // Density sparkline across chapters (in chapter order).
  const sparkline = renderSparkline(trace.chapters.map((c) => c.density));
  output.info(`Density: ${sparkline}`);
  output.newline();

  // Per-chapter table.
  output.success('Per-chapter motif density (hits per 1000 words):');
  for (const ch of trace.chapters) {
    const density = ch.density.toFixed(1).padStart(6);
    const bar = renderSparkline([ch.density, trace.maxDensity]).charAt(0);
    const flags: string[] = [];
    if (ch.isGap) flags.push('GAP');
    if (ch.isSpike) flags.push('SPIKE');
    const flagStr = flags.length > 0 ? `  [${flags.join(', ')}]` : '';
    output.info(`  ${bar} ${ch.chapter}  ${ch.hits} hits  density ${density}${flagStr}`);
  }
  output.newline();

  // Summary: gaps and spikes.
  if (trace.gaps.length > 0) {
    output.warning(`⚠️  Theme ABSENT in ${trace.gaps.length} chapter${trace.gaps.length !== 1 ? 's' : ''}: ${trace.gaps.join(', ')}`);
  } else {
    output.success('✅ Theme present in every chapter');
  }

  if (trace.spikes.length > 0) {
    output.info(`🔥 Spikes (>= ${2}× mean density): ${trace.spikes.join(', ')}`);
  }

  output.dim(`Total occurrences: ${trace.totalHits} | mean density: ${trace.meanDensity.toFixed(1)} | peak: ${trace.maxDensity.toFixed(1)}`);
}
