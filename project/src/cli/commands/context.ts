/**
 * Context CLI Command definition
 */

import type { Command } from '../types.js';
import { handleContextCommand } from '../handlers/context-handler.js';

export const contextCommand: Command = {
  name: 'context',
  description: 'Manage context contracts and build context for AI operations',
  handler: async (args, context) => {
    await handleContextCommand(args, context.cwd, context.output, context.extension);
  },
  subcommands: [
    {
      name: 'contracts',
      description: 'List all available context contracts',
      handler: async (args, context) => {
        await handleContextCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'show-contract',
      description: 'Show detail for a context contract',
      handler: async (args, context) => {
        await handleContextCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'build',
      description: 'Build context using a named contract',
      handler: async (args, context) => {
        await handleContextCommand(args, context.cwd, context.output, context.extension);
      },
    },
  ],
  flags: [
    {
      name: 'contract',
      alias: 'c',
      type: 'string',
      description: 'Contract ID for show-contract or build',
    },
    {
      name: 'scene',
      alias: 's',
      type: 'string',
      description: 'Current scene ID for context build',
    },
    {
      name: 'chapter',
      alias: 'C',
      type: 'string',
      description: 'Current chapter ID for context build',
    },
    {
      name: 'task',
      alias: 't',
      type: 'string',
      description: 'User task description for context build',
    },
    {
      name: 'project',
      alias: 'p',
      type: 'string',
      description: 'Project ID (defaults to current project)',
    },
  ],
  examples: [
    '/novel context contracts',
    '/novel context show-contract scene_continuation',
    '/novel context build --contract scene_continuation --scene 42',
    '/novel context build --contract continuity_check --chapter 5 --task "Check for contradictions"',
  ],
};
