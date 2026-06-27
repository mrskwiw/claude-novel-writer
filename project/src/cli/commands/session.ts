/**
 * Session Commands
 * Commands for tracking writing sessions and progress
 */

import type { Command } from '../types.js';
import { handleSessionCommand } from '../handlers/session-handler.js';

export const sessionCommand: Command = {
  name: 'session',
  description: 'Manage writing sessions',
  handler: async (args, context) => {
    await handleSessionCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'start',
      description: 'Start a new writing session',
      handler: async (args, context) => {
        await handleSessionCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'ritual',
          type: 'boolean',
          description: 'Display pre-writing ritual checklist before starting',
        },
        {
          name: 'timer',
          type: 'number',
          description: 'Pomodoro-style focus timer duration in minutes',
        },
      ],
    },
    {
      name: 'end',
      description: 'End current writing session',
      handler: async (args, context) => {
        await handleSessionCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'note',
          type: 'string',
          description: 'Hemingway stop-point note: what happens next',
        },
      ],
    },
    {
      name: 'stats',
      description: 'Show session statistics',
      handler: async (args, context) => {
        await handleSessionCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'progress',
      description: 'Show writing progress dashboard',
      handler: async (args, context) => {
        await handleSessionCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'type',
      alias: 't',
      type: 'string',
      description: 'Session type',
      choices: ['drafting', 'revising', 'planning', 'editing'],
    },
    {
      name: 'mood',
      alias: 'm',
      type: 'number',
      description: 'Mood rating (1-5)',
    },
    {
      name: 'notes',
      alias: 'n',
      type: 'string',
      description: 'Session notes (Hemingway stop point)',
    },
    {
      name: 'days',
      alias: 'd',
      type: 'number',
      description: 'Number of days to show in summary',
    },
  ],
  examples: [
    '/novel session start --type drafting --ritual',
    '/novel session start --timer 25',
    '/novel session end --note "Mara confronts the council next"',
    '/novel session stats --days 7',
    '/novel session progress',
  ],
};

export const progressCommand: Command = {
  name: 'progress',
  description: 'Show writing progress dashboard',
  handler: async (args, context) => {
    await handleSessionCommand(args, context.cwd, context.output);
  },
  flags: [
    {
      name: 'streak',
      type: 'boolean',
      description: 'Show streak information',
      default: true,
    },
    {
      name: 'velocity',
      type: 'boolean',
      description: 'Show velocity metrics',
      default: true,
    },
    {
      name: 'recent',
      type: 'boolean',
      description: 'Show recent sessions',
      default: true,
    },
    {
      name: 'milestones',
      type: 'boolean',
      description: 'Show milestone achievements',
      default: false,
    },
    {
      name: 'compact',
      alias: 'c',
      type: 'boolean',
      description: 'Compact display mode',
      default: false,
    },
  ],
  examples: [
    '/novel progress',
    '/novel progress --compact',
    '/novel progress --streak --velocity',
    '/novel progress --milestones',
    '/novel progress --recent',
  ],
};
