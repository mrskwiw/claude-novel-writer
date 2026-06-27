/**
 * Unit tests for DB → File reverse sync (GAP-05)
 *
 * Covers:
 *  - CharacterSync.exportToYAML()
 *  - LocationSync.exportToYAML()
 *  - WorldRulesSync.exportToYAML()
 *  - PlotThreadSync.exportToYAML()
 *  - ChapterSync.exportToFile()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { MCPClient } from '../../../project/src/core/database.js';

// ---------------------------------------------------------------------------
// Helper: minimal mock client that returns fixed read sequences
// ---------------------------------------------------------------------------

function makeMockClient(readSequence: any[][]): MCPClient {
  let idx = 0;
  return {
    readQuery: vi.fn().mockImplementation(async () => {
      const result = readSequence[idx] ?? [];
      idx++;
      return result;
    }),
    writeQuery: vi.fn().mockResolvedValue(undefined),
  } as unknown as MCPClient;
}

// ---------------------------------------------------------------------------
// Test directory lifecycle
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `novel-reverse-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  if (existsSync(tmpDir)) {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// CharacterSync.exportToYAML()
// ---------------------------------------------------------------------------

describe('CharacterSync.exportToYAML()', () => {
  it('writes a YAML file with correct name and role', async () => {
    const { CharacterSync } = await import(
      '../../../project/src/sync/character-sync.js'
    );

    const charRow = {
      id: 1,
      name: 'Elena',
      full_name: 'Elena Sparks',
      role: 'protagonist',
      summary: 'A determined scientist',
      voice_notes: null,
      file_path: null,
    };

    // call order: character row, attributes (empty), arc (empty)
    const client = makeMockClient([[charRow], [], []]);
    const sync = new CharacterSync(client, 1, tmpDir);

    const outputPath = await sync.exportToYAML('1');

    expect(existsSync(outputPath)).toBe(true);
    const content = await readFile(outputPath, 'utf-8');

    expect(content).toContain('name: Elena');
    expect(content).toContain('role: protagonist');
    expect(content).toContain('summary: A determined scientist');
    expect(content).toContain('fullName: Elena Sparks');
  });

  it('includes physical and personality attributes in output', async () => {
    const { CharacterSync } = await import(
      '../../../project/src/sync/character-sync.js'
    );

    const charRow = {
      id: 2,
      name: 'Marcus',
      full_name: null,
      role: 'antagonist',
      summary: 'Cold villain',
      voice_notes: null,
      file_path: null,
    };

    const attrRows = [
      { attribute_type: 'physical', attribute_name: 'eyes', attribute_value: 'grey' },
      { attribute_type: 'personality', attribute_name: 'trait', attribute_value: 'ruthless' },
      { attribute_type: 'skill', attribute_name: 'combat', attribute_value: 'expert' },
    ];

    const client = makeMockClient([[charRow], attrRows, []]);
    const sync = new CharacterSync(client, 1, tmpDir);

    const outputPath = await sync.exportToYAML('2');
    const content = await readFile(outputPath, 'utf-8');

    expect(content).toContain('eyes: grey');
    expect(content).toContain('trait: ruthless');
    expect(content).toContain('combat: expert');
  });

  it('includes arc data when available', async () => {
    const { CharacterSync } = await import(
      '../../../project/src/sync/character-sync.js'
    );

    const charRow = {
      id: 3,
      name: 'Sara',
      full_name: null,
      role: 'major',
      summary: 'Mentor figure',
      voice_notes: null,
      file_path: null,
    };

    const arcRows = [
      {
        starting_state: 'isolated',
        ending_state: 'connected',
        midpoint_crisis: 'betrayal by friend',
      },
    ];

    const client = makeMockClient([[charRow], [], arcRows]);
    const sync = new CharacterSync(client, 1, tmpDir);

    const outputPath = await sync.exportToYAML('3');
    const content = await readFile(outputPath, 'utf-8');

    expect(content).toContain('startingState: isolated');
    expect(content).toContain('endingState: connected');
    expect(content).toContain('midpointCrisis: betrayal by friend');
  });

  it('throws when character not found', async () => {
    const { CharacterSync } = await import(
      '../../../project/src/sync/character-sync.js'
    );

    const client = makeMockClient([[]]);
    const sync = new CharacterSync(client, 1, tmpDir);

    await expect(sync.exportToYAML('999')).rejects.toThrow('Character 999 not found');
  });

  it('returns the absolute file path', async () => {
    const { CharacterSync } = await import(
      '../../../project/src/sync/character-sync.js'
    );

    const charRow = {
      id: 4,
      name: 'Tom',
      full_name: null,
      role: 'minor',
      summary: 'side character',
      voice_notes: null,
      file_path: null,
    };

    const client = makeMockClient([[charRow], [], []]);
    const sync = new CharacterSync(client, 1, tmpDir);

    const outputPath = await sync.exportToYAML('4');

    expect(outputPath).toMatch(/\.yaml$/);
    expect(outputPath.startsWith(tmpDir) || outputPath.includes('characters')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LocationSync.exportToYAML()
// ---------------------------------------------------------------------------

describe('LocationSync.exportToYAML()', () => {
  it('writes a YAML file with correct name and description', async () => {
    const { LocationSync } = await import(
      '../../../project/src/sync/location-sync.js'
    );

    const locRow = {
      id: 1,
      name: 'The Library',
      location_type: 'building',
      description: 'A vast archive of forbidden knowledge',
      file_path: null,
    };

    const client = makeMockClient([[locRow]]);
    const sync = new LocationSync(client, 1, tmpDir);

    const outputPath = await sync.exportToYAML('1');

    expect(existsSync(outputPath)).toBe(true);
    const content = await readFile(outputPath, 'utf-8');

    expect(content).toContain('name: The Library');
    expect(content).toContain('type: building');
    expect(content).toContain('description: A vast archive of forbidden knowledge');
  });

  it('omits type field when location_type is null', async () => {
    const { LocationSync } = await import(
      '../../../project/src/sync/location-sync.js'
    );

    const locRow = {
      id: 2,
      name: 'Unknown Place',
      location_type: null,
      description: 'Mysterious',
      file_path: null,
    };

    const client = makeMockClient([[locRow]]);
    const sync = new LocationSync(client, 1, tmpDir);

    const outputPath = await sync.exportToYAML('2');
    const content = await readFile(outputPath, 'utf-8');

    // Should not include 'type:' line when null
    expect(content).not.toMatch(/^type:/m);
    expect(content).toContain('name: Unknown Place');
  });

  it('throws when location not found', async () => {
    const { LocationSync } = await import(
      '../../../project/src/sync/location-sync.js'
    );

    const client = makeMockClient([[]]);
    const sync = new LocationSync(client, 1, tmpDir);

    await expect(sync.exportToYAML('999')).rejects.toThrow('Location 999 not found');
  });
});

// ---------------------------------------------------------------------------
// WorldRulesSync.exportToYAML()
// ---------------------------------------------------------------------------

describe('WorldRulesSync.exportToYAML()', () => {
  it('writes a YAML file with required world rule fields', async () => {
    const { WorldRulesSync } = await import(
      '../../../project/src/sync/world-rules-sync.js'
    );

    const ruleRow = {
      id: 1,
      rule_name: 'No Time Travel',
      rule_category: 'physics',
      description: 'Time cannot be reversed',
      limitations: 'Except via prophecy',
      is_hard_rule: 1,
      established_chapter_id: 2,
      established_quote: '"The clock cannot go back." — The Oracle',
    };

    const client = makeMockClient([[ruleRow]]);
    const sync = new WorldRulesSync(client, 1, tmpDir);

    const outputPath = await sync.exportToYAML('1');

    expect(existsSync(outputPath)).toBe(true);
    const content = await readFile(outputPath, 'utf-8');

    expect(content).toContain('name: No Time Travel');
    expect(content).toContain('category: physics');
    expect(content).toContain('description: Time cannot be reversed');
    expect(content).toContain('limitations: Except via prophecy');
    expect(content).toContain('is_hard_rule: true');
  });

  it('includes established_in block when chapter id is set', async () => {
    const { WorldRulesSync } = await import(
      '../../../project/src/sync/world-rules-sync.js'
    );

    const ruleRow = {
      id: 2,
      rule_name: 'Magic Costs',
      rule_category: 'magic',
      description: 'Every spell costs life force',
      limitations: null,
      is_hard_rule: 1,
      established_chapter_id: 5,
      established_quote: null,
    };

    const client = makeMockClient([[ruleRow]]);
    const sync = new WorldRulesSync(client, 1, tmpDir);

    const outputPath = await sync.exportToYAML('2');
    const content = await readFile(outputPath, 'utf-8');

    expect(content).toContain('established_in:');
    expect(content).toContain('chapter: 5');
  });

  it('throws when world rule not found', async () => {
    const { WorldRulesSync } = await import(
      '../../../project/src/sync/world-rules-sync.js'
    );

    const client = makeMockClient([[]]);
    const sync = new WorldRulesSync(client, 1, tmpDir);

    await expect(sync.exportToYAML('999')).rejects.toThrow('World rule 999 not found');
  });
});

// ---------------------------------------------------------------------------
// PlotThreadSync.exportToYAML()
// ---------------------------------------------------------------------------

describe('PlotThreadSync.exportToYAML()', () => {
  it('writes a YAML file with required plot thread fields', async () => {
    const { PlotThreadSync } = await import(
      '../../../project/src/sync/plot-thread-sync.js'
    );

    const threadRow = {
      id: 1,
      thread_name: 'The Lost Artifact',
      thread_type: 'main',
      description: 'Finding the crystal',
      status: 'active',
      priority: 8,
      notes: 'Key driver',
    };

    // call order: thread row, beats (empty)
    const client = makeMockClient([[threadRow], []]);
    const sync = new PlotThreadSync(client, 1, tmpDir);

    const outputPath = await sync.exportToYAML('1');

    expect(existsSync(outputPath)).toBe(true);
    const content = await readFile(outputPath, 'utf-8');

    expect(content).toContain('name: The Lost Artifact');
    expect(content).toContain('type: main');
    expect(content).toContain('status: active');
    expect(content).toContain('priority: 8');
    expect(content).toContain('description: Finding the crystal');
    expect(content).toContain('notes: Key driver');
  });

  it('includes beats when present', async () => {
    const { PlotThreadSync } = await import(
      '../../../project/src/sync/plot-thread-sync.js'
    );

    const threadRow = {
      id: 2,
      thread_name: 'Romance',
      thread_type: 'subplot',
      description: 'Two hearts converge',
      status: 'planned',
      priority: 5,
      notes: null,
    };

    const beatRows = [
      { scene_reference: 'Ch1.Scene2', description: 'First meeting', beat_type: 'setup' },
      { scene_reference: 'Ch3.Scene1', description: 'Confession', beat_type: 'climax' },
    ];

    const client = makeMockClient([[threadRow], beatRows]);
    const sync = new PlotThreadSync(client, 1, tmpDir);

    const outputPath = await sync.exportToYAML('2');
    const content = await readFile(outputPath, 'utf-8');

    expect(content).toContain('beats:');
    expect(content).toContain('First meeting');
    expect(content).toContain('Confession');
    expect(content).toContain('setup');
    expect(content).toContain('climax');
  });

  it('throws when plot thread not found', async () => {
    const { PlotThreadSync } = await import(
      '../../../project/src/sync/plot-thread-sync.js'
    );

    const client = makeMockClient([[]]);
    const sync = new PlotThreadSync(client, 1, tmpDir);

    await expect(sync.exportToYAML('999')).rejects.toThrow('Plot thread 999 not found');
  });
});

// ---------------------------------------------------------------------------
// ChapterSync.exportToFile()
// ---------------------------------------------------------------------------

describe('ChapterSync.exportToFile()', () => {
  it('creates a markdown file with YAML frontmatter', async () => {
    const { ChapterSync } = await import(
      '../../../project/src/sync/chapter-sync.js'
    );

    const chapterRow = {
      id: 1,
      chapter_number: 2,
      title: 'Into the Forest',
      status: 'drafted',
      summary: 'They venture deeper',
      notes: 'Needs tension review',
      file_path: null,
      word_count: 1200,
    };

    const client = makeMockClient([[chapterRow]]);
    const sync = new ChapterSync(client, 1, tmpDir);

    const outputPath = await sync.exportToFile(1);

    expect(existsSync(outputPath)).toBe(true);
    const content = await readFile(outputPath, 'utf-8');

    // Must start with frontmatter delimiter
    expect(content.trimStart()).toMatch(/^---/);
    expect(content).toContain('title: Into the Forest');
    expect(content).toContain('number: 2');
    expect(content).toContain('status: drafted');
    expect(content).toContain('summary: They venture deeper');
    expect(content).toContain('notes: Needs tension review');
  });

  it('generates filename with zero-padded chapter number', async () => {
    const { ChapterSync } = await import(
      '../../../project/src/sync/chapter-sync.js'
    );

    const chapterRow = {
      id: 2,
      chapter_number: 5,
      title: 'Revelation',
      status: 'polished',
      summary: null,
      notes: null,
      file_path: null,
      word_count: 3200,
    };

    const client = makeMockClient([[chapterRow]]);
    const sync = new ChapterSync(client, 1, tmpDir);

    const outputPath = await sync.exportToFile(2);

    // Should have zero-padded number in filename
    expect(outputPath).toMatch(/05/);
    expect(outputPath).toMatch(/\.md$/);
  });

  it('uses stored file_path when available', async () => {
    const { ChapterSync } = await import(
      '../../../project/src/sync/chapter-sync.js'
    );

    const storedPath = join(tmpDir, 'chapters', '03-legacy.md');

    const chapterRow = {
      id: 3,
      chapter_number: 3,
      title: 'Legacy',
      status: 'drafted',
      summary: null,
      notes: null,
      file_path: storedPath,
      word_count: 900,
    };

    const client = makeMockClient([[chapterRow]]);
    const sync = new ChapterSync(client, 1, tmpDir);

    // Ensure directory exists for stored path
    await mkdir(join(tmpDir, 'chapters'), { recursive: true });
    const outputPath = await sync.exportToFile(3);

    expect(outputPath).toBe(storedPath);
  });

  it('throws when chapter not found', async () => {
    const { ChapterSync } = await import(
      '../../../project/src/sync/chapter-sync.js'
    );

    const client = makeMockClient([[]]);
    const sync = new ChapterSync(client, 1, tmpDir);

    await expect(sync.exportToFile(404)).rejects.toThrow('Chapter 404 not found');
  });
});
