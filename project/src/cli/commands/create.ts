/**
 * Create Command
 * Creates new project elements (characters, locations, chapters)
 */

import type { Command } from '../types.js';
import { handleCreateCharacter } from '../handlers/create-handler.js';
import { handleCreateLocation } from '../handlers/create-handler.js';
import { handleCreateChapter } from '../handlers/create-handler.js';
import { handleCreatePlot } from '../handlers/create-handler.js';
import { handleWorldRuleCreate } from '../handlers/world-rule-handler.js';

export const createCommand: Command = {
  name: 'create',
  description: 'Create new project elements (characters, locations, chapters)',
  aliases: ['new', 'add'],
  requiresProject: true,
  subcommands: [
    {
      name: 'character',
      description: 'Create a new character profile',
      handler: handleCreateCharacter,
      flags: [
        {
          name: 'interactive',
          alias: 'i',
          description: 'Interactive mode with prompts (default behavior)',
          type: 'boolean',
          default: false,
        },
        {
          name: 'name',
          description: 'Character name',
          type: 'string',
          required: false,
        },
        {
          name: 'role',
          description: 'Character role',
          type: 'string',
          required: false,
          choices: ['protagonist', 'antagonist', 'major', 'minor', 'background'],
        },
        {
          name: 'summary',
          description: 'Character summary',
          type: 'string',
          required: false,
        },
        {
          name: 'full-name',
          description: 'Full/formal name',
          type: 'string',
          required: false,
        },
        {
          name: 'age',
          description: 'Age',
          type: 'string',
          required: false,
        },
        {
          name: 'eyes',
          description: 'Eye color',
          type: 'string',
          required: false,
        },
        {
          name: 'hair',
          description: 'Hair color',
          type: 'string',
          required: false,
        },
        {
          name: 'height',
          description: 'Height',
          type: 'string',
          required: false,
        },
        {
          name: 'build',
          description: 'Body build',
          type: 'string',
          required: false,
        },
      ],
      examples: [
        '/novel create character',
        '/novel create character --interactive',
        '/novel create character --name "Sarah Chen" --role protagonist --summary "A brilliant astrophysicist..."',
      ],
    },
    {
      name: 'location',
      description: 'Create a new location/world element',
      handler: handleCreateLocation,
      flags: [
        {
          name: 'interactive',
          alias: 'i',
          description: 'Interactive mode with prompts (default behavior)',
          type: 'boolean',
          default: false,
        },
        {
          name: 'name',
          description: 'Location name',
          type: 'string',
          required: false,
        },
        {
          name: 'description',
          description: 'Location description',
          type: 'string',
          required: false,
        },
        {
          name: 'type',
          description: 'Location type (city, building, room, planet, etc.)',
          type: 'string',
          required: false,
        },
        {
          name: 'parent',
          description: 'Parent location name',
          type: 'string',
          required: false,
        },
      ],
      examples: [
        '/novel create location',
        '/novel create location --interactive',
        '/novel create location --name "SETI Observatory" --type building --description "A remote facility..."',
      ],
    },
    {
      name: 'chapter',
      description: 'Create a new chapter file',
      handler: handleCreateChapter,
      flags: [
        {
          name: 'number',
          alias: 'n',
          description: 'Chapter number (default: next available)',
          type: 'number',
          required: false,
        },
        {
          name: 'title',
          alias: 't',
          description: 'Chapter title',
          type: 'string',
          required: false,
        },
        {
          name: 'pov',
          description: 'POV character name',
          type: 'string',
          required: false,
        },
        {
          name: 'location',
          alias: 'l',
          description: 'Default location',
          type: 'string',
          required: false,
        },
        {
          name: 'scenes',
          alias: 's',
          description: 'Number of scenes to create',
          type: 'number',
          default: 1,
        },
      ],
      examples: [
        '/novel create chapter',
        '/novel create chapter --number 1 --title "The Signal" --pov sarah',
        '/novel create chapter --number 5 --scenes 3',
      ],
    },
    {
      name: 'plot',
      description: 'Create a new plot thread',
      aliases: ['thread'],
      handler: handleCreatePlot,
      flags: [
        {
          name: 'name',
          alias: 'n',
          description: 'Plot thread name',
          type: 'string',
          required: true,
        },
        {
          name: 'type',
          alias: 't',
          description: 'Plot thread type',
          type: 'string',
          required: false,
          choices: ['main', 'subplot', 'character', 'theme'],
          default: 'subplot',
        },
        {
          name: 'description',
          alias: 'd',
          description: 'Plot thread description',
          type: 'string',
          required: false,
        },
        {
          name: 'priority',
          alias: 'p',
          description: 'Priority (1-5, 5 is highest)',
          type: 'number',
          default: 3,
        },
        {
          name: 'status',
          alias: 's',
          description: 'Plot thread status',
          type: 'string',
          choices: ['planned', 'active', 'resolved', 'abandoned'],
          default: 'planned',
        },
      ],
      examples: [
        '/novel create plot --name "The Mystery of the Signal"',
        '/novel create plot --name "Sarah\'s Redemption" --type character --description "Sarah must face her past"',
        '/novel create plot --name "Main Plot" --type main --priority 5',
      ],
    },
    {
      name: 'world-rule',
      description: 'Create a new world rule',
      aliases: ['rule', 'world-rules'],
      handler: async (args, context) => {
        await handleWorldRuleCreate(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'name',
          alias: 'n',
          description: 'Rule name (required)',
          type: 'string',
          required: true,
        },
        {
          name: 'category',
          alias: 'c',
          description: 'Category: magic, technology, physics, social, political',
          type: 'string',
          required: true,
        },
        {
          name: 'description',
          alias: 'd',
          description: 'Rule description (required)',
          type: 'string',
          required: true,
        },
        {
          name: 'limitations',
          alias: 'l',
          description: 'Rule limitations',
          type: 'string',
        },
        {
          name: 'hard-rule',
          description: 'Whether this rule must never be violated',
          type: 'boolean',
        },
      ],
      examples: [
        '/novel create world-rule --name "No Electricity" --category technology --description "Victorian era — no electrical devices exist"',
        '/novel create world-rule --name "Magic Costs Blood" --category magic --description "Every spell drains the caster\'s life force" --hard-rule',
      ],
    },
  ],
  handler: async (args, context) => {
    context.output.error('Please specify what to create: character, location, chapter, plot, or world-rule');
    context.output.info('Examples:');
    context.output.list([
      '/novel create character',
      '/novel create location',
      '/novel create chapter',
      '/novel create plot',
      '/novel create world-rule',
    ]);
  },
  examples: [
    '/novel create character',
    '/novel create location',
    '/novel create chapter',
    '/novel create plot',
  ],
};
