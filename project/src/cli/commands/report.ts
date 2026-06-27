/**
 * Report CLI Command definition
 *
 * A one-screen manuscript-health rollup that composes existing analyzers
 * (pacing, developmental, style-targets, draft-scanner, plot threads, and
 * narrative promises) into a single compact dashboard. Read-only.
 */

import type { Command } from '../types.js';
import { handleReportCommand } from '../handlers/report-handler.js';

export const reportCommand: Command = {
  name: 'report',
  description: 'One-screen manuscript-health dashboard (tension, threads, promises, purpose, style, [TK]s)',
  handler: async (args, context) => {
    await handleReportCommand(args, context.cwd, context.output);
  },
  examples: ['/novel report'],
};
