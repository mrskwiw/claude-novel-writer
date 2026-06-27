/**
 * Agent Query Tracker CLI Command — PROC-10
 *
 * Subcommands: add, list, update, stats, export-package
 */

import type { Command } from '../types.js';
import { handleQueryCommand } from '../handlers/query-handler.js';

export const queryCommand: Command = {
  name: 'query',
  description: 'Track literary agent query submissions',
  aliases: ['queries'],
  handler: async (args, context) => {
    await handleQueryCommand(args, context.cwd, context.output, context.extension);
  },
  subcommands: [
    {
      name: 'add',
      description: 'Record a new agent query submission',
      handler: async (args, context) => {
        await handleQueryCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'list',
      description: 'List all queries, optionally filtered by status',
      handler: async (args, context) => {
        await handleQueryCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'update',
      description: 'Update the status or notes on an existing query',
      handler: async (args, context) => {
        await handleQueryCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'stats',
      description: 'Show a dashboard of query statistics',
      handler: async (args, context) => {
        await handleQueryCommand(args, context.cwd, context.output, context.extension);
      },
    },
    {
      name: 'export-package',
      description: 'Build a query package template for a named agent',
      handler: async (args, context) => {
        await handleQueryCommand(args, context.cwd, context.output, context.extension);
      },
    },
  ],
  flags: [
    {
      name: 'agent',
      alias: 'a',
      type: 'string',
      description: 'Agent name (add, export-package)',
    },
    {
      name: 'agency',
      type: 'string',
      description: 'Literary agency name (add)',
    },
    {
      name: 'date',
      alias: 'd',
      type: 'string',
      description: 'Query date in YYYY-MM-DD format (add, defaults to today)',
    },
    {
      name: 'materials',
      alias: 'm',
      type: 'string',
      description: 'Comma-separated list of materials sent, e.g. "query,synopsis,first_10_pages" (add)',
    },
    {
      name: 'notes',
      alias: 'n',
      type: 'string',
      description: 'Free-text notes to attach (add, update)',
    },
    {
      name: 'id',
      type: 'string',
      description: 'Query record id (update)',
    },
    {
      name: 'status',
      alias: 's',
      type: 'string',
      description:
        'Status filter (list) or new status (update): sent | pending | rejected | partial_request | full_request | offer | closed',
    },
    {
      name: 'response-date',
      alias: 'r',
      type: 'string',
      description: 'Date agent responded, YYYY-MM-DD (update)',
    },
  ],
  examples: [
    '/novel query add --agent "Jane Smith" --agency "Big Five Agency" --date "2026-05-01" --materials "query,synopsis"',
    '/novel query list',
    '/novel query list --status pending',
    '/novel query update --id <id> --status rejected --response-date "2026-06-01" --notes "Form rejection"',
    '/novel query stats',
    '/novel query export-package --agent "Jane Smith"',
  ],
};
