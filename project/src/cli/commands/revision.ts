/**
 * Revision CLI Command definition
 * Snapshot and restore draft versions of the manuscript.
 */

import type { Command } from '../types.js';
import { handleRevisionCommand } from '../handlers/revision-handler.js';

export const revisionCommand: Command = {
  name: 'revision',
  description: 'Snapshot and restore draft versions',
  aliases: ['rev'],
  handler: async (args, context) => {
    await handleRevisionCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'snapshot',
      description: 'Create a new draft snapshot',
      handler: async (args, context) => {
        await handleRevisionCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'list',
      description: 'List all snapshots (newest first)',
      handler: async (args, context) => {
        await handleRevisionCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'show',
      description: 'Show metadata for a named snapshot',
      handler: async (args, context) => {
        await handleRevisionCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'diff',
      description: 'Show line diff between two snapshots for a chapter file',
      handler: async (args, context) => {
        await handleRevisionCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'restore',
      description: 'Restore chapters/ from a named snapshot',
      handler: async (args, context) => {
        await handleRevisionCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'auto-snapshot',
      description: 'Display information about the auto-snapshot feature',
      handler: async (args, context) => {
        await handleRevisionCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'chapter',
      alias: 'c',
      type: 'string',
      description: 'Chapter filename for diff (e.g. chapter-01.md)',
    },
  ],
  examples: [
    '/novel revision snapshot "before-act-2"',
    '/novel revision snapshot',
    '/novel revision list',
    '/novel revision show "before-act-2"',
    '/novel revision diff "before-act-2" "after-revision" --chapter chapter-01.md',
    '/novel revision restore "before-act-2"',
  ],
};
