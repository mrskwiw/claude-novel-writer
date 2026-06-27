/**
 * Graph CLI Command definition
 */

import type { Command } from '../types.js';
import { handleGraphCommand } from '../handlers/graph-handler.js';

export const graphCommand: Command = {
  name: 'graph',
  description: 'Manage and query the narrative graph',
  handler: async (args, context) => {
    await handleGraphCommand(args, context.cwd, context.output, context.extension);
  },
  subcommands: [
    {
      name: 'rebuild',
      description: 'Rebuild the full narrative graph for the project',
      handler: async (args, context) => {
        await handleGraphCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'show',
      description: 'Show a node in the narrative graph',
      handler: async (args, context) => {
        await handleGraphCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'neighbors',
      description: 'List neighboring nodes for a given node',
      handler: async (args, context) => {
        await handleGraphCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'path',
      description: 'Find a path between two nodes in the graph',
      handler: async (args, context) => {
        await handleGraphCommand(args, context.cwd, context.output, context.extension);
      },
    },
  ],
  flags: [
    {
      name: 'from',
      alias: 'f',
      type: 'string',
      description: 'Source node ID (for path subcommand)',
    },
    {
      name: 'to',
      alias: 't',
      type: 'string',
      description: 'Target node ID (for path subcommand)',
    },
    {
      name: 'project',
      alias: 'p',
      type: 'string',
      description: 'Project ID (defaults to current project)',
    },
  ],
  examples: [
    '/novel graph rebuild',
    '/novel graph show node-character-mira-proj1',
    '/novel graph neighbors node-character-mira-proj1',
    '/novel graph path --from node-character-mira-proj1 --to node-scene-cave-proj1',
  ],
};
