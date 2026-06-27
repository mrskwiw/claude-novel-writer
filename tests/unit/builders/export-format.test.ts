/**
 * Unit Tests for ManuscriptAssembler.exportFormatted (GAP-16)
 *
 * Covers:
 *   - ExportFormat type accepts the four expected values.
 *   - exportFormatted with format='markdown' delegates to assemble() and writes a file.
 *   - When pandoc is not available, error message contains "pandoc is not installed"
 *     and the manual pandoc command.
 *   - The --format flag on the export command defaults to 'markdown'.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ExportFormat } from '../../../project/src/types/novel.js';

// ---------------------------------------------------------------------------
// Mock child_process before any module that uses it is imported.
// ---------------------------------------------------------------------------
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// Mock the export handler to prevent the transitive import chain
// (export-handler → NovelWriterExtension → commands/novel → cli/index →
//  registry singleton) from crashing during module collection.
vi.mock('../../../project/src/cli/handlers/export-handler.js', () => ({
  handleExportCommand: vi.fn(),
}));

// Import the mocked execFile after the vi.mock declaration.
import { execFile } from 'child_process';
const mockedExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

// Import modules under test AFTER the mock declarations.
import { ManuscriptAssembler, type ManuscriptMetadata } from '../../../project/src/builders/manuscript-assembler.js';
import { exportCommand } from '../../../project/src/cli/commands/export.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stub execFile so that every call (including pandoc --version) succeeds. */
function stubPandocAvailable(): void {
  mockedExecFile.mockImplementation(
    (_cmd: string, _args: string[], callback: (...args: unknown[]) => void) => {
      callback(null, 'pandoc 3.x', '');
      return {} as ReturnType<typeof mockedExecFile>;
    }
  );
}

/** Stub execFile so that every call fails (pandoc not found). */
function stubPandocMissing(): void {
  mockedExecFile.mockImplementation(
    (_cmd: string, _args: string[], callback: (...args: unknown[]) => void) => {
      callback(new Error('Command not found: pandoc'));
      return {} as ReturnType<typeof mockedExecFile>;
    }
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportFormat type', () => {
  it('accepts all four valid format literals without compile errors', () => {
    // This is a compile-time check expressed as a runtime array assertion.
    const formats: ExportFormat[] = ['markdown', 'docx', 'epub', 'pdf'];
    expect(formats).toHaveLength(4);
    expect(formats).toContain('markdown');
    expect(formats).toContain('docx');
    expect(formats).toContain('epub');
    expect(formats).toContain('pdf');
  });
});

describe('ManuscriptAssembler.exportFormatted()', () => {
  let testDir: string;
  let assembler: ManuscriptAssembler;
  const metadata: ManuscriptMetadata = { title: 'Test Novel', author: 'Jane Doe' };

  beforeEach(async () => {
    testDir = join(tmpdir(), `export-format-test-${Date.now()}`);
    const chaptersDir = join(testDir, 'chapters');
    await mkdir(chaptersDir, { recursive: true });

    // A minimal chapter file so assemble() produces non-empty output.
    const chapter = [
      '---',
      'title: Chapter One',
      'number: 1',
      'status: drafted',
      '---',
      '',
      'Once upon a time.',
    ].join('\n');
    await writeFile(join(chaptersDir, '01-chapter-one.md'), chapter, 'utf-8');

    assembler = new ManuscriptAssembler(testDir);

    // Safest default for unit tests: pandoc not present.
    stubPandocMissing();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(testDir, { recursive: true, force: true });
  });

  // ── markdown ──────────────────────────────────────────────────────────────

  describe("format = 'markdown'", () => {
    it('writes assembled content to the output path', async () => {
      const outputPath = join(testDir, 'export', 'manuscript.md');

      const result = await assembler.exportFormatted(
        'proj-1',
        'markdown',
        outputPath,
        metadata
      );

      expect(result.format).toBe('markdown');
      expect(result.path).toBe(outputPath);

      const written = await readFile(outputPath, 'utf-8');
      expect(written).toContain('Chapter One');
    });

    it('creates the output directory if it does not exist', async () => {
      const outputPath = join(testDir, 'deep', 'nested', 'out.md');
      await expect(
        assembler.exportFormatted('proj-1', 'markdown', outputPath, metadata)
      ).resolves.not.toThrow();
    });

    it('does not invoke execFile (no pandoc needed for markdown)', async () => {
      const outputPath = join(testDir, 'export', 'manuscript.md');
      await assembler.exportFormatted('proj-1', 'markdown', outputPath, metadata);
      expect(mockedExecFile).not.toHaveBeenCalled();
    });
  });

  // ── binary formats — pandoc missing ───────────────────────────────────────

  const binaryFormats: ExportFormat[] = ['docx', 'epub', 'pdf'];

  describe('binary formats — pandoc not installed', () => {
    for (const format of binaryFormats) {
      it(`throws "pandoc is not installed" for format=${format}`, async () => {
        stubPandocMissing();
        const outputPath = join(testDir, 'export', `manuscript.${format}`);

        await expect(
          assembler.exportFormatted('proj-1', format, outputPath, metadata)
        ).rejects.toThrow(/pandoc is not installed/i);
      });

      it(`error for format=${format} includes pandoc install URL`, async () => {
        stubPandocMissing();
        const outputPath = join(testDir, 'export', `manuscript.${format}`);
        let msg = '';
        try {
          await assembler.exportFormatted('proj-1', format, outputPath, metadata);
        } catch (err) {
          msg = (err as Error).message;
        }
        expect(msg).toContain('https://pandoc.org/installing.html');
      });

      it(`error for format=${format} includes manual pandoc command`, async () => {
        stubPandocMissing();
        const outputPath = join(testDir, 'export', `manuscript.${format}`);
        let msg = '';
        try {
          await assembler.exportFormatted('proj-1', format, outputPath, metadata);
        } catch (err) {
          msg = (err as Error).message;
        }
        expect(msg).toContain(`pandoc -f markdown -t ${format}`);
      });
    }
  });

  // ── binary formats — pandoc available ─────────────────────────────────────

  describe('binary formats — pandoc available', () => {
    for (const format of binaryFormats) {
      it(`resolves with correct path and format for format=${format}`, async () => {
        stubPandocAvailable();
        const outputPath = join(testDir, 'export', `manuscript.${format}`);

        const result = await assembler.exportFormatted(
          'proj-1',
          format,
          outputPath,
          metadata
        );

        expect(result.format).toBe(format);
        expect(result.path).toBe(outputPath);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Export command flag definition
// The export-handler is mocked above so this import chain is safe.
// ---------------------------------------------------------------------------

describe('exportCommand flag definition', () => {
  it('defines a --format flag', () => {
    const formatFlag = exportCommand.flags?.find((f) => f.name === 'format');
    expect(formatFlag).toBeDefined();
  });

  it('--format flag defaults to "markdown"', () => {
    const formatFlag = exportCommand.flags?.find((f) => f.name === 'format');
    expect(formatFlag?.default).toBe('markdown');
  });

  it('--format flag has alias "f"', () => {
    const formatFlag = exportCommand.flags?.find((f) => f.name === 'format');
    expect(formatFlag?.alias).toBe('f');
  });

  it('--format flag type is string', () => {
    const formatFlag = exportCommand.flags?.find((f) => f.name === 'format');
    expect(formatFlag?.type).toBe('string');
  });
});
