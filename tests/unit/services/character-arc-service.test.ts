/**
 * Unit tests for CharacterArcService — SPEC-09
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CharacterArcService } from '../../../project/src/services/character-arc-service.js';
import type { MCPClient } from '../../../project/src/core/database.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMock(readResult: unknown[] = []): MCPClient {
  return {
    readQuery: vi.fn().mockResolvedValue(readResult),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 1 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

/** Build a db row matching the getArc() JOIN result shape. */
function makeStateRow(overrides: Record<string, unknown> = {}) {
  return {
    state: 'hopeful',
    scene_order: 1,
    scene_title: 'Opening scene',
    chapter_number: 1,
    character_name: 'Sarah',
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('CharacterArcService', () => {
  let client: MCPClient;
  let svc: CharacterArcService;

  beforeEach(() => {
    client = makeMock();
    svc = new CharacterArcService(client);
  });

  // ── getArc() ──────────────────────────────────────────────────────────────

  describe('getArc()', () => {
    it('returns null when character has no state rows', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const arc = await svc.getArc('proj-1', 'NonExistent');
      expect(arc).toBeNull();
    });

    it('returns arc with states ordered by chapter + scene (as returned by query)', async () => {
      const rows = [
        makeStateRow({ chapter_number: 1, scene_order: 1, state: 'hopeful' }),
        makeStateRow({ chapter_number: 1, scene_order: 3, state: 'determined' }),
        makeStateRow({ chapter_number: 2, scene_order: 1, state: 'fearful' }),
      ];
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const arc = await svc.getArc('proj-1', 'Sarah');

      expect(arc).not.toBeNull();
      expect(arc!.characterName).toBe('Sarah');
      expect(arc!.states).toHaveLength(3);
      expect(arc!.states[0]).toMatchObject({ chapterNumber: 1, sceneOrder: 1, state: 'hopeful' });
      expect(arc!.states[1]).toMatchObject({ chapterNumber: 1, sceneOrder: 3, state: 'determined' });
      expect(arc!.states[2]).toMatchObject({ chapterNumber: 2, sceneOrder: 1, state: 'fearful' });
    });

    it('sets isComplete = true when first state !== last state', async () => {
      const rows = [
        makeStateRow({ state: 'hopeful', scene_order: 1, chapter_number: 1 }),
        makeStateRow({ state: 'determined', scene_order: 2, chapter_number: 1 }),
      ];
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const arc = await svc.getArc('proj-1', 'Sarah');
      expect(arc!.isComplete).toBe(true);
    });

    it('sets isComplete = false when first state === last state', async () => {
      const rows = [
        makeStateRow({ state: 'hopeful', scene_order: 1, chapter_number: 1 }),
        makeStateRow({ state: 'fearful',  scene_order: 2, chapter_number: 1 }),
        makeStateRow({ state: 'hopeful',  scene_order: 3, chapter_number: 1 }),
      ];
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const arc = await svc.getArc('proj-1', 'Sarah');
      expect(arc!.isComplete).toBe(false);
    });

    it('sets isComplete = false for a single-state arc', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeStateRow({ state: 'neutral', scene_order: 1, chapter_number: 1 }),
      ]);

      const arc = await svc.getArc('proj-1', 'Sarah');
      expect(arc!.isComplete).toBe(false);
    });

    it('detects a static run of 3 identical consecutive states', async () => {
      const rows = [
        makeStateRow({ state: 'neutral', scene_order: 1, chapter_number: 1 }),
        makeStateRow({ state: 'neutral', scene_order: 2, chapter_number: 1 }),
        makeStateRow({ state: 'neutral', scene_order: 3, chapter_number: 1 }),
        makeStateRow({ state: 'hopeful', scene_order: 4, chapter_number: 1 }),
      ];
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const arc = await svc.getArc('proj-1', 'Sarah');
      // Static run starts at scene_order 1
      expect(arc!.staticRuns).toContain(1);
    });

    it('does NOT flag a run of exactly 2 identical states', async () => {
      const rows = [
        makeStateRow({ state: 'tense', scene_order: 1, chapter_number: 1 }),
        makeStateRow({ state: 'tense', scene_order: 2, chapter_number: 1 }),
        makeStateRow({ state: 'hopeful', scene_order: 3, chapter_number: 1 }),
      ];
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const arc = await svc.getArc('proj-1', 'Sarah');
      expect(arc!.staticRuns).toHaveLength(0);
    });

    it('detects multiple non-overlapping static runs', async () => {
      const rows = [
        makeStateRow({ state: 'hopeful', scene_order: 1, chapter_number: 1 }),
        makeStateRow({ state: 'hopeful', scene_order: 2, chapter_number: 1 }),
        makeStateRow({ state: 'hopeful', scene_order: 3, chapter_number: 1 }),
        makeStateRow({ state: 'fearful', scene_order: 4, chapter_number: 1 }),
        makeStateRow({ state: 'fearful', scene_order: 5, chapter_number: 1 }),
        makeStateRow({ state: 'fearful', scene_order: 6, chapter_number: 1 }),
      ];
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const arc = await svc.getArc('proj-1', 'Sarah');
      expect(arc!.staticRuns).toHaveLength(2);
      expect(arc!.staticRuns).toContain(1);
      expect(arc!.staticRuns).toContain(4);
    });

    it('preserves sceneTitle in each state entry', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeStateRow({ scene_title: 'The Castle', state: 'tense', scene_order: 1, chapter_number: 1 }),
      ]);

      const arc = await svc.getArc('proj-1', 'Sarah');
      expect(arc!.states[0].sceneTitle).toBe('The Castle');
    });

    it('handles null scene_title gracefully', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeStateRow({ scene_title: null, state: 'neutral', scene_order: 1, chapter_number: 1 }),
      ]);

      const arc = await svc.getArc('proj-1', 'Sarah');
      expect(arc!.states[0].sceneTitle).toBe('');
    });
  });

  // ── getSceneStates() ───────────────────────────────────────────────────────

  describe('getSceneStates()', () => {
    it('returns all character states for a chapter', async () => {
      const rows = [
        { character_name: 'Sarah', state: 'hopeful', scene_title: 'Act I' },
        { character_name: 'Marcus', state: 'tense', scene_title: 'Act I' },
      ];
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await svc.getSceneStates('proj-1', 1);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ characterName: 'Sarah', state: 'hopeful', sceneTitle: 'Act I' });
      expect(result[1]).toMatchObject({ characterName: 'Marcus', state: 'tense', sceneTitle: 'Act I' });
    });

    it('returns empty array when no states exist for the chapter', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const result = await svc.getSceneStates('proj-1', 99);
      expect(result).toEqual([]);
    });

    it('passes correct chapter number to query', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await svc.getSceneStates('proj-1', 7);

      expect(client.readQuery).toHaveBeenCalledWith(
        expect.stringContaining('chapter_number'),
        ['proj-1', 7]
      );
    });
  });

  // ── recordState() ──────────────────────────────────────────────────────────

  describe('recordState()', () => {
    it('calls writeQuery with ON CONFLICT DO UPDATE semantics', async () => {
      await svc.recordState('proj-1', 42, 7, 'hopeful', 'notes here');

      expect(client.writeQuery).toHaveBeenCalledOnce();
      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];

      expect(sql).toMatch(/ON CONFLICT\(character_id, scene_id\) DO UPDATE/i);
      expect(params).toContain('proj-1');
      expect(params).toContain(42);
      expect(params).toContain(7);
      expect(params).toContain('hopeful');
      expect(params).toContain('notes here');
    });

    it('passes null for notes when omitted', async () => {
      await svc.recordState('proj-1', 1, 1, 'neutral');

      const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
      expect(params).toContain(null);
    });

    it('generates a unique id each invocation', async () => {
      await svc.recordState('proj-1', 1, 1, 'hopeful');
      await svc.recordState('proj-1', 1, 2, 'fearful');

      const id1 = ((client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]])[1][0];
      const id2 = ((client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[1] as [string, unknown[]])[1][0];
      expect(id1).not.toBe(id2);
    });
  });

  // ── compareArcs() ──────────────────────────────────────────────────────────

  describe('compareArcs()', () => {
    it('returns both arcs when both characters exist', async () => {
      const sarahRows = [
        makeStateRow({ character_name: 'Sarah', state: 'hopeful', scene_order: 1, chapter_number: 1 }),
        makeStateRow({ character_name: 'Sarah', state: 'determined', scene_order: 2, chapter_number: 1 }),
      ];
      const marcusRows = [
        makeStateRow({ character_name: 'Marcus', state: 'tense', scene_order: 1, chapter_number: 1 }),
      ];

      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(sarahRows)
        .mockResolvedValueOnce(marcusRows);

      const { a, b } = await svc.compareArcs('proj-1', 'Sarah', 'Marcus');
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a!.characterName).toBe('Sarah');
      expect(b!.characterName).toBe('Marcus');
    });

    it('returns null for a missing character', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([]) // Sarah — not found
        .mockResolvedValueOnce([makeStateRow({ character_name: 'Marcus' })]);

      const { a, b } = await svc.compareArcs('proj-1', 'Sarah', 'Marcus');
      expect(a).toBeNull();
      expect(b).not.toBeNull();
    });
  });
});
