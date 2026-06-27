/**
 * Unit Tests for IdeaSync
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import YAML from 'yaml';
import { IdeaSync } from '../../../project/src/sync/idea-sync.js';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { getTestProjectPath } from '../../setup.js';
import type { IdeaEntry } from '../../../project/src/types/novel.js';

// Helper to create a minimal valid IdeaEntry
function makeIdea(overrides: Partial<IdeaEntry> = {}): IdeaEntry {
  return {
    projectId: 1,
    ideaKey: `idea-${Date.now()}-${Math.random()}`,
    content: 'An interesting idea',
    tags: ['plot', 'mystery'],
    status: 'active',
    ...overrides,
  };
}

describe('IdeaSync', () => {
  let sync: IdeaSync;
  let mockClient: MockMCPClient;
  let projectPath: string;
  const projectId = 1;

  beforeEach(() => {
    projectPath = getTestProjectPath();
    mockClient = new MockMCPClient();
    sync = new IdeaSync(mockClient, projectId);
  });

  // ─── syncIdea ─────────────────────────────────────────────────────────────

  describe('syncIdea()', () => {
    it('should insert a new idea into the database', async () => {
      const idea = makeIdea({ ideaKey: 'opening-hook' });
      await sync.syncIdea(idea);
      expect(mockClient.getRecordCount('ideas')).toBe(1);
      const rows = mockClient.getTableData('ideas');
      expect(rows[0].idea_key).toBe('opening-hook');
    });

    it('should update an existing idea when ideaKey already exists', async () => {
      const idea = makeIdea({ ideaKey: 'recurring-key', content: 'Original content' });
      mockClient.seed('ideas', [
        {
          id: 5,
          project_id: projectId,
          idea_key: 'recurring-key',
          content: 'Old content',
          tags: '[]',
          status: 'active',
          linked_entity_type: null,
          linked_entity_name: null,
          notes: null,
        },
      ]);

      await sync.syncIdea({ ...idea, content: 'Updated content' });

      // Should still be 1 row (update not insert)
      expect(mockClient.getRecordCount('ideas')).toBe(1);
    });

    it('should serialise tags as JSON string', async () => {
      const idea = makeIdea({ ideaKey: 'tag-test', tags: ['alpha', 'beta', 'gamma'] });
      await sync.syncIdea(idea);
      const rows = mockClient.getTableData('ideas');
      const tagsRaw = rows[0].tags as string;
      expect(JSON.parse(tagsRaw)).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('should store optional linkedEntityType and linkedEntityName', async () => {
      const idea = makeIdea({
        ideaKey: 'linked-idea',
        linkedEntityType: 'character',
        linkedEntityName: 'Alice',
      });
      await sync.syncIdea(idea);
      const rows = mockClient.getTableData('ideas');
      expect(rows[0].linked_entity_type).toBe('character');
      expect(rows[0].linked_entity_name).toBe('Alice');
    });

    it('should store null for missing optional fields', async () => {
      const idea = makeIdea({ ideaKey: 'no-optionals' });
      // No linkedEntityType, linkedEntityName, notes
      await sync.syncIdea(idea);
      const rows = mockClient.getTableData('ideas');
      expect(rows[0].linked_entity_type).toBeNull();
      expect(rows[0].linked_entity_name).toBeNull();
      expect(rows[0].notes).toBeNull();
    });

    it('should store notes when provided', async () => {
      const idea = makeIdea({ ideaKey: 'with-notes', notes: 'Research this further' });
      await sync.syncIdea(idea);
      const rows = mockClient.getTableData('ideas');
      expect(rows[0].notes).toBe('Research this further');
    });

    it('should handle status values: used and discarded', async () => {
      const idea1 = makeIdea({ ideaKey: 'used-idea', status: 'used' });
      const idea2 = makeIdea({ ideaKey: 'disc-idea', status: 'discarded' });
      await sync.syncIdea(idea1);
      await sync.syncIdea(idea2);
      const rows = mockClient.getTableData('ideas');
      expect(rows.find((r) => r.idea_key === 'used-idea')?.status).toBe('used');
      expect(rows.find((r) => r.idea_key === 'disc-idea')?.status).toBe('discarded');
    });
  });

  // ─── syncAllFromDirectory ─────────────────────────────────────────────────

  describe('syncAllFromDirectory()', () => {
    it('should return 0 when directory does not exist', async () => {
      const count = await sync.syncAllFromDirectory('/nonexistent/path');
      expect(count).toBe(0);
    });

    it('should return 0 for empty directory', async () => {
      const ideasDir = join(projectPath, 'ideas');
      await mkdir(ideasDir, { recursive: true });
      const count = await sync.syncAllFromDirectory(ideasDir);
      expect(count).toBe(0);
    });

    it('should sync all .yml files in the directory', async () => {
      const ideasDir = join(projectPath, 'ideas');
      await mkdir(ideasDir, { recursive: true });

      const idea1: IdeaEntry = makeIdea({ ideaKey: 'idea-a', content: 'Idea A' });
      const idea2: IdeaEntry = makeIdea({ ideaKey: 'idea-b', content: 'Idea B' });

      await writeFile(join(ideasDir, 'idea-a.yml'), YAML.stringify(idea1));
      await writeFile(join(ideasDir, 'idea-b.yml'), YAML.stringify(idea2));

      const count = await sync.syncAllFromDirectory(ideasDir);
      expect(count).toBe(2);
      expect(mockClient.getRecordCount('ideas')).toBe(2);
    });

    it('should ignore non-.yml files', async () => {
      const ideasDir = join(projectPath, 'ideas');
      await mkdir(ideasDir, { recursive: true });

      const idea: IdeaEntry = makeIdea({ ideaKey: 'valid-idea' });
      await writeFile(join(ideasDir, 'valid.yml'), YAML.stringify(idea));
      await writeFile(join(ideasDir, 'readme.md'), '# Notes');
      await writeFile(join(ideasDir, 'notes.txt'), 'plain text');

      const count = await sync.syncAllFromDirectory(ideasDir);
      expect(count).toBe(1);
    });

    it('should upsert on second run for same files', async () => {
      const ideasDir = join(projectPath, 'ideas');
      await mkdir(ideasDir, { recursive: true });

      const idea: IdeaEntry = makeIdea({ ideaKey: 'repeated-key', content: 'v1' });
      await writeFile(join(ideasDir, 'idea.yml'), YAML.stringify(idea));

      await sync.syncAllFromDirectory(ideasDir);
      // Update file
      await writeFile(join(ideasDir, 'idea.yml'), YAML.stringify({ ...idea, content: 'v2' }));
      const count = await sync.syncAllFromDirectory(ideasDir);

      expect(count).toBe(1);
      expect(mockClient.getRecordCount('ideas')).toBe(1);
    });
  });

  // ─── listFromDb ───────────────────────────────────────────────────────────

  describe('listFromDb()', () => {
    const seedRows = [
      {
        id: 1,
        project_id: projectId,
        idea_key: 'k1',
        content: 'Content 1',
        tags: '["plot"]',
        linked_entity_type: null,
        linked_entity_name: null,
        status: 'active',
        notes: null,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 2,
        project_id: projectId,
        idea_key: 'k2',
        content: 'Content 2',
        tags: '["character"]',
        linked_entity_type: 'character',
        linked_entity_name: 'Alice',
        status: 'used',
        notes: 'Used it',
        created_at: '2024-01-02T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      },
    ];

    beforeEach(() => {
      mockClient.seed('ideas', seedRows);
    });

    it('should return all ideas when no status filter', async () => {
      const ideas = await sync.listFromDb();
      expect(ideas).toHaveLength(2);
    });

    it('should map rows to IdeaEntry objects correctly', async () => {
      const ideas = await sync.listFromDb();
      const first = ideas.find((i) => i.ideaKey === 'k1')!;
      expect(first.content).toBe('Content 1');
      expect(first.tags).toEqual(['plot']);
      expect(first.status).toBe('active');
      expect(first.linkedEntityType).toBeUndefined();
      expect(first.linkedEntityName).toBeUndefined();
      expect(first.notes).toBeUndefined();
    });

    it('should map linked entity fields when present', async () => {
      const ideas = await sync.listFromDb();
      const second = ideas.find((i) => i.ideaKey === 'k2')!;
      expect(second.linkedEntityType).toBe('character');
      expect(second.linkedEntityName).toBe('Alice');
      expect(second.notes).toBe('Used it');
    });

    it('should parse empty tags array from "[]" JSON', async () => {
      mockClient.seed('ideas', [
        {
          id: 3,
          project_id: projectId,
          idea_key: 'empty-tags',
          content: 'No tags',
          tags: null,
          linked_entity_type: null,
          linked_entity_name: null,
          status: 'active',
          notes: null,
          created_at: '2024-01-03T00:00:00.000Z',
          updated_at: '2024-01-03T00:00:00.000Z',
        },
      ]);
      const ideas = await sync.listFromDb();
      const row = ideas.find((i) => i.ideaKey === 'empty-tags')!;
      expect(row.tags).toEqual([]);
    });

    it('should filter by status when provided', async () => {
      const ideas = await sync.listFromDb('used');
      expect(ideas.every((i) => i.status === 'used')).toBe(true);
    });

    it('should return projectId on each entry', async () => {
      const ideas = await sync.listFromDb();
      expect(ideas.every((i) => i.projectId === projectId)).toBe(true);
    });
  });
});
