/**
 * Unit tests for DevelopmentalAnalyzer (PROC-04)
 */

import { describe, it, expect, vi } from 'vitest';
import { DevelopmentalAnalyzer } from '../../../project/src/analysis/developmental-analyzer.js';
import type { MCPClient } from '../../../project/src/core/database.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a mock MCPClient where `readQuery` returns different values on
 * successive calls (first call → `firstResult`, second call → `secondResult`,
 * and so on). When only one set of rows is needed, pass it as `firstResult`.
 */
function makeMockClient(
  firstResult: unknown[] = [],
  secondResult: unknown[] = []
): MCPClient {
  const readQuery = vi
    .fn()
    .mockResolvedValueOnce(firstResult)
    .mockResolvedValueOnce(secondResult);

  return {
    readQuery,
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 0 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

// ─── auditScenePurposes ───────────────────────────────────────────────────────

describe('DevelopmentalAnalyzer.auditScenePurposes()', () => {
  it('returns hasPurpose: false when purpose is null', async () => {
    const rows = [
      {
        scene_id: 1,
        scene_title: 'Opening',
        purpose: null,
        chapter_id: 10,
        chapter_title: 'Chapter One',
      },
    ];
    const client = makeMockClient(rows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.auditScenePurposes('1');

    expect(result).toHaveLength(1);
    expect(result[0].hasPurpose).toBe(false);
    expect(result[0].purpose).toBeUndefined();
  });

  it('returns hasPurpose: false when purpose is an empty string', async () => {
    const rows = [
      {
        scene_id: 2,
        scene_title: 'Confrontation',
        purpose: '',
        chapter_id: 11,
        chapter_title: 'Chapter Two',
      },
    ];
    const client = makeMockClient(rows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.auditScenePurposes('1');

    expect(result[0].hasPurpose).toBe(false);
    expect(result[0].purpose).toBeUndefined();
  });

  it('returns hasPurpose: false when purpose is whitespace-only', async () => {
    const rows = [
      {
        scene_id: 3,
        scene_title: 'Resolution',
        purpose: '   ',
        chapter_id: 12,
        chapter_title: 'Chapter Three',
      },
    ];
    const client = makeMockClient(rows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.auditScenePurposes('1');

    expect(result[0].hasPurpose).toBe(false);
  });

  it('returns hasPurpose: true when purpose is set to a non-empty string', async () => {
    const rows = [
      {
        scene_id: 4,
        scene_title: 'Midpoint',
        purpose: 'Establish the stakes',
        chapter_id: 13,
        chapter_title: 'Chapter Four',
      },
    ];
    const client = makeMockClient(rows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.auditScenePurposes('1');

    expect(result[0].hasPurpose).toBe(true);
    expect(result[0].purpose).toBe('Establish the stakes');
  });

  it('maps all scene fields correctly', async () => {
    const rows = [
      {
        scene_id: 5,
        scene_title: 'The Duel',
        purpose: 'Force protagonist to choose',
        chapter_id: 20,
        chapter_title: 'Climax',
      },
    ];
    const client = makeMockClient(rows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.auditScenePurposes('42');

    expect(result[0]).toMatchObject({
      sceneId: 5,
      sceneTitle: 'The Duel',
      chapterId: 20,
      chapterTitle: 'Climax',
      hasPurpose: true,
    });
  });

  it('returns both flagged and un-flagged scenes in the same call', async () => {
    const rows = [
      { scene_id: 1, scene_title: 'A', purpose: null, chapter_id: 1, chapter_title: 'Ch1' },
      { scene_id: 2, scene_title: 'B', purpose: 'Show backstory', chapter_id: 1, chapter_title: 'Ch1' },
      { scene_id: 3, scene_title: 'C', purpose: '', chapter_id: 2, chapter_title: 'Ch2' },
    ];
    const client = makeMockClient(rows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.auditScenePurposes('1');

    expect(result).toHaveLength(3);
    expect(result.filter((r) => !r.hasPurpose)).toHaveLength(2);
    expect(result.filter((r) => r.hasPurpose)).toHaveLength(1);
  });

  it('returns an empty array when there are no scenes', async () => {
    const client = makeMockClient([]);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.auditScenePurposes('1');

    expect(result).toEqual([]);
  });

  it('passes projectId as a query parameter', async () => {
    const client = makeMockClient([]);
    const analyzer = new DevelopmentalAnalyzer(client);

    await analyzer.auditScenePurposes('99');

    const readQuery = client.readQuery as ReturnType<typeof vi.fn>;
    expect(readQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['99'])
    );
  });
});

// ─── analyzeSubplotBalance ────────────────────────────────────────────────────

describe('DevelopmentalAnalyzer.analyzeSubplotBalance()', () => {
  it('flags a thread with 2 beats (< 3 threshold)', async () => {
    const rows = [
      { thread_id: '10', title: 'Revenge arc', beat_count: 2 },
    ];
    const client = makeMockClient(rows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.analyzeSubplotBalance('1');

    expect(result).toHaveLength(1);
    expect(result[0].flag).toBe(true);
    expect(result[0].sceneCount).toBe(2);
  });

  it('flags a thread with 0 beats', async () => {
    const rows = [
      { thread_id: '11', title: 'Romance subplot', beat_count: 0 },
    ];
    const client = makeMockClient(rows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.analyzeSubplotBalance('1');

    expect(result[0].flag).toBe(true);
    expect(result[0].sceneCount).toBe(0);
  });

  it('does NOT flag a thread with exactly 3 beats', async () => {
    const rows = [
      { thread_id: '12', title: 'Mystery arc', beat_count: 3 },
    ];
    const client = makeMockClient(rows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.analyzeSubplotBalance('1');

    expect(result[0].flag).toBe(false);
  });

  it('does NOT flag a thread with more than 3 beats', async () => {
    const rows = [
      { thread_id: '13', title: 'Hero journey', beat_count: 10 },
    ];
    const client = makeMockClient(rows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.analyzeSubplotBalance('1');

    expect(result[0].flag).toBe(false);
  });

  it('correctly maps all fields', async () => {
    const rows = [
      { thread_id: '20', title: 'Betrayal arc', beat_count: 5 },
    ];
    const client = makeMockClient(rows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.analyzeSubplotBalance('7');

    expect(result[0]).toMatchObject({
      plotThreadId: '20',
      title: 'Betrayal arc',
      sceneCount: 5,
      flag: false,
    });
  });

  it('handles multiple threads with mixed flag states', async () => {
    const rows = [
      { thread_id: '1', title: 'A', beat_count: 1 },
      { thread_id: '2', title: 'B', beat_count: 4 },
      { thread_id: '3', title: 'C', beat_count: 2 },
    ];
    const client = makeMockClient(rows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.analyzeSubplotBalance('1');

    expect(result).toHaveLength(3);
    expect(result.filter((r) => r.flag)).toHaveLength(2); // threads A and C
    expect(result.filter((r) => !r.flag)).toHaveLength(1); // thread B
  });

  it('returns an empty array when there are no plot threads', async () => {
    const client = makeMockClient([]);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.analyzeSubplotBalance('1');

    expect(result).toEqual([]);
  });
});

// ─── findPlotHoles ────────────────────────────────────────────────────────────

describe('DevelopmentalAnalyzer.findPlotHoles()', () => {
  it('flags a thread whose last beat was in chapter 1 when max chapter is 5', async () => {
    // First call: max chapter query returns 5
    // Second call: open threads with their last beat chapter
    const maxRows = [{ max_chapter: 5 }];
    const threadRows = [
      { thread_id: '1', title: 'Old subplot', open_since: '2024-01-01', last_chapter: 1 },
    ];
    const client = makeMockClient(maxRows, threadRows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.findPlotHoles('1');

    expect(result).toHaveLength(1);
    expect(result[0].threadId).toBe('1');
    expect(result[0].lastChapter).toBe(1);
  });

  it('does NOT flag a thread whose last beat is in the most recent chapter', async () => {
    const maxRows = [{ max_chapter: 5 }];
    const threadRows = [
      { thread_id: '2', title: 'Active subplot', open_since: '2024-01-01', last_chapter: 5 },
    ];
    const client = makeMockClient(maxRows, threadRows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.findPlotHoles('1');

    expect(result).toHaveLength(0);
  });

  it('flags a thread with no beats at all (last_chapter is null)', async () => {
    const maxRows = [{ max_chapter: 5 }];
    const threadRows = [
      { thread_id: '3', title: 'Forgotten arc', open_since: '2024-01-01', last_chapter: null },
    ];
    const client = makeMockClient(maxRows, threadRows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.findPlotHoles('1');

    expect(result).toHaveLength(1);
    expect(result[0].lastChapter).toBeUndefined();
  });

  it('does not flag a thread exactly 2 chapters behind (boundary test)', async () => {
    const maxRows = [{ max_chapter: 5 }];
    const threadRows = [
      { thread_id: '4', title: 'Recent arc', open_since: '2024-01-01', last_chapter: 3 },
    ];
    const client = makeMockClient(maxRows, threadRows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.findPlotHoles('1');

    // maxChapter - lastChapter = 5 - 3 = 2, which is < 3 → not a plot hole
    expect(result).toHaveLength(0);
  });

  it('flags a thread exactly 3 chapters behind (boundary test)', async () => {
    const maxRows = [{ max_chapter: 5 }];
    const threadRows = [
      { thread_id: '5', title: 'Stale arc', open_since: '2024-01-01', last_chapter: 2 },
    ];
    const client = makeMockClient(maxRows, threadRows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.findPlotHoles('1');

    // maxChapter - lastChapter = 5 - 2 = 3 → is a plot hole
    expect(result).toHaveLength(1);
  });

  it('returns empty array when there are no open threads', async () => {
    const maxRows = [{ max_chapter: 3 }];
    const threadRows: unknown[] = [];
    const client = makeMockClient(maxRows, threadRows);
    const analyzer = new DevelopmentalAnalyzer(client);

    const result = await analyzer.findPlotHoles('1');

    expect(result).toEqual([]);
  });
});
