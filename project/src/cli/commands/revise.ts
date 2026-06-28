/**
 * Revise CLI Command definition — mechanical prose fixes
 *
 * Distinct from the `revision` command (which snapshots/restores drafts).
 * `revise` performs deterministic, diff-gated copy-edit fixes on a single
 * chapter Markdown file. Default behaviour is a DRY RUN (preview only);
 * fixes are written to disk only when `--apply` or `--all` is supplied.
 */

import type { Command } from '../types.js';
import { handleReviseCommand } from '../handlers/revise-handler.js';
import { ALL_CATEGORIES } from '../../analysis/prose-fixer.js';

export const reviseCommand: Command = {
  name: 'revise',
  description:
    'Apply mechanical, reversible copy-edit fixes to a chapter (dry run by default)',
  arguments: [
    {
      name: 'chapter',
      description: 'Chapter number (e.g. 3) or filename (e.g. 03-opening.md)',
      type: 'string',
      required: true,
    },
  ],
  flags: [
    {
      name: 'apply',
      alias: 'a',
      type: 'string',
      description:
        `Comma-separated categories to apply, no spaces (one of: ${ALL_CATEGORIES.join(', ')})`,
    },
    {
      name: 'all',
      type: 'boolean',
      description: 'Apply every safe category',
    },
    {
      name: 'chapter',
      alias: 'c',
      type: 'string',
      description: 'Chapter number or filename (alternative to the positional argument)',
    },
  ],
  examples: [
    '/novel revise 3                                  # dry run: preview every fix',
    '/novel revise 3 --apply doubled-words,multiple-spaces',
    '/novel revise 03-opening.md --apply trailing-whitespace',
    '/novel revise 3 --all                            # apply every safe category',
    '/novel help revise',
  ],
  handler: async (args, context) => {
    await handleReviseCommand(args, context.cwd, context.output);
  },
};
