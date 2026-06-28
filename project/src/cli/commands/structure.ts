/**
 * Story Structure CLI Commands
 *
 * Maps story-structure beat templates (three-act, save-the-cat, heros-journey)
 * to word-count positions derived from the project's target word count, and
 * compares them against the current manuscript.
 */

import type { Command } from '../types.js';
import { handleStructureCommand } from '../handlers/structure-handler.js';

export const structureCommand: Command = {
  name: 'structure',
  description: 'Apply story-structure beat templates and track them against the manuscript',
  handler: async (args, context) => {
    await handleStructureCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'list',
      description: 'List available structure templates',
      handler: async (args, context) => {
        await handleStructureCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'apply',
      description: 'Apply a structure template to the project',
      handler: async (args, context) => {
        await handleStructureCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'status',
      description: 'Compare the applied structure against the current manuscript',
      handler: async (args, context) => {
        await handleStructureCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'template',
      alias: 't',
      type: 'string',
      description: 'Template id (three-act, save-the-cat, heros-journey)',
    },
    {
      name: 'words',
      alias: 'w',
      type: 'number',
      description: 'Override target word count (defaults to project target_word_count)',
    },
  ],
  examples: [
    '/novel structure list',
    '/novel structure apply three-act',
    '/novel structure apply save-the-cat --words 95000',
    '/novel structure status',
    '/novel structure status --template heros-journey',
  ],
};
