/**
 * Export CLI Handlers
 */

import { join } from 'path';
import { existsSync } from 'fs';
import { NovelWriterExtension } from '../../index.js';
import type { ParsedArgs, OutputFormatter } from '../types.js';
import type { ManuscriptMetadata, AssembleOptions } from '../../builders/manuscript-assembler.js';
import type { ExportFormat } from '../../types/novel.js';

const VALID_FORMATS: ExportFormat[] = ['markdown', 'docx', 'epub', 'pdf'];

/** Extension map used when the user doesn't supply an explicit --output path. */
const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  markdown: 'md',
  docx: 'docx',
  epub: 'epub',
  pdf: 'pdf',
};

/**
 * Helper to load project metadata from database
 */
async function loadProjectMetadata(
  extension: NovelWriterExtension,
  projectPath: string
): Promise<Partial<ManuscriptMetadata>> {
  const mcpClient = (extension as any).mcpClient;

  try {
    // Try to get the most recent project (assumes single project per directory)
    const result = await mcpClient.readQuery(
      'SELECT title, author, genre FROM projects ORDER BY id DESC LIMIT 1',
      []
    );

    if (result && result.length > 0 && result[0]) {
      return {
        title: result[0].title || 'Untitled Novel',
        author: result[0].author || 'Unknown Author',
        genre: result[0].genre,
      };
    }
  } catch (error) {
    // Database not available, use defaults
    console.debug('Could not load project metadata from database:', error);
  }

  return {
    title: 'Untitled Novel',
    author: 'Unknown Author',
  };
}

export async function handleExportCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'manuscript':
      await handleExportManuscript(args, projectPath, output, injectedExtension);
      break;
    case 'stats':
      await handleExportStats(args, projectPath, output, injectedExtension);
      break;
    default:
      // Default to manuscript export
      await handleExportManuscript(args, projectPath, output, injectedExtension);
  }
}

async function handleExportManuscript(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const assembler = extension.getManuscriptAssembler();

    // Load project metadata from database
    const dbMetadata = await loadProjectMetadata(extension, projectPath);

    // Build metadata from flags (flags override database)
    const metadata: ManuscriptMetadata = {
      title: (args.flags['title'] as string) || dbMetadata.title || 'Untitled Novel',
      author: (args.flags['author'] as string) || dbMetadata.author || 'Unknown Author',
      genre: (args.flags['genre'] as string) || dbMetadata.genre,
      copyright: args.flags['copyright'] as string,
      dedication: args.flags['dedication'] as string,
      acknowledgments: args.flags['acknowledgments'] as string,
      about: args.flags['about'] as string,
    };

    // Parse filter options
    const filter: AssembleOptions['filter'] = {};

    if (args.flags['chapters']) {
      const chapterStr = args.flags['chapters'] as string;
      filter.chapters = chapterStr.split(',').map((n) => parseInt(n.trim(), 10));
    }

    if (args.flags['status']) {
      const statusStr = args.flags['status'] as string;
      filter.status = statusStr.split(',').map((s) => s.trim());
    }

    // Build assemble options
    const options = {
      includeMetadata: !args.flags['no-metadata'],
      includeFrontMatter: !args.flags['no-front-matter'],
      includeChapterNumbers: !args.flags['no-chapter-numbers'],
      sceneBreak: (args.flags['scene-break'] as string) || '\n\n* * *\n\n',
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    };

    // Resolve and validate format flag.
    const rawFormat = ((args.flags['format'] as string) || 'markdown').toLowerCase();
    if (!VALID_FORMATS.includes(rawFormat as ExportFormat)) {
      output.error(
        `Invalid format "${rawFormat}". Valid formats: ${VALID_FORMATS.join(', ')}`
      );
      return;
    }
    const format = rawFormat as ExportFormat;

    // Determine output path — use the correct extension when defaulting.
    const defaultFilename = `manuscript.${FORMAT_EXTENSIONS[format]}`;
    const outputPath =
      (args.flags['output'] as string) ||
      join(projectPath, 'export', defaultFilename);

    output.info(`Assembling manuscript...`);

    const withHeader = args.flags['with-header'] as boolean | undefined;

    if (format === 'markdown') {
      // Optionally prepend export header (PROC-09)
      if (withHeader) {
        const { mkdir, writeFile } = await import('fs/promises');
        const { dirname } = await import('path');

        // Generate the header and the manuscript body
        const header = await assembler.generateExportHeader(metadata, options.filter);
        const body = await assembler.assemble(metadata, options);
        const fullContent = `${header}\n\n---\n\n${body}`;

        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, fullContent, 'utf-8');
      } else {
        // Existing markdown path — unchanged behaviour.
        await assembler.exportToFile(outputPath, metadata, options);
      }
      output.success(`Manuscript exported: ${outputPath}`);
    } else {
      // Formatted export via pandoc.
      try {
        const result = await assembler.exportFormatted(
          projectPath,
          format,
          outputPath,
          metadata,
          options
        );
        output.success(`Manuscript exported (${result.format.toUpperCase()}): ${result.path}`);
        if (result.warning) {
          output.dim(`Warning: ${result.warning}`);
        }
      } catch (err) {
        output.error((err as Error).message);
        return;
      }
    }

    output.newline();

    // Show stats
    const stats = await assembler.getStats(options.filter);
    output.info(`Chapters: ${stats.totalChapters}`);
    output.info(`Total words: ${stats.totalWords.toLocaleString()}`);
    output.info(`Average chapter: ${stats.averageChapterLength.toLocaleString()} words`);
    output.newline();

    // Show conversion tip only when outputting markdown.
    if (format === 'markdown') {
      output.dim('Tip: Re-run with --format docx|epub|pdf to convert via pandoc.');
    }

  } catch (error) {
    output.error(`Failed to export manuscript: ${(error as Error).message}`);
  }
}

async function handleExportStats(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter,
  injectedExtension?: NovelWriterExtension
): Promise<void> {
  try {
    const extension = injectedExtension || new NovelWriterExtension(projectPath);
    const assembler = extension.getManuscriptAssembler();

    // Parse filter options
    const filter: AssembleOptions['filter'] = {};

    if (args.flags['chapters']) {
      const chapterStr = args.flags['chapters'] as string;
      filter.chapters = chapterStr.split(',').map((n) => parseInt(n.trim(), 10));
    }

    if (args.flags['status']) {
      const statusStr = args.flags['status'] as string;
      filter.status = statusStr.split(',').map((s) => s.trim());
    }

    const stats = await assembler.getStats(Object.keys(filter).length > 0 ? filter : undefined);

    output.success('Manuscript Statistics');
    output.newline();

    output.info(`Total Chapters: ${stats.totalChapters}`);
    output.info(`Total Words: ${stats.totalWords.toLocaleString()}`);
    output.info(`Total Characters: ${stats.totalCharacters.toLocaleString()}`);
    output.info(`Average Chapter Length: ${stats.averageChapterLength.toLocaleString()} words`);
    output.newline();

    output.info('Chapter Breakdown:');
    stats.chapters.forEach((chapter) => {
      output.dim(
        `  Ch ${chapter.number}: ${chapter.title} - ${chapter.wordCount.toLocaleString()} words`
      );
    });

  } catch (error) {
    output.error(`Failed to get statistics: ${(error as Error).message}`);
  }
}
