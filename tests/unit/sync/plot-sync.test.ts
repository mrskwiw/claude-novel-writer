/**
 * Unit Tests for PlotSync
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlotSync } from '../../../project/src/sync/plot-sync.js';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { createTestPlotFile } from '../../helpers/test-utils.js';
import { getTestProjectPath } from '../../setup.js';

describe('PlotSync', () => {
  let sync: PlotSync;
  let mockClient: MockMCPClient;
  let projectPath: string;
  const projectId = 1;

  beforeEach(() => {
    projectPath = getTestProjectPath();
    mockClient = new MockMCPClient();
    sync = new PlotSync(mockClient, projectId);
  });

  describe('syncPlotFile()', () => {
    it('should insert new plot into database', async () => {
      // Arrange
      const filePath = await createTestPlotFile(projectPath, 'The Mystery', {
        type: 'main',
        status: 'active',
        priority: 5,
        description: 'A strange signal',
      });

      // Spy on writeQuery
      const writeQuerySpy = vi.spyOn(mockClient, 'writeQuery');

      // Act
      await sync.syncPlotFile(filePath);

      // Assert
      expect(writeQuerySpy).toHaveBeenCalled();
      expect(mockClient.getRecordCount('plot_threads')).toBeGreaterThan(0);
    });

    it('should sync plot with beats to database', async () => {
      // Arrange
      const filePath = await createTestPlotFile(projectPath, 'The Mystery', {
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
            scene: '3.5',
            description: 'Source found',
            type: 'climax',
          },
        ],
      });

      // Act
      await sync.syncPlotFile(filePath);

      // Assert
      expect(mockClient.getRecordCount('plot_threads')).toBe(1);
      // Note: In real implementation, would check plot_beats table
    });

    it('should throw error for invalid YAML', async () => {
      // Arrange
      const { writeFile } = await import('fs/promises');
      const { join } = await import('path');
      const filePath = join(projectPath, 'plots', 'invalid.yml');
      await writeFile(filePath, 'invalid: yaml: content:');

      // Act & Assert
      await expect(sync.syncPlotFile(filePath)).rejects.toThrow();
    });

    it('should throw error for missing required fields', async () => {
      // Arrange
      const { writeFile } = await import('fs/promises');
      const { join } = await import('path');
      const filePath = join(projectPath, 'plots', 'incomplete.yml');
      await writeFile(filePath, 'description: "Missing name and type"');

      // Act & Assert
      await expect(sync.syncPlotFile(filePath)).rejects.toThrow(
        'missing required'
      );
    });

    it('should update existing plot in database', async () => {
      // Arrange
      const filePath = await createTestPlotFile(projectPath, 'The Mystery', {
        type: 'main',
        status: 'active',
        priority: 5,
        description: 'Original description',
      });

      // First sync
      await sync.syncPlotFile(filePath);
      const initialCount = mockClient.getRecordCount('plot_threads');

      // Modify file
      const { writeFile } = await import('fs/promises');
      const { readFile } = await import('fs/promises');
      const YAML = await import('yaml');
      const content = await readFile(filePath, 'utf-8');
      const plot = YAML.parse(content);
      plot.description = 'Updated description';
      plot.priority = 4;
      await writeFile(filePath, YAML.stringify(plot));

      // Act - Second sync (should update)
      await sync.syncPlotFile(filePath);

      // Assert
      expect(mockClient.getRecordCount('plot_threads')).toBe(initialCount);
    });
  });

  describe('syncAllPlots()', () => {
    it('should sync multiple plot files', async () => {
      // Arrange
      const { join } = await import('path');
      const plotsDir = join(projectPath, 'plots');

      await createTestPlotFile(projectPath, 'Plot One', {
        type: 'main',
        status: 'active',
        priority: 5,
        description: 'First plot',
      });

      await createTestPlotFile(projectPath, 'Plot Two', {
        type: 'subplot',
        status: 'planned',
        priority: 3,
        description: 'Second plot',
      });

      // Act
      await sync.syncAllPlots(plotsDir);

      // Assert
      expect(mockClient.getRecordCount('plot_threads')).toBe(2);
    });

    it('should skip template files', async () => {
      // Arrange
      const { join } = await import('path');
      const { writeFile } = await import('fs/promises');
      const plotsDir = join(projectPath, 'plots');

      // Create regular plot
      await createTestPlotFile(projectPath, 'Plot One', {
        type: 'main',
        status: 'active',
        priority: 5,
        description: 'First plot',
      });

      // Create template file (should be skipped)
      const templatePath = join(plotsDir, '_template.yml');
      await writeFile(
        templatePath,
        'name: "Template"\ntype: main\nstatus: planned\npriority: 3\ndescription: "Template"'
      );

      // Act
      await sync.syncAllPlots(plotsDir);

      // Assert
      expect(mockClient.getRecordCount('plot_threads')).toBe(1);
    });

    it('should continue on individual file errors', async () => {
      // Arrange
      const { join } = await import('path');
      const { writeFile } = await import('fs/promises');
      const plotsDir = join(projectPath, 'plots');

      // Valid plot
      await createTestPlotFile(projectPath, 'Valid Plot', {
        type: 'main',
        status: 'active',
        priority: 5,
        description: 'Valid plot',
      });

      // Invalid plot (missing required fields)
      const invalidPath = join(plotsDir, 'invalid.yml');
      await writeFile(invalidPath, 'description: "Invalid - missing name"');

      // Act
      await sync.syncAllPlots(plotsDir);

      // Assert - Should have synced the valid plot despite invalid one
      expect(mockClient.getRecordCount('plot_threads')).toBeGreaterThan(0);
    });
  });
});
