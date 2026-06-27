/**
 * Plot Thread Builder
 * Creates plot thread YAML files with interactive or programmatic input
 */

import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import YAML from 'yaml';
import type { PlotYAML } from '../types/novel.js';
import type { PromptFunction } from './character-builder.js';

export interface PlotBuilderOptions {
  projectPath: string;
}

export class PlotBuilder {
  private projectPath: string;
  private plotsDir: string;

  constructor(options: PlotBuilderOptions) {
    this.projectPath = options.projectPath;
    this.plotsDir = join(this.projectPath, 'plots');
  }

  /**
   * Create a plot thread file with all data provided
   */
  async create(plotData: PlotYAML): Promise<string> {
    // Ensure plots directory exists
    if (!existsSync(this.plotsDir)) {
      await mkdir(this.plotsDir, { recursive: true });
    }

    // Generate filename from plot name
    const filename = this.generateFilename(plotData.name);
    const filePath = join(this.plotsDir, filename);

    // Check if file already exists
    if (existsSync(filePath)) {
      throw new Error(`Plot file already exists: ${filename}`);
    }

    // Convert to YAML
    const yamlContent = YAML.stringify(plotData, {
      indent: 2,
      lineWidth: 80,
    });

    // Write file
    await writeFile(filePath, yamlContent, 'utf-8');

    return filePath;
  }

  /**
   * Create a plot thread interactively with prompts
   */
  async createInteractive(promptFn: PromptFunction): Promise<string> {
    console.log('Creating plot thread interactively...');

    // Basic information
    const name = await promptFn('Plot thread name:', { required: true });
    const type = await promptFn('Type (main/subplot/character/theme):', {
      default: 'subplot',
    });
    const description = await promptFn('Description:', { required: true });
    const priorityStr = await promptFn('Priority (1-5, 5 is highest):', {
      default: '3',
    });
    const priority = parseInt(priorityStr, 10);

    // Status
    const status = await promptFn('Status (planned/active/resolved/abandoned):', {
      default: 'planned',
    });

    // Themes
    const themesInput = await promptFn('Themes (comma-separated):', {
      required: false,
    });
    const themes = themesInput
      ? themesInput.split(',').map((t: string) => t.trim())
      : undefined;

    // Notes
    const notes = await promptFn('Additional notes:', { required: false });

    // Build plot data
    const plotData: PlotYAML = {
      name,
      type: type as any,
      status: status as any,
      priority: Number(priority),
      description,
      beats: [],
      themes,
      notes,
    };

    // Create the file
    return await this.create(plotData);
  }

  /**
   * Generate a filename from plot name
   */
  generateFilename(name: string): string {
    // Convert to lowercase, replace spaces and special chars with hyphens
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return `${slug}.yml`;
  }

  /**
   * Validate plot data
   */
  validate(plotData: Partial<PlotYAML>): string[] {
    const errors: string[] = [];

    if (!plotData.name || plotData.name.trim().length === 0) {
      errors.push('Missing required field: name');
    }

    if (!plotData.type) {
      errors.push('Missing required field: type');
    } else if (!['main', 'subplot', 'character', 'theme'].includes(plotData.type)) {
      errors.push('Plot type must be: main, subplot, character, or theme');
    }

    if (!plotData.status) {
      errors.push('Missing required field: status');
    } else if (!['planned', 'active', 'resolved', 'abandoned'].includes(plotData.status)) {
      errors.push('Status must be: planned, active, resolved, or abandoned');
    }

    if (plotData.priority !== undefined) {
      if (plotData.priority < 1 || plotData.priority > 5) {
        errors.push('Priority must be between 1 and 5');
      }
    }

    if (!plotData.description || plotData.description.trim().length === 0) {
      errors.push('Missing required field: description');
    }

    return errors;
  }

  /**
   * List all plot files
   */
  async list(): Promise<string[]> {
    if (!existsSync(this.plotsDir)) {
      return [];
    }

    const { readdir } = await import('fs/promises');
    const files = await readdir(this.plotsDir);

    return files
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .filter((f) => !f.startsWith('_')) // Exclude template files
      .map((f) => join(this.plotsDir, f));
  }
}
