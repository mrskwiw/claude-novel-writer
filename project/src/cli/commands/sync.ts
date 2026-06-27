/**
 * Sync Command Definition
 * Syncs YAML files to database, or exports DB entities back to files (reverse sync).
 */

import type { Command } from '../types.js';
import {
  handleSyncAll,
  handleSyncCharacters,
  handleSyncLocations,
  handleSyncPlots,
  handleSyncChapters,
  handleSyncTimeline,
  handleSyncWorldRules,
  handleSyncFromDb,
} from '../handlers/sync-handler.js';

export const syncCommand: Command = {
  name: 'sync',
  description: 'Sync YAML files to database',
  handler: handleSyncAll,
  subcommands: [
    {
      name: 'all',
      description: 'Sync all content (characters, locations, plots, chapters)',
      handler: handleSyncAll,
      examples: ['/novel sync all'],
    },
    {
      name: 'characters',
      description: 'Sync all character YAML files to database',
      aliases: ['chars'],
      handler: handleSyncCharacters,
      examples: ['/novel sync characters'],
    },
    {
      name: 'locations',
      description: 'Sync all location YAML files to database',
      aliases: ['locs'],
      handler: handleSyncLocations,
      examples: ['/novel sync locations'],
    },
    {
      name: 'plots',
      description: 'Sync all plot thread YAML files to database',
      aliases: ['threads'],
      handler: handleSyncPlots,
      examples: ['/novel sync plots'],
    },
    {
      name: 'chapters',
      description: 'Sync all chapter markdown files to database',
      aliases: ['chaps'],
      handler: handleSyncChapters,
      examples: ['/novel sync chapters'],
    },
    {
      name: 'timeline',
      description: 'Sync timeline YAML files to database',
      aliases: ['timelines'],
      handler: handleSyncTimeline,
      examples: ['/novel sync timeline'],
    },
    {
      name: 'world-rules',
      description: 'Sync world rule YAML files to database',
      aliases: ['world-rule', 'rules'],
      handler: handleSyncWorldRules,
      examples: ['/novel sync world-rules'],
    },
    {
      name: 'from-db',
      description: 'Reverse sync: export DB entities back to YAML/Markdown files',
      aliases: ['reverse', 'export'],
      handler: handleSyncFromDb,
      arguments: [
        {
          name: 'type',
          description: 'Entity type to export: characters, locations, world-rules, plot-threads, chapters, all',
          type: 'string',
          required: false,
        },
      ],
      examples: [
        '/novel sync from-db',
        '/novel sync from-db characters',
        '/novel sync from-db chapters',
      ],
    },
  ],
  examples: [
    '/novel sync all',
    '/novel sync characters',
    '/novel sync plots',
    '/novel sync from-db',
    '/novel sync from-db characters',
  ],
};
