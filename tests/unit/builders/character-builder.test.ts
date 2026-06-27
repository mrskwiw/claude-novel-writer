/**
 * Unit Tests for CharacterBuilder
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CharacterBuilder } from '../../../project/src/builders/character-builder.js';
import { getTestProjectPath } from '../../setup.js';
import { readYAMLFile } from '../../helpers/test-utils.js';
import { existsSync } from 'fs';
import { join } from 'path';
import type { CharacterYAML } from '../../../project/src/types/novel.js';

describe('CharacterBuilder', () => {
  let builder: CharacterBuilder;
  let projectPath: string;

  beforeEach(() => {
    projectPath = getTestProjectPath();
    builder = new CharacterBuilder({ projectPath });
  });

  describe('create()', () => {
    it('should create valid character YAML file', async () => {
      // Arrange
      const characterData: CharacterYAML = {
        name: 'Sarah Chen',
        role: 'protagonist',
        summary: 'A brilliant scientist',
      };

      // Act
      const filePath = await builder.create(characterData);

      // Assert
      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toContain('sarah-chen.yml');
    });

    it('should generate correct filename from character name', async () => {
      // Arrange
      const characterData: CharacterYAML = {
        name: 'Dr. James O\'Brien',
        role: 'major',
        summary: 'Test character',
      };

      // Act
      const filePath = await builder.create(characterData);

      // Assert
      expect(filePath).toContain('dr-james-o-brien.yml');
    });

    it('should throw error if character file already exists', async () => {
      // Arrange
      const characterData: CharacterYAML = {
        name: 'Sarah Chen',
        role: 'protagonist',
        summary: 'A brilliant scientist',
      };

      // Act
      await builder.create(characterData);

      // Assert
      await expect(builder.create(characterData)).rejects.toThrow(
        'Character file already exists'
      );
    });

    it('should handle optional physical attributes', async () => {
      // Arrange
      const characterData: CharacterYAML = {
        name: 'Sarah Chen',
        role: 'protagonist',
        summary: 'A brilliant scientist',
        physical: {
          age: '32',
          hair: 'brown',
          eyes: 'brown',
        },
      };

      // Act
      const filePath = await builder.create(characterData);

      // Assert
      const savedData = await readYAMLFile<CharacterYAML>(filePath);
      expect(savedData.physical).toBeDefined();
      expect(savedData.physical?.age).toBe('32');
    });

    it('should handle optional personality traits', async () => {
      // Arrange
      const characterData: CharacterYAML = {
        name: 'Sarah Chen',
        role: 'protagonist',
        summary: 'A brilliant scientist',
        personality: {
          traits: 'Curious and determined',
          fears: 'Failure',
        },
      };

      // Act
      const filePath = await builder.create(characterData);

      // Assert
      const savedData = await readYAMLFile<CharacterYAML>(filePath);
      expect(savedData.personality).toBeDefined();
      expect(savedData.personality?.traits).toBe('Curious and determined');
    });

    it('should handle character arc', async () => {
      // Arrange
      const characterData: CharacterYAML = {
        name: 'Sarah Chen',
        role: 'protagonist',
        summary: 'A brilliant scientist',
        arc: {
          startingState: 'Isolated',
          endingState: 'Connected',
        },
      };

      // Act
      const filePath = await builder.create(characterData);

      // Assert
      const savedData = await readYAMLFile<CharacterYAML>(filePath);
      expect(savedData.arc).toBeDefined();
      expect(savedData.arc?.startingState?.trim()).toBe('Isolated');
    });
  });

  describe('validate()', () => {
    it('should return empty array for valid character data', () => {
      // Arrange
      const characterData: CharacterYAML = {
        name: 'Sarah Chen',
        role: 'protagonist',
        summary: 'A brilliant scientist',
      };

      // Act
      const errors = builder.validate(characterData);

      // Assert
      expect(errors).toEqual([]);
    });

    it('should return errors for missing name', () => {
      // Arrange
      const characterData = {
        role: 'protagonist',
        summary: 'A brilliant scientist',
      } as any;

      // Act
      const errors = builder.validate(characterData);

      // Assert
      expect(errors).toContain('Missing required field: name');
    });

    it('should return errors for missing role', () => {
      // Arrange
      const characterData = {
        name: 'Sarah Chen',
        summary: 'A brilliant scientist',
      } as any;

      // Act
      const errors = builder.validate(characterData);

      // Assert
      expect(errors).toContain('Missing required field: role');
    });

    it('should return errors for missing summary', () => {
      // Arrange
      const characterData = {
        name: 'Sarah Chen',
        role: 'protagonist',
      } as any;

      // Act
      const errors = builder.validate(characterData);

      // Assert
      expect(errors).toContain('Missing required field: summary');
    });

    it('should validate role enum values', () => {
      // Arrange
      const characterData = {
        name: 'Sarah Chen',
        role: 'invalid-role',
        summary: 'A brilliant scientist',
      } as any;

      // Act
      const errors = builder.validate(characterData);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.toLowerCase().includes('role'))).toBe(true);
    });
  });

  describe('list()', () => {
    it('should return empty array when no characters exist', async () => {
      // Act
      const files = await builder.list();

      // Assert
      expect(files).toEqual([]);
    });

    it('should return all character files in directory', async () => {
      // Arrange
      await builder.create({
        name: 'Sarah Chen',
        role: 'protagonist',
        summary: 'Scientist',
      });
      await builder.create({
        name: 'Alex Rivers',
        role: 'major',
        summary: 'Engineer',
      });

      // Act
      const files = await builder.list();

      // Assert
      expect(files).toHaveLength(2);
      expect(files.some((f) => f.includes('sarah-chen.yml'))).toBe(true);
      expect(files.some((f) => f.includes('alex-rivers.yml'))).toBe(true);
    });

    it('should exclude template files (starting with _)', async () => {
      // Arrange
      const { writeFile } = await import('fs/promises');
      const templatePath = join(
        projectPath,
        'characters',
        '_template.yml'
      );
      await writeFile(templatePath, 'name: Template');

      await builder.create({
        name: 'Sarah Chen',
        role: 'protagonist',
        summary: 'Scientist',
      });

      // Act
      const files = await builder.list();

      // Assert
      expect(files).toHaveLength(1);
      expect(files.some((f) => f.includes('_template'))).toBe(false);
    });
  });

  describe('generateFilename()', () => {
    it('should convert "Sarah Chen" to "sarah-chen.yml"', () => {
      // Act
      const filename = builder.generateFilename('Sarah Chen');

      // Assert
      expect(filename).toBe('sarah-chen.yml');
    });

    it('should handle special characters', () => {
      // Act
      const filename = builder.generateFilename("O'Brien");

      // Assert
      expect(filename).toBe('o-brien.yml');
    });

    it('should handle multiple spaces', () => {
      // Act
      const filename = builder.generateFilename('Dr.   Sarah    Chen');

      // Assert
      expect(filename).toBe('dr-sarah-chen.yml');
    });

    it('should handle leading/trailing hyphens', () => {
      // Act
      const filename = builder.generateFilename('  Sarah Chen  ');

      // Assert
      expect(filename).not.toMatch(/^-/);
      expect(filename).not.toMatch(/-\.yml$/);
    });
  });
});
