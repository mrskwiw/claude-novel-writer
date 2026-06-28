/**
 * Theme / Motif CLI Command definition
 *
 * Register themes with associated motif words/phrases, list them, and run a
 * deterministic motif-density scan across chapter prose (`trace`). Themes are
 * stored as YAML under `<project>/themes/<slug>.yml` — no database involved.
 */

import type { Command } from '../types.js';
import { handleThemeCommand } from '../handlers/theme-handler.js';

export const themeCommand: Command = {
  name: 'theme',
  description: 'Track themes and motifs, and trace their density across chapters',
  handler: async (args, context) => {
    await handleThemeCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'add',
      description: 'Register a theme with associated motif words/phrases',
      handler: async (args, context) => {
        await handleThemeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'list',
      description: 'List registered themes and their motifs',
      handler: async (args, context) => {
        await handleThemeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'trace',
      description: 'Scan chapters for motif density, gaps, and spikes',
      handler: async (args, context) => {
        await handleThemeCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'name',
      alias: 'n',
      type: 'string',
      description: 'Theme name (e.g. "isolation")',
    },
    {
      name: 'motifs',
      alias: 'm',
      type: 'string',
      description: 'Comma-separated motif words/phrases (e.g. "cold,mirror,silence,locked")',
    },
    {
      name: 'description',
      alias: 'd',
      type: 'string',
      description: 'Optional theme description',
    },
    {
      name: 'theme',
      alias: 't',
      type: 'string',
      description: 'Limit trace to a single theme (by name or slug)',
    },
  ],
  examples: [
    '/novel theme add --name "isolation" --motifs "cold,mirror,silence,locked"',
    '/novel theme list',
    '/novel theme trace',
    '/novel theme trace --theme isolation',
  ],
};
