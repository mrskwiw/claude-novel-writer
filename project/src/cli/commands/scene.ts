/**
 * Scene Commands
 * Commands for managing scenes within chapters
 */

import type { Command } from '../types.js';
import { handleSceneCommand } from '../handlers/scene-handler.js';

export const sceneCommand: Command = {
  name: 'scene',
  description: 'Manage scenes within chapters',
  handler: async (args, context) => {
    await handleSceneCommand(args, context.cwd, context.output);
  },
  subcommands: [
    {
      name: 'add',
      description: 'Add new scene to chapter',
      handler: async (args, context) => {
        await handleSceneCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'list',
      description: 'List scenes in chapter',
      handler: async (args, context) => {
        await handleSceneCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'edit',
      description: 'Edit scene metadata',
      handler: async (args, context) => {
        await handleSceneCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'delete',
      description: 'Delete scene from chapter',
      handler: async (args, context) => {
        await handleSceneCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'reorder',
      description: 'Reorder scenes in chapter',
      handler: async (args, context) => {
        await handleSceneCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'stats',
      description: 'Show scene statistics for chapter',
      handler: async (args, context) => {
        await handleSceneCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'sync',
      description: 'Sync scenes to database',
      handler: async (args, context) => {
        await handleSceneCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'tension-arc',
      description: 'Show tension arc across project',
      handler: async (args, context) => {
        await handleSceneCommand(args, context.cwd, context.output);
      },
    },
    {
      name: 'beats',
      description: 'Manage AI-generated beats within a scene (generate, list, sync, clear)',
      handler: async (args, context) => {
        await handleSceneCommand(args, context.cwd, context.output);
      },
    },
  ],
  flags: [
    {
      name: 'chapter',
      alias: 'c',
      type: 'number',
      description: 'Chapter number',
      required: false,
    },
    {
      name: 'scene',
      alias: 's',
      type: 'number',
      description: 'Scene number',
    },
    {
      name: 'title',
      alias: 't',
      type: 'string',
      description: 'Scene title',
    },
    {
      name: 'pov',
      alias: 'p',
      type: 'string',
      description: 'POV character name',
    },
    {
      name: 'location',
      alias: 'l',
      type: 'string',
      description: 'Scene location',
    },
    {
      name: 'time',
      type: 'string',
      description: 'Time of day',
      choices: ['Morning', 'Afternoon', 'Evening', 'Night'],
    },
    {
      name: 'purpose',
      type: 'string',
      description: 'Scene narrative purpose',
    },
    {
      name: 'tone',
      type: 'string',
      description: 'Emotional tone',
    },
    {
      name: 'tension',
      type: 'number',
      description: 'Tension level (1-10)',
    },
    {
      name: 'order',
      alias: 'o',
      type: 'string',
      description: 'New scene order (comma-separated, e.g., "3,1,2")',
    },
    {
      name: 'content',
      type: 'string',
      description: 'Scene content',
    },
    {
      name: 'after',
      alias: 'a',
      type: 'number',
      description: 'Insert scene after this scene number',
    },
    {
      name: 'beats',
      alias: 'b',
      type: 'number',
      description: 'Number of beats to generate (default 5)',
    },
    {
      name: 'action',
      type: 'string',
      description: 'Beats sub-action: generate, list, sync, clear',
    },
  ],
  examples: [
    '/novel scene add --chapter 1 --title "The Arrival" --pov "Mara" --location "Ironhold"',
    '/novel scene list --chapter 1',
    '/novel scene edit --chapter 1 --scene 2 --tension 8 --time Evening',
    '/novel scene reorder --chapter 1 --order "3,1,2"',
    '/novel scene beats --chapter 1 --scene 2 --action generate --beats 5',
    '/novel scene tension-arc',
  ],
};
