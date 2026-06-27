/**
 * Timeline Commands
 * Commands for managing timeline events in the novel
 */

import type { Command } from '../types.js';
import { handleTimelineCommand } from '../handlers/timeline-handler.js';

export const timelineCommand: Command = {
  name: 'timeline',
  description: 'Manage timeline events in your novel',
  handler: async (args, context) => {
    await handleTimelineCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'add',
      description: 'Add a new timeline event',
      flags: [
        {
          name: 'name',
          type: 'string',
          description: 'Event name (required)',
          required: true,
        },
        {
          name: 'type',
          type: 'string',
          description: 'Event type: plot, backstory, world_history',
        },
        {
          name: 'description',
          type: 'string',
          description: 'Event description',
        },
        {
          name: 'date',
          type: 'string',
          description: 'Story date (flexible format: "2024-05-01", "Summer 1995", etc.)',
        },
        {
          name: 'timestamp',
          type: 'number',
          description: 'Story timestamp (unix-style number for precise ordering)',
        },
        {
          name: 'importance',
          type: 'number',
          description: 'Importance level (1-10)',
        },
        {
          name: 'backstory',
          type: 'boolean',
          description: 'Mark as backstory event',
        },
        {
          name: 'before',
          type: 'string',
          description: 'Comma-separated list of event names that must happen after this one',
        },
      ],
      handler: async (args, context) => {
        await handleTimelineCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'list',
      description: 'List all timeline events',
      flags: [
        {
          name: 'type',
          type: 'string',
          description: 'Filter by event type',
        },
        {
          name: 'backstory',
          type: 'boolean',
          description: 'Show only backstory events',
        },
        {
          name: 'importance',
          type: 'number',
          description: 'Show only events with importance >= N',
        },
        {
          name: 'verbose',
          type: 'boolean',
          description: 'Show detailed information',
        },
      ],
      handler: async (args, context) => {
        await handleTimelineCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'show',
      description: 'Show timeline event details',
      flags: [
        {
          name: 'name',
          type: 'string',
          description: 'Event name',
          required: true,
        },
      ],
      handler: async (args, context) => {
        await handleTimelineCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'update',
      description: 'Update timeline event',
      flags: [
        {
          name: 'name',
          type: 'string',
          description: 'Event name',
          required: true,
        },
        {
          name: 'description',
          type: 'string',
          description: 'New description',
        },
        {
          name: 'date',
          type: 'string',
          description: 'New story date',
        },
        {
          name: 'timestamp',
          type: 'number',
          description: 'New timestamp',
        },
        {
          name: 'importance',
          type: 'number',
          description: 'New importance level (1-10)',
        },
      ],
      handler: async (args, context) => {
        await handleTimelineCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'delete',
      description: 'Delete timeline event',
      flags: [
        {
          name: 'name',
          type: 'string',
          description: 'Event name',
          required: true,
        },
      ],
      handler: async (args, context) => {
        await handleTimelineCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'link',
      description: 'Create dependency between events (A must happen before B)',
      flags: [
        {
          name: 'before',
          type: 'string',
          description: 'Event that happens first (required)',
          required: true,
        },
        {
          name: 'after',
          type: 'string',
          description: 'Event that happens second (required)',
          required: true,
        },
        {
          name: 'type',
          type: 'string',
          description: 'Dependency type: sequence, causation, reference (default: sequence)',
        },
        {
          name: 'notes',
          type: 'string',
          description: 'Notes about this dependency',
        },
      ],
      handler: async (args, context) => {
        await handleTimelineCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'check',
      description: 'Check for timeline conflicts (events with dependencies but wrong timestamps)',
      handler: async (args, context) => {
        await handleTimelineCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'sync',
      description: 'Sync timeline YAML files to database',
      handler: async (args, context) => {
        await handleTimelineCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'export',
      description: 'Export timeline events to YAML file',
      flags: [
        {
          name: 'output',
          type: 'string',
          description: 'Output file path (default: timeline/timeline.yaml)',
        },
      ],
      handler: async (args, context) => {
        await handleTimelineCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [],
  examples: [
    '/novel timeline add --name "The Coronation" --type plot --date "Summer 1995" --importance 8',
    '/novel timeline list --type plot --importance 5',
    '/novel timeline show --name "The Coronation"',
    '/novel timeline link --before "The Coronation" --after "The Rebellion" --type causation',
    '/novel timeline check',
    '/novel timeline export --output timeline/timeline.yaml',
  ],
};
