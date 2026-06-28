/**
 * Coverage tests for the `analyze` CLI handler.
 *
 * Drives `handleAnalyzeCommand(args, projectPath, output)` across every
 * sub-command. The handler constructs its OWN NovelWriterExtension from the
 * project path (a real DirectSQLiteClient over `<dir>/.novel/data.db`), so the
 * fixture must be a real on-disk project: an initialized database plus chapter
 * markdown files, characters, scenes, and plot threads.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleAnalyzeCommand } from '../../project/src/cli/handlers/analyze-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';

// ─── Output capture ───────────────────────────────────────────────────────────

function makeOutput(): { output: OutputFormatter; log: string[] } {
  const log: string[] = [];
  const output: OutputFormatter = {
    success: (m: string) => log.push(`SUCCESS: ${m}`),
    error: (m: string) => log.push(`ERROR: ${m}`),
    warning: (m: string) => log.push(`WARNING: ${m}`),
    info: (m: string) => log.push(`INFO: ${m}`),
    dim: (m: string) => log.push(`DIM: ${m}`),
    table: () => log.push('TABLE'),
    list: () => log.push('LIST'),
    section: () => log.push('SECTION'),
    spinner: () => ({ stop: () => {} }),
    newline: () => log.push(''),
    heading: (t: string) => log.push(`HEADING: ${t}`),
    keyValue: () => log.push('KEYVALUE'),
    code: () => log.push('CODE'),
  };
  return { output, log };
}

function args(subcommand: string, flags: Record<string, string | number | boolean> = {}): ParsedArgs {
  return {
    command: 'analyze',
    subcommand,
    positional: [],
    arguments: {},
    flags,
    raw: `/novel analyze ${subcommand}`,
  };
}

async function rmWithRetry(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

// ─── Chapter fixtures ─────────────────────────────────────────────────────────

const CH1 = `---
title: The Beginning
---

# Chapter 1

<!-- scene:1 -->
<!-- title: Opening -->
<!-- pov: Alice Walker -->
<!-- location: Police Station -->
<!-- purpose: Establish the central mystery of the story -->
<!-- tension: 7 -->

Alice walked into the cold room and the harsh lights flickered overhead.
Alice said "We need to find the whole truth before it is far too late."
Alice said "I will not rest for a moment until this strange case is solved."
Alice said "Something here simply does not add up at all, my friend."
She heard a sharp sound. She smelled the bitter smoke. The rough brick wall
scraped against her trembling hand as the bright lamp glared at her.

<!-- /scene:1 -->

<!-- scene:2 -->
<!-- title: Confrontation -->
<!-- pov: Bob Smith -->
<!-- tension: 8 -->

Bob said "You absolutely cannot hide from me forever, you know."
Bob said "Tell me everything that you know about this right now."
Bob said "I have waited far too long for this single perfect moment."
The angry tall man was furious and the situation was very tense indeed.

<!-- /scene:2 -->
`;

const CH2 = `---
title: The Quiet Middle
---

# Chapter 2

<!-- scene:1 -->
<!-- title: A Calm Beat -->
<!-- pov: Alice Walker -->
<!-- purpose: A quiet character beat to slow the pace -->
<!-- tension: 2 -->

Alice said "Maybe we should take a quiet break and finally rest now."
Alice said "It has been a very long and tiring week for both of us."
Alice said "I just want one single moment of calm before the coming storm."
The peaceful garden smelled sweetly of roses and soft birds sang in the light.

<!-- /scene:1 -->
`;

const CH3 = `---
title: The Finale
---

# Chapter 3

<!-- scene:1 -->
<!-- title: The Reckoning -->
<!-- pov: Bob Smith -->
<!-- purpose: Bring every thread to a decisive head -->
<!-- tension: 9 -->

Bob said "This finally ends here tonight, once and for all of us."
Bob said "Everything that we feared has now truly come to pass."
Bob said "Stand beside me now and we will see this difficult thing through."
The storm roared loudly and the salty sea spray stung against their faces.
${Array.from({ length: 60 }, (_, i) => `The waves crashed against the rocks as the long night wore endlessly on toward dawn number ${i}.`).join(' ')}

<!-- /scene:1 -->
`;

// ─── Shared populated project ─────────────────────────────────────────────────

describe('analyze handler — populated project', () => {
  let dir: string;
  let extension: TestNovelWriterExtension;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'analyze-pop-'));
    extension = new TestNovelWriterExtension(dir);
    await extension.initialize({
      title: 'Coverage Novel',
      author: 'Tester',
      genre: 'Mystery',
      targetWordCount: 80000,
    });

    // Characters (needed for POV resolution + name checks)
    const builder = extension.getCharacterBuilder();
    await builder.create({ name: 'Alice Walker', role: 'protagonist', summary: 'Detective' });
    await builder.create({ name: 'Bob Smith', role: 'major', summary: 'Partner' });
    const charSync = extension.getCharacterSync();
    for (const f of await builder.list()) {
      await charSync.syncCharacterFile(f);
    }

    // Chapter markdown files
    const chaptersDir = join(dir, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    const files: Array<[string, string]> = [
      ['01-beginning.md', CH1],
      ['02-middle.md', CH2],
      ['03-finale.md', CH3],
    ];
    const chapterSync = extension.getChapterSync();
    const sceneSync = extension.getSceneSync();
    for (const [name, content] of files) {
      const p = join(chaptersDir, name);
      await writeFile(p, content, 'utf-8');
      await chapterSync.syncChapterFile(p);
      await sceneSync.syncChapterScenes(p, {
        resolveCharacterNames: true,
        resolveLocationNames: false,
      });
    }

    // style-targets.yml — exercises the file-sourced targets branch
    await writeFile(join(dir, 'style-targets.yml'), 'tense: past\n', 'utf-8');

    // Plot threads + beats (for subplots / plot-holes)
    const mcp = (extension as any).mcpClient;
    const projectId = extension.getProjectId();

    const sceneId = async (chapterNumber: number, sceneNumber: number): Promise<number> => {
      const rows = await mcp.readQuery(
        `SELECT s.id FROM scenes s JOIN chapters c ON s.chapter_id = c.id
         WHERE c.project_id = ? AND c.chapter_number = ? AND s.scene_number = ?`,
        [projectId, chapterNumber, sceneNumber]
      );
      return rows[0].id as number;
    };

    const insertThread = async (name: string, status: string): Promise<number> => {
      await mcp.writeQuery(
        `INSERT INTO plot_threads (project_id, thread_name, thread_type, status, priority)
         VALUES (?, ?, 'subplot', ?, 8)`,
        [projectId, name, status]
      );
      const r = await mcp.readQuery('SELECT last_insert_rowid() as id', []);
      return r[0].id as number;
    };

    const insertBeat = async (
      threadId: number,
      sId: number,
      order: number
    ): Promise<void> => {
      await mcp.writeQuery(
        `INSERT INTO plot_beats (plot_thread_id, scene_id, beat_order, description, beat_type)
         VALUES (?, ?, ?, 'beat', 'development')`,
        [threadId, sId, order]
      );
    };

    // Thread A: well developed (4 beats, recent activity in ch3)
    const threadA = await insertThread('Main Mystery', 'active');
    await insertBeat(threadA, await sceneId(1, 1), 1);
    await insertBeat(threadA, await sceneId(1, 2), 2);
    await insertBeat(threadA, await sceneId(2, 1), 3);
    await insertBeat(threadA, await sceneId(3, 1), 4);

    // Thread B: underdeveloped (1 beat, in ch1)
    const threadB = await insertThread('Romance Subplot', 'active');
    await insertBeat(threadB, await sceneId(1, 1), 1);

    // Thread C: open with no beats → plot hole
    await insertThread('Forgotten Thread', 'active');
  });

  afterAll(async () => {
    extension.cleanup();
    await rmWithRetry(dir);
  });

  it('tension-arc renders chapter bars', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('tension-arc'), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Tension Arc'))).toBe(true);
    expect(log.some((l) => l.includes('Ch1'))).toBe(true);
  });

  it('pov-balance renders a table', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('pov-balance'), dir, output);
    expect(log).toContain('TABLE');
    expect(log.some((l) => l.startsWith('HEADING: POV Balance'))).toBe(true);
  });

  it('chapter-lengths renders a table', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('chapter-lengths'), dir, output);
    expect(log).toContain('TABLE');
  });

  it('pacing produces a full report', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('pacing'), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Pacing Report'))).toBe(true);
    expect(log).toContain('CODE');
  });

  it('default subcommand falls back to pacing', async () => {
    const { output, log } = makeOutput();
    const a = args('pacing');
    delete (a as any).subcommand;
    a.positional = [];
    await handleAnalyzeCommand(a, dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Pacing Report'))).toBe(true);
  });

  it('conflict lists low-conflict chapters', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('conflict'), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Low-Conflict'))).toBe(true);
    expect(log).toContain('TABLE');
  });

  it('prose --chapter analyzes a single chapter', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('prose', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.includes('Prose Analysis'))).toBe(true);
  });

  it('prose --all analyzes every chapter', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('prose', { all: true }), dir, output);
    expect(log.some((l) => l.includes('Prose Analysis — All Chapters'))).toBe(true);
  });

  it('prose without flag reports an error', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('prose', {}), dir, output);
    expect(log.some((l) => l.startsWith('ERROR:') && l.includes('--chapter'))).toBe(true);
  });

  it('prose with missing chapter number reports an error', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('prose', { chapter: 99 }), dir, output);
    expect(log.some((l) => l.startsWith('ERROR:') && l.includes('No chapter file'))).toBe(true);
  });

  it('sentences analyzes rhythm checks', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('sentences', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.includes('Sentence Rhythm'))).toBe(true);
  });

  it('dialogue analyzes a chapter', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('dialogue', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.includes('Dialogue Analysis'))).toBe(true);
  });

  it('read-aloud prepares clean text', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('read-aloud', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Read-Aloud'))).toBe(true);
  });

  it('rhythm reports rhythm flags', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('rhythm', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Rhythm'))).toBe(true);
  });

  it('scenes lists all scenes', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('scenes'), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Scene Purpose Audit'))).toBe(true);
    expect(log).toContain('TABLE');
  });

  it('scenes --purpose flags scenes missing a purpose', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('scenes', { purpose: true }), dir, output);
    expect(log.some((l) => l.startsWith('WARNING:') && l.includes('missing a purpose'))).toBe(true);
  });

  it('subplots flags underdeveloped threads', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('subplots'), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Subplot Balance'))).toBe(true);
    expect(log.some((l) => l.startsWith('WARNING:') && l.includes('underdeveloped'))).toBe(true);
  });

  it('plot-holes detects open threads with no recent beats', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('plot-holes'), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Potential Plot Holes'))).toBe(true);
    expect(log).toContain('TABLE');
  });

  it('copy edits a chapter with explicit pov and tense', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(
      args('copy', { chapter: 1, pov: 'Alice Walker', tense: 'past' }),
      dir,
      output
    );
    expect(log.some((l) => l.includes('Copy Edit'))).toBe(true);
  });

  it('copy falls back to style-target tense when no --tense flag', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('copy', { chapter: 2 }), dir, output);
    expect(log.some((l) => l.includes('Copy Edit'))).toBe(true);
    expect(log.some((l) => l.startsWith('DIM:') && l.includes('expected tense'))).toBe(true);
  });

  it('dialogue-reader groups dialogue by character', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('dialogue-reader', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Dialogue Reader'))).toBe(true);
    expect(log.some((l) => l.includes('[ALICE]'))).toBe(true);
  });

  it('sensory reports sensory balance', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('sensory', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Sensory Balance'))).toBe(true);
    expect(log).toContain('TABLE');
  });

  it('show-tell reports the show/tell ratio', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('show-tell', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Show vs Tell'))).toBe(true);
  });

  it('style --chapter grades a single chapter', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('style', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.includes('Style Targets'))).toBe(true);
    expect(log).toContain('TABLE');
  });

  it('style --all grades every chapter', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('style', { all: true }), dir, output);
    expect(log.some((l) => l.includes('Style Targets'))).toBe(true);
  });

  it('voice analyzes character voices', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('voice'), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Character Voice Analysis'))).toBe(true);
    expect(log).toContain('TABLE');
  });

  it('voice --character narrows to one known character', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('voice', { character: 'Alice Walker' }), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Character Voice Analysis'))).toBe(true);
  });

  it('voice --character with unknown name warns', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('voice', { character: 'Nobody' }), dir, output);
    expect(log.some((l) => l.startsWith('WARNING:') && l.includes('Nobody'))).toBe(true);
  });

  it('unknown subcommand reports an error and lists options', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('not-a-real-subcommand'), dir, output);
    expect(log.some((l) => l.startsWith('ERROR:') && l.includes('Unknown analyze subcommand'))).toBe(true);
    expect(log.some((l) => l.startsWith('INFO:') && l.includes('Available:'))).toBe(true);
  });
});

// ─── Well-developed project (all-good success branches) ───────────────────────

const CH_GOOD = `---
title: Solid Chapter
---

# Chapter 1

<!-- scene:1 -->
<!-- title: Solid Scene -->
<!-- pov: Alice Walker -->
<!-- purpose: A scene that fully declares its narrative purpose -->
<!-- tension: 5 -->

Alice said "Every single scene here has a clearly declared purpose for once."
The room was warm and the soft light fell gently across the wooden floor.

<!-- /scene:1 -->
`;

describe('analyze handler — well-developed project', () => {
  let dir: string;
  let extension: TestNovelWriterExtension;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'analyze-good-'));
    extension = new TestNovelWriterExtension(dir);
    await extension.initialize({
      title: 'Good Novel',
      author: 'Tester',
      genre: 'Mystery',
      targetWordCount: 80000,
    });

    const builder = extension.getCharacterBuilder();
    await builder.create({ name: 'Alice Walker', role: 'protagonist', summary: 'Detective' });
    const charSync = extension.getCharacterSync();
    for (const f of await builder.list()) await charSync.syncCharacterFile(f);

    const chaptersDir = join(dir, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    const p = join(chaptersDir, '01-solid.md');
    await writeFile(p, CH_GOOD, 'utf-8');
    await extension.getChapterSync().syncChapterFile(p);
    await extension
      .getSceneSync()
      .syncChapterScenes(p, { resolveCharacterNames: true, resolveLocationNames: false });

    // One plot thread with 3 beats → not underdeveloped
    const mcp = (extension as any).mcpClient;
    const projectId = extension.getProjectId();
    const rows = await mcp.readQuery(
      `SELECT s.id FROM scenes s JOIN chapters c ON s.chapter_id = c.id
       WHERE c.project_id = ? ORDER BY s.id`,
      [projectId]
    );
    const sId = rows[0].id as number;
    await mcp.writeQuery(
      `INSERT INTO plot_threads (project_id, thread_name, thread_type, status, priority)
       VALUES (?, 'Solid Thread', 'main', 'active', 9)`,
      [projectId]
    );
    const tr = await mcp.readQuery('SELECT last_insert_rowid() as id', []);
    const threadId = tr[0].id as number;
    for (let i = 1; i <= 3; i++) {
      await mcp.writeQuery(
        `INSERT INTO plot_beats (plot_thread_id, scene_id, beat_order, description, beat_type)
         VALUES (?, ?, ?, 'beat', 'development')`,
        [threadId, sId, i]
      );
    }
  });

  afterAll(async () => {
    extension.cleanup();
    await rmWithRetry(dir);
  });

  it('scenes --purpose reports all scenes have a purpose', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('scenes', { purpose: true }), dir, output);
    expect(log.some((l) => l.includes('All scenes have a declared purpose'))).toBe(true);
  });

  it('subplots reports all threads sufficiently developed', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('subplots'), dir, output);
    expect(log.some((l) => l.includes('3 or more beats'))).toBe(true);
  });
});

// ─── Empty project (initialized DB, no data) ──────────────────────────────────

describe('analyze handler — empty initialized project', () => {
  let dir: string;
  let extension: TestNovelWriterExtension;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'analyze-empty-'));
    extension = new TestNovelWriterExtension(dir);
    await extension.initialize({
      title: 'Empty Novel',
      author: 'Tester',
      genre: 'Mystery',
      targetWordCount: 80000,
    });
  });

  afterAll(async () => {
    extension.cleanup();
    await rmWithRetry(dir);
  });

  it('tension-arc reports no chapters', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('tension-arc'), dir, output);
    expect(log.some((l) => l.includes('No chapters found'))).toBe(true);
  });

  it('pov-balance reports no POV scenes', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('pov-balance'), dir, output);
    expect(log.some((l) => l.includes('No POV scenes found'))).toBe(true);
  });

  it('chapter-lengths reports no chapters', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('chapter-lengths'), dir, output);
    expect(log.some((l) => l.includes('No chapters found'))).toBe(true);
  });

  it('pacing handles empty data', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('pacing'), dir, output);
    expect(log.some((l) => l.startsWith('DIM:') && l.includes('No POV data'))).toBe(true);
    expect(log.some((l) => l.startsWith('DIM:') && l.includes('No chapters'))).toBe(true);
    expect(log.some((l) => l.startsWith('SUCCESS:') && l.includes('No pacing issues'))).toBe(true);
  });

  it('conflict reports no low-conflict chapters', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('conflict'), dir, output);
    expect(log.some((l) => l.includes('No low-conflict chapters'))).toBe(true);
  });

  it('scenes reports no scenes', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('scenes'), dir, output);
    expect(log.some((l) => l.includes('No scenes found'))).toBe(true);
  });

  it('subplots reports no plot threads', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('subplots'), dir, output);
    expect(log.some((l) => l.includes('No plot threads found'))).toBe(true);
  });

  it('plot-holes reports none detected', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('plot-holes'), dir, output);
    expect(log.some((l) => l.includes('No plot holes detected'))).toBe(true);
  });

  it('voice reports no dialogue found', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('voice'), dir, output);
    expect(log.some((l) => l.includes('No character dialogue found'))).toBe(true);
  });

  it('prose --all reports no chapter files', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('prose', { all: true }), dir, output);
    expect(log.some((l) => l.includes('No chapter files found'))).toBe(true);
  });

  it('style --all reports no chapter files', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('style', { all: true }), dir, output);
    expect(log.some((l) => l.includes('No chapter files found'))).toBe(true);
  });

  it('prose --chapter reports missing chapters directory', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('prose', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.startsWith('ERROR:') && l.includes('chapters/ directory not found'))).toBe(true);
  });
});

// ─── No project (database not initialized) ────────────────────────────────────

describe('analyze handler — uninitialized project', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'analyze-noinit-'));
  });

  afterAll(async () => {
    await rmWithRetry(dir);
  });

  it('tension-arc requires an initialized project', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('tension-arc'), dir, output);
    expect(log.some((l) => l.includes('Project not initialized'))).toBe(true);
  });

  it('scenes requires an initialized project', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('scenes'), dir, output);
    expect(log.some((l) => l.includes('Project not initialized'))).toBe(true);
  });
});
