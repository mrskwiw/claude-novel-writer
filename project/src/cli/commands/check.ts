/**
 * Check Commands
 * Commands for consistency checking
 */

import type { Command } from '../types.js';
import { handleCheckCommand } from '../handlers/check-handler.js';

export const checkCommand: Command = {
  name: 'check',
  description: 'Run consistency checks on manuscript',
  handler: async (args, context) => {
    await handleCheckCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'consistency',
      description: 'Run all consistency checks',
      handler: async (args, context) => {
        await handleCheckCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'characters',
      description: 'Check character attribute consistency',
      handler: async (args, context) => {
        await handleCheckCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'timeline',
      description: 'Check timeline consistency',
      handler: async (args, context) => {
        await handleCheckCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'world-rules',
      description: 'Check world rule documentation',
      handler: async (args, context) => {
        await handleCheckCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'plot-threads',
      description: 'Check for unresolved plot threads',
      handler: async (args, context) => {
        await handleCheckCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'list',
      description: 'List existing consistency issues',
      handler: async (args, context) => {
        await handleCheckCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'resolve',
      description: 'Mark consistency issue as resolved',
      handler: async (args, context) => {
        await handleCheckCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'acknowledge',
      description: 'Acknowledge issue (intentional inconsistency)',
      handler: async (args, context) => {
        await handleCheckCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'false-positive',
      description: 'Mark issue as false positive',
      handler: async (args, context) => {
        await handleCheckCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'severity',
      alias: 's',
      type: 'string',
      description: 'Filter by severity (error, warning, info)',
      choices: ['error', 'warning', 'info'],
    },
    {
      name: 'id',
      alias: 'i',
      type: 'number',
      description: 'Issue ID for resolve/acknowledge/false-positive',
    },
    {
      name: 'notes',
      alias: 'n',
      type: 'string',
      description: 'Resolution notes',
    },
    {
      name: 'verbose',
      alias: 'v',
      type: 'boolean',
      description: 'Show detailed information',
    },
  ],
  examples: [
    '/novel check',
    '/novel check consistency',
    '/novel check characters',
    '/novel check list --severity error',
    '/novel check resolve --id 12 --notes "fixed in chapter 4"',
    '/novel check false-positive --id 7',
  ],
};
