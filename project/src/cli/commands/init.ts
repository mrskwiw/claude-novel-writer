/**
 * /novel init command
 * Initialize a new novel project
 */

import type { Command } from '../types.js';
import { handleInit } from '../handlers/init-handler.js';

export const initCommand: Command = {
  name: 'init',
  description: 'Initialize a new novel project in the current directory',
  aliases: ['initialize', 'setup'],
  requiresProject: false,

  flags: [
    {
      name: 'title',
      description: 'Project title',
      type: 'string',
      required: false,
    },
    {
      name: 'author',
      description: 'Author name',
      type: 'string',
      required: false,
    },
    {
      name: 'genre',
      description: 'Genre or category',
      type: 'string',
      required: false,
    },
    {
      name: 'words',
      alias: 'w',
      description: 'Target word count',
      type: 'number',
      required: false,
      default: 80000,
    },
    {
      name: 'phase',
      description: 'Starting phase',
      type: 'string',
      required: false,
      default: 'ideation',
      choices: [
        'ideation',
        'planning',
        'drafting',
        'revising',
        'polishing',
        'production',
        'distribution',
      ],
    },
    {
      name: 'skip-prompts',
      description: 'Force non-interactive mode (also auto-enabled when stdin is not a TTY)',
      type: 'boolean',
      required: false,
      default: false,
    },
    {
      name: 'json',
      description: 'Emit a machine-readable JSON result (implies non-interactive)',
      type: 'boolean',
      required: false,
      default: false,
    },
    {
      name: 'editing-mode',
      description: 'Default editing mode saved to CLAUDE.md (non-interactive default: deterministic)',
      type: 'string',
      required: false,
      choices: ['deterministic', 'ai'],
    },
    {
      name: 'force',
      description: 'Remove existing .novel/ and reinitialize',
      type: 'boolean',
      required: false,
      default: false,
    },
  ],

  examples: [
    '/novel init',
    '/novel init --title "Galaxy at War" --author "Jane Smith"',
    '/novel init --title "My Novel" --genre "Sci-Fi" --words 120000',
    '/novel init --force --title "My Novel" --author "Jane Smith"',
    '/novel init --json --title "..." --author "..."',
  ],

  handler: handleInit,
};
