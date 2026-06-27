/**
 * Foreshadow CLI Commands — PROC-03
 *
 * Standalone `foreshadow` command for tagging planted setup elements and
 * tracking their payoff. Sourced from WRITING_PROCESS.md.
 */

import type { Command } from '../types.js';
import { handleForeshadowCommand } from '../handlers/foreshadow-handler.js';

export const foreshadowCommand: Command = {
  name: 'foreshadow',
  description: 'Track planted foreshadowing and payoff moments',
  handler: async (args, context) => {
    await handleForeshadowCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'add',
      description: 'Add a foreshadowing note',
      handler: async (args, context) => {
        await handleForeshadowCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'content',
          alias: 'c',
          type: 'string',
          description: 'Description of the foreshadowed element',
        },
        {
          name: 'chapter',
          type: 'number',
          description: 'Chapter number where the foreshadowing is planted',
        },
        {
          name: 'scene',
          type: 'number',
          description: 'Scene ID where the foreshadowing appears',
        },
      ],
    },
    {
      name: 'list',
      description: 'List foreshadowing notes',
      handler: async (args, context) => {
        await handleForeshadowCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'status',
          alias: 's',
          type: 'string',
          description: 'Filter by status',
          choices: ['planted', 'paid_off', 'forgotten'],
        },
      ],
    },
    {
      name: 'payoff',
      description: 'Mark a foreshadowing note as paid off',
      handler: async (args, context) => {
        await handleForeshadowCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'id',
          type: 'string',
          description: 'ID of the foreshadowing note',
        },
        {
          name: 'chapter',
          type: 'number',
          description: 'Chapter number where the payoff occurs',
        },
      ],
    },
  ],
  flags: [],
  examples: [
    '/novel foreshadow add --content "Rusty key in the drawer" --chapter 2',
    '/novel foreshadow add --content "Strange scar on her wrist" --scene 14',
    '/novel foreshadow list',
    '/novel foreshadow list --status planted',
    '/novel foreshadow payoff --id 3 --chapter 18',
  ],
};
