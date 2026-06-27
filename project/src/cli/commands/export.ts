/**
 * Export CLI Commands
 */

import type { Command } from '../types.js';
import { handleExportCommand } from '../handlers/export-handler.js';

export const exportCommand: Command = {
  name: 'export',
  description: 'Export manuscript in various formats',
  handler: async (args, context) => {
    await handleExportCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'manuscript',
      aliases: ['markdown', 'md', 'docx', 'epub', 'pdf'],
      description: 'Export complete manuscript',
      handler: async (args, context) => {
        await handleExportCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'stats',
      description: 'Show manuscript statistics',
      handler: async (args, context) => {
        await handleExportCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'format',
      alias: 'f',
      type: 'string',
      description: 'Export format',
      choices: ['markdown', 'docx', 'epub', 'pdf'],
      default: 'markdown',
    },
    {
      name: 'output',
      alias: 'o',
      type: 'string',
      description: 'Output file path',
    },
    {
      name: 'title',
      alias: 't',
      type: 'string',
      description: 'Manuscript title',
    },
    {
      name: 'author',
      alias: 'a',
      type: 'string',
      description: 'Author name',
    },
    {
      name: 'genre',
      alias: 'g',
      type: 'string',
      description: 'Genre/category',
    },
    {
      name: 'copyright',
      type: 'string',
      description: 'Copyright notice',
    },
    {
      name: 'dedication',
      type: 'string',
      description: 'Dedication text',
    },
    {
      name: 'acknowledgments',
      type: 'string',
      description: 'Acknowledgments text',
    },
    {
      name: 'about',
      type: 'string',
      description: 'About the author',
    },
    {
      name: 'chapters',
      type: 'string',
      description: 'Specific chapters to include (comma-separated numbers)',
    },
    {
      name: 'status',
      type: 'string',
      description: 'Only include chapters with this status (drafted, revised, final)',
    },
    {
      name: 'no-metadata',
      type: 'boolean',
      description: 'Exclude title page and metadata',
    },
    {
      name: 'no-front-matter',
      type: 'boolean',
      description: 'Exclude dedication and acknowledgments',
    },
    {
      name: 'no-chapter-numbers',
      type: 'boolean',
      description: 'Exclude chapter numbers from headings',
    },
    {
      name: 'scene-break',
      type: 'string',
      description: 'Custom scene break marker (default: * * *)',
    },
    {
      name: 'with-header',
      type: 'boolean',
      description: 'Prepend an export header (title, word count, TOC) to the manuscript (PROC-09)',
    },
  ],
  examples: [
    '/novel export manuscript',
    '/novel export manuscript --format epub --output export/book.epub',
    '/novel export manuscript --title "My Novel" --author "Jane Doe" --genre Fantasy',
    '/novel export manuscript --chapters 1,2,3 --status final',
    '/novel export manuscript --no-metadata --no-chapter-numbers',
    '/novel export stats',
  ],
};
