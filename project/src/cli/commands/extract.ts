/**
 * Extract CLI Command definition — "discovery writer" support
 *
 * Scans already-drafted chapter prose and proposes NEW story entities
 * (characters & locations) that are not yet recorded in `characters/*.yml` /
 * `locations/*.yml`. Read-only: it suggests `create` commands; it never writes.
 */

import type { Command } from '../types.js';
import { handleExtractCommand } from '../handlers/extract-handler.js';

export const extractCommand: Command = {
  name: 'extract',
  description:
    'Scan drafted chapter prose and propose NEW characters & locations to create (discovery-writer path)',
  aliases: ['discover'],
  flags: [
    { name: 'chapter', alias: 'c', description: 'Chapter number to scan', type: 'number' },
    { name: 'all', alias: 'a', description: 'Scan all chapters', type: 'boolean' },
    { name: 'file', alias: 'f', description: 'Scan an arbitrary prose file (e.g. a freeform outline) instead of a chapter', type: 'string' },
  ],
  handler: async (args, context) => {
    await handleExtractCommand(args, context.cwd, context.output);
  },
  examples: [
    '/novel extract --chapter 1',
    '/novel extract -c 3',
    '/novel extract --all',
    '/novel extract --file outline.md',
  ],
};
