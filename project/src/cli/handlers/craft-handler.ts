/**
 * Craft Command Handlers — CRAFT-01 Opening Line Workshop
 *
 * Contains handler functions for craft-focused generate subcommands.
 * Import individual handlers from here; avoid modifying generate-handler.ts
 * beyond the single import line.
 */

import { NovelWriterExtension } from '../../index.js';
import { GenerationManager } from '../../ai/generation-manager.js';
import type { ParsedArgs, OutputFormatter } from '../types.js';

/**
 * Handle `generate opening-lines [--count N]`
 *
 * Workshops N opening line options for the novel.
 * Default 5, max 10.
 *
 * @param args        - Parsed CLI arguments
 * @param projectPath - Path to the novel project root
 * @param output      - Output formatter
 * @param injectedExtension - Optional pre-built extension (for testing)
 */
export async function handleGenerateOpeningLines(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const rawCount = args.flags['count'] as number | undefined;
    const count = rawCount !== undefined ? Math.min(Math.max(rawCount, 1), 10) : 5;

    const extension = injectedExtension ?? new NovelWriterExtension(projectPath);
    const mcpClient = (extension as any).mcpClient;
    const projectId = (extension as any).projectId ?? 1;

    const generator = new GenerationManager(mcpClient, projectId);

    output.info(`Workshopping ${count} opening line${count === 1 ? '' : 's'}...`);
    output.newline();

    const result = await generator.workshopOpeningLines(String(projectId), count);

    output.success('Opening Line Options:');
    output.newline();
    output.dim(result.content);
    output.newline();

    if (result.reasoning) {
      output.dim(`Tip: ${result.reasoning}`);
    }
  } catch (error) {
    output.error(`Failed to workshop opening lines: ${(error as Error).message}`);
  }
}
