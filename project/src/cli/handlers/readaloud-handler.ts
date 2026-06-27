/**
 * Read-Aloud Command Handler (CRAFT-05 — real TTS)
 *
 * Resolves a chapter (and optional scene), strips manuscript markup, then hands
 * the clean prose to `speak()` so the author can HEAR the cadence. Distinct
 * from `analyze read-aloud`, which only prints rhythm/rhyme analysis.
 */

import { readFile } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { ParsedArgs, OutputFormatter } from '../types.js';
import { ReadAloudPreparer } from '../../analysis/read-aloud.js';
import { speak, type SpeakOptions } from '../../analysis/tts.js';

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Handle `/novel readaloud [--chapter N] [--scene N] [--rate N] [--out path] [--text "..."]`.
 */
export async function handleReadAloudCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const rate = args.flags['rate'] as number | undefined;
    const voice = args.flags['voice'] as string | undefined;
    const outFile = args.flags['out'] as string | undefined;
    const adHoc = args.flags['text'] as string | undefined;

    const opts: SpeakOptions = {};
    if (rate !== undefined) opts.rate = rate;
    if (voice) opts.voice = voice;
    if (outFile) opts.outFile = outFile;

    // Resolve the text to speak: explicit --text wins, else a chapter file.
    let text: string;
    let label: string;

    if (adHoc !== undefined) {
      text = adHoc;
      label = 'ad-hoc text';
    } else {
      const filePath = resolveChapterFile(args, projectPath, output);
      if (!filePath) return;

      const raw = await readFile(filePath, 'utf-8');
      const sceneNum = args.flags['scene'] as number | undefined;
      const source = sceneNum !== undefined ? extractScene(raw, sceneNum, output) : raw;
      if (source === undefined) return;

      text = ReadAloudPreparer.stripMarkup(source);
      label =
        sceneNum !== undefined
          ? `chapter ${args.flags['chapter']}, scene ${sceneNum}`
          : `chapter ${args.flags['chapter']}`;
    }

    if (text.trim().length === 0) {
      output.warning('Nothing to read — the resolved text is empty after stripping markup.');
      return;
    }

    output.heading('Read Aloud');
    output.dim(`Source: ${label} · ${ReadAloudPreparer._countWords(text)} words`);
    if (opts.outFile) output.dim(`Rendering to file: ${opts.outFile}`);
    output.newline();

    const result = await speak(text, opts);

    if (result.spoken) {
      if (result.note && opts.outFile) {
        output.success(result.note);
      } else {
        output.success(`Spoken with ${result.engine}.`);
      }
    } else {
      output.warning(
        result.note ?? 'No speech produced and no engine reported a reason.'
      );
      output.info(
        'TTS engines: Windows uses PowerShell System.Speech; macOS uses `say`; ' +
          'Linux needs `spd-say` or `espeak`/`espeak-ng` installed.'
      );
    }
  } catch (err) {
    output.error(`Read-aloud failed: ${(err as Error).message}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve a chapter file path from the `--chapter N` flag by matching the
 * leading numeric prefix of files in `chapters/`. Mirrors `resolveChapterFile`
 * in analyze-handler.ts.
 */
function resolveChapterFile(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): string | undefined {
  const chapterNum = args.flags['chapter'] as number | undefined;
  if (chapterNum === undefined) {
    output.error('Specify --chapter N (or use --text "..." to read ad-hoc text).');
    return undefined;
  }

  const chaptersDir = join(projectPath, 'chapters');
  if (!existsSync(chaptersDir)) {
    output.error(`chapters/ directory not found at ${chaptersDir}`);
    return undefined;
  }

  let entries: string[];
  try {
    entries = readdirSync(chaptersDir).filter((f: string) => f.endsWith('.md'));
  } catch {
    output.error(`chapters/ directory not found at ${chaptersDir}`);
    return undefined;
  }

  const padded = String(chapterNum).padStart(2, '0');
  const match = entries.find(
    (f) => f.startsWith(padded) || f.includes(`-${padded}`) || f.includes(`-${chapterNum}`)
  );

  if (!match) {
    output.error(`No chapter file found for chapter ${chapterNum} in ${chaptersDir}`);
    return undefined;
  }

  return join(chaptersDir, match);
}

/**
 * Extract the Nth scene (1-based) from raw chapter text by splitting on
 * `--- Scene N ---` delimiter lines. Returns the whole chapter (with a warning)
 * when the scene index is out of range, or `undefined` when no scenes exist.
 */
function extractScene(
  raw: string,
  sceneNum: number,
  output: OutputFormatter
): string | undefined {
  const delimiter = /^---\s*Scene\b.*$/gim;
  const parts = raw.split(delimiter);

  // Index 0 is any preamble before the first delimiter; scenes are 1..N after.
  const scenes = parts.slice(1).map((s) => s.trim()).filter((s) => s.length > 0);

  if (scenes.length === 0) {
    output.warning('No "--- Scene N ---" delimiters found; reading the whole chapter.');
    return raw;
  }

  if (sceneNum < 1 || sceneNum > scenes.length) {
    output.error(`Scene ${sceneNum} not found (chapter has ${scenes.length} scene(s)).`);
    return undefined;
  }

  return scenes[sceneNum - 1];
}
