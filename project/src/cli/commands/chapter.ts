/**
 * Chapter command definitions
 */

import type { Command } from '../types.js';
import { handleChapterCommand } from '../handlers/chapter-handler.js';

export const chapterCommand: Command = {
  name: 'chapter',
  description: 'Manage novel chapters',
  handler: async (args, context) => {
    await handleChapterCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'create',
      description: 'Create a new chapter',
      handler: async (args, context) => {
        await handleChapterCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'list',
      description: 'List all chapters',
      handler: async (args, context) => {
        await handleChapterCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'sync',
      description: 'Sync chapters to database',
      handler: async (args, context) => {
        await handleChapterCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'stats',
      description: 'Show chapter statistics',
      handler: async (args, context) => {
        await handleChapterCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'check',
      description: 'Run a quality checklist on a chapter',
      handler: async (args, context) => {
        await handleChapterCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'chapter',
          alias: 'c',
          type: 'number',
          description: 'Chapter number to check',
          required: true,
        },
      ],
    },
  ],
  flags: [
    {
      name: 'number',
      alias: 'n',
      type: 'number',
      description: 'Chapter number',
    },
    {
      name: 'title',
      alias: 't',
      type: 'string',
      description: 'Chapter title',
      required: false,
    },
    {
      name: 'template',
      type: 'string',
      description: 'Template to use (standard/action/dialogue/introspection/flashback)',
    },
    {
      name: 'interactive',
      alias: 'i',
      type: 'boolean',
      description: 'Interactive mode with prompts',
      default: false,
    },
    {
      name: 'status',
      alias: 's',
      type: 'string',
      description: 'Chapter status',
      choices: ['planned', 'drafted', 'revised', 'polished', 'final'],
    },
    {
      name: 'pov',
      type: 'string',
      description: 'POV character name',
    },
  ],
  examples: [
    '/novel chapter create --title "The Beginning" --interactive',
    '/novel chapter create --number 5 --title "The Revelation" --template action',
    '/novel chapter list',
    '/novel chapter sync',
    '/novel chapter stats',
  ],
};
