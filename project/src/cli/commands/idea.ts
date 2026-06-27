/**
 * Idea CLI Command definition
 */

import type { Command } from '../types.js';
import { handleIdeaCommand } from '../handlers/idea-handler.js';

export const ideaCommand: Command = {
  name: 'idea',
  description: 'Capture and manage story ideas',
  aliases: ['ideas'],
  handler: async (args, context) => {
    await handleIdeaCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'add',
      description: 'Quick-capture a new idea',
      handler: async (args, context) => {
        await handleIdeaCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'list',
      description: 'List captured ideas, with optional tag/status filters',
      handler: async (args, context) => {
        await handleIdeaCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'show',
      description: 'Show full detail for an idea',
      handler: async (args, context) => {
        await handleIdeaCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'link',
      description: 'Link an idea to a story entity',
      handler: async (args, context) => {
        await handleIdeaCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'explore',
      description: 'Print a brainstorm prompt for Claude',
      handler: async (args, context) => {
        await handleIdeaCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'use',
      description: 'Mark an idea as used',
      handler: async (args, context) => {
        await handleIdeaCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'discard',
      description: 'Mark an idea as discarded',
      handler: async (args, context) => {
        await handleIdeaCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'sync',
      description: 'Sync all idea YAML files to the database',
      handler: async (args, context) => {
        await handleIdeaCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'tag',
      alias: 't',
      type: 'string',
      description: 'Tag to apply (add) or filter by (list)',
    },
    {
      name: 'status',
      alias: 's',
      type: 'string',
      description: 'Status filter: active | used | discarded',
    },
    {
      name: 'to',
      type: 'string',
      description: 'Entity type to link: character | plot | location | scene | world-rule',
    },
    {
      name: 'name',
      alias: 'n',
      type: 'string',
      description: 'Entity name for linking',
    },
    {
      name: 'prompt',
      alias: 'p',
      type: 'string',
      description: 'Brainstorm prompt text (used by explore subcommand)',
    },
    {
      name: 'key',
      alias: 'k',
      type: 'string',
      description: 'Idea key (alternative to positional argument)',
    },
    {
      name: 'content',
      alias: 'c',
      type: 'string',
      description: 'Idea content (alternative to positional argument for add)',
    },
  ],
  examples: [
    '/novel idea add "A wizard discovers a hidden library"',
    '/novel idea add "Dragon attack" --tag fantasy --tag action',
    '/novel idea list',
    '/novel idea list --status active --tag magic',
    '/novel idea show lm3kx9',
    '/novel idea link lm3kx9 --to character --name Mira',
    '/novel idea explore --prompt "How might Mira discover her power?"',
    '/novel idea use lm3kx9',
    '/novel idea discard lm3kx9',
    '/novel idea sync',
  ],
};
