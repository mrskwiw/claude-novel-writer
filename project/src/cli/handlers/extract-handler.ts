/**
 * Extract Command Handler — "discovery writer" support
 *
 * Resolves a chapter file (by numeric prefix, mirroring analyze-handler's
 * `resolveChapterFile`), runs the deterministic `EntityExtractor`, and prints
 * the proposed NEW characters / locations together with the ready-to-run
 * `create` command for each. Read-only — it never creates anything.
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import { join } from 'path';
import { readdirSync } from 'fs';
import {
  EntityExtractor,
  type ExtractionResult,
  type EntityCandidate,
} from '../../analysis/entity-extractor.js';

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function handleExtractCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extractor = new EntityExtractor(projectPath);

    // --file: scan an arbitrary prose file (e.g. a freeform outline) to
    // bootstrap structured entities before chapters exist.
    const fileArg = args.flags['file'] as string | undefined;
    if (fileArg) {
      let result: ExtractionResult;
      try {
        result = await extractor.extractFromFile(fileArg);
      } catch {
        output.error(`Could not read file: ${fileArg}`);
        return;
      }
      renderResult(basename(fileArg), result, output);
      return;
    }

    if (args.flags['all']) {
      const files = listChapterFiles(projectPath, output);
      if (files === undefined) return;
      if (files.length === 0) {
        output.info('No chapter files found in chapters/.');
        return;
      }
      for (const file of files) {
        const result = await extractor.extractFromChapter(join(projectPath, 'chapters', file));
        renderResult(file, result, output);
        output.newline();
      }
      return;
    }

    const filePath = resolveChapterFile(args, projectPath, output);
    if (!filePath) return;

    const result = await extractor.extractFromChapter(filePath);
    renderResult(basename(filePath), result, output);
  } catch (err) {
    output.error(`Entity extraction failed: ${(err as Error).message}`);
  }
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/** Print the proposed entities and the create command for each. */
function renderResult(
  label: string,
  result: ExtractionResult,
  output: OutputFormatter
): void {
  output.heading(`Extract — ${label}`);
  output.newline();

  if (result.characters.length === 0 && result.locations.length === 0) {
    output.success('No new characters or locations detected. Everything is already tracked.');
    return;
  }

  renderSection('New Characters', 'character', result.characters, output);
  if (result.characters.length > 0 && result.locations.length > 0) output.newline();
  renderSection('New Locations', 'location', result.locations, output);

  output.newline();
  output.dim('These are suggestions from the prose — run a create command above to confirm any you want to keep.');
}

/** Print one entity group with its mention count and ready-to-run command. */
function renderSection(
  title: string,
  kind: 'character' | 'location',
  candidates: EntityCandidate[],
  output: OutputFormatter
): void {
  if (candidates.length === 0) return;

  output.info(`── ${title} (${candidates.length}) ─────────────────────────`);
  for (const c of candidates) {
    const plural = c.mentions === 1 ? 'mention' : 'mentions';
    output.info(`  ${c.name}  (${c.mentions} ${plural})`);
    output.dim(`    novel create ${kind} --name "${c.name}"`);
  }
}

// ─── Chapter resolution ──────────────────────────────────────────────────────

/** List all `.md` chapter files, or undefined when chapters/ is missing. */
function listChapterFiles(
  projectPath: string,
  output: OutputFormatter
): string[] | undefined {
  const chaptersDir = join(projectPath, 'chapters');
  try {
    return readdirSync(chaptersDir)
      .filter((f) => f.endsWith('.md'))
      .sort();
  } catch {
    output.error(`chapters/ directory not found at ${chaptersDir}`);
    return undefined;
  }
}

/**
 * Resolve a chapter file path from the `--chapter N` flag.
 * Mirrors `resolveChapterFile` in analyze-handler.ts.
 */
function resolveChapterFile(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): string | undefined {
  const chapterNum = args.flags['chapter'] as number | undefined;
  if (chapterNum === undefined) {
    output.error('Specify --chapter N to pick a chapter, or --all to scan every chapter.');
    return undefined;
  }

  const chaptersDir = join(projectPath, 'chapters');
  let entries: string[];
  try {
    entries = readdirSync(chaptersDir).filter((f) => f.endsWith('.md'));
  } catch {
    output.error(`chapters/ directory not found at ${chaptersDir}`);
    return undefined;
  }

  const padded = String(chapterNum).padStart(2, '0');
  const match = entries.find(
    (f) => f.startsWith(padded) || f.includes(`-${padded}`) || f.includes(`-${chapterNum}`)
  );

  if (!match) {
    output.error(`No chapter file found for chapter ${chapterNum} in ${chaptersDir}`);
    return undefined;
  }

  return join(chaptersDir, match);
}

/** Cross-platform basename for display. */
function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}
