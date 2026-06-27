/**
 * Canon CLI Command definition
 */

import type { Command } from '../types.js';
import { handleCanonCommand } from '../handlers/canon-handler.js';

export const canonCommand: Command = {
  name: 'canon',
  description: 'Manage canonical story facts, rules, situations, and assertions',
  handler: async (args, context) => {
    await handleCanonCommand(args, context.cwd, context.output, context.extension);
  },
  subcommands: [
    {
      name: 'create',
      description: 'Create a new canon item (fact, rule, situation, or assertion)',
      handler: async (args, context) => {
        await handleCanonCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'list',
      description: 'List all active canon items',
      handler: async (args, context) => {
        await handleCanonCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'show',
      description: 'Show detail for a canon item',
      arguments: [
        {
          name: 'id',
          description: 'ID of the canon item to display',
          type: 'string',
          required: true,
        },
      ],
      handler: async (args, context) => {
        await handleCanonCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'conflicts',
      description: 'List open canon conflicts',
      handler: async (args, context) => {
        await handleCanonCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'promote',
      description: 'Promote an assertion to a hard fact',
      arguments: [
        {
          name: 'id',
          description: 'ID of the assertion to promote',
          type: 'string',
          required: true,
        },
      ],
      handler: async (args, context) => {
        await handleCanonCommand(args, context.cwd, context.output, context.extension);
      },
    },
  ],
  flags: [
    {
      name: 'type',
      alias: 't',
      type: 'string',
      description: 'Canon item type',
      choices: ['fact', 'rule', 'situation', 'assertion'],
    },
    {
      name: 'subject',
      type: 'string',
      description: 'Subject of the canon statement',
    },
    {
      name: 'predicate',
      type: 'string',
      description: 'Predicate of the canon statement',
    },
    {
      name: 'object',
      alias: 'o',
      type: 'string',
      description: 'Object of the canon statement',
    },
    {
      name: 'description',
      alias: 'd',
      type: 'string',
      description: 'Human-readable description',
    },
    {
      name: 'project',
      alias: 'p',
      type: 'string',
      description: 'Project ID (defaults to current project)',
    },
  ],
  examples: [
    '/novel canon create --type fact --subject Mira --predicate "has eyes of" --object green --description "Established in chapter 1"',
    '/novel canon create --type rule --subject magic --predicate "requires" --description "A verbal incantation"',
    '/novel canon list',
    '/novel canon show <id>',
    '/novel canon conflicts',
    '/novel canon promote <id>',
  ],
};
