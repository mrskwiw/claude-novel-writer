/**
 * Location Commands
 * Commands for managing locations in the novel
 */

import type { Command } from '../types.js';
import { handleLocationCommand } from '../handlers/location-handler.js';

export const locationCommand: Command = {
  name: 'location',
  description: 'Manage locations in your novel',
  handler: async (args, context) => {
    await handleLocationCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'create',
      description: 'Create new location interactively',
      handler: async (args, context) => {
        await handleLocationCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'list',
      description: 'List all locations',
      handler: async (args, context) => {
        await handleLocationCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'show',
      description: 'Show location details',
      handler: async (args, context) => {
        await handleLocationCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'edit',
      description: 'Edit location metadata',
      handler: async (args, context) => {
        await handleLocationCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'delete',
      description: 'Delete location file',
      handler: async (args, context) => {
        await handleLocationCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'sync',
      description: 'Sync location to database',
      handler: async (args, context) => {
        await handleLocationCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'scenes',
      description: 'List scenes set in this location',
      handler: async (args, context) => {
        await handleLocationCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'name',
      alias: 'n',
      type: 'string',
      description: 'Location name',
    },
    {
      name: 'type',
      alias: 't',
      type: 'string',
      description: 'Location type',
      choices: ['world', 'region', 'city', 'building', 'room', 'vehicle', 'other'],
    },
    {
      name: 'description',
      alias: 'd',
      type: 'string',
      description: 'Location description',
    },
    {
      name: 'parent',
      alias: 'p',
      type: 'string',
      description: 'Parent location name (for hierarchical locations)',
    },
    {
      name: 'all',
      alias: 'a',
      type: 'boolean',
      description: 'Show all details',
    },
  ],
  examples: [
    '/novel location create --name "Ironhold" --type city --description "A fortress carved into a mountain"',
    '/novel location list',
    '/novel location show --name "Ironhold" --all',
    '/novel location edit --name "Ironhold" --parent "Northern Reach"',
    '/novel location scenes --name "Ironhold"',
    '/novel location sync --name "Ironhold"',
  ],
};
