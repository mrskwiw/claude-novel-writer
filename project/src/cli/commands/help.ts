/**
 * Help CLI Command definition
 */

import type { Command } from '../types.js';
import { handleHelpCommand } from '../handlers/help-handler.js';

export const helpCommand: Command = {
  name: 'help',
  description: 'List all available commands or show help for a specific command',
  handler: async (args, context) => {
    // Import registry lazily to avoid circular module dependency
    const { registry } = await import('../registry.js');
    const targetCommand = args.positional[0] ?? undefined;
    const result = handleHelpCommand(targetCommand ? [targetCommand] : [], registry);
    context.output.info(result);
  },
};
