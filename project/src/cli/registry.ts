/**
 * Command Registry
 * Central registry of all available CLI commands
 */

import type { Command } from './types.js';
import { initCommand } from './commands/init.js';
import { createCommand } from './commands/create.js';
import { listCommand } from './commands/list.js';
import { syncCommand } from './commands/sync.js';
import { chapterCommand } from './commands/chapter.js';
import { sessionCommand, progressCommand } from './commands/session.js';
import { sceneCommand } from './commands/scene.js';
import { characterCommand } from './commands/character.js';
import { locationCommand } from './commands/location.js';
import { plotCommand } from './commands/plot.js';
import { worldRuleCommand } from './commands/world-rule.js';
import { checkCommand } from './commands/check.js';
import { timelineCommand } from './commands/timeline.js';
import { exportCommand } from './commands/export.js';
import { generateCommand } from './commands/generate.js';
import { ideaCommand } from './commands/idea.js';
import { knowledgeCommand } from './commands/knowledge.js';
import { canonCommand } from './commands/canon.js';
import { promiseCommand } from './commands/promise.js';
import { contextCommand } from './commands/context.js';
import { graphCommand } from './commands/graph.js';
import { helpCommand } from './commands/help.js';
import { revisionCommand } from './commands/revision.js';
import { draftCommand } from './commands/draft.js';
import { analyzeCommand } from './commands/analyze.js';
import { researchCommand } from './commands/research.js';
import { betaCommand } from './commands/beta.js';
import { queryCommand } from './commands/query.js';
import { seriesCommand } from './commands/series.js';

export class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private aliases: Map<string, string> = new Map();

  constructor() {
    this.registerDefaults();
  }

  /**
   * Register all default commands
   */
  private registerDefaults(): void {
    // Project management
    this.register(initCommand);

    // Content creation
    this.register(createCommand);

    // Content viewing
    this.register(listCommand);

    // Content synchronization
    this.register(syncCommand);

    // Chapter management
    this.register(chapterCommand);

    // Scene management
    this.register(sceneCommand);

    // Character management
    this.register(characterCommand);

    // Location management
    this.register(locationCommand);

    // Plot thread management
    this.register(plotCommand);

    // World rules management
    this.register(worldRuleCommand);

    // Timeline management
    this.register(timelineCommand);

    // Session tracking
    this.register(sessionCommand);
    this.register(progressCommand);

    // Consistency checking
    this.register(checkCommand);

    // Export
    this.register(exportCommand);

    // AI Generation
    this.register(generateCommand);

    // Idea capture
    this.register(ideaCommand);

    // Intelligence layer — Ticket 012
    this.register(knowledgeCommand);
    this.register(canonCommand);
    this.register(promiseCommand);
    this.register(contextCommand);
    this.register(graphCommand);

    // Help
    this.register(helpCommand);

    // Draft version control
    this.register(revisionCommand);

    // Drafting support tools — SPEC-06
    this.register(draftCommand);

    // Pacing & structure analysis — GAP-11 / SPEC-08
    this.register(analyzeCommand);

    // Research repository — SPEC-04
    this.register(researchCommand);

    // Beta reader management — SPEC-11
    this.register(betaCommand);

    // Agent query tracker — PROC-10
    this.register(queryCommand);

    // Series management — PROC-11
    this.register(seriesCommand);
  }

  /**
   * Register a command
   */
  register(command: Command): void {
    this.commands.set(command.name, command);

    // Register aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliases.set(alias, command.name);
      }
    }

    // Register subcommands
    if (command.subcommands) {
      for (const subcommand of command.subcommands) {
        const fullName = `${command.name}:${subcommand.name}`;
        this.commands.set(fullName, subcommand);
      }
    }
  }

  /**
   * Get a command by name or alias
   */
  get(name: string): Command | undefined {
    // Check direct command
    if (this.commands.has(name)) {
      return this.commands.get(name);
    }

    // Check alias
    const aliasTarget = this.aliases.get(name);
    if (aliasTarget) {
      return this.commands.get(aliasTarget);
    }

    return undefined;
  }

  /**
   * Get all registered commands
   */
  getAll(): Command[] {
    return Array.from(this.commands.values()).filter(
      (cmd) => !cmd.name.includes(':')
    );
  }

  /**
   * Check if command exists
   */
  has(name: string): boolean {
    return this.commands.has(name) || this.aliases.has(name);
  }

  /**
   * Find commands matching partial name (for suggestions)
   */
  findSimilar(name: string): Command[] {
    const similar: Command[] = [];

    for (const [cmdName, command] of this.commands.entries()) {
      if (cmdName.includes(':')) continue; // Skip subcommands

      // Check command name similarity
      if (cmdName.startsWith(name) || this.levenshteinDistance(cmdName, name) <= 2) {
        similar.push(command);
      }

      // Check aliases
      if (command.aliases) {
        for (const alias of command.aliases) {
          if (alias.startsWith(name) || this.levenshteinDistance(alias, name) <= 2) {
            similar.push(command);
            break;
          }
        }
      }
    }

    return similar;
  }

  /**
   * Calculate Levenshtein distance for suggestion
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

// Export singleton instance
export const registry = new CommandRegistry();
