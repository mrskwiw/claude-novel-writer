/**
 * Unit Tests for PlotThreadSync.resolveSceneRef
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlotThreadSync } from '../../../project/src/sync/plot-thread-sync.js';
import type { MCPClient } from '../../../project/src/core/database.js';

function makeMockClient(readQueryResults: any[][] = []): MCPClient {
  let callIndex = 0;
  return {
    readQuery: vi.fn().mockImplementation(async () => {
      const result = readQueryResults[callIndex] ?? [];
      callIndex++;
      return result;
    }),
    writeQuery: vi.fn().mockResolvedValue(undefined),
  } as unknown as MCPClient;
}

describe('PlotThreadSync.resolveSceneRef()', () => {
  const projectId = 1;

  describe('format parsing — returns null for unrecognized format', () => {
    it('returns null for plain text', async () => {
      const client = makeMockClient([[]]);
      const sync = new PlotThreadSync(client, projectId);
      expect(await sync.resolveSceneRef('Opening Scene')).toBeNull();
    });

    it('returns null for empty string', async () => {
      const client = makeMockClient([[]]);
      const sync = new PlotThreadSync(client, projectId);
      expect(await sync.resolveSceneRef('')).toBeNull();
    });

    it('returns null for partial format "Ch1"', async () => {
      const client = makeMockClient([[]]);
      const sync = new PlotThreadSync(client, projectId);
      expect(await sync.resolveSceneRef('Ch1')).toBeNull();
    });
  });

  describe('format parsing — recognized formats query the DB', () => {
    it('parses "Ch3.Scene2" and queries ch=3 scene=2', async () => {
      const client = makeMockClient([[{ id: 42 }]]);
      const sync = new PlotThreadSync(client, projectId);
      const result = await sync.resolveSceneRef('Ch3.Scene2');
      expect(result).toEqual({ sceneId: 42, canonicalKey: 'Ch3.Scene2' });
      expect(client.readQuery).toHaveBeenCalledWith(
        expect.stringContaining('chapter_number = ?'),
        expect.arrayContaining([projectId, 3, 2])
      );
    });

    it('parses "Ch3.S2" and queries ch=3 scene=2', async () => {
      const client = makeMockClient([[{ id: 7 }]]);
      const sync = new PlotThreadSync(client, projectId);
      const result = await sync.resolveSceneRef('Ch3.S2');
      expect(result).toEqual({ sceneId: 7, canonicalKey: 'Ch3.Scene2' });
    });

    it('parses "Chapter 3 Scene 2" (case-insensitive) and queries ch=3 scene=2', async () => {
      const client = makeMockClient([[{ id: 15 }]]);
      const sync = new PlotThreadSync(client, projectId);
      const result = await sync.resolveSceneRef('Chapter 3 Scene 2');
      expect(result).toEqual({ sceneId: 15, canonicalKey: 'Ch3.Scene2' });
    });

    it('parses "3.2" numeric format and queries ch=3 scene=2', async () => {
      const client = makeMockClient([[{ id: 99 }]]);
      const sync = new PlotThreadSync(client, projectId);
      const result = await sync.resolveSceneRef('3.2');
      expect(result).toEqual({ sceneId: 99, canonicalKey: 'Ch3.Scene2' });
    });
  });

  describe('DB lookup returns null when scene not found', () => {
    it('returns null when DB has no matching scene for valid format', async () => {
      const client = makeMockClient([[]]); // empty result
      const sync = new PlotThreadSync(client, projectId);
      expect(await sync.resolveSceneRef('Ch1.Scene1')).toBeNull();
    });

    it('does not query DB for unrecognized format', async () => {
      const client = makeMockClient([]);
      const sync = new PlotThreadSync(client, projectId);
      await sync.resolveSceneRef('RandomText');
      expect(client.readQuery).not.toHaveBeenCalled();
    });
  });
});
