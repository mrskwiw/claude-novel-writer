/**
 * Interactive Character Builder
 * Prompts author for input and generates YAML character files
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import YAML from 'yaml';
import type { CharacterYAML } from '../types/novel.js';

export interface CharacterBuilderOptions {
  projectPath: string;
  outputDir?: string; // Default: 'characters'
}

export class CharacterBuilder {
  private projectPath: string;
  private outputDir: string;

  constructor(options: CharacterBuilderOptions) {
    this.projectPath = options.projectPath;
    this.outputDir = options.outputDir || 'characters';
  }

  /**
   * Interactive character creation - prompts for all fields
   */
  async createInteractive(promptFn: PromptFunction): Promise<string> {
    console.log('=== Interactive Character Creation ===\n');

    // Basic Information
    const name = await promptFn('Character name', { required: true });
    const fullName = await promptFn('Full name (optional)', {
      default: name,
    });
    const role = await promptFn(
      'Role (protagonist/antagonist/major/minor/background)',
      {
        required: true,
        validate: (v) =>
          ['protagonist', 'antagonist', 'major', 'minor', 'background'].includes(
            v
          ),
      }
    );
    const summary = await promptFn(
      'Character summary (one paragraph describing their essence)',
      { required: true, multiline: true }
    );

    console.log('\n--- Physical Attributes ---');
    const physical: Record<string, string> = {};

    const addPhysical = await promptFn(
      'Add physical attributes? (yes/no)',
      { default: 'yes' }
    );

    if (addPhysical.toLowerCase() === 'yes') {
      physical.age = await promptFn('Age', {});
      physical.eyeColor = await promptFn('Eye color', {});
      physical.hairColor = await promptFn('Hair color', {});
      physical.height = await promptFn('Height', {});
      physical.build = await promptFn('Build/physique', {});

      // Additional physical traits
      const morePhysical = await promptFn(
        'Add more physical traits? (yes/no)',
        { default: 'no' }
      );

      if (morePhysical.toLowerCase() === 'yes') {
        while (true) {
          const key = await promptFn('Trait name (or empty to finish)', {});
          if (!key) break;

          const value = await promptFn(`Value for ${key}`, {
            required: true,
          });
          physical[key] = value;
        }
      }
    }

    console.log('\n--- Personality Traits ---');
    const personality: Record<string, string> = {};

    const addPersonality = await promptFn(
      'Add personality traits? (yes/no)',
      { default: 'yes' }
    );

    if (addPersonality.toLowerCase() === 'yes') {
      personality.core = await promptFn('Core personality', {
        required: true,
      });
      personality.strengths = await promptFn('Strengths', {});
      personality.flaws = await promptFn('Flaws', {});
      personality.fears = await promptFn('Fears', {});
      personality.desires = await promptFn('Desires/goals', {});
    }

    console.log('\n--- Background ---');
    const background: Record<string, string> = {};

    const addBackground = await promptFn('Add background? (yes/no)', {
      default: 'yes',
    });

    if (addBackground.toLowerCase() === 'yes') {
      background.occupation = await promptFn('Occupation', {});
      background.education = await promptFn('Education', {});
      background.family = await promptFn('Family background', {});
      background.hometown = await promptFn('Hometown', {});
    }

    console.log('\n--- Skills ---');
    const skills: Record<string, string> = {};

    const addSkills = await promptFn('Add skills? (yes/no)', {
      default: 'no',
    });

    if (addSkills.toLowerCase() === 'yes') {
      while (true) {
        const skillName = await promptFn('Skill name (or empty to finish)', {});
        if (!skillName) break;

        const skillDesc = await promptFn(`Description for ${skillName}`, {
          required: true,
        });
        skills[skillName] = skillDesc;
      }
    }

    console.log('\n--- Voice & Speech Patterns ---');
    const voice: CharacterYAML['voice'] = {};

    const addVoice = await promptFn('Add voice/speech patterns? (yes/no)', {
      default: 'yes',
    });

    if (addVoice.toLowerCase() === 'yes') {
      // Patterns
      const patterns: string[] = [];
      console.log('Speech patterns (one per line, empty line to finish):');
      while (true) {
        const pattern = await promptFn('Pattern', {});
        if (!pattern) break;
        patterns.push(pattern);
      }
      if (patterns.length > 0) voice.patterns = patterns;

      // Quirks
      const quirks: string[] = [];
      console.log('Speech quirks (one per line, empty line to finish):');
      while (true) {
        const quirk = await promptFn('Quirk', {});
        if (!quirk) break;
        quirks.push(quirk);
      }
      if (quirks.length > 0) voice.quirks = quirks;

      // Vocabulary
      const vocab = await promptFn('Vocabulary style/description', {});
      if (vocab) voice.vocabulary = vocab;
    }

    console.log('\n--- Character Arc ---');
    const addArc = await promptFn('Add character arc? (yes/no)', {
      default: 'no',
    });

    let arc: CharacterYAML['arc'] = undefined;

    if (addArc.toLowerCase() === 'yes') {
      arc = {
        startingState: await promptFn('Starting state (who they are at the beginning)', {
          required: true,
          multiline: true,
        }),
        endingState: await promptFn('Ending state (who they become)', {
          required: true,
          multiline: true,
        }),
        midpointCrisis: await promptFn(
          'Midpoint crisis (optional - what forces them to change)',
          { multiline: true }
        ),
      };
    }

    console.log('\n--- Additional Notes ---');
    const notes = await promptFn('Additional notes (optional)', {
      multiline: true,
    });

    // Build character object
    const character: CharacterYAML = {
      name,
      fullName: fullName !== name ? fullName : undefined,
      role: role as any,
      summary,
      physical: Object.keys(physical).length > 0 ? physical : undefined,
      personality:
        Object.keys(personality).length > 0 ? personality : undefined,
      background:
        Object.keys(background).length > 0 ? background : undefined,
      skills: Object.keys(skills).length > 0 ? skills : undefined,
      voice: Object.keys(voice).length > 0 ? voice : undefined,
      arc,
      notes: notes || undefined,
    };

    // Generate filename
    const filename = this.generateFilename(name);
    const filePath = await this.writeCharacterFile(character, filename);

    console.log(`\n✓ Character created: ${filePath}`);

    return filePath;
  }

  /**
   * Create character from object (programmatic API - main API for tests)
   */
  async create(character: CharacterYAML, filename?: string): Promise<string> {
    // Ensure characters directory exists
    const dirPath = join(this.projectPath, this.outputDir);
    await mkdir(dirPath, { recursive: true });

    // Generate filename
    const fname = filename || this.generateFilename(character.name);
    const filePath = join(dirPath, fname);

    // Check if file already exists
    const { existsSync } = await import('fs');
    if (existsSync(filePath)) {
      throw new Error(`Character file already exists: ${fname}`);
    }

    return await this.writeCharacterFile(character, fname);
  }

  /**
   * Create character from object (programmatic API - alias for backwards compatibility)
   */
  async createFromObject(
    character: CharacterYAML,
    filename?: string
  ): Promise<string> {
    return await this.create(character, filename);
  }

  /**
   * Validate character data
   */
  validate(characterData: Partial<CharacterYAML>): string[] {
    const errors: string[] = [];

    if (!characterData.name || characterData.name.trim().length === 0) {
      errors.push('Missing required field: name');
    }

    if (!characterData.role) {
      errors.push('Missing required field: role');
    } else if (
      !['protagonist', 'antagonist', 'major', 'minor', 'background'].includes(
        characterData.role
      )
    ) {
      errors.push(
        'Role must be: protagonist, antagonist, major, minor, or background'
      );
    }

    if (!characterData.summary || characterData.summary.trim().length === 0) {
      errors.push('Missing required field: summary');
    }

    return errors;
  }

  /**
   * List all character files
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
      .filter((f) => !f.startsWith('_')) // Exclude template files
      .map((f) => join(dirPath, f));
  }

  /**
   * Write character to YAML file
   */
  private async writeCharacterFile(
    character: CharacterYAML,
    filename: string
  ): Promise<string> {
    // Ensure characters directory exists
    const dirPath = join(this.projectPath, this.outputDir);
    await mkdir(dirPath, { recursive: true });

    // Generate YAML with proper formatting
    const yaml = this.generateYAML(character);

    // Write file
    const filePath = join(dirPath, filename);
    await writeFile(filePath, yaml, 'utf-8');

    return filePath;
  }

  /**
   * Generate properly formatted YAML
   */
  private generateYAML(character: CharacterYAML): string {
    // Custom YAML formatting for readability
    const parts: string[] = [];

    parts.push('# Character Profile');
    parts.push(`# Generated: ${new Date().toISOString()}\n`);

    // Basic info
    parts.push(`name: ${character.name}`);
    if (character.fullName) {
      parts.push(`fullName: ${character.fullName}`);
    }
    parts.push(`role: ${character.role}`);
    parts.push('summary: |');
    parts.push(
      character.summary
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')
    );
    parts.push('');

    // Physical
    if (character.physical) {
      parts.push('# Physical Attributes');
      parts.push('physical:');
      for (const [key, value] of Object.entries(character.physical)) {
        parts.push(`  ${key}: "${value}"`);
      }
      parts.push('');
    }

    // Personality
    if (character.personality) {
      parts.push('# Personality Traits');
      parts.push('personality:');
      for (const [key, value] of Object.entries(character.personality)) {
        parts.push(`  ${key}: "${value}"`);
      }
      parts.push('');
    }

    // Background
    if (character.background) {
      parts.push('# Background Information');
      parts.push('background:');
      for (const [key, value] of Object.entries(character.background)) {
        parts.push(`  ${key}: "${value}"`);
      }
      parts.push('');
    }

    // Skills
    if (character.skills) {
      parts.push('# Skills & Abilities');
      parts.push('skills:');
      for (const [key, value] of Object.entries(character.skills)) {
        parts.push(`  ${key}: "${value}"`);
      }
      parts.push('');
    }

    // Voice
    if (character.voice) {
      parts.push('# Voice & Speech Patterns');
      parts.push('voice:');

      if (character.voice.patterns) {
        parts.push('  patterns:');
        for (const pattern of character.voice.patterns) {
          parts.push(`    - ${pattern}`);
        }
      }

      if (character.voice.quirks) {
        parts.push('  quirks:');
        for (const quirk of character.voice.quirks) {
          parts.push(`    - ${quirk}`);
        }
      }

      if (character.voice.vocabulary) {
        parts.push(`  vocabulary: "${character.voice.vocabulary}"`);
      }
      parts.push('');
    }

    // Relationships
    if (character.relationships && character.relationships.length > 0) {
      parts.push('# Relationships');
      parts.push('relationships:');
      for (const rel of character.relationships) {
        parts.push(`  - character: ${rel.character}`);
        parts.push(`    type: ${rel.type}`);
        parts.push(`    description: "${rel.description}"`);
        parts.push('');
      }
    }

    // Arc
    if (character.arc) {
      parts.push('# Character Arc');
      parts.push('arc:');
      parts.push('  startingState: |');
      parts.push(
        character.arc.startingState
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n')
      );
      parts.push('  endingState: |');
      parts.push(
        character.arc.endingState
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n')
      );
      if (character.arc.midpointCrisis) {
        parts.push('  midpointCrisis: |');
        parts.push(
          character.arc.midpointCrisis
            .split('\n')
            .map((line) => `    ${line}`)
            .join('\n')
        );
      }
      parts.push('');
    }

    // Notes
    if (character.notes) {
      parts.push('# Additional Notes');
      parts.push('notes: |');
      parts.push(
        character.notes
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')
      );
    }

    return parts.join('\n');
  }

  /**
   * Generate safe filename from character name
   */
  generateFilename(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') + '.yml'
    );
  }
}

/**
 * Function type for prompting user
 */
export type PromptFunction = (
  message: string,
  options?: PromptOptions
) => Promise<string>;

export interface PromptOptions {
  required?: boolean;
  default?: string;
  multiline?: boolean;
  validate?: (value: string) => boolean;
}
