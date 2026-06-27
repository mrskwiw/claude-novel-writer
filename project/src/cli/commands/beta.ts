/**
 * Beta Reader CLI Command definition — SPEC-11
 *
 * Subcommands: add, list, feedback, report, resolve
 */

import type { Command } from '../types.js';
import { handleBetaCommand } from '../handlers/beta-handler.js';

export const betaCommand: Command = {
  name: 'beta',
  description: 'Manage beta readers and their feedback',
  aliases: ['br'],
  handler: async (args, context) => {
    await handleBetaCommand(args, context.cwd, context.output, context.extension);
  },
  subcommands: [
    {
      name: 'add',
      description: 'Add a new beta reader',
      handler: async (args, context) => {
        await handleBetaCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'list',
      description: 'List all beta readers with feedback counts',
      handler: async (args, context) => {
        await handleBetaCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'feedback',
      description: 'Record feedback from a beta reader',
      handler: async (args, context) => {
        await handleBetaCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'report',
      description: 'Show aggregated feedback report by chapter and type',
      handler: async (args, context) => {
        await handleBetaCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'resolve',
      description: 'Mark a feedback item as resolved',
      handler: async (args, context) => {
        await handleBetaCommand(args, context.cwd, context.output, context.extension);
      },
    },
  ],
  flags: [
    {
      name: 'name',
      alias: 'n',
      type: 'string',
      description: 'Reader name (add, feedback)',
    },
    {
      name: 'email',
      alias: 'e',
      type: 'string',
      description: 'Reader email address (add)',
    },
    {
      name: 'chapters',
      type: 'string',
      description: 'Chapter range assignment, e.g. "1-10" (add)',
    },
    {
      name: 'reader',
      alias: 'r',
      type: 'string',
      description: 'Reader name to attribute feedback to (feedback)',
    },
    {
      name: 'chapter',
      alias: 'c',
      type: 'number',
      description: 'Chapter number the feedback refers to (feedback)',
    },
    {
      name: 'type',
      alias: 't',
      type: 'string',
      description: 'Feedback type (feedback)',
      choices: ['pacing', 'character', 'plot', 'clarity', 'emotion', 'other'],
    },
    {
      name: 'note',
      type: 'string',
      description: 'Feedback note text (feedback)',
    },
    {
      name: 'id',
      type: 'string',
      description: 'Feedback item id to resolve (resolve)',
    },
    {
      name: 'status',
      alias: 's',
      type: 'string',
      description: 'Update reader status: active | completed | dropped',
    },
  ],
  examples: [
    '/novel beta add --name "Alex" --email "alex@example.com" --chapters "1-10"',
    '/novel beta list',
    '/novel beta feedback --reader "Alex" --chapter 3 --type pacing --note "Chapter drags in the middle"',
    '/novel beta report',
    '/novel beta resolve --id <feedback-id>',
  ],
};
