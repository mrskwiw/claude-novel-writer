/**
 * Coverage tests: src/cli/handlers/character-handler.ts
 *
 * Complements tests/integration/character-workflow.test.ts by exercising the
 * branches the workflow file does not reach when this file is measured alone:
 * list truncation/empty/error, show --all sub-sections (background/skills/voice/
 * notes) + substring name match, every edit branch, delete, sync (all/single/
 * empty/not-initialized), scenes (not-initialized/no-name/multi-chapter grouping),
 * arc (single/compare/static-run/incomplete/not-found/not-initialized) and
 * states (rows/empty/no-chapter/not-initialized).
 *
 * The DB-backed handlers accept an injected extension, so the seeded
 * TestNovelWriterExtension (which has projectId set) is passed directly — no
 * private-method spying needed. list/show/delete construct their own extension
 * internally but only touch YAML files under <projectPath>/characters.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleCharacterCommand } from '../../project/src/cli/handlers/character-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';
import type { CharacterYAML } from '../../project/src/types/novel.js';

function makeOutput() {
  const log: string[] = [];
  const out: OutputFormatter = {
    success: (m) => log.push(`SUCCESS: ${m}`),
    error: (m) => log.push(`ERROR: ${m}`),
    warning: (m) => log.push(`WARNING: ${m}`),
    info: (m) => log.push(`INFO: ${m}`),
    dim: (m) => log.push(`DIM: ${m}`),
    table: () => log.push('TABLE'),
    list: (items) => log.push(`LIST: ${items.join('|')}`),
    section: () => log.push('SECTION'),
    spinner: (m) => ({ stop: (msg?: string) => log.push(`SPINNER: ${msg ?? m}`) }),
    newline: () => log.push(''),
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: (d) => log.push(`KV: ${JSON.stringify(d)}`),
    code: (c) => log.push(`CODE: ${c}`),
  };
  return { log, out };
}

async function rmRetry(p: string) {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(p, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

function args(
  subcommand: string,
  flags: Record<string, string | number | boolean> = {}
): ParsedArgs {
  return {
    command: 'character',
    subcommand,
    positional: [subcommand],
    arguments: {},
    flags,
    raw: '',
  };
}

describe('character-handler coverage', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let log: string[];
  let out: OutputFormatter;
  let projectId: number;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'char-h-'));
    ext = new TestNovelWriterExtension(dir);
    await ext.initialize({ title: 'T', author: 'A', genre: 'Fantasy', targetWordCount: 1000 });
    projectId = ext.getProjectId()!;
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    ext?.cleanup();
    await rmRetry(dir);
  });

  async function seedChar(c: CharacterYAML) {
    return ext.getCharacterBuilder().create(c);
  }

  // ── dispatcher ────────────────────────────────────────────────────────────
  it('unknown subcommand', async () => {
    await handleCharacterCommand(args('frobnicate'), dir, out, ext);
    expect(log.some((l) => l.includes('Unknown character subcommand'))).toBe(true);
  });

  it('dispatches via positional[0] when subcommand unset', async () => {
    const a: ParsedArgs = {
      command: 'character',
      positional: ['list'],
      arguments: {},
      flags: {},
      raw: '',
    };
    await handleCharacterCommand(a, dir, out, ext);
    expect(log.some((l) => l.includes('No characters found'))).toBe(true);
  });

  // ── create ────────────────────────────────────────────────────────────────
  it('create requires --name', async () => {
    await handleCharacterCommand(args('create', { role: 'major', summary: 's' }), dir, out, ext);
    expect(log.some((l) => l.includes('Character name required'))).toBe(true);
  });

  it('create requires --role', async () => {
    await handleCharacterCommand(args('create', { name: 'X', summary: 's' }), dir, out, ext);
    expect(log.some((l) => l.includes('Character role required'))).toBe(true);
  });

  it('create requires --summary', async () => {
    await handleCharacterCommand(args('create', { name: 'X', role: 'major' }), dir, out, ext);
    expect(log.some((l) => l.includes('Character summary required'))).toBe(true);
  });

  it('create with physical + personality flags succeeds and syncs', async () => {
    await handleCharacterCommand(
      args('create', {
        name: 'Full Build',
        role: 'protagonist',
        summary: 'A complete character',
        age: '40',
        'eye-color': 'grey',
        'hair-color': 'white',
        height: '180cm',
        build: 'lean',
        personality: 'stoic',
      }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Character created'))).toBe(true);
    expect(log.some((l) => l.includes('Synced to database'))).toBe(true);
  });

  it('create reports validation errors', async () => {
    // whitespace name passes the truthy guard but fails builder.validate()
    await handleCharacterCommand(
      args('create', { name: '   ', role: 'major', summary: 'x' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Validation errors'))).toBe(true);
  });

  // ── list ──────────────────────────────────────────────────────────────────
  it('list shows empty message', async () => {
    await handleCharacterCommand(args('list'), dir, out, ext);
    expect(log.some((l) => l.includes('No characters found'))).toBe(true);
  });

  it('list renders long and short summaries', async () => {
    await seedChar({ name: 'Longy', role: 'major', summary: 'x'.repeat(90) });
    await seedChar({ name: 'Shorty', role: 'minor', summary: 'brief' });
    await handleCharacterCommand(args('list'), dir, out, ext);
    expect(log.some((l) => l.includes('Longy'))).toBe(true);
    expect(log.some((l) => l.includes('Total: 2 characters'))).toBe(true);
  });

  // ── show ──────────────────────────────────────────────────────────────────
  it('show requires --name', async () => {
    await handleCharacterCommand(args('show'), dir, out, ext);
    expect(log.some((l) => l.includes('Character name required'))).toBe(true);
  });

  it('show reports not found', async () => {
    await handleCharacterCommand(args('show', { name: 'Ghost' }), dir, out, ext);
    expect(log.some((l) => l.includes('Character not found'))).toBe(true);
  });

  it('show basic info hints at --all', async () => {
    await seedChar({ name: 'Basic', role: 'minor', summary: 'plain' });
    await handleCharacterCommand(args('show', { name: 'Basic' }), dir, out, ext);
    expect(log.some((l) => l.includes('=== Basic ==='))).toBe(true);
    expect(log.some((l) => l.includes('Use --all'))).toBe(true);
  });

  it('show --all renders every optional section', async () => {
    await seedChar({
      name: 'Detailed',
      role: 'protagonist',
      fullName: 'Detailed Full Name',
      summary: 'a deep character',
      physical: { age: '30', eyeColor: 'blue' },
      personality: { core: 'curious' },
      background: { origin: 'mountains', family: 'orphan' },
      skills: { combat: 'expert', cooking: 'novice' },
      voice: {
        patterns: ['speaks slowly', 'uses metaphors'],
        vocabulary: 'archaic',
        quirks: ['hums', 'taps foot'],
      },
      arc: {
        startingState: 'naive',
        endingState: 'wise',
        midpointCrisis: 'betrayal',
      },
      notes: 'a note worth keeping',
    });
    await handleCharacterCommand(args('show', { name: 'Detailed', all: true }), dir, out, ext);
    expect(log.some((l) => l.includes('Background:'))).toBe(true);
    expect(log.some((l) => l.includes('Skills:'))).toBe(true);
    expect(log.some((l) => l.includes('Voice:'))).toBe(true);
    expect(log.some((l) => l.includes('Patterns:'))).toBe(true);
    expect(log.some((l) => l.includes('Vocabulary'))).toBe(true);
    expect(log.some((l) => l.includes('Quirks:'))).toBe(true);
    expect(log.some((l) => l.includes('Character Arc:'))).toBe(true);
    expect(log.some((l) => l.includes('betrayal'))).toBe(true);
    expect(log.some((l) => l.includes('Notes:'))).toBe(true);
  });

  it('show resolves a substring name match', async () => {
    await seedChar({ name: 'Alexander Hamilton', role: 'major', summary: 'founding father' });
    await handleCharacterCommand(args('show', { name: 'Hamilton' }), dir, out, ext);
    expect(log.some((l) => l.includes('=== Alexander Hamilton ==='))).toBe(true);
  });

  // ── edit ──────────────────────────────────────────────────────────────────
  it('edit requires --name', async () => {
    await handleCharacterCommand(args('edit'), dir, out, ext);
    expect(log.some((l) => l.includes('Character name required'))).toBe(true);
  });

  it('edit reports not found', async () => {
    await handleCharacterCommand(args('edit', { name: 'Ghost', role: 'major' }), dir, out, ext);
    expect(log.some((l) => l.includes('Character not found'))).toBe(true);
  });

  it('edit errors when no updates specified', async () => {
    await seedChar({ name: 'Editable', role: 'minor', summary: 's' });
    await handleCharacterCommand(args('edit', { name: 'Editable' }), dir, out, ext);
    expect(log.some((l) => l.includes('No updates specified'))).toBe(true);
  });

  it('edit applies role, summary, all physical fields and personality, then syncs', async () => {
    await seedChar({ name: 'Editable', role: 'minor', summary: 's' });
    await handleCharacterCommand(
      args('edit', {
        name: 'Editable',
        role: 'major',
        summary: 'updated summary',
        age: '50',
        'eye-color': 'hazel',
        'hair-color': 'silver',
        height: '183cm',
        build: 'stocky',
        personality: 'reserved',
      }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Character updated: Editable'))).toBe(true);
    expect(log.some((l) => l.includes('Synced to database'))).toBe(true);
  });

  // ── delete ────────────────────────────────────────────────────────────────
  it('delete requires --name', async () => {
    await handleCharacterCommand(args('delete'), dir, out, ext);
    expect(log.some((l) => l.includes('Character name required'))).toBe(true);
  });

  it('delete reports not found', async () => {
    await handleCharacterCommand(args('delete', { name: 'Ghost' }), dir, out, ext);
    expect(log.some((l) => l.includes('Character not found'))).toBe(true);
  });

  it('delete removes the file', async () => {
    await seedChar({ name: 'Doomed', role: 'background', summary: 'gone soon' });
    await handleCharacterCommand(args('delete', { name: 'Doomed' }), dir, out, ext);
    expect(log.some((l) => l.includes('Character deleted: Doomed'))).toBe(true);
    const files = await ext.getCharacterBuilder().list();
    expect(files.length).toBe(0);
  });

  // ── sync ──────────────────────────────────────────────────────────────────
  it('sync errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'char-empty-'));
    try {
      await handleCharacterCommand(args('sync'), empty, out, ext);
      expect(log.some((l) => l.includes('Project not initialized'))).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('sync reports nothing to sync when no files', async () => {
    await handleCharacterCommand(args('sync'), dir, out, ext);
    expect(log.some((l) => l.includes('No characters to sync'))).toBe(true);
  });

  it('sync all characters', async () => {
    await seedChar({ name: 'A One', role: 'major', summary: 's' });
    await seedChar({ name: 'B Two', role: 'minor', summary: 's' });
    await handleCharacterCommand(args('sync'), dir, out, ext);
    expect(log.some((l) => l.includes('Synced 2 characters'))).toBe(true);
  });

  it('sync single character', async () => {
    await seedChar({ name: 'Solo', role: 'major', summary: 's' });
    await handleCharacterCommand(args('sync', { name: 'Solo' }), dir, out, ext);
    expect(log.some((l) => l.includes('Character synced: Solo'))).toBe(true);
  });

  it('sync single not found', async () => {
    await handleCharacterCommand(args('sync', { name: 'Ghost' }), dir, out, ext);
    expect(log.some((l) => l.includes('Character not found: Ghost'))).toBe(true);
  });

  // ── scenes ────────────────────────────────────────────────────────────────
  it('scenes errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'char-empty2-'));
    try {
      await handleCharacterCommand(args('scenes', { name: 'X' }), empty, out, ext);
      expect(log.some((l) => l.includes('Project not initialized'))).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('scenes requires --name', async () => {
    await handleCharacterCommand(args('scenes'), dir, out, ext);
    expect(log.some((l) => l.includes('Character name required'))).toBe(true);
  });

  it('scenes reports character not in database', async () => {
    await handleCharacterCommand(args('scenes', { name: 'Ghost' }), dir, out, ext);
    expect(log.some((l) => l.includes('Character not found in database'))).toBe(true);
  });

  it('scenes reports no scenes for a character', async () => {
    const mcp = (ext as any).mcpClient;
    await mcp.writeQuery(
      'INSERT INTO characters (project_id, name, role, summary) VALUES (?, ?, ?, ?)',
      [projectId, 'Loner', 'minor', 's']
    );
    await handleCharacterCommand(args('scenes', { name: 'Loner' }), dir, out, ext);
    expect(log.some((l) => l.includes('No scenes found featuring'))).toBe(true);
  });

  it('scenes lists scenes grouped across multiple chapters', async () => {
    const mcp = (ext as any).mcpClient;
    await mcp.writeQuery(
      'INSERT INTO characters (project_id, name, role, summary) VALUES (?, ?, ?, ?)',
      [projectId, 'Hero', 'protagonist', 's']
    );
    const charId = (await mcp.readQuery('SELECT id FROM characters WHERE name = ?', ['Hero']))[0].id;
    for (const [num, title] of [[1, 'Beginnings'], [2, 'Rising']] as [number, string][]) {
      await mcp.writeQuery(
        'INSERT INTO chapters (project_id, chapter_number, title) VALUES (?, ?, ?)',
        [projectId, num, title]
      );
    }
    const chapters = await mcp.readQuery(
      'SELECT id, chapter_number FROM chapters ORDER BY chapter_number',
      []
    );
    let sceneNo = 1;
    for (const ch of chapters) {
      await mcp.writeQuery(
        'INSERT INTO scenes (chapter_id, scene_number, title, pov_character_id, word_count) VALUES (?, ?, ?, ?, ?)',
        [ch.id, 1, `Scene ${sceneNo++}`, charId, 400]
      );
    }
    await handleCharacterCommand(args('scenes', { name: 'Hero' }), dir, out, ext);
    expect(log.some((l) => l.includes('Scenes featuring Hero'))).toBe(true);
    expect(log.some((l) => l.includes('Chapter 1: Beginnings'))).toBe(true);
    expect(log.some((l) => l.includes('Chapter 2: Rising'))).toBe(true);
    expect(log.some((l) => l.includes('Total: 2 scenes'))).toBe(true);
  });

  // ── arc & states helpers ────────────────────────────────────────────────────
  async function seedArc(
    name: string,
    states: string[]
  ): Promise<void> {
    const mcp = (ext as any).mcpClient;
    await mcp.writeQuery(
      'INSERT INTO characters (project_id, name, role, summary) VALUES (?, ?, ?, ?)',
      [projectId, name, 'major', 's']
    );
    const charId = (await mcp.readQuery('SELECT id FROM characters WHERE name = ?', [name]))[0].id;
    // chapter 1 (idempotent across calls — only insert if missing)
    const existing = await mcp.readQuery('SELECT id FROM chapters WHERE chapter_number = 1', []);
    let chapterId: number;
    if (existing.length === 0) {
      await mcp.writeQuery(
        'INSERT INTO chapters (project_id, chapter_number, title) VALUES (?, ?, ?)',
        [projectId, 1, 'Chapter One']
      );
      chapterId = (await mcp.readQuery('SELECT id FROM chapters WHERE chapter_number = 1', []))[0].id;
    } else {
      chapterId = existing[0].id;
    }
    const arcService = ext.getCharacterArcService();
    // Use scene_number namespaced per character to keep UNIQUE(chapter_id, scene_number) happy.
    const base = charId * 100;
    for (let i = 0; i < states.length; i++) {
      const sceneNumber = base + i + 1;
      await mcp.writeQuery(
        'INSERT INTO scenes (chapter_id, scene_number, title, pov_character_id) VALUES (?, ?, ?, ?)',
        [chapterId, sceneNumber, `${name} scene ${i + 1}`, charId]
      );
      const sceneId = (
        await mcp.readQuery('SELECT id FROM scenes WHERE chapter_id = ? AND scene_number = ?', [
          chapterId,
          sceneNumber,
        ])
      )[0].id;
      await arcService.recordState(String(projectId), charId, sceneId, states[i] as any);
    }
  }

  // ── arc ─────────────────────────────────────────────────────────────────────
  it('arc errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'char-empty3-'));
    try {
      await handleCharacterCommand(args('arc', { name: 'X' }), empty, out, ext);
      expect(log.some((l) => l.includes('Project not initialized'))).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('arc requires --name', async () => {
    await handleCharacterCommand(args('arc'), dir, out, ext);
    expect(log.some((l) => l.includes('Character name required'))).toBe(true);
  });

  it('arc reports no data for an unknown character', async () => {
    await handleCharacterCommand(args('arc', { name: 'Nobody' }), dir, out, ext);
    expect(log.some((l) => l.includes('No arc data found'))).toBe(true);
  });

  it('arc renders a single completed arc timeline', async () => {
    await seedArc('Aria', ['hopeful', 'determined', 'transformed']);
    await handleCharacterCommand(args('arc', { name: 'Aria' }), dir, out, ext);
    expect(log.some((l) => l.includes('Character Arc: Aria'))).toBe(true);
    expect(log.some((l) => l.includes('Ch1'))).toBe(true);
  });

  it('arc flags an incomplete arc with a static run', async () => {
    // three identical states → first === last (incomplete) AND a static run of 3
    await seedArc('Static', ['neutral', 'neutral', 'neutral']);
    await handleCharacterCommand(args('arc', { name: 'Static' }), dir, out, ext);
    expect(log.some((l) => l.includes('Arc incomplete'))).toBe(true);
    expect(log.some((l) => l.includes('Static runs'))).toBe(true);
  });

  it('arc compares two characters (both present)', async () => {
    await seedArc('Hero', ['fearful', 'determined']);
    await seedArc('Foil', ['joyful', 'grieving']);
    await handleCharacterCommand(args('arc', { name: 'Hero', compare: 'Foil' }), dir, out, ext);
    expect(log.some((l) => l.includes('Arc Comparison: Hero vs Foil'))).toBe(true);
    expect(log.some((l) => l.includes('Hero:'))).toBe(true);
    expect(log.some((l) => l.includes('Foil:'))).toBe(true);
  });

  it('arc compare reports missing arc data for both sides', async () => {
    await handleCharacterCommand(
      args('arc', { name: 'NoOne', compare: 'NoTwo' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('NoOne: no arc data found'))).toBe(true);
    expect(log.some((l) => l.includes('NoTwo: no arc data found'))).toBe(true);
  });

  // ── states ───────────────────────────────────────────────────────────────────
  it('states errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'char-empty4-'));
    try {
      await handleCharacterCommand(args('states', { chapter: 1 }), empty, out, ext);
      expect(log.some((l) => l.includes('Project not initialized'))).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('states requires --chapter', async () => {
    await handleCharacterCommand(args('states'), dir, out, ext);
    expect(log.some((l) => l.includes('Chapter number required'))).toBe(true);
  });

  it('states reports none recorded for a chapter', async () => {
    await handleCharacterCommand(args('states', { chapter: 99 }), dir, out, ext);
    expect(log.some((l) => l.includes('No character states recorded'))).toBe(true);
  });

  it('states renders a table of recorded states', async () => {
    await seedArc('Aria', ['hopeful', 'determined']);
    await handleCharacterCommand(args('states', { chapter: 1 }), dir, out, ext);
    expect(log.some((l) => l.includes('Character States — Chapter 1'))).toBe(true);
    expect(log.some((l) => l.includes('Aria'))).toBe(true);
  });
});
