/**
 * Character Commands
 * Commands for managing characters in the novel
 */

import type { Command } from '../types.js';
import { handleCharacterCommand } from '../handlers/character-handler.js';

export const characterCommand: Command = {
  name: 'character',
  description: 'Manage characters in your novel',
  handler: async (args, context) => {
    await handleCharacterCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'create',
      description: 'Create new character interactively',
      handler: async (args, context) => {
        await handleCharacterCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'list',
      description: 'List all characters',
      handler: async (args, context) => {
        await handleCharacterCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'show',
      description: 'Show character details',
      handler: async (args, context) => {
        await handleCharacterCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'edit',
      description: 'Edit character metadata',
      handler: async (args, context) => {
        await handleCharacterCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'delete',
      description: 'Delete character file',
      handler: async (args, context) => {
        await handleCharacterCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'sync',
      description: 'Sync character to database',
      handler: async (args, context) => {
        await handleCharacterCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'scenes',
      description: 'List scenes featuring this character',
      handler: async (args, context) => {
        await handleCharacterCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'arc',
      description: 'Display character arc timeline; use --compare for side-by-side',
      handler: async (args, context) => {
        await handleCharacterCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'states',
      description: 'Show all character states for a chapter (--chapter N)',
      handler: async (args, context) => {
        await handleCharacterCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'name',
      alias: 'n',
      type: 'string',
      description: 'Character name',
    },
    {
      name: 'role',
      alias: 'r',
      type: 'string',
      description: 'Character role',
      choices: ['protagonist', 'antagonist', 'major', 'minor', 'background'],
    },
    {
      name: 'summary',
      alias: 's',
      type: 'string',
      description: 'Character summary',
    },
    {
      name: 'age',
      type: 'string',
      description: 'Character age',
    },
    {
      name: 'eye-color',
      type: 'string',
      description: 'Eye colour, recorded in the appearance profile (e.g. "hazel")',
    },
    {
      name: 'hair-color',
      type: 'string',
      description: 'Hair colour, recorded in the appearance profile (e.g. "auburn")',
    },
    {
      name: 'height',
      type: 'string',
      description: 'Height, recorded in the appearance profile (e.g. "5\'9\"" or "tall")',
    },
    {
      name: 'build',
      type: 'string',
      description: 'Build/physique',
    },
    {
      name: 'personality',
      alias: 'p',
      type: 'string',
      description: 'Core personality',
    },
    {
      name: 'all',
      alias: 'a',
      type: 'boolean',
      description: 'Show all details',
    },
    {
      name: 'compare',
      alias: 'c',
      type: 'string',
      description: 'Compare arc with a second character name',
    },
    {
      name: 'chapter',
      type: 'number',
      description: 'Chapter number (for character states --chapter N)',
    },
  ],
  examples: [
    '/novel character create --name "Ada Vex" --role protagonist',
    '/novel character list',
    '/novel character show --name "Ada Vex" --all',
    '/novel character arc --name "Ada Vex" --compare "Kael"',
    '/novel character states --name "Ada Vex" --chapter 3',
    '/novel character sync',
  ],
};
