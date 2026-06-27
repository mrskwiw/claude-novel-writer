/**
 * Draft CLI Command definition — SPEC-06 Drafting Support Tools
 */

import type { Command } from '../types.js';
import { handleDraftCommand } from '../handlers/draft-handler.js';

export const draftCommand: Command = {
  name: 'draft',
  description: 'Drafting support tools',
  subcommands: [
    {
      name: 'tk-list',
      aliases: ['scan', 'markers', 'todo'],
      description: 'List all placeholder markers (TK, TODO, FIXME, CHECK) in chapter files',
      handler: async (args, context) => {
        await handleDraftCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'chapter-check',
      aliases: ['check', 'readaloud', 'read-aloud'],
      description: 'Run a structural checklist on a chapter',
      handler: async (args, context) => {
        await handleDraftCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'chapter',
      alias: 'c',
      type: 'number',
      description: 'Filter to a specific chapter number',
    },
  ],
  examples: [
    '/novel draft tk-list',
    '/novel draft tk-list --chapter 3',
    '/novel draft chapter-check 5',
  ],
  handler: async (args, context) => {
    await handleDraftCommand(args, context.cwd, context.output);
  },
};
