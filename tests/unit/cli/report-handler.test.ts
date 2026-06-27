/**
 * Unit tests: report-handler
 *
 * Verifies the `/novel report` dashboard renders every section, never throws,
 * and degrades gracefully when the project is uninitialised (no .novel/data.db)
 * and when chapter files are present on disk.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ParsedArgs, OutputFormatter } from '../../../project/src/cli/types.js';
import { handleReportCommand } from '../../../project/src/cli/handlers/report-handler.js';

// ── mock output ──────────────────────────────────────────────────────────────

interface Entry {
  type: string;
  message: string;
}

function createMockOutput(): { entries: Entry[]; output: OutputFormatter } {
  const entries: Entry[] = [];
  const push = (type: string) => (message: string) => entries.push({ type, message });
  const output: OutputFormatter = {
    success: push('success'),
    error: push('error'),
    warning: push('warning'),
    info: push('info'),
    dim: push('dim'),
    table: () => entries.push({ type: 'table', message: '' }),
    list: () => entries.push({ type: 'list', message: '' }),
    section: () => entries.push({ type: 'section', message: '' }),
    spinner: () => ({ stop: () => {} }),
    newline: () => entries.push({ type: 'newline', message: '' }),
    heading: push('heading'),
    keyValue: () => entries.push({ type: 'keyValue', message: '' }),
    code: () => entries.push({ type: 'code', message: '' }),
  };
  return { entries, output };
}

function makeArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    command: 'report',
    subcommand: undefined,
    positional: [],
    arguments: {},
    flags: {},
    raw: '',
    ...overrides,
  };
}

const allText = (entries: Entry[]): string => entries.map((e) => e.message).join('\n');

// ── tests ────────────────────────────────────────────────────────────────────

describe('report-handler', () => {
  let projectPath: string;

  beforeEach(async () => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    projectPath = join(tmpdir(), `novel-report-test-${id}`);
    await mkdir(projectPath, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it('renders a heading and never throws on an empty/uninitialised project', async () => {
    const { entries, output } = createMockOutput();
    await expect(
      handleReportCommand(makeArgs(), projectPath, output)
    ).resolves.toBeUndefined();
    expect(entries.some((e) => e.type === 'heading')).toBe(true);
  });

  it('renders all six dashboard sections', async () => {
    const { entries, output } = createMockOutput();
    await handleReportCommand(makeArgs(), projectPath, output);
    const text = allText(entries);
    for (const section of [
      'Tension Arc',
      'Plot Threads',
      'Narrative Promises',
      'Scene Purpose',
      'Style Targets',
      'Draft Markers',
    ]) {
      expect(text).toContain(section);
    }
  });

  it('degrades DB-backed sections to a notice when no project db exists', async () => {
    const { entries, output } = createMockOutput();
    await handleReportCommand(makeArgs(), projectPath, output);
    expect(entries.some((e) => e.type === 'dim' && /no project data/i.test(e.message))).toBe(true);
  });

  it('counts [TK] markers from chapter files (read-only, no db needed)', async () => {
    const chaptersDir = join(projectPath, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    await writeFile(
      join(chaptersDir, '01-opening.md'),
      '# Opening\n\nShe walked in. [TK: describe the room] He nodded. [TK]\n',
      'utf-8'
    );

    const { entries, output } = createMockOutput();
    await handleReportCommand(makeArgs(), projectPath, output);

    const warnings = entries.filter((e) => e.type === 'warning').map((e) => e.message);
    expect(warnings.some((m) => /\[TK\]/.test(m) && /2/.test(m))).toBe(true);
  });

  it('reports a clean draft-marker state when no [TK]s are present', async () => {
    const chaptersDir = join(projectPath, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    await writeFile(join(chaptersDir, '01-clean.md'), '# Clean\n\nNo markers here.\n', 'utf-8');

    const { entries, output } = createMockOutput();
    await handleReportCommand(makeArgs(), projectPath, output);

    expect(
      entries.some((e) => e.type === 'success' && /no open \[TK\] markers/i.test(e.message))
    ).toBe(true);
  });

  it('summarises style-target warnings across chapter files', async () => {
    const chaptersDir = join(projectPath, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    // A chapter long enough for the style analyzer to measure something.
    const body = Array.from({ length: 30 })
      .map(() => 'The quiet house stood silently on the lonely hill, waiting patiently.')
      .join(' ');
    await writeFile(join(chaptersDir, '01-style.md'), `# Style\n\n${body}\n`, 'utf-8');

    const { entries, output } = createMockOutput();
    await handleReportCommand(makeArgs(), projectPath, output);

    const text = allText(entries);
    expect(text).toContain('Style Targets');
    // Either within-target (success) or outside-target (warning) — both valid,
    // the point is the section produced a real measurement, not the "no files" notice.
    expect(text).not.toContain('No chapter files to measure');
  });
});
