/**
 * World Rules Builder
 * Helps create and manage world rule YAML files
 */

import { join } from 'path';
import { writeFile, mkdir, readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import YAML from 'yaml';
import type { WorldRuleYAML } from '../types/novel.js';

export class WorldRulesBuilder {
  constructor(
    private projectPath: string,
    private outputDir: string = 'world-rules'
  ) {}

  /**
   * Create a new world rule YAML file
   */
  async create(ruleData: WorldRuleYAML, filename?: string): Promise<string> {
    const dirPath = join(this.projectPath, this.outputDir);
    await mkdir(dirPath, { recursive: true });

    const fname = filename || this.generateFilename(ruleData.name);
    const filePath = join(dirPath, fname);

    if (existsSync(filePath)) {
      throw new Error(`World rule file already exists: ${fname}`);
    }

    return await this.writeRuleFile(ruleData, fname);
  }

  /**
   * Generate filename from rule name
   */
  private generateFilename(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${slug}.yml`;
  }

  /**
   * Write world rule data to YAML file
   */
  private async writeRuleFile(
    ruleData: WorldRuleYAML,
    filename: string
  ): Promise<string> {
    const dirPath = join(this.projectPath, this.outputDir);
    await mkdir(dirPath, { recursive: true });

    const filePath = join(dirPath, filename);
    const yamlContent = YAML.stringify(ruleData);

    await writeFile(filePath, yamlContent, 'utf-8');

    console.log(`Created world rule: ${filePath}`);
    return filePath;
  }

  /**
   * Validate world rule data
   */
  validate(ruleData: Partial<WorldRuleYAML>): string[] {
    const errors: string[] = [];

    if (!ruleData.name || ruleData.name.trim().length === 0) {
      errors.push('Missing required field: name');
    }

    if (!ruleData.category) {
      errors.push('Missing required field: category');
    } else if (!['magic', 'technology', 'physics', 'social', 'political'].includes(ruleData.category)) {
      errors.push('Invalid category. Must be: magic, technology, physics, social, or political');
    }

    if (!ruleData.description || ruleData.description.trim().length === 0) {
      errors.push('Missing required field: description');
    }

    // Validate established_in if present
    if (ruleData.established_in) {
      if (ruleData.established_in.chapter && typeof ruleData.established_in.chapter !== 'number') {
        errors.push('established_in.chapter must be a number');
      }
    }

    return errors;
  }

  /**
   * List all world rule files
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
    category: 'magic' | 'technology' | 'physics' | 'social' | 'political';
    description: string;
    limitations?: string;
    is_hard_rule?: boolean;
  }): Promise<string> {
    const ruleData: WorldRuleYAML = {
      name: options.name,
      category: options.category,
      description: options.description,
      limitations: options.limitations,
      is_hard_rule: options.is_hard_rule !== undefined ? options.is_hard_rule : true,
    };

    const errors = this.validate(ruleData);
    if (errors.length > 0) {
      throw new Error(`Validation failed:\n${errors.join('\n')}`);
    }

    return await this.create(ruleData);
  }

  /**
   * Add an example to existing world rule
   */
  async addExample(
    ruleFilePath: string,
    example: string
  ): Promise<void> {
    const content = await readFile(ruleFilePath, 'utf-8');
    const ruleData = YAML.parse(content) as WorldRuleYAML;

    if (!ruleData.examples) {
      ruleData.examples = [];
    }

    ruleData.examples.push(example);

    const yamlContent = YAML.stringify(ruleData);
    await writeFile(ruleFilePath, yamlContent, 'utf-8');

    console.log(`Added example to world rule: ${ruleFilePath}`);
  }

  /**
   * Add an exception to existing world rule
   */
  async addException(
    ruleFilePath: string,
    exception: string
  ): Promise<void> {
    const content = await readFile(ruleFilePath, 'utf-8');
    const ruleData = YAML.parse(content) as WorldRuleYAML;

    if (!ruleData.exceptions) {
      ruleData.exceptions = [];
    }

    ruleData.exceptions.push(exception);

    const yamlContent = YAML.stringify(ruleData);
    await writeFile(ruleFilePath, yamlContent, 'utf-8');

    console.log(`Added exception to world rule: ${ruleFilePath}`);
  }

  /**
   * Update world rule limitations
   */
  async updateLimitations(
    ruleFilePath: string,
    limitations: string
  ): Promise<void> {
    const content = await readFile(ruleFilePath, 'utf-8');
    const ruleData = YAML.parse(content) as WorldRuleYAML;

    ruleData.limitations = limitations;

    const yamlContent = YAML.stringify(ruleData);
    await writeFile(ruleFilePath, yamlContent, 'utf-8');

    console.log(`Updated limitations for world rule: ${ruleFilePath}`);
  }

  /**
   * Mark where rule was established
   */
  async markEstablished(
    ruleFilePath: string,
    chapter?: number,
    scene?: string,
    quote?: string
  ): Promise<void> {
    const content = await readFile(ruleFilePath, 'utf-8');
    const ruleData = YAML.parse(content) as WorldRuleYAML;

    ruleData.established_in = {
      chapter,
      scene,
      quote,
    };

    const yamlContent = YAML.stringify(ruleData);
    await writeFile(ruleFilePath, yamlContent, 'utf-8');

    console.log(`Marked establishment point for world rule: ${ruleFilePath}`);
  }

  /**
   * Toggle hard rule status
   */
  async toggleHardRule(
    ruleFilePath: string
  ): Promise<boolean> {
    const content = await readFile(ruleFilePath, 'utf-8');
    const ruleData = YAML.parse(content) as WorldRuleYAML;

    ruleData.is_hard_rule = !ruleData.is_hard_rule;

    const yamlContent = YAML.stringify(ruleData);
    await writeFile(ruleFilePath, yamlContent, 'utf-8');

    console.log(`Toggled hard rule status to: ${ruleData.is_hard_rule}`);
    return ruleData.is_hard_rule;
  }

  /**
   * Get world rules statistics
   */
  async getStats(): Promise<{
    totalRules: number;
    byCategory: Record<string, number>;
    hardRules: number;
    flexibleRules: number;
    withLimitations: number;
    withExamples: number;
    withExceptions: number;
    established: number;
  }> {
    const files = await this.list();

    const stats = {
      totalRules: files.length,
      byCategory: {} as Record<string, number>,
      hardRules: 0,
      flexibleRules: 0,
      withLimitations: 0,
      withExamples: 0,
      withExceptions: 0,
      established: 0,
    };

    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const rule = YAML.parse(content) as WorldRuleYAML;

      // Count by category
      stats.byCategory[rule.category] = (stats.byCategory[rule.category] || 0) + 1;

      // Count hard vs flexible
      if (rule.is_hard_rule) {
        stats.hardRules++;
      } else {
        stats.flexibleRules++;
      }

      // Count rules with limitations
      if (rule.limitations) {
        stats.withLimitations++;
      }

      // Count rules with examples
      if (rule.examples && rule.examples.length > 0) {
        stats.withExamples++;
      }

      // Count rules with exceptions
      if (rule.exceptions && rule.exceptions.length > 0) {
        stats.withExceptions++;
      }

      // Count established rules
      if (rule.established_in) {
        stats.established++;
      }
    }

    return stats;
  }

  /**
   * Get rules by category
   */
  async getRulesByCategory(
    category: 'magic' | 'technology' | 'physics' | 'social' | 'political'
  ): Promise<Array<{ name: string; path: string; description: string }>> {
    const files = await this.list();
    const rules: Array<{ name: string; path: string; description: string }> = [];

    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const rule = YAML.parse(content) as WorldRuleYAML;

      if (rule.category === category) {
        rules.push({
          name: rule.name,
          path: file,
          description: rule.description,
        });
      }
    }

    return rules;
  }

  /**
   * Get hard rules (must never violate)
   */
  async getHardRules(): Promise<Array<{ name: string; path: string; category: string }>> {
    const files = await this.list();
    const hardRules: Array<{ name: string; path: string; category: string }> = [];

    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const rule = YAML.parse(content) as WorldRuleYAML;

      if (rule.is_hard_rule) {
        hardRules.push({
          name: rule.name,
          path: file,
          category: rule.category,
        });
      }
    }

    return hardRules;
  }
}
