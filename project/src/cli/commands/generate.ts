/**
 * AI Generation CLI Commands
 */

import type { Command } from '../types.js';
import { handleGenerateCommand } from '../handlers/generate-handler.js';

export const generateCommand: Command = {
  name: 'generate',
  description: 'AI-assisted content generation',
  handler: async (args, context) => {
    await handleGenerateCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'character',
      description: 'Generate character profile from description',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'location',
      description: 'Generate location/world-building details',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'continue',
      description: 'Suggest scene continuation',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'dialogue',
      description: 'Enhance dialogue for character voice',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'describe',
      description: 'Expand description with sensory details',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'plot',
      description: 'Suggest plot development',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'next-sentence',
      description: 'Generate one true sentence to break through writer\'s block',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'scene',
          alias: 's',
          type: 'number',
          description: 'Scene ID (required)',
          required: true,
        },
      ],
    },
    {
      name: 'synopsis',
      description: 'Generate a synopsis (short ~150w, medium ~400w, long ~800w)',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'length',
          alias: 'l',
          type: 'string',
          description: 'Synopsis length: short | medium | long',
          choices: ['short', 'medium', 'long'],
        },
        {
          name: 'save',
          type: 'boolean',
          description: 'Save synopsis to export/synopsis-[length].md',
        },
      ],
    },
    {
      name: 'pitch',
      description: 'Generate a 25-word elevator pitch',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'query-letter',
      description: 'Generate a professional query letter for literary agents',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'comps',
          type: 'string',
          description: 'Comma-separated comp titles, e.g. "Title by Author, Title2 by Author2"',
        },
      ],
    },
    {
      name: 'comps',
      description: 'Suggest 5 comparative titles (2020–2025) for the novel',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'opening-lines',
      description: 'Workshop opening line options for the novel (CRAFT-01)',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'count',
          alias: 'n',
          type: 'number',
          description: 'Number of opening line options to generate (default 5, max 10)',
        },
      ],
    },
    {
      name: 'name',
      description: 'Generate character name options with cultural context',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'culture',
          type: 'string',
          description: 'Cultural/ethnic origin (e.g. "Irish", "Japanese")',
        },
        {
          name: 'gender',
          type: 'string',
          description: 'Gender: male | female | neutral',
          choices: ['male', 'female', 'neutral'],
        },
        {
          name: 'count',
          alias: 'n',
          type: 'number',
          description: 'Number of names to generate (default 5)',
        },
        {
          name: 'type',
          type: 'string',
          description: 'Name type: first | last | full (default full)',
          choices: ['first', 'last', 'full'],
        },
      ],
    },
    {
      name: 'premise',
      description: 'Workshop a partial premise through structured development questions',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'idea',
          alias: 'i',
          type: 'string',
          description: 'The initial premise idea to develop (required)',
          required: true,
        },
      ],
    },
    {
      name: 'sketch',
      description: 'Generate a quick character sketch to capture an early idea',
      handler: async (args, context) => {
        await handleGenerateCommand(args, context.cwd, context.output);
      },
      flags: [
        {
          name: 'role',
          alias: 'r',
          type: 'string',
          description: 'Character role (e.g. "antagonist", "mentor")',
        },
        {
          name: 'genre',
          alias: 'g',
          type: 'string',
          description: 'Story genre (e.g. "thriller", "fantasy")',
        },
        {
          name: 'notes',
          alias: 'n',
          type: 'string',
          description: 'Freeform notes about the character',
        },
      ],
    },
  ],
  flags: [
    {
      name: 'description',
      alias: 'd',
      type: 'string',
      description: 'Content description',
    },
    {
      name: 'character',
      alias: 'c',
      type: 'string',
      description: 'Character name',
    },
    {
      name: 'scene',
      alias: 's',
      type: 'number',
      description: 'Scene ID',
    },
    {
      name: 'pov',
      type: 'string',
      description: 'POV character name',
    },
    {
      name: 'style',
      type: 'string',
      description: 'Writing style: descriptive, action, dialogue, introspective',
    },
    {
      name: 'temperature',
      alias: 't',
      type: 'number',
      description: 'Creativity level (0.0-1.0, higher = more creative)',
    },
    {
      name: 'alternatives',
      alias: 'a',
      type: 'number',
      description: 'Number of alternative suggestions',
    },
    {
      name: 'save',
      type: 'boolean',
      description: 'Save generated content to file',
    },
    {
      name: 'output',
      alias: 'o',
      type: 'string',
      description: 'Output file path',
    },
  ],
  examples: [
    '/novel generate character --description "A jaded ex-detective with a gambling debt"',
    '/novel generate location --description "A flooded subway station turned market"',
    '/novel generate continue --scene 12 --alternatives 3',
    '/novel generate dialogue --character "Mara" --scene 12',
    '/novel generate synopsis --length medium --save',
    '/novel generate pitch',
    '/novel generate name --culture Japanese --gender female --count 5',
  ],
};
