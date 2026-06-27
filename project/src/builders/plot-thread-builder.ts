/**
 * Plot Thread Builder
 * Helps create and manage plot thread YAML files
 */

import { join } from 'path';
import { writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import YAML from 'yaml';
import type { PlotYAML } from '../types/novel.js';

export class PlotThreadBuilder {
  constructor(
    private projectPath: string,
    private outputDir: string = 'plots'
  ) {}

  /**
   * Create a new plot thread YAML file
   */
  async create(plotData: PlotYAML, filename?: string): Promise<string> {
    const dirPath = join(this.projectPath, this.outputDir);
    await mkdir(dirPath, { recursive: true });

    const fname = filename || this.generateFilename(plotData.name);
    const filePath = join(dirPath, fname);

    if (existsSync(filePath)) {
      throw new Error(`Plot thread file already exists: ${fname}`);
    }

    return await this.writePlotFile(plotData, fname);
  }

  /**
   * Generate filename from plot thread name
   */
  private generateFilename(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${slug}.yml`;
  }

  /**
   * Write plot thread data to YAML file
   */
  private async writePlotFile(
    plotData: PlotYAML,
    filename: string
  ): Promise<string> {
    const dirPath = join(this.projectPath, this.outputDir);
    await mkdir(dirPath, { recursive: true });

    const filePath = join(dirPath, filename);
    const yamlContent = YAML.stringify(plotData);

    await writeFile(filePath, yamlContent, 'utf-8');

    console.log(`Created plot thread: ${filePath}`);
    return filePath;
  }

  /**
   * Validate plot thread data
   */
  validate(plotData: Partial<PlotYAML>): string[] {
    const errors: string[] = [];

    if (!plotData.name || plotData.name.trim().length === 0) {
      errors.push('Missing required field: name');
    }

    if (!plotData.type) {
      errors.push('Missing required field: type');
    } else if (!['main', 'subplot', 'character', 'theme'].includes(plotData.type)) {
      errors.push('Invalid type. Must be: main, subplot, character, or theme');
    }

    if (!plotData.status) {
      errors.push('Missing required field: status');
    } else if (!['planned', 'active', 'resolved', 'abandoned'].includes(plotData.status)) {
      errors.push('Invalid status. Must be: planned, active, resolved, or abandoned');
    }

    if (plotData.priority === undefined || plotData.priority === null) {
      errors.push('Missing required field: priority');
    } else if (typeof plotData.priority !== 'number' || plotData.priority < 1 || plotData.priority > 10) {
      errors.push('Priority must be a number between 1 and 10');
    }

    if (!plotData.description || plotData.description.trim().length === 0) {
      errors.push('Missing required field: description');
    }

    // Validate beats if present
    if (plotData.beats) {
      plotData.beats.forEach((beat, idx) => {
        if (!beat.scene || beat.scene.trim().length === 0) {
          errors.push(`Beat ${idx + 1}: missing scene reference`);
        }
        if (!beat.description || beat.description.trim().length === 0) {
          errors.push(`Beat ${idx + 1}: missing description`);
        }
        if (!beat.type || !['setup', 'development', 'climax', 'resolution'].includes(beat.type)) {
          errors.push(`Beat ${idx + 1}: invalid type (must be setup, development, climax, or resolution)`);
        }
      });
    }

    // Validate characters if present
    if (plotData.characters) {
      plotData.characters.forEach((char, idx) => {
        if (!char.name || char.name.trim().length === 0) {
          errors.push(`Character ${idx + 1}: missing name`);
        }
        if (!char.role || char.role.trim().length === 0) {
          errors.push(`Character ${idx + 1}: missing role`);
        }
      });
    }

    return errors;
  }

  /**
   * List all plot thread files
   */
  async list(): Promise<string[]> {
    const dirPath = join(this.projectPath, this.outputDir);

    if (!existsSync(dirPath)) {
      return [];
    }

    const files = await readdir(dirPath);

    return files
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map((f) => join(dirPath, f));
  }

  /**
   * Interactive creation helper
   */
  async createInteractive(options: {
    name: string;
    type: 'main' | 'subplot' | 'character' | 'theme';
    description: string;
    priority?: number;
    status?: 'planned' | 'active' | 'resolved' | 'abandoned';
  }): Promise<string> {
    const plotData: PlotYAML = {
      name: options.name,
      type: options.type,
      status: options.status || 'planned',
      priority: options.priority || 5,
      description: options.description,
    };

    const errors = this.validate(plotData);
    if (errors.length > 0) {
      throw new Error(`Validation failed:\n${errors.join('\n')}`);
    }

    return await this.create(plotData);
  }

  /**
   * Create a plot thread with beats
   */
  async createWithBeats(
    plotData: Omit<PlotYAML, 'beats'>,
    beats: Array<{
      scene: string;
      description: string;
      type: 'setup' | 'development' | 'climax' | 'resolution';
    }>
  ): Promise<string> {
    const fullPlotData: PlotYAML = {
      ...plotData,
      beats,
    };

    const errors = this.validate(fullPlotData);
    if (errors.length > 0) {
      throw new Error(`Validation failed:\n${errors.join('\n')}`);
    }

    return await this.create(fullPlotData);
  }

  /**
   * Add a beat to existing plot thread
   */
  async addBeat(
    plotFilePath: string,
    beat: {
      scene: string;
      description: string;
      type: 'setup' | 'development' | 'climax' | 'resolution';
    }
  ): Promise<void> {
    const { readFile } = await import('fs/promises');
    const content = await readFile(plotFilePath, 'utf-8');
    const plotData = YAML.parse(content) as PlotYAML;

    if (!plotData.beats) {
      plotData.beats = [];
    }

    plotData.beats.push(beat);

    const yamlContent = YAML.stringify(plotData);
    await writeFile(plotFilePath, yamlContent, 'utf-8');

    console.log(`Added beat to plot thread: ${plotFilePath}`);
  }

  /**
   * Update plot thread status
   */
  async updateStatus(
    plotFilePath: string,
    status: 'planned' | 'active' | 'resolved' | 'abandoned'
  ): Promise<void> {
    const { readFile } = await import('fs/promises');
    const content = await readFile(plotFilePath, 'utf-8');
    const plotData = YAML.parse(content) as PlotYAML;

    plotData.status = status;

    const yamlContent = YAML.stringify(plotData);
    await writeFile(plotFilePath, yamlContent, 'utf-8');

    console.log(`Updated plot thread status to: ${status}`);
  }

  /**
   * Link character to plot thread
   */
  async linkCharacter(
    plotFilePath: string,
    characterName: string,
    role: string,
    arc?: string
  ): Promise<void> {
    const { readFile } = await import('fs/promises');
    const content = await readFile(plotFilePath, 'utf-8');
    const plotData = YAML.parse(content) as PlotYAML;

    if (!plotData.characters) {
      plotData.characters = [];
    }

    // Check if character already linked
    const existing = plotData.characters.find((c) => c.name === characterName);
    if (existing) {
      throw new Error(`Character ${characterName} already linked to this plot thread`);
    }

    plotData.characters.push({ name: characterName, role, arc });

    const yamlContent = YAML.stringify(plotData);
    await writeFile(plotFilePath, yamlContent, 'utf-8');

    console.log(`Linked character ${characterName} to plot thread`);
  }

  /**
   * Get plot thread statistics
   */
  async getStats(): Promise<{
    totalThreads: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    totalBeats: number;
    unresolvedThreads: number;
    highPriorityUnresolved: number;
  }> {
    const files = await this.list();
    const { readFile } = await import('fs/promises');

    const stats = {
      totalThreads: files.length,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      totalBeats: 0,
      unresolvedThreads: 0,
      highPriorityUnresolved: 0,
    };

    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const plot = YAML.parse(content) as PlotYAML;

      // Count by type
      stats.byType[plot.type] = (stats.byType[plot.type] || 0) + 1;

      // Count by status
      stats.byStatus[plot.status] = (stats.byStatus[plot.status] || 0) + 1;

      // Count beats
      if (plot.beats) {
        stats.totalBeats += plot.beats.length;
      }

      // Count unresolved
      if (plot.status !== 'resolved' && plot.status !== 'abandoned') {
        stats.unresolvedThreads++;
        if (plot.priority >= 7) {
          stats.highPriorityUnresolved++;
        }
      }
    }

    return stats;
  }
}
