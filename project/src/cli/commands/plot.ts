/**
 * Plot Thread CLI Commands
 */

import type { Command } from '../types.js';
import { handlePlotCommand } from '../handlers/plot-handler.js';

export const plotCommand: Command = {
  name: 'plot',
  description: 'Manage plot threads and story arcs',
  handler: async (args, context) => {
    await handlePlotCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'create',
      description: 'Create new plot thread',
      handler: async (args, context) => {
        await handlePlotCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'list',
      description: 'List plot threads',
      handler: async (args, context) => {
        await handlePlotCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'show',
      description: 'Show plot thread details',
      handler: async (args, context) => {
        await handlePlotCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'beat',
      description: 'Add or manage plot beats',
      handler: async (args, context) => {
        await handlePlotCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'resolve',
      description: 'Mark plot thread as resolved',
      handler: async (args, context) => {
        await handlePlotCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'sync',
      description: 'Sync plot threads to database',
      handler: async (args, context) => {
        await handlePlotCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'check',
      description: 'Check for unresolved plot threads',
      handler: async (args, context) => {
        await handlePlotCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'stats',
      description: 'Show plot thread statistics',
      handler: async (args, context) => {
        await handlePlotCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'name',
      alias: 'n',
      type: 'string',
      description: 'Plot thread name',
    },
    {
      name: 'type',
      alias: 't',
      type: 'string',
      description: 'Thread type',
      choices: ['main', 'subplot', 'character', 'theme'],
    },
    {
      name: 'description',
      alias: 'd',
      type: 'string',
      description: 'Plot thread description',
    },
    {
      name: 'priority',
      alias: 'p',
      type: 'number',
      description: 'Priority (1-10)',
    },
    {
      name: 'status',
      alias: 's',
      type: 'string',
      description: 'Thread status',
      choices: ['planned', 'active', 'resolved', 'abandoned'],
    },
    {
      name: 'scene',
      type: 'string',
      description: 'Scene reference for beat',
    },
    {
      name: 'beat-type',
      type: 'string',
      description: 'Beat type',
      choices: ['setup', 'development', 'climax', 'resolution'],
    },
    {
      name: 'beat-description',
      type: 'string',
      description: 'Beat description',
    },
    {
      name: 'all',
      alias: 'a',
      type: 'boolean',
      description: 'Show all details',
    },
    {
      name: 'unresolved',
      alias: 'u',
      type: 'boolean',
      description: 'Show only unresolved threads',
    },
  ],
  examples: [
    '/novel plot create --name "The Missing Heir" --type main --priority 9',
    '/novel plot list --unresolved',
    '/novel plot show --name "The Missing Heir" --all',
    '/novel plot beat --name "The Missing Heir" --beat-type setup --beat-description "Letter arrives" --scene 3',
    '/novel plot resolve --name "The Missing Heir"',
    '/novel plot check',
  ],
};
