/**
 * Unit tests for SyncStateRepository and SyncConflictError (GAP-04)
 *
 * Covers:
 *  - SyncStateRepository.detectConflict() logic
 *  - SyncConflictError shape
 *  - CharacterSync.exportToYAML (YAML construction)
 *  - ChapterSync.exportToFile (frontmatter construction)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncStateRepository } from '../../../project/src/db/repositories/sync-state-repository.js';
import { SyncConflictError } from '../../../project/src/types/novel.js';
import type { MCPClient } from '../../../project/src/core/database.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// ---------------------------------------------------------------------------
// Minimal mock MCPClient factory
// ---------------------------------------------------------------------------

function makeMockClient(
  readQueryResults: any[][] = [],
  writeQueryFn?: () => Promise<void>
): MCPClient {
  let callIndex = 0;
  return {
    readQuery: vi.fn().mockImplementation(async () => {
      const result = readQueryResults[callIndex] ?? [];
      callIndex++;
      return result;
    }),
    writeQuery: writeQueryFn
      ? vi.fn().mockImplementation(writeQueryFn)
      : vi.fn().mockResolvedValue(undefined),
  } as unknown as MCPClient;
}

// ---------------------------------------------------------------------------
// SyncStateRepository.detectConflict()
// ---------------------------------------------------------------------------

describe('SyncStateRepository.detectConflict()', () => {
  describe('returns false when no previous sync exists (null lastSyncedAt)', () => {
    it('returns false when sync_state has no row for entity', async () => {
      // readQuery returns [] → lastSynced = null → no conflict
      const client = makeMockClient([[]]);
      const repo = new SyncStateRepository(client);

      const result = await repo.detectConflict('character', 'Alice', '2025-01-10T12:00:00.000Z');

      expect(result).toBe(false);
    });
  });

  describe('returns false when dbUpdatedAt <= lastSyncedAt', () => {
    it('returns false when dbUpdatedAt equals lastSyncedAt', async () => {
      const ts = '2025-01-10T12:00:00.000Z';
      const client = makeMockClient([[{ last_synced_at: ts }]]);
      const repo = new SyncStateRepository(client);

      const result = await repo.detectConflict('character', 'Alice', ts);

      expect(result).toBe(false);
    });

    it('returns false when dbUpdatedAt is earlier than lastSyncedAt', async () => {
      const client = makeMockClient([[{ last_synced_at: '2025-01-15T00:00:00.000Z' }]]);
      const repo = new SyncStateRepository(client);

      // DB was "updated" before the last sync → file is newer → no conflict
      const result = await repo.detectConflict(
        'chapter',
        '1',
        '2025-01-10T00:00:00.000Z'
      );

      expect(result).toBe(false);
    });
  });

  describe('returns true when dbUpdatedAt > lastSyncedAt', () => {
    it('returns true when DB was modified after last file sync', async () => {
      const client = makeMockClient([[{ last_synced_at: '2025-01-10T12:00:00.000Z' }]]);
      const repo = new SyncStateRepository(client);

      const result = await repo.detectConflict(
        'character',
        'Bob',
        '2025-01-11T08:00:00.000Z'   // DB updated AFTER last sync
      );

      expect(result).toBe(true);
    });

    it('returns true for ISO string comparison (lexicographic ordering works)', async () => {
      const client = makeMockClient([[{ last_synced_at: '2025-06-01T00:00:00.000Z' }]]);
      const repo = new SyncStateRepository(client);

      const result = await repo.detectConflict(
        'world_rule',
        'Magic Principle',
        '2025-06-02T00:00:00.000Z'
      );

      expect(result).toBe(true);
    });
  });

  describe('getLastSynced()', () => {
    it('returns null when no sync_state row exists', async () => {
      const client = makeMockClient([[]]);
      const repo = new SyncStateRepository(client);

      const result = await repo.getLastSynced('character', 'Unknown');

      expect(result).toBeNull();
    });

    it('returns ISO string when row exists', async () => {
      const ts = '2025-03-15T09:30:00.000Z';
      const client = makeMockClient([[{ last_synced_at: ts }]]);
      const repo = new SyncStateRepository(client);

      const result = await repo.getLastSynced('location', 'Castle');

      expect(result).toBe(ts);
    });
  });

  describe('record()', () => {
    it('inserts a new row when none exists', async () => {
      // First readQuery (check existence) → empty, then writeQuery for INSERT
      const client = makeMockClient([[]]);
      const repo = new SyncStateRepository(client);

      await repo.record('character', 'Alice', '1', '/path/alice.yaml');

      expect(client.writeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sync_state'),
        expect.arrayContaining(['character', 'Alice', '1'])
      );
    });

    it('updates an existing row', async () => {
      // readQuery returns an existing row
      const client = makeMockClient([[{ entity_type: 'character' }]]);
      const repo = new SyncStateRepository(client);

      await repo.record('character', 'Alice', '1', '/path/alice.yaml');

      expect(client.writeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sync_state'),
        expect.arrayContaining(['character', 'Alice'])
      );
    });
  });
});

// ---------------------------------------------------------------------------
// SyncConflictError
// ---------------------------------------------------------------------------

describe('SyncConflictError', () => {
  it('has the correct entity type', () => {
    const err = new SyncConflictError('character', 'Alice', 'DB is newer');
    expect(err.entityType).toBe('character');
  });

  it('has the correct entity id', () => {
    const err = new SyncConflictError('chapter', '3', 'DB is newer');
    expect(err.entityId).toBe('3');
  });

  it('includes entity type and id in the message', () => {
    const err = new SyncConflictError('location', 'Castle', 'conflict detail');
    expect(err.message).toContain('location');
    expect(err.message).toContain('Castle');
  });

  it('includes details in the message', () => {
    const detail = 'DB record updated at 2025-01-11 is newer than last file sync.';
    const err = new SyncConflictError('world_rule', 'Magic', detail);
    expect(err.message).toContain(detail);
  });

  it('is an instance of Error', () => {
    const err = new SyncConflictError('plot_thread', 'Act 1', 'test');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name SyncConflictError', () => {
    const err = new SyncConflictError('chapter', '1', 'test');
    expect(err.name).toBe('SyncConflictError');
  });
});

// ---------------------------------------------------------------------------
// CharacterSync.exportToYAML — YAML construction
// ---------------------------------------------------------------------------

describe('CharacterSync.exportToYAML', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `novel-sync-state-test-${Date.now()}`);
    await mkdir(join(tmpDir, 'characters'), { recursive: true });
  });

  it('constructs a valid YAML file from DB data', async () => {
    // Lazy import to avoid top-level fs mock issues
    const { CharacterSync } = await import(
      '../../../project/src/sync/character-sync.js'
    );

    const charRow = {
      id: 1,
      name: 'Alice',
      full_name: 'Alice Wonderland',
      role: 'protagonist',
      summary: 'Curious girl',
      voice_notes: null,
      file_path: join(tmpDir, 'characters', 'alice.yaml'),
    };

    const attrRows = [
      { attribute_type: 'physical', attribute_name: 'hair', attribute_value: 'blonde' },
      { attribute_type: 'personality', attribute_name: 'trait', attribute_value: 'curious' },
    ];

    const arcRows = [
      { starting_state: 'naive', ending_state: 'wise', midpoint_crisis: null },
    ];

    // readQuery call order: char row, attrs, arc
    const client = makeMockClient([[charRow], attrRows, arcRows]);
    const sync = new CharacterSync(client, 1, tmpDir);

    const outputPath = await sync.exportToYAML('1');

    // Verify file was written
    const { readFile } = await import('fs/promises');
    const content = await readFile(outputPath, 'utf-8');

    // Validate YAML structure — must have required fields
    expect(content).toContain('name: Alice');
    expect(content).toContain('role: protagonist');
    expect(content).toContain('summary: Curious girl');
    expect(content).toContain('fullName: Alice Wonderland');
    expect(content).toContain('hair: blonde');
    expect(content).toContain('trait: curious');
    expect(content).toContain('startingState: naive');
    expect(content).toContain('endingState: wise');
  });

  it('writes to a sensible path when no file_path stored in DB', async () => {
    const { CharacterSync } = await import(
      '../../../project/src/sync/character-sync.js'
    );

    const charRow = {
      id: 2,
      name: 'Bob Smith',
      full_name: null,
      role: 'minor',
      summary: 'Side character',
      voice_notes: null,
      file_path: null,  // no stored path → derive from name
    };

    const client = makeMockClient([[charRow], [], []]);
    const sync = new CharacterSync(client, 1, tmpDir);

    const outputPath = await sync.exportToYAML('2');

    // Should be under tmpDir/characters/
    expect(outputPath).toContain('characters');
    expect(outputPath).toMatch(/bob-smith\.yaml$/);
  });
});

// ---------------------------------------------------------------------------
// ChapterSync.exportToFile — frontmatter construction
// ---------------------------------------------------------------------------

describe('ChapterSync.exportToFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `novel-sync-state-chap-test-${Date.now()}`);
    await mkdir(join(tmpDir, 'chapters'), { recursive: true });
  });

  it('constructs valid markdown frontmatter from DB data', async () => {
    const { ChapterSync } = await import(
      '../../../project/src/sync/chapter-sync.js'
    );

    const chapterRow = {
      id: 1,
      chapter_number: 1,
      title: 'The Beginning',
      status: 'drafted',
      summary: 'Hero leaves home',
      notes: 'First draft',
      file_path: join(tmpDir, 'chapters', '01-the-beginning.md'),
      word_count: 500,
    };

    const client = makeMockClient([[chapterRow]]);
    const sync = new ChapterSync(client, 1, tmpDir);

    const outputPath = await sync.exportToFile(1);

    const { readFile } = await import('fs/promises');
    const content = await readFile(outputPath, 'utf-8');

    // Validate frontmatter markers and fields
    expect(content).toMatch(/^---/);
    expect(content).toContain('title: The Beginning');
    expect(content).toContain('number: 1');
    expect(content).toContain('status: drafted');
    expect(content).toContain('summary: Hero leaves home');
    expect(content).toContain('notes: First draft');
    // Closing frontmatter delimiter
    expect(content).toMatch(/---\n/);
  });

  it('writes to a derived path when no file_path stored in DB', async () => {
    const { ChapterSync } = await import(
      '../../../project/src/sync/chapter-sync.js'
    );

    const chapterRow = {
      id: 2,
      chapter_number: 3,
      title: 'Dark Night',
      status: 'planned',
      summary: null,
      notes: null,
      file_path: null,
      word_count: 0,
    };

    const client = makeMockClient([[chapterRow]]);
    const sync = new ChapterSync(client, 1, tmpDir);

    const outputPath = await sync.exportToFile(2);

    expect(outputPath).toContain('chapters');
    // Filename should include chapter number
    expect(outputPath).toMatch(/03/);
  });

  it('throws when chapter not found', async () => {
    const { ChapterSync } = await import(
      '../../../project/src/sync/chapter-sync.js'
    );

    const client = makeMockClient([[]]); // empty result
    const sync = new ChapterSync(client, 1, tmpDir);

    await expect(sync.exportToFile(999)).rejects.toThrow('Chapter 999 not found');
  });
});
