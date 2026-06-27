/**
 * /novel slash command handler
 * Entry point for the Novel Writer CLI
 */

import { handleNovelCommand } from '../cli/index.js';

/**
 * Handler for /novel slash command
 * Called by Claude Code when user types /novel
 *
 * @param commandString - The command string after /novel (e.g., "init --title 'My Novel'")
 */
export async function novel(commandString: string): Promise<void> {
  await handleNovelCommand(commandString);
}

// Export as default for Claude Code
export default novel;
