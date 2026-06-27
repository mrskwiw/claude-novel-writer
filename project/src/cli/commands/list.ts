/**
 * List Command
 * Lists project elements (characters, locations, chapters, plots, issues)
 */

import type { Command } from '../types.js';
import {
  handleListCharacters,
  handleListLocations,
  handleListChapters,
  handleListPlots,
  handleListIssues,
} from '../handlers/list-handler.js';

export const listCommand: Command = {
  name: 'list',
  description: 'List project elements',
  aliases: ['ls'],
  requiresProject: true,
  subcommands: [
    {
      name: 'characters',
      description: 'List all characters',
      aliases: ['chars'],
      handler: handleListCharacters,
      flags: [
        {
          name: 'role',
          alias: 'r',
          description: 'Filter by role',
          type: 'string',
          choices: ['protagonist', 'antagonist', 'major', 'minor', 'background'],
        },
        {
          name: 'format',
          alias: 'f',
          description: 'Output format',
          type: 'string',
          choices: ['table', 'list', 'detailed'],
          default: 'table',
        },
      ],
      examples: [
        '/novel list characters',
        '/novel list characters --role protagonist',
        '/novel list characters --format detailed',
      ],
    },
    {
      name: 'locations',
      description: 'List all locations',
      aliases: ['locs'],
      handler: handleListLocations,
      flags: [
        {
          name: 'type',
          alias: 't',
          description: 'Filter by location type',
          type: 'string',
        },
        {
          name: 'format',
          alias: 'f',
          description: 'Output format',
          type: 'string',
          choices: ['table', 'list', 'detailed'],
          default: 'table',
        },
      ],
      examples: [
        '/novel list locations',
        '/novel list locations --type building',
        '/novel list locations --format detailed',
      ],
    },
    {
      name: 'chapters',
      description: 'List all chapters',
      aliases: ['chaps'],
      handler: handleListChapters,
      flags: [
        {
          name: 'format',
          alias: 'f',
          description: 'Output format',
          type: 'string',
          choices: ['table', 'list', 'detailed'],
          default: 'table',
        },
        {
          name: 'pov',
          description: 'Filter by POV character',
          type: 'string',
        },
      ],
      examples: [
        '/novel list chapters',
        '/novel list chapters --pov sarah',
        '/novel list chapters --format detailed',
      ],
    },
    {
      name: 'plots',
      description: 'List all plot threads',
      aliases: ['threads'],
      handler: handleListPlots,
      flags: [
        {
          name: 'type',
          alias: 't',
          description: 'Filter by plot type',
          type: 'string',
          choices: ['main', 'subplot', 'character', 'theme'],
        },
        {
          name: 'status',
          alias: 's',
          description: 'Filter by status',
          type: 'string',
          choices: ['planned', 'active', 'resolved', 'abandoned'],
        },
        {
          name: 'format',
          alias: 'f',
          description: 'Output format',
          type: 'string',
          choices: ['table', 'list', 'detailed'],
          default: 'table',
        },
      ],
      examples: [
        '/novel list plots',
        '/novel list plots --type main',
        '/novel list plots --status active',
      ],
    },
    {
      name: 'issues',
      description: 'List consistency issues',
      handler: handleListIssues,
      flags: [
        {
          name: 'severity',
          alias: 's',
          description: 'Filter by severity',
          type: 'string',
          choices: ['error', 'warning', 'info'],
        },
        {
          name: 'type',
          alias: 't',
          description: 'Filter by issue type',
          type: 'string',
          choices: ['character_attribute', 'timeline', 'world_rule', 'continuity'],
        },
        {
          name: 'status',
          description: 'Filter by status',
          type: 'string',
          choices: ['open', 'acknowledged', 'resolved', 'false_positive'],
          default: 'open',
        },
      ],
      examples: [
        '/novel list issues',
        '/novel list issues --severity error',
        '/novel list issues --type timeline --status open',
      ],
    },
  ],
  handler: async (args, context) => {
    context.output.error('Please specify what to list: characters, locations, chapters, plots, or issues');
    context.output.info('Examples:');
    context.output.list([
      '/novel list characters',
      '/novel list locations',
      '/novel list chapters',
      '/novel list plots',
      '/novel list issues',
    ]);
  },
  examples: [
    '/novel list characters',
    '/novel list locations',
    '/novel list chapters',
    '/novel list plots',
    '/novel list issues',
  ],
};
