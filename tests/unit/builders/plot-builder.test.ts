/**
 * Unit Tests for PlotBuilder
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PlotBuilder } from '../../../project/src/builders/plot-builder.js';
import { getTestProjectPath } from '../../setup.js';
import { readYAMLFile } from '../../helpers/test-utils.js';
import { existsSync } from 'fs';
import type { PlotYAML } from '../../../project/src/types/novel.js';

describe('PlotBuilder', () => {
  let builder: PlotBuilder;
  let projectPath: string;

  beforeEach(() => {
    projectPath = getTestProjectPath();
    builder = new PlotBuilder({ projectPath });
  });

  describe('create()', () => {
    it('should create valid plot YAML file', async () => {
      // Arrange
      const plotData: PlotYAML = {
        name: 'The Mystery',
        type: 'main',
        status: 'active',
        priority: 5,
        description: 'A strange signal from space',
      };

      // Act
      const filePath = await builder.create(plotData);

      // Assert
      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toContain('the-mystery.yml');
    });

    it('should handle plot with beats', async () => {
      // Arrange
      const plotData: PlotYAML = {
        name: 'The Mystery',
        type: 'main',
        status: 'active',
        priority: 5,
        description: 'A strange signal',
        beats: [
          {
            scene: '1.1',
            description: 'Signal detected',
            type: 'setup',
          },
          {
            scene: '5.3',
            description: 'Source found',
            type: 'climax',
          },
        ],
      };

      // Act
      const filePath = await builder.create(plotData);

      // Assert
      const savedData = await readYAMLFile<PlotYAML>(filePath);
      expect(savedData.beats).toBeDefined();
      expect(savedData.beats).toHaveLength(2);
      expect(savedData.beats?.[0].scene).toBe('1.1');
    });

    it('should handle characters array', async () => {
      // Arrange
      const plotData: PlotYAML = {
        name: 'The Mystery',
        type: 'main',
        status: 'active',
        priority: 5,
        description: 'A strange signal',
        characters: [
          {
            name: 'Sarah Chen',
            role: 'protagonist',
            arc: 'Learns to trust',
          },
        ],
      };

      // Act
      const filePath = await builder.create(plotData);

      // Assert
      const savedData = await readYAMLFile<PlotYAML>(filePath);
      expect(savedData.characters).toBeDefined();
      expect(savedData.characters).toHaveLength(1);
      expect(savedData.characters?.[0].name).toBe('Sarah Chen');
    });

    it('should handle themes and dependencies', async () => {
      // Arrange
      const plotData: PlotYAML = {
        name: 'The Mystery',
        type: 'subplot',
        status: 'active',
        priority: 3,
        description: 'A strange signal',
        themes: ['Trust', 'Discovery'],
        dependencies: ['Main plot must resolve first'],
      };

      // Act
      const filePath = await builder.create(plotData);

      // Assert
      const savedData = await readYAMLFile<PlotYAML>(filePath);
      expect(savedData.themes).toEqual(['Trust', 'Discovery']);
      expect(savedData.dependencies).toHaveLength(1);
    });

    it('should throw error if plot file already exists', async () => {
      // Arrange
      const plotData: PlotYAML = {
        name: 'The Mystery',
        type: 'main',
        status: 'active',
        priority: 5,
        description: 'Test',
      };

      // Act
      await builder.create(plotData);

      // Assert
      await expect(builder.create(plotData)).rejects.toThrow(
        'Plot file already exists'
      );
    });
  });

  describe('validate()', () => {
    it('should return empty array for valid plot data', () => {
      // Arrange
      const plotData: PlotYAML = {
        name: 'The Mystery',
        type: 'main',
        status: 'active',
        priority: 5,
        description: 'A strange signal',
      };

      // Act
      const errors = builder.validate(plotData);

      // Assert
      expect(errors).toEqual([]);
    });

    it('should return errors for missing name', () => {
      // Arrange
      const plotData = {
        type: 'main',
        status: 'active',
        priority: 5,
        description: 'Test',
      } as any;

      // Act
      const errors = builder.validate(plotData);

      // Assert
      expect(errors).toContain('Missing required field: name');
    });

    it('should return errors for missing type', () => {
      // Arrange
      const plotData = {
        name: 'The Mystery',
        status: 'active',
        priority: 5,
        description: 'Test',
      } as any;

      // Act
      const errors = builder.validate(plotData);

      // Assert
      expect(errors).toContain('Missing required field: type');
    });

    it('should validate plot type enum', () => {
      // Arrange
      const plotData = {
        name: 'The Mystery',
        type: 'invalid-type',
        status: 'active',
        priority: 5,
        description: 'Test',
      } as any;

      // Act
      const errors = builder.validate(plotData);

      // Assert
      expect(errors.some((e) => e.includes('type'))).toBe(true);
    });

    it('should validate status enum', () => {
      // Arrange
      const plotData = {
        name: 'The Mystery',
        type: 'main',
        status: 'invalid-status',
        priority: 5,
        description: 'Test',
      } as any;

      // Act
      const errors = builder.validate(plotData);

      // Assert
      expect(errors.some((e) => e.toLowerCase().includes('status'))).toBe(true);
    });

    it('should validate priority range (1-5)', () => {
      // Arrange
      const plotData = {
        name: 'The Mystery',
        type: 'main',
        status: 'active',
        priority: 10,
        description: 'Test',
      } as any;

      // Act
      const errors = builder.validate(plotData);

      // Assert
      expect(errors.some((e) => e.toLowerCase().includes('priority'))).toBe(true);
    });
  });

  describe('list()', () => {
    it('should return empty array when no plots exist', async () => {
      // Act
      const files = await builder.list();

      // Assert
      expect(files).toEqual([]);
    });

    it('should return all plot files', async () => {
      // Arrange
      await builder.create({
        name: 'Plot One',
        type: 'main',
        status: 'active',
        priority: 5,
        description: 'First plot',
      });
      await builder.create({
        name: 'Plot Two',
        type: 'subplot',
        status: 'planned',
        priority: 3,
        description: 'Second plot',
      });

      // Act
      const files = await builder.list();

      // Assert
      expect(files).toHaveLength(2);
    });
  });

  describe('generateFilename()', () => {
    it('should convert "The Mystery" to "the-mystery.yml"', () => {
      // Act
      const filename = builder.generateFilename('The Mystery');

      // Assert
      expect(filename).toBe('the-mystery.yml');
    });

    it('should handle special characters', () => {
      // Act
      const filename = builder.generateFilename('Sarah\'s Arc');

      // Assert
      expect(filename).toBe('sarah-s-arc.yml');
    });

    it('should handle multiple spaces', () => {
      // Act
      const filename = builder.generateFilename('The   Big   Mystery');

      // Assert
      expect(filename).toBe('the-big-mystery.yml');
    });
  });
});
