/**
 * Help CLI Command definition
 */

import type { Command } from '../types.js';
import { handleHelpCommand } from '../handlers/help-handler.js';

export const helpCommand: Command = {
  name: 'help',
  description: 'List all available commands or show help for a specific command',
  flags: [
    {
      name: 'json',
      type: 'boolean',
      description: 'Emit a machine-readable JSON schema of the CLI (or one command)',
    },
  ],
  handler: async (args, context) => {
    // Import registry lazily to avoid circular module dependency
    const { registry } = await import('../registry.js');
    const targetCommand = args.positional[0] ?? undefined;
    const json = args.flags.json === true;
    const result = handleHelpCommand(targetCommand ? [targetCommand] : [], registry, json);
    context.output.info(result);
  },
  examples: [
    '/novel help',
    '/novel help generate',
    '/novel help --json',
    '/novel help generate --json',
  ],
};
