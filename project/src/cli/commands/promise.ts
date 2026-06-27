/**
 * Promise CLI Command definition
 */

import type { Command } from '../types.js';
import { handlePromiseCommand } from '../handlers/promise-handler.js';

export const promiseCommand: Command = {
  name: 'promise',
  description: 'Manage narrative promises and their payoffs',
  handler: async (args, context) => {
    await handlePromiseCommand(args, context.cwd, context.output, context.extension);
  },
  subcommands: [
    {
      name: 'create',
      description: 'Create a new narrative promise',
      handler: async (args, context) => {
        await handlePromiseCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'list',
      description: 'List open narrative promises',
      handler: async (args, context) => {
        await handlePromiseCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'show',
      description: 'Show detail for a narrative promise',
      handler: async (args, context) => {
        await handlePromiseCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'payoff',
      description: 'Record a payoff for a narrative promise',
      handler: async (args, context) => {
        await handlePromiseCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'health',
      description: 'Report health of all promises in the project',
      handler: async (args, context) => {
        await handlePromiseCommand(args, context.cwd, context.output, context.extension);
      },
    },
  ],
  flags: [
    {
      name: 'title',
      alias: 'T',
      type: 'string',
      description: 'Promise title',
    },
    {
      name: 'type',
      alias: 't',
      type: 'string',
      description: 'Promise type: mystery | foreshadowing | chekhov_gun | relationship_tension | character_arc | worldbuilding_question | plot_question | thematic_question',
    },
    {
      name: 'description',
      alias: 'd',
      type: 'string',
      description: 'Description of the promise',
    },
    {
      name: 'importance',
      alias: 'i',
      type: 'number',
      description: 'Importance score 1-10',
    },
    {
      name: 'strength',
      alias: 's',
      type: 'number',
      description: 'Payoff strength 1-10 (for payoff subcommand)',
    },
    {
      name: 'resolves',
      alias: 'r',
      type: 'boolean',
      description: 'Whether this payoff resolves the promise (for payoff subcommand)',
    },
    {
      name: 'project',
      alias: 'p',
      type: 'string',
      description: 'Project ID (defaults to current project)',
    },
  ],
  examples: [
    '/novel promise create --type mystery --title "Who killed the king?" --description "Introduced in ch 1" --importance 9',
    '/novel promise list',
    '/novel promise show <id>',
    '/novel promise payoff <id> --description "The killer revealed" --strength 8 --resolves',
    '/novel promise health',
  ],
};
