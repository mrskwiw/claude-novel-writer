/**
 * Interactive Location Builder
 * Prompts author for input and generates YAML location files
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { LocationYAML } from '../types/novel.js';
import type { PromptFunction, PromptOptions } from './character-builder.js';

export interface LocationBuilderOptions {
  projectPath: string;
  outputDir?: string; // Default: 'world'
}

export class LocationBuilder {
  private projectPath: string;
  private outputDir: string;

  constructor(options: LocationBuilderOptions) {
    this.projectPath = options.projectPath;
    this.outputDir = options.outputDir || 'world';
  }

  /**
   * Interactive location creation - prompts for all fields
   */
  async createInteractive(promptFn: PromptFunction): Promise<string> {
    console.log('=== Interactive Location Creation ===\n');

    // Basic Information
    const name = await promptFn('Location name', { required: true });

    const type = await promptFn(
      'Location type (city/building/room/country/planet/etc)',
      {}
    );

    const parentLocation = await promptFn(
      'Parent location (optional - e.g., "Earth" for "New York")',
      {}
    );

    const description = await promptFn(
      'Description (what does it look like? what\'s the atmosphere?)',
      { required: true, multiline: true }
    );

    console.log('\n--- Detailed Attributes ---');
    const details: Record<string, string> = {};

    const addDetails = await promptFn('Add detailed attributes? (yes/no)', {
      default: 'yes',
    });

    if (addDetails.toLowerCase() === 'yes') {
      details.size = await promptFn('Size/scale', {});
      details.population = await promptFn('Population (if applicable)', {});
      details.climate = await promptFn('Climate/weather', {});
      details.architecture = await promptFn('Architecture style', {});
      details.atmosphere = await promptFn('Atmosphere/feel', {});

      // Additional details
      const moreDetails = await promptFn(
        'Add more custom details? (yes/no)',
        { default: 'no' }
      );

      if (moreDetails.toLowerCase() === 'yes') {
        while (true) {
          const key = await promptFn('Detail name (or empty to finish)', {});
          if (!key) break;

          const value = await promptFn(`Value for ${key}`, {
            required: true,
          });
          details[key] = value;
        }
      }
    }

    console.log('\n--- Location-Specific Rules ---');
    const rules: string[] = [];

    const addRules = await promptFn(
      'Add location rules/constraints? (yes/no)',
      { default: 'no' }
    );

    if (addRules.toLowerCase() === 'yes') {
      console.log(
        'Enter rules one at a time (e.g., "No technology works here", "Must speak quietly")'
      );
      while (true) {
        const rule = await promptFn('Rule (or empty to finish)', {});
        if (!rule) break;
        rules.push(rule);
      }
    }

    console.log('\n--- Additional Information ---');

    const firstAppearance = await promptFn(
      'First appearance (chapter/scene where introduced)',
      {}
    );

    const notes = await promptFn('Additional notes (optional)', {
      multiline: true,
    });

    // Build location object
    const location: LocationYAML = {
      name,
      type: type || undefined,
      parentLocation: parentLocation || undefined,
      description,
      details: Object.keys(details).length > 0 ? details : undefined,
      rules: rules.length > 0 ? rules : undefined,
      firstAppearance: firstAppearance || undefined,
      notes: notes || undefined,
    };

    // Generate filename
    const filename = this.generateFilename(name);
    const filePath = await this.writeLocationFile(location, filename);

    console.log(`\n✓ Location created: ${filePath}`);

    return filePath;
  }

  /**
   * Create location from object (programmatic API)
   */
  async createFromObject(
    location: LocationYAML,
    filename?: string
  ): Promise<string> {
    const fname = filename || this.generateFilename(location.name);
    return await this.writeLocationFile(location, fname);
  }

  /**
   * Write location to YAML file
   */
  private async writeLocationFile(
    location: LocationYAML,
    filename: string
  ): Promise<string> {
    // Ensure world directory exists
    const dirPath = join(this.projectPath, this.outputDir);
    await mkdir(dirPath, { recursive: true });

    // Generate YAML with proper formatting
    const yaml = this.generateYAML(location);

    // Write file
    const filePath = join(dirPath, filename);
    await writeFile(filePath, yaml, 'utf-8');

    return filePath;
  }

  /**
   * Generate properly formatted YAML
   */
  private generateYAML(location: LocationYAML): string {
    const parts: string[] = [];

    parts.push('# Location Profile');
    parts.push(`# Generated: ${new Date().toISOString()}\n`);

    // Basic info
    parts.push(`name: ${location.name}`);

    if (location.type) {
      parts.push(`type: ${location.type}`);
    }

    if (location.parentLocation) {
      parts.push(`parentLocation: ${location.parentLocation}`);
    }

    parts.push('description: |');
    parts.push(
      location.description
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')
    );
    parts.push('');

    // Details
    if (location.details) {
      parts.push('# Detailed Attributes');
      parts.push('details:');
      for (const [key, value] of Object.entries(location.details)) {
        parts.push(`  ${key}: "${value}"`);
      }
      parts.push('');
    }

    // Rules
    if (location.rules && location.rules.length > 0) {
      parts.push('# Location-Specific Rules');
      parts.push('rules:');
      for (const rule of location.rules) {
        parts.push(`  - ${rule}`);
      }
      parts.push('');
    }

    // First appearance
    if (location.firstAppearance) {
      parts.push('# First Appearance');
      parts.push(`firstAppearance: ${location.firstAppearance}`);
      parts.push('');
    }

    // Notes
    if (location.notes) {
      parts.push('# Additional Notes');
      parts.push('notes: |');
      parts.push(
        location.notes
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')
      );
    }

    return parts.join('\n');
  }

  /**
   * Create location from object (programmatic API - main API)
   */
  async create(location: LocationYAML, filename?: string): Promise<string> {
    // Ensure world directory exists
    const dirPath = join(this.projectPath, this.outputDir);
    await mkdir(dirPath, { recursive: true });

    // Generate filename
    const fname = filename || this.generateFilename(location.name);
    const filePath = join(dirPath, fname);

    // Check if file already exists
    const { existsSync } = await import('fs');
    if (existsSync(filePath)) {
      throw new Error(`Location file already exists: ${fname}`);
    }

    return await this.writeLocationFile(location, fname);
  }

  /**
   * Validate location data
   */
  validate(locationData: Partial<LocationYAML>): string[] {
    const errors: string[] = [];

    if (!locationData.name || locationData.name.trim().length === 0) {
      errors.push('Missing required field: name');
    }

    if (!locationData.description || locationData.description.trim().length === 0) {
      errors.push('Missing required field: description');
    }

    return errors;
  }

  /**
   * List all location files
   */
  async list(): Promise<string[]> {
    const dirPath = join(this.projectPath, this.outputDir);
    const { existsSync } = await import('fs');

    if (!existsSync(dirPath)) {
      return [];
    }

    const { readdir } = await import('fs/promises');
    const files = await readdir(dirPath);

    return files
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map((f) => join(dirPath, f));
  }

  /**
   * Generate safe filename from location name
   */
  private generateFilename(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') + '.yml'
    );
  }
}
