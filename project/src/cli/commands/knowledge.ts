/**
 * Knowledge CLI Command definition
 */

import type { Command } from '../types.js';
import { handleKnowledgeCommand } from '../handlers/knowledge-handler.js';

export const knowledgeCommand: Command = {
  name: 'knowledge',
  description: 'Manage knowledge objects',
  handler: async (args, context) => {
    await handleKnowledgeCommand(args, context.cwd, context.output, context.extension);
  },
  subcommands: [
    {
      name: 'list',
      description: 'List knowledge objects by type or status',
      handler: async (args, context) => {
        await handleKnowledgeCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'show',
      description: 'Show full detail for a knowledge object',
      handler: async (args, context) => {
        await handleKnowledgeCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'search',
      description: 'Search knowledge objects by query text',
      handler: async (args, context) => {
        await handleKnowledgeCommand(args, context.cwd, context.output, context.extension);
      },
    },
  ],
  flags: [
    {
      name: 'type',
      alias: 't',
      type: 'string',
      description: 'Knowledge object type filter',
    },
    {
      name: 'status',
      alias: 's',
      type: 'string',
      description: 'Status filter: active | draft | deprecated | archived',
    },
    {
      name: 'query',
      alias: 'q',
      type: 'string',
      description: 'Search query text',
    },
    {
      name: 'project',
      alias: 'p',
      type: 'string',
      description: 'Project ID (defaults to current project)',
    },
  ],
  examples: [
    '/novel knowledge list',
    '/novel knowledge list --type character_profile',
    '/novel knowledge list --status active',
    '/novel knowledge show <id>',
    '/novel knowledge search "dragon"',
  ],
};
