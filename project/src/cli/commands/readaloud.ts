/**
 * Read-Aloud CLI Command definition (CRAFT-05 — real text-to-speech)
 *
 * Speaks a chapter/scene (or ad-hoc text) using the host OS speech engine, or
 * renders it to an audio file with `--out`.
 */

import type { Command } from '../types.js';
import { handleReadAloudCommand } from '../handlers/readaloud-handler.js';

export const readaloudCommand: Command = {
  name: 'readaloud',
  description: 'Read a chapter, scene, or ad-hoc text aloud using your system text-to-speech engine',
  aliases: ['speak', 'tts'],
  flags: [
    { name: 'chapter', alias: 'c', description: 'Chapter number to read aloud', type: 'number' },
    { name: 'scene', alias: 's', description: 'Scene number within the chapter (optional)', type: 'number' },
    { name: 'rate', alias: 'r', description: 'Speech rate (engine-specific scale)', type: 'number' },
    { name: 'voice', alias: 'v', description: 'Named voice to use (engine-specific)', type: 'string' },
    { name: 'out', alias: 'o', description: 'Render audio to this WAV/AIFF file instead of speaking', type: 'string' },
    { name: 'text', alias: 't', description: 'Speak ad-hoc text instead of a chapter', type: 'string' },
  ],
  handler: async (args, context) => {
    await handleReadAloudCommand(args, context.cwd, context.output);
  },
  examples: [
    '/novel readaloud --chapter 1',
    '/novel readaloud --chapter 1 --scene 2',
    '/novel readaloud --chapter 1 --rate 175',
    '/novel readaloud --chapter 1 --out chapter-01.wav',
    '/novel readaloud --text "The rain fell hard on the tin roof."',
  ],
};
