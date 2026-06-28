/**
 * Integration tests for the new `analyze hook` subcommand and the advisory
 * severity grading of `analyze prose` (Feature 1 + Feature 2).
 *
 * These handlers read chapter files directly and do not require an initialized
 * database, so the fixture is just a temp dir with a `chapters/` folder (and an
 * optional `style-targets.yml`).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleAnalyzeCommand } from '../../project/src/cli/handlers/analyze-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';

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

const STRONG_OPENING = `---
title: Strong
---

# Chapter 1

Why was there blood on the knife? Marcus ran from the smoke-filled room.
He felt very afraid as the end result became clear to everyone present.
`;

const WEAK_OPENING = `# Chapter 2

It was a quiet morning.
`;

describe('analyze hook + advisory severity', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'analyze-hook-'));
    const chaptersDir = join(dir, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    await writeFile(join(chaptersDir, '01-strong.md'), STRONG_OPENING, 'utf-8');
    await writeFile(join(chaptersDir, '02-weak.md'), WEAK_OPENING, 'utf-8');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // ── Feature 2: hook scorer ──────────────────────────────────────────────────

  it('hook --chapter scores a chapter opening with a breakdown', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('hook', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Opening Hook'))).toBe(true);
    expect(log).toContain('TABLE');
    expect(log.some((l) => l.includes('Score:') && l.includes('/100'))).toBe(true);
  });

  it('hook defaults to chapter 1 when no --chapter flag is given', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('hook'), dir, output);
    expect(log.some((l) => l.startsWith('HEADING: Opening Hook — 01-strong.md'))).toBe(true);
  });

  it('a strong opening reports no suggestions', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('hook', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.includes('Strong opening'))).toBe(true);
  });

  it('a weak opening lists advisory suggestions', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('hook', { chapter: 2 }), dir, output);
    expect(log.some((l) => l.includes('Suggestions'))).toBe(true);
    expect(log.some((l) => l.includes('•'))).toBe(true);
  });

  it('hook reports an error for a missing chapter', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('hook', { chapter: 99 }), dir, output);
    expect(log.some((l) => l.startsWith('ERROR:') && l.includes('No chapter file'))).toBe(true);
  });

  // ── Feature 1: advisory vs strict prose grading ─────────────────────────────

  it('prose defaults to softened advisory grading', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('prose', { chapter: 1 }), dir, output);
    expect(log.some((l) => l.includes('Advisory grading scaled to style-targets'))).toBe(true);
    // doubled "end result" is graded as a suggestion, never a hard error here.
    expect(log.some((l) => l.includes('[doubled_word]') && l.includes('redundant'))).toBe(true);
    expect(log.some((l) => l.includes('── Errors'))).toBe(false);
  });

  it('prose --strict restores hard pass/fail flagging', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('prose', { chapter: 1, strict: true }), dir, output);
    // strict path groups by raw severity; doubled words are hard errors.
    expect(log.some((l) => l.includes('── Errors'))).toBe(true);
    expect(log.some((l) => l.includes('Advisory grading scaled'))).toBe(false);
  });
});

describe('analyze prose — allow-list suppression', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'analyze-allow-'));
    const chaptersDir = join(dir, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    await writeFile(join(chaptersDir, '01-strong.md'), STRONG_OPENING, 'utf-8');
    // Allow-list "very" so the intensifier flag on it is suppressed.
    await writeFile(join(dir, 'style-targets.yml'), 'allow:\n  - very\n', 'utf-8');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('suppresses flags whose text is on the project allow-list', async () => {
    const { output, log } = makeOutput();
    await handleAnalyzeCommand(args('prose', { chapter: 1 }), dir, output);
    // No advisory line should flag the allow-listed word "very".
    expect(log.some((l) => l.includes('[intensifier]') && l.includes('"very"'))).toBe(false);
  });
});
