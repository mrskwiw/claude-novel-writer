/**
 * Research CLI Command definition — SPEC-04
 *
 * Subcommands: add, list, show, link, verify-list, sync
 */

import type { Command } from '../types.js';
import { handleResearchCommand } from '../handlers/research-handler.js';

export const researchCommand: Command = {
  name: 'research',
  description: 'Manage research notes and [VERIFY:] markers in chapter files',
  aliases: ['res'],
  handler: async (args, context) => {
    await handleResearchCommand(args, context.cwd, context.output, context.extension);
  },
  subcommands: [
    {
      name: 'add',
      description: 'Add a new research note',
      handler: async (args, context) => {
        await handleResearchCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'list',
      description: 'List research notes, with optional tag filter',
      handler: async (args, context) => {
        await handleResearchCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'show',
      description: 'Show full detail for a research note including usage links',
      handler: async (args, context) => {
        await handleResearchCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'link',
      description: 'Link a research note to a chapter',
      handler: async (args, context) => {
        await handleResearchCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'verify-list',
      aliases: ['verify', 'markers'],
      description: 'List all [VERIFY:] markers in chapter files',
      handler: async (args, context) => {
        await handleResearchCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'sync',
      description: 'Placeholder for future YAML-based sync',
      handler: async (args, context) => {
        await handleResearchCommand(args, context.cwd, context.output, context.extension);
      },
    },
  ],
  flags: [
    {
      name: 'title',
      alias: 't',
      type: 'string',
      description: 'Title of the research note (add)',
    },
    {
      name: 'url',
      alias: 'u',
      type: 'string',
      description: 'URL for the research source (add)',
    },
    {
      name: 'notes',
      alias: 'n',
      type: 'string',
      description: 'Free-text notes to attach (add)',
    },
    {
      name: 'tag',
      type: 'string',
      description: 'Tag(s) to apply (add) or filter by (list). Comma-separated.',
    },
    {
      name: 'chapter',
      alias: 'c',
      type: 'number',
      description: 'Chapter number to link to (link) or filter by (verify-list)',
    },
    {
      name: 'note',
      type: 'string',
      description: 'Optional note to attach when linking',
    },
  ],
  examples: [
    '/novel research add --title "Victorian London" --url "https://example.com" --tag "history,setting"',
    '/novel research list',
    '/novel research list --tag history',
    '/novel research show <id>',
    '/novel research link <id> --chapter 3 --note "Used in the market scene"',
    '/novel research verify-list',
    '/novel research verify-list --chapter 2',
  ],
};
