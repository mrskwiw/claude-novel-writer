/**
 * World Rule CLI Commands
 */

import type { Command } from '../types.js';
import { handleWorldRuleCommand } from '../handlers/world-rule-handler.js';

export const worldRuleCommand: Command = {
  name: 'world-rule',
  description: 'Manage world rules and consistency constraints',
  handler: async (args, context) => {
    await handleWorldRuleCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'create',
      description: 'Create new world rule',
      handler: async (args, context) => {
        await handleWorldRuleCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'list',
      description: 'List world rules',
      handler: async (args, context) => {
        await handleWorldRuleCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'show',
      description: 'Show world rule details',
      handler: async (args, context) => {
        await handleWorldRuleCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'add-example',
      description: 'Add example to world rule',
      handler: async (args, context) => {
        await handleWorldRuleCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'add-exception',
      description: 'Add exception to world rule',
      handler: async (args, context) => {
        await handleWorldRuleCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'limitations',
      description: 'Update rule limitations',
      handler: async (args, context) => {
        await handleWorldRuleCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'established',
      description: 'Mark where rule was established',
      handler: async (args, context) => {
        await handleWorldRuleCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'toggle-hard',
      description: 'Toggle hard rule status',
      handler: async (args, context) => {
        await handleWorldRuleCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'sync',
      description: 'Sync world rules to database',
      handler: async (args, context) => {
        await handleWorldRuleCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'stats',
      description: 'Show world rule statistics',
      handler: async (args, context) => {
        await handleWorldRuleCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'search',
      description: 'Search world rules',
      handler: async (args, context) => {
        await handleWorldRuleCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'name',
      alias: 'n',
      type: 'string',
      description: 'World rule name',
    },
    {
      name: 'category',
      alias: 'c',
      type: 'string',
      description: 'Rule category',
      choices: ['magic', 'technology', 'physics', 'social', 'political'],
    },
    {
      name: 'description',
      alias: 'd',
      type: 'string',
      description: 'Rule description',
    },
    {
      name: 'limitations',
      alias: 'l',
      type: 'string',
      description: 'Rule limitations',
    },
    {
      name: 'hard-rule',
      type: 'boolean',
      description: 'Whether rule must never be violated',
    },
    {
      name: 'example',
      type: 'string',
      description: 'Example of rule application',
    },
    {
      name: 'exception',
      type: 'string',
      description: 'Exception to the rule',
    },
    {
      name: 'chapter',
      type: 'number',
      description: 'Chapter where rule was established',
    },
    {
      name: 'scene',
      type: 'string',
      description: 'Scene where rule was established',
    },
    {
      name: 'quote',
      type: 'string',
      description: 'Quote establishing the rule',
    },
    {
      name: 'all',
      alias: 'a',
      type: 'boolean',
      description: 'Show all details',
    },
    {
      name: 'keyword',
      alias: 'k',
      type: 'string',
      description: 'Search keyword',
    },
  ],
  examples: [
    '/novel world-rule create --name "Blood Magic" --category magic --description "Costs the caster vitality"',
    '/novel world-rule list',
    '/novel world-rule show --name "Blood Magic" --all',
    '/novel world-rule add-example --name "Blood Magic" --example "Healing a wound ages the healer"',
    '/novel world-rule toggle-hard --name "Blood Magic"',
    '/novel world-rule search --keyword magic',
  ],
};
