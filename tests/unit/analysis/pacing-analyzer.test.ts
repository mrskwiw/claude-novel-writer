/**
 * Unit tests for PacingAnalyzer (GAP-11 / SPEC-08)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PacingAnalyzer } from '../../../project/src/analysis/pacing-analyzer.js';
import type { MCPClient } from '../../../project/src/core/database.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeMockClient(readResult: unknown[] = []): MCPClient {
  return {
    readQuery: vi.fn().mockResolvedValue(readResult),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 0 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

// ─── analyzeTensionArc ────────────────────────────────────────────────────────

describe('PacingAnalyzer.analyzeTensionArc()', () => {
  it('maps DB rows to ChapterTensionData array', async () => {
    const rows = [
      { chapter_number: 1, title: 'The Beginning', avg_tension: 5.2, scene_count: 3 },
      { chapter_number: 2, title: 'Rising Action', avg_tension: 7.1, scene_count: 4 },
    ];
    const client = makeMockClient(rows);
    const analyzer = new PacingAnalyzer(client, 1);

    const result = await analyzer.analyzeTensionArc();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      chapterNumber: 1,
      chapterTitle: 'The Beginning',
      avgTension: 5.2,
      sceneCount: 3,
    });
    expect(result[1]).toEqual({
      chapterNumber: 2,
      chapterTitle: 'Rising Action',
      avgTension: 7.1,
      sceneCount: 4,
    });
  });

  it('returns empty array when DB returns no rows', async () => {
    const client = makeMockClient([]);
    const analyzer = new PacingAnalyzer(client, 1);

    const result = await analyzer.analyzeTensionArc();

    expect(result).toEqual([]);
  });

  it('passes projectId as query parameter', async () => {
    const client = makeMockClient([]);
    const analyzer = new PacingAnalyzer(client, 42);

    await analyzer.analyzeTensionArc();

    const readQuery = client.readQuery as ReturnType<typeof vi.fn>;
    expect(readQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([42])
    );
  });
});

// ─── analyzePOVBalance ────────────────────────────────────────────────────────

describe('PacingAnalyzer.analyzePOVBalance()', () => {
  it('computes percentages that sum to ~100%', async () => {
    const rows = [
      { character_name: 'Alice', scene_count: 6 },
      { character_name: 'Bob', scene_count: 4 },
    ];
    const client = makeMockClient(rows);
    const analyzer = new PacingAnalyzer(client, 1);

    const result = await analyzer.analyzePOVBalance();

    expect(result).toHaveLength(2);
    const total = result.reduce((s, p) => s + p.percentage, 0);
    expect(total).toBeCloseTo(100, 1);
  });

  it('returns correct scene counts', async () => {
    const rows = [
      { character_name: 'Alice', scene_count: 7 },
      { character_name: 'Bob', scene_count: 3 },
    ];
    const client = makeMockClient(rows);
    const analyzer = new PacingAnalyzer(client, 1);

    const result = await analyzer.analyzePOVBalance();

    expect(result[0].sceneCount).toBe(7);
    expect(result[1].sceneCount).toBe(3);
    expect(result[0].percentage).toBeCloseTo(70, 1);
    expect(result[1].percentage).toBeCloseTo(30, 1);
  });

  it('returns empty array when DB returns no rows', async () => {
    const client = makeMockClient([]);
    const analyzer = new PacingAnalyzer(client, 1);
    const result = await analyzer.analyzePOVBalance();
    expect(result).toEqual([]);
  });
});

// ─── analyzeChapterLengths ────────────────────────────────────────────────────

describe('PacingAnalyzer.analyzeChapterLengths()', () => {
  it('flags chapter with >2x average word count as long', async () => {
    // avg = (1000 + 1000 + 1000 + 3500) / 4 = 1625; 3500 > 2 * 1625 = 3250 → long
    const rows = [
      { chapter_number: 1, title: 'Ch1', word_count: 1000 },
      { chapter_number: 2, title: 'Ch2', word_count: 1000 },
      { chapter_number: 3, title: 'Ch3', word_count: 1000 },
      { chapter_number: 4, title: 'Ch4', word_count: 3500 },
    ];
    const client = makeMockClient(rows);
    const analyzer = new PacingAnalyzer(client, 1);

    const result = await analyzer.analyzeChapterLengths();

    const ch4 = result.find((r) => r.chapterNumber === 4);
    expect(ch4?.deviation).toBe('long');
  });

  it('flags chapter with <0.5x average word count as short', async () => {
    // avg = (2000 + 2000 + 2000 + 400) / 4 = 1600; 400 < 0.5 * 1600 = 800 → short
    const rows = [
      { chapter_number: 1, title: 'Ch1', word_count: 2000 },
      { chapter_number: 2, title: 'Ch2', word_count: 2000 },
      { chapter_number: 3, title: 'Ch3', word_count: 2000 },
      { chapter_number: 4, title: 'Ch4', word_count: 400 },
    ];
    const client = makeMockClient(rows);
    const analyzer = new PacingAnalyzer(client, 1);

    const result = await analyzer.analyzeChapterLengths();

    const ch4 = result.find((r) => r.chapterNumber === 4);
    expect(ch4?.deviation).toBe('short');
  });

  it('marks chapters within normal range as normal', async () => {
    const rows = [
      { chapter_number: 1, title: 'Ch1', word_count: 1000 },
      { chapter_number: 2, title: 'Ch2', word_count: 1200 },
      { chapter_number: 3, title: 'Ch3', word_count: 900 },
    ];
    const client = makeMockClient(rows);
    const analyzer = new PacingAnalyzer(client, 1);

    const result = await analyzer.analyzeChapterLengths();

    expect(result.every((r) => r.deviation === 'normal')).toBe(true);
  });

  it('returns empty array when DB returns no rows', async () => {
    const client = makeMockClient([]);
    const analyzer = new PacingAnalyzer(client, 1);
    const result = await analyzer.analyzeChapterLengths();
    expect(result).toEqual([]);
  });
});

// ─── generateReport (ASCII chart) ────────────────────────────────────────────

describe('PacingAnalyzer — ASCII tension chart (via generateReport)', () => {
  it('renders 5 filled blocks for a chapter with avg tension 5', async () => {
    // Set up three method calls: tension arc, pov balance, chapter lengths
    const tensionRows = [
      { chapter_number: 1, title: 'Ch1', avg_tension: 5, scene_count: 2 },
    ];
    const client = makeMockClient([]);
    // Override readQuery to return different results per call
    let callCount = 0;
    (client.readQuery as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(tensionRows); // tension
      if (callCount === 2) return Promise.resolve([]);           // pov
      return Promise.resolve([]);                                // lengths
    });

    const analyzer = new PacingAnalyzer(client, 1);
    const report = await analyzer.generateReport();

    // "Ch1   ██████████ 5.0" — exactly 5 filled + 5 empty
    expect(report.asciiTensionChart).toMatch(/█{5}░{5}/);
    expect(report.asciiTensionChart).toContain('5.0');
  });
});

// ─── generateReport — flags ───────────────────────────────────────────────────

describe('PacingAnalyzer.generateReport() flags', () => {
  function makeReportClient(
    tensionRows: unknown[],
    povRows: unknown[],
    lengthRows: unknown[]
  ): MCPClient {
    const client = makeMockClient([]);
    let callCount = 0;
    (client.readQuery as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(tensionRows);
      if (callCount === 2) return Promise.resolve(povRows);
      return Promise.resolve(lengthRows);
    });
    return client;
  }

  it('flags pov_imbalance when one character has > 70% of scenes', async () => {
    const tensionRows = [{ chapter_number: 1, title: 'Ch1', avg_tension: 6, scene_count: 2 }];
    const povRows = [
      { character_name: 'Alice', scene_count: 8 },
      { character_name: 'Bob', scene_count: 2 },
    ];
    const lengthRows = [{ chapter_number: 1, title: 'Ch1', word_count: 1000 }];

    const client = makeReportClient(tensionRows, povRows, lengthRows);
    const analyzer = new PacingAnalyzer(client, 1);
    const report = await analyzer.generateReport();

    const flag = report.flags.find((f) => f.type === 'pov_imbalance');
    expect(flag).toBeDefined();
    expect(flag?.description).toContain('Alice');
  });

  it('does NOT flag pov_imbalance when no character exceeds 70%', async () => {
    const tensionRows = [{ chapter_number: 1, title: 'Ch1', avg_tension: 5, scene_count: 2 }];
    const povRows = [
      { character_name: 'Alice', scene_count: 6 },
      { character_name: 'Bob', scene_count: 4 },
    ];
    const lengthRows = [{ chapter_number: 1, title: 'Ch1', word_count: 1000 }];

    const client = makeReportClient(tensionRows, povRows, lengthRows);
    const analyzer = new PacingAnalyzer(client, 1);
    const report = await analyzer.generateReport();

    expect(report.flags.some((f) => f.type === 'pov_imbalance')).toBe(false);
  });

  it('flags tension_dip for 3+ consecutive low-tension chapters after a high one', async () => {
    // Ch1 high (6), Ch2 Ch3 Ch4 low (2, 2, 2) → tension_dip on Ch2-Ch4
    const tensionRows = [
      { chapter_number: 1, title: 'Ch1', avg_tension: 6, scene_count: 2 },
      { chapter_number: 2, title: 'Ch2', avg_tension: 2, scene_count: 2 },
      { chapter_number: 3, title: 'Ch3', avg_tension: 2, scene_count: 2 },
      { chapter_number: 4, title: 'Ch4', avg_tension: 2, scene_count: 2 },
    ];

    const client = makeReportClient(tensionRows, [], []);
    const analyzer = new PacingAnalyzer(client, 1);
    const report = await analyzer.generateReport();

    const flag = report.flags.find((f) => f.type === 'tension_dip');
    expect(flag).toBeDefined();
    expect(flag?.affectedChapters).toContain(2);
    expect(flag?.affectedChapters).toContain(3);
    expect(flag?.affectedChapters).toContain(4);
  });

  it('does NOT flag tension_dip for fewer than 3 consecutive low-tension chapters', async () => {
    const tensionRows = [
      { chapter_number: 1, title: 'Ch1', avg_tension: 6, scene_count: 2 },
      { chapter_number: 2, title: 'Ch2', avg_tension: 2, scene_count: 2 },
      { chapter_number: 3, title: 'Ch3', avg_tension: 2, scene_count: 2 },
      { chapter_number: 4, title: 'Ch4', avg_tension: 8, scene_count: 2 },
    ];

    const client = makeReportClient(tensionRows, [], []);
    const analyzer = new PacingAnalyzer(client, 1);
    const report = await analyzer.generateReport();

    expect(report.flags.some((f) => f.type === 'tension_dip')).toBe(false);
  });

  it('returns all three data arrays in the report', async () => {
    const tensionRows = [
      { chapter_number: 1, title: 'Ch1', avg_tension: 5, scene_count: 2 },
    ];
    const povRows = [{ character_name: 'Alice', scene_count: 5 }];
    const lengthRows = [{ chapter_number: 1, title: 'Ch1', word_count: 1000 }];

    const client = makeReportClient(tensionRows, povRows, lengthRows);
    const analyzer = new PacingAnalyzer(client, 1);
    const report = await analyzer.generateReport();

    expect(report.tensionArc).toHaveLength(1);
    expect(report.povBalance).toHaveLength(1);
    expect(report.chapterLengths).toHaveLength(1);
    expect(typeof report.asciiTensionChart).toBe('string');
  });

  it('flags conflict_gap for 3+ consecutive chapters with avg tension ≤ 3', async () => {
    const tensionRows = [
      { chapter_number: 1, title: 'Ch1', avg_tension: 3, scene_count: 2 },
      { chapter_number: 2, title: 'Ch2', avg_tension: 2, scene_count: 2 },
      { chapter_number: 3, title: 'Ch3', avg_tension: 1, scene_count: 2 },
    ];

    const client = makeReportClient(tensionRows, [], []);
    const analyzer = new PacingAnalyzer(client, 1);
    const report = await analyzer.generateReport();

    const flag = report.flags.find((f) => f.type === 'conflict_gap');
    expect(flag).toBeDefined();
    expect(flag?.affectedChapters).toEqual([1, 2, 3]);
  });
});
