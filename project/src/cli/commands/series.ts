/**
 * Series Management CLI Command — PROC-11
 *
 * Subcommands: create, add-book, list, bible add, bible list, threads, check
 */

import type { Command } from '../types.js';
import { handleSeriesCommand } from '../handlers/series-handler.js';

export const seriesCommand: Command = {
  name: 'series',
  description: 'Manage a multi-book series with shared bible and cross-book thread tracking',
  aliases: ['ser'],
  handler: async (args, context) => {
    await handleSeriesCommand(args, context.cwd, context.output, context.extension);
  },
  subcommands: [
    {
      name: 'create',
      description: 'Create a new series',
      handler: async (args, context) => {
        await handleSeriesCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'add-book',
      description: 'Add a book to a series',
      handler: async (args, context) => {
        await handleSeriesCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'list',
      description: 'List all series with book counts',
      handler: async (args, context) => {
        await handleSeriesCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'bible',
      description: 'Manage the series bible (add or list entries)',
      handler: async (args, context) => {
        await handleSeriesCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'threads',
      description: 'Report cross-book unresolved narrative threads',
      handler: async (args, context) => {
        await handleSeriesCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'check',
      description: 'Check consistency of series bible against individual book canon',
      handler: async (args, context) => {
        await handleSeriesCommand(args, context.cwd, context.output, context.extension);
      },
    },
  ],
  flags: [
    {
      name: 'title',
      alias: 't',
      type: 'string',
      description: 'Series or book title (create, add-book)',
    },
    {
      name: 'description',
      alias: 'd',
      type: 'string',
      description: 'Optional description for the series (create)',
    },
    {
      name: 'series',
      alias: 's',
      type: 'string',
      description: 'Series id (add-book, bible, threads, check)',
    },
    {
      name: 'book',
      alias: 'b',
      type: 'number',
      description: 'Book number within the series (add-book)',
    },
    {
      name: 'project',
      alias: 'p',
      type: 'string',
      description: 'Project id to attach as a book (add-book, defaults to current project)',
    },
    {
      name: 'category',
      alias: 'c',
      type: 'string',
      description: 'Bible entry category: character | world | timeline | theme | other (bible add/list)',
    },
    {
      name: 'key',
      alias: 'k',
      type: 'string',
      description: 'Bible entry key, e.g. "Mira.age_in_book_1" (bible add)',
    },
    {
      name: 'value',
      alias: 'v',
      type: 'string',
      description: 'Bible entry value (bible add)',
    },
    {
      name: 'notes',
      alias: 'n',
      type: 'string',
      description: 'Optional notes to attach to a bible entry (bible add)',
    },
    {
      name: 'applies-to',
      type: 'string',
      description: 'Comma-separated book numbers the bible entry applies to; omit for all books (bible add)',
    },
  ],
  examples: [
    '/novel series create --title "The Mira Chronicles" --description "A four-book fantasy series"',
    '/novel series add-book --series <id> --book 2 --title "The Second Door" --project <projectId>',
    '/novel series list',
    '/novel series bible add --series <id> --category character --key "Mira.age_in_book_1" --value "23"',
    '/novel series bible list --series <id>',
    '/novel series bible list --series <id> --category character',
    '/novel series threads --series <id>',
    '/novel series check --series <id>',
  ],
};
