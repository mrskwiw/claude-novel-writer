/**
 * Coverage tests: src/cli/handlers/export-handler.ts
 *
 * handleExportCommand(args, projectPath, output, injectedExtension?)
 *
 * Uses a real TestNovelWriterExtension (file-backed ManuscriptAssembler) with
 * seeded chapter files, and covers: default/manuscript/stats dispatch, markdown
 * export, the --with-header path, invalid-format guard, the pandoc/formatted
 * export error branch, the metadata-load catch, and the top-level catch.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, mkdtemp } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleExportCommand } from '../../project/src/cli/handlers/export-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';
import type { NovelWriterExtension } from '../../project/src/index.js';

function makeOutput() {
  const log: string[] = [];
  const out: OutputFormatter = {
    success: (m) => log.push(`SUCCESS: ${m}`),
    error: (m) => log.push(`ERROR: ${m}`),
    warning: (m) => log.push(`WARNING: ${m}`),
    info: (m) => log.push(`INFO: ${m}`),
    dim: (m) => log.push(`DIM: ${m}`),
    table: () => log.push('TABLE'),
    list: () => log.push('LIST'),
    section: () => log.push('SECTION'),
    spinner: () => ({ stop: () => {} }),
    newline: () => log.push(''),
    heading: () => log.push('HEADING'),
    keyValue: () => log.push('KEYVALUE'),
    code: () => log.push('CODE'),
  };
  return { log, out };
}

function args(subcommand: string | undefined, flags: Record<string, unknown> = {}): ParsedArgs {
  return {
    command: 'export',
    subcommand,
    positional: subcommand ? [subcommand] : [],
    arguments: {},
    flags: flags as Record<string, string | number | boolean>,
    raw: '',
  };
}

describe('export-handler coverage', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let log: string[];
  let out: OutputFormatter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'export-h-'));
    ext = new TestNovelWriterExtension(dir);
    await ext.initialize({ title: 'Test Novel', author: 'Tester', genre: 'Fantasy', targetWordCount: 80000, projectPath: dir });

    const chaptersDir = join(dir, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    await writeFile(
      join(chaptersDir, '01-opening.md'),
      '---\ntitle: The Beginning\nnumber: 1\nstatus: drafted\n---\n\n# The Beginning\n\nSarah looked out the window.\n',
      'utf-8'
    );
    await writeFile(
      join(chaptersDir, '02-conflict.md'),
      '---\ntitle: Rising Tension\nnumber: 2\nstatus: drafted\n---\n\n# Rising Tension\n\nTom confronted Sarah.\n',
      'utf-8'
    );

    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    ext.cleanup();
    for (let i = 0; i < 5; i++) {
      try { await rm(dir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
  });

  // ── dispatch ───────────────────────────────────────────────────────────────
  it('defaults to manuscript export when no subcommand', async () => {
    await handleExportCommand(args(undefined), dir, out, ext);
    expect(log.some((l) => l.includes('Manuscript exported'))).toBe(true);
    expect(existsSync(join(dir, 'export', 'manuscript.md'))).toBe(true);
  });

  it('exports markdown for the "manuscript" subcommand', async () => {
    await handleExportCommand(args('manuscript'), dir, out, ext);
    expect(log.some((l) => l.includes('Manuscript exported'))).toBe(true);
    // markdown tip is shown
    expect(log.some((l) => l.includes('DIM'))).toBe(true);
  });

  it('exports markdown with --with-header', async () => {
    await handleExportCommand(args('manuscript', { 'with-header': true, output: join(dir, 'export', 'h.md') }), dir, out, ext);
    expect(log.some((l) => l.includes('Manuscript exported'))).toBe(true);
    expect(existsSync(join(dir, 'export', 'h.md'))).toBe(true);
  });

  it('honours metadata + filter flags', async () => {
    await handleExportCommand(
      args('manuscript', {
        title: 'Epic', author: 'Jane', genre: 'SciFi', copyright: 'c', dedication: 'd',
        chapters: '1,2', status: 'drafted', 'no-metadata': true, 'scene-break': '\n***\n',
      }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Manuscript exported'))).toBe(true);
  });

  // ── invalid format ─────────────────────────────────────────────────────────
  it('rejects an invalid format', async () => {
    await handleExportCommand(args('manuscript', { format: 'banana' }), dir, out, ext);
    expect(log.some((l) => l.includes('Invalid format'))).toBe(true);
  });

  // ── formatted (pandoc) export error branch ─────────────────────────────────
  it('reports an error when a formatted (pandoc) conversion fails', async () => {
    // Force exportFormatted to throw so the catch + error branch runs regardless
    // of whether pandoc happens to be installed on the host.
    const realAsm = ext.getManuscriptAssembler();
    (ext as any).getManuscriptAssembler = () => ({
      exportFormatted: async () => { throw new Error('pandoc missing'); },
      getStats: realAsm.getStats.bind(realAsm),
      assemble: realAsm.assemble.bind(realAsm),
      exportToFile: realAsm.exportToFile.bind(realAsm),
      generateExportHeader: realAsm.generateExportHeader.bind(realAsm),
    });
    await handleExportCommand(args('manuscript', { format: 'docx', output: join(dir, 'export', 'm.docx') }), dir, out, ext);
    expect(log.some((l) => l.includes('ERROR') && l.includes('pandoc missing'))).toBe(true);
  });

  // ── stats ──────────────────────────────────────────────────────────────────
  it('shows manuscript statistics with a chapter breakdown', async () => {
    await handleExportCommand(args('stats'), dir, out, ext);
    expect(log.some((l) => l.includes('Manuscript Statistics'))).toBe(true);
    expect(log.some((l) => l.includes('Total Chapters: 2'))).toBe(true);
    expect(log.some((l) => l.includes('Ch 1: The Beginning'))).toBe(true);
  });

  it('shows statistics for filtered chapters', async () => {
    await handleExportCommand(args('stats', { chapters: '1', status: 'drafted' }), dir, out, ext);
    expect(log.some((l) => l.includes('Total Chapters: 1'))).toBe(true);
  });

  // ── metadata-load catch ────────────────────────────────────────────────────
  it('falls back to defaults when project metadata cannot be loaded', async () => {
    // Force loadProjectMetadata's readQuery to throw; assembler still reads files.
    (ext as any).mcpClient = {
      readQuery: async () => { throw new Error('db gone'); },
      writeQuery: async () => {},
    };
    await handleExportCommand(args('manuscript'), dir, out, ext);
    expect(log.some((l) => l.includes('Manuscript exported'))).toBe(true);
  });

  // ── top-level catch ────────────────────────────────────────────────────────
  it('reports failure when the assembler cannot be built (manuscript)', async () => {
    const broken = { getManuscriptAssembler: () => { throw new Error('no assembler'); } } as unknown as NovelWriterExtension;
    await handleExportCommand(args('manuscript'), dir, out, broken);
    expect(log.some((l) => l.includes('Failed to export manuscript'))).toBe(true);
  });

  it('reports failure when the assembler cannot be built (stats)', async () => {
    const broken = { getManuscriptAssembler: () => { throw new Error('no assembler'); } } as unknown as NovelWriterExtension;
    await handleExportCommand(args('stats'), dir, out, broken);
    expect(log.some((l) => l.includes('Failed to get statistics'))).toBe(true);
  });
});
