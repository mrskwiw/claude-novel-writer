/**
 * Analyze CLI Command definition (GAP-11 / SPEC-08)
 *
 * Exposes pacing & structure analysis sub-commands.
 */

import type { Command } from '../types.js';
import { handleAnalyzeCommand } from '../handlers/analyze-handler.js';

export const analyzeCommand: Command = {
  name: 'analyze',
  description: 'Analyze manuscript structure, pacing, and prose',
  aliases: ['analysis'],
  handler: async (args, context) => {
    await handleAnalyzeCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'tension-arc',
      description: 'Show tension level across every chapter as an ASCII chart',
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'pov-balance',
      description: 'Show POV character distribution across all scenes',
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'chapter-lengths',
      description: 'Show chapter word counts and flag outliers',
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'pacing',
      description: 'Full pacing report: tension arc, POV balance, chapter lengths, and flags',
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'conflict',
      description: 'Show chapters with low conflict (avg tension ≤ 3)',
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'prose',
      description: 'Run prose analysis on one chapter (--chapter N) or all chapters (--all)',
      flags: [
        { name: 'chapter', alias: 'c', description: 'Chapter number to analyze', type: 'number' },
        { name: 'all', alias: 'a', description: 'Analyze all chapters', type: 'boolean' },
      ],
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'sentences',
      description: 'Sentence rhythm analysis for one chapter (--chapter N)',
      flags: [
        { name: 'chapter', alias: 'c', description: 'Chapter number to analyze', type: 'number' },
      ],
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'dialogue',
      description: 'Dialogue checks for one chapter (--chapter N)',
      flags: [
        { name: 'chapter', alias: 'c', description: 'Chapter number to analyze', type: 'number' },
      ],
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'read-aloud',
      description: 'Prepare chapter for read-aloud / TTS: strip markup, show rhythm and rhyme flags (CRAFT-05)',
      flags: [
        { name: 'chapter', alias: 'c', description: 'Chapter number to prepare', type: 'number' },
      ],
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'rhythm',
      description: 'Show only rhythm flags for a chapter (--chapter N) (CRAFT-05)',
      flags: [
        { name: 'chapter', alias: 'c', description: 'Chapter number to analyze', type: 'number' },
      ],
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'scenes',
      aliases: ['developmental', 'structure'],
      description: 'Scene purpose audit — list scenes missing a declared purpose field (--purpose)',
      flags: [
        { name: 'purpose', alias: 'p', description: 'Audit scenes for missing purpose fields', type: 'boolean' },
      ],
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'subplots',
      description: 'Subplot balance — count beats per plot thread and flag underdeveloped threads (< 3 beats)',
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'plot-holes',
      description: 'Plot-hole detection — find open plot threads with no beats in the last 3 chapters',
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'copy',
      description: 'Copy-edit analysis for one chapter (--chapter N) with optional POV and tense checks',
      flags: [
        { name: 'chapter', alias: 'c', description: 'Chapter number to analyze', type: 'number' },
        { name: 'pov', description: 'POV character name for slip detection', type: 'string' },
        { name: 'tense', description: 'Expected narrative tense', type: 'string', choices: ['past', 'present'] },
      ],
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'dialogue-reader',
      description: 'Output only dialogue grouped by character, stripped of all prose (CRAFT-03)',
      flags: [
        { name: 'chapter', alias: 'c', description: 'Chapter number to read', type: 'number' },
      ],
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'sensory',
      description: 'Sensory balance report for one chapter (PROC-05)',
      flags: [
        { name: 'chapter', alias: 'c', description: 'Chapter number to analyze', type: 'number' },
      ],
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'show-tell',
      description: 'Show vs tell ratio for one chapter (PROC-05)',
      flags: [
        { name: 'chapter', alias: 'c', description: 'Chapter number to analyze', type: 'number' },
      ],
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'style',
      description: 'Measure prose metrics against this project\'s style-targets.yml (--chapter N or --all)',
      flags: [
        { name: 'chapter', alias: 'c', description: 'Chapter number to analyze', type: 'number' },
        { name: 'all', alias: 'a', description: 'Analyze all chapters', type: 'boolean' },
      ],
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'voice',
      description: 'Manuscript-wide character voice analysis: flag too-similar voices and voices that drift across chapters',
      flags: [
        { name: 'character', description: 'Focus the report on a single character by name', type: 'string' },
      ],
      handler: async (args, context) => {
        await handleAnalyzeCommand(args, context.cwd, context.output);
      },
    },
  ],
  examples: [
    '/novel analyze tension-arc',
    '/novel analyze pov-balance',
    '/novel analyze chapter-lengths',
    '/novel analyze pacing',
    '/novel analyze conflict',
    '/novel analyze prose --chapter 1',
    '/novel analyze prose --all',
    '/novel analyze sentences --chapter 1',
    '/novel analyze dialogue --chapter 1',
    '/novel analyze read-aloud --chapter 1',
    '/novel analyze rhythm --chapter 1',
    '/novel analyze scenes --purpose',
    '/novel analyze subplots',
    '/novel analyze plot-holes',
    '/novel analyze copy --chapter 1',
    '/novel analyze copy --chapter 1 --pov "Sarah" --tense past',
    '/novel analyze dialogue-reader --chapter 1',
    '/novel analyze sensory --chapter 1',
    '/novel analyze show-tell --chapter 1',
    '/novel analyze style --chapter 1',
    '/novel analyze style --all',
    '/novel analyze voice',
  ],
};
