/**
 * Unit Tests for LocationSync
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import YAML from 'yaml';
import { LocationSync } from '../../../project/src/sync/location-sync.js';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { createTestLocationFile } from '../../helpers/test-utils.js';
import { getTestProjectPath } from '../../setup.js';
import type { LocationYAML } from '../../../project/src/types/novel.js';

describe('LocationSync', () => {
  let sync: LocationSync;
  let mockClient: MockMCPClient;
  let projectPath: string;
  const projectId = 1;

  beforeEach(() => {
    projectPath = getTestProjectPath();
    mockClient = new MockMCPClient();
    sync = new LocationSync(mockClient, projectId, projectPath);
  });

  // ─── syncLocationFile ─────────────────────────────────────────────────────

  describe('syncLocationFile()', () => {
    it('should insert a new location into the database', async () => {
      const filePath = await createTestLocationFile(projectPath, 'The Library', {
        description: 'A vast library',
        type: 'interior',
      });

      await sync.syncLocationFile(filePath);

      expect(mockClient.getRecordCount('locations')).toBe(1);
      const rows = mockClient.getTableData('locations');
      expect(rows[0].name).toBe('The Library');
    });

    it('should update an existing location on second sync', async () => {
      const filePath = await createTestLocationFile(projectPath, 'The Library', {
        description: 'First description',
      });

      // First sync – inserts
      await sync.syncLocationFile(filePath);
      expect(mockClient.getRecordCount('locations')).toBe(1);

      // Overwrite file, second sync – should update, not insert
      const location: LocationYAML = { name: 'The Library', description: 'Updated description' };
      await writeFile(filePath, YAML.stringify(location));

      await sync.syncLocationFile(filePath);
      expect(mockClient.getRecordCount('locations')).toBe(1);
    });

    it('should throw when the file is missing required name field', async () => {
      const locationsDir = join(projectPath, 'locations');
      await mkdir(locationsDir, { recursive: true });
      const filePath = join(locationsDir, 'bad.yml');
      await writeFile(filePath, 'description: "Missing name"');

      await expect(sync.syncLocationFile(filePath)).rejects.toThrow("missing required 'name' field");
    });

    it('should resolve parentLocation ID when parent exists', async () => {
      // Seed parent location in DB
      mockClient.seed('locations', [
        { id: 10, project_id: projectId, name: 'City', location_type: null, description: 'A city' },
      ]);

      const filePath = await createTestLocationFile(projectPath, 'Library', {
        description: 'In the city',
        parentLocation: 'City',
      });

      await sync.syncLocationFile(filePath);

      const rows = mockClient.getTableData('locations');
      // The newly inserted row should contain parent_location_id = 10
      const newRow = rows.find((r) => r.name === 'Library');
      expect(newRow).toBeDefined();
    });

    it('should warn and proceed when parentLocation is not found', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const filePath = await createTestLocationFile(projectPath, 'Library', {
        description: 'Somewhere',
        parentLocation: 'NonExistentParent',
      });

      await sync.syncLocationFile(filePath);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Parent location not found'));
      expect(mockClient.getRecordCount('locations')).toBe(1);
      warnSpy.mockRestore();
    });

    it('should include details and rules in description', async () => {
      const filePath = await createTestLocationFile(projectPath, 'Arena', {
        description: 'A great arena',
        details: { capacity: '10000', era: 'ancient' },
        rules: ['No weapons', 'Silence during bouts'],
      });

      await sync.syncLocationFile(filePath);

      const rows = mockClient.getTableData('locations');
      expect(rows[0].description).toContain('capacity');
      expect(rows[0].description).toContain('No weapons');
    });

    it('should include notes in description when provided', async () => {
      const filePath = await createTestLocationFile(projectPath, 'Tower', {
        description: 'A tall tower',
        notes: 'Research this more',
      });

      await sync.syncLocationFile(filePath);

      const rows = mockClient.getTableData('locations');
      expect(rows[0].description).toContain('Research this more');
    });

    it('should throw SyncConflictError when DB row was updated after last file sync', async () => {
      // Simulate a DB row with updated_at that is newer than the last file sync
      const dbUpdatedAt = new Date(Date.now() + 60_000).toISOString(); // 1 min in the future
      mockClient.seed('locations', [
        { id: 5, project_id: projectId, name: 'Castle', updated_at: dbUpdatedAt },
      ]);
      // Seed sync_state with an older timestamp so detectConflict returns true
      const olderSync = new Date(Date.now() - 60_000).toISOString();
      mockClient.seed('sync_state', [
        { id: 1, entity_type: 'location', entity_id: 'Castle', project_id: String(projectId), last_synced_at: olderSync, file_path: null },
      ]);

      const filePath = await createTestLocationFile(projectPath, 'Castle', {
        description: 'An old castle',
      });

      const { SyncConflictError } = await import('../../../project/src/types/novel.js');
      await expect(sync.syncLocationFile(filePath)).rejects.toBeInstanceOf(SyncConflictError);
    });

    it('should succeed with forceFile=true even when conflict exists', async () => {
      const dbUpdatedAt = new Date(Date.now() + 60_000).toISOString();
      mockClient.seed('locations', [
        { id: 5, project_id: projectId, name: 'Castle', updated_at: dbUpdatedAt },
      ]);
      const olderSync = new Date(Date.now() - 60_000).toISOString();
      mockClient.seed('sync_state', [
        { id: 1, entity_type: 'location', entity_id: 'Castle', project_id: String(projectId), last_synced_at: olderSync, file_path: null },
      ]);

      const filePath = await createTestLocationFile(projectPath, 'Castle', {
        description: 'Forced update',
      });

      await expect(sync.syncLocationFile(filePath, { forceFile: true })).resolves.toBeUndefined();
    });

    it('should not conflict when no updated_at on existing DB row', async () => {
      // existing row, no updated_at
      mockClient.seed('locations', [
        { id: 5, project_id: projectId, name: 'Castle', updated_at: null },
      ]);

      const filePath = await createTestLocationFile(projectPath, 'Castle', {
        description: 'Should not conflict',
      });

      await expect(sync.syncLocationFile(filePath)).resolves.toBeUndefined();
    });
  });

  // ─── exportToYAML ─────────────────────────────────────────────────────────
  // Note: exportToYAML passes locationId as a string param but the WHERE clause
  // compares against numeric id. We seed with string id to match MockMCPClient equality.

  describe('exportToYAML()', () => {
    it('should write a YAML file for the given location ID', async () => {
      // Seed with string id matching what the query passes ('1')
      mockClient.seed('locations', [
        {
          id: '1',
          project_id: projectId,
          name: 'The Dungeon',
          location_type: 'underground',
          description: 'Dark and damp',
          file_path: null,
        },
      ]);

      const outputPath = await sync.exportToYAML('1');
      const { readFile } = await import('fs/promises');
      const content = await readFile(outputPath, 'utf-8');
      const parsed = YAML.parse(content) as LocationYAML;

      expect(parsed.name).toBe('The Dungeon');
      expect(parsed.description).toBe('Dark and damp');
      expect(parsed.type).toBe('underground');
    });

    it('should use existing file_path from DB when present', async () => {
      const customPath = join(projectPath, 'locations', 'custom-dungeon.yaml');
      mockClient.seed('locations', [
        {
          id: '2',
          project_id: projectId,
          name: 'Dungeon',
          location_type: null,
          description: 'Custom path',
          file_path: customPath,
        },
      ]);

      const outputPath = await sync.exportToYAML('2');
      expect(outputPath).toBe(customPath);
    });

    it('should throw when location ID does not exist', async () => {
      await expect(sync.exportToYAML('999')).rejects.toThrow('Location 999 not found');
    });

    it('should create a slug-based filename from location name', async () => {
      mockClient.seed('locations', [
        {
          id: '3',
          project_id: projectId,
          name: 'The Grand Palace!',
          location_type: null,
          description: 'Big place',
          file_path: null,
        },
      ]);

      const outputPath = await sync.exportToYAML('3');
      expect(outputPath).toContain('the-grand-palace');
      expect(outputPath.endsWith('.yaml')).toBe(true);
    });
  });

  // ─── deleteLocation ────────────────────────────────────────────────────────

  describe('deleteLocation()', () => {
    it('should remove location from database by name', async () => {
      mockClient.seed('locations', [
        { id: 1, project_id: projectId, name: 'The Forest' },
        { id: 2, project_id: projectId, name: 'The River' },
      ]);

      await sync.deleteLocation('The Forest');

      const rows = mockClient.getTableData('locations');
      expect(rows.find((r) => r.name === 'The Forest')).toBeUndefined();
      expect(rows.find((r) => r.name === 'The River')).toBeDefined();
    });
  });
});
