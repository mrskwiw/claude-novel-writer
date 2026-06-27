/**
 * tts.ts — CRAFT-05 Real Text-to-Speech ("Read Aloud")
 *
 * Cross-platform text-to-speech via the host operating system's built-in
 * speech engine. The companion module `read-aloud.ts` only *analyses* prose
 * rhythm/rhyme; this module actually *speaks* it so the author can HEAR the
 * cadence — the practice the craft docs call for.
 *
 * Engines, by platform:
 *   - Windows (win32): PowerShell + System.Speech.Synthesis.SpeechSynthesizer
 *   - macOS   (darwin): `say`
 *   - Linux:           `spd-say`, falling back to `espeak` / `espeak-ng`
 *
 * Safety: the manuscript text is NEVER interpolated into a shell command.
 * It is written to a temporary file and the engine is told to read that file
 * (Windows/macOS/espeak), or it is passed as a discrete argv entry through
 * `execFile` (spd-say), which spawns the binary directly without a shell.
 *
 * Philosophy: "Reading aloud reveals weak parts." — Hemingway / Harrison
 */

import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SpeakOptions {
  /**
   * Speech rate. The scale is engine-specific:
   *   - macOS `say` / espeak: words per minute (e.g. 175)
   *   - Windows SpeechSynthesizer: -10..10 (values are clamped to this range)
   */
  rate?: number;
  /** Named voice to use (engine-specific identifier). */
  voice?: string;
  /** When set, render audio to this file (WAV on Windows/Linux, AIFF on macOS) instead of speaking. */
  outFile?: string;
}

export interface SpeakResult {
  /** The engine actually used, or `'none'` when no engine was available. */
  engine: string;
  /** True when speech (or file render) succeeded. */
  spoken: boolean;
  /** Human-readable note: which file was written, why nothing was spoken, etc. */
  note?: string;
}

// ─── execFile promise wrapper ─────────────────────────────────────────────────

/**
 * Promisified `execFile`. Deliberately hand-rolled (rather than
 * `util.promisify`) so the callback-style `child_process.execFile` mock used in
 * tests is trivial to drive.
 */
function execFileAsync(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Speak `text` aloud (or render it to `opts.outFile`) using the host OS speech
 * engine. Never throws on a missing engine — degrades gracefully and returns
 * `{ spoken: false }` with an explanatory note.
 *
 * @param text - Prose to speak. Treated as untrusted; never shell-interpolated.
 * @param opts - Optional rate, voice, and output-file overrides.
 */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<SpeakResult> {
  switch (process.platform) {
    case 'win32':
      return speakWindows(text, opts);
    case 'darwin':
      return speakMac(text, opts);
    default:
      return speakLinux(text, opts);
  }
}

// ─── Windows ──────────────────────────────────────────────────────────────────

async function speakWindows(text: string, opts: SpeakOptions): Promise<SpeakResult> {
  const textFile = await writeTempFile(text, 'txt');

  const lines: string[] = [
    'Add-Type -AssemblyName System.Speech;',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
  ];
  if (opts.rate !== undefined) {
    lines.push(`$synth.Rate = ${clampWindowsRate(opts.rate)};`);
  }
  if (opts.voice) {
    lines.push(`$synth.SelectVoice(${psLiteral(opts.voice)});`);
  }
  if (opts.outFile) {
    lines.push(`$synth.SetOutputToWaveFile(${psLiteral(opts.outFile)});`);
  }
  // Read the manuscript text from disk — never interpolated into the script.
  lines.push(`$text = [System.IO.File]::ReadAllText(${psLiteral(textFile)});`);
  lines.push('$synth.Speak($text);');
  lines.push('$synth.Dispose();');

  const scriptFile = await writeTempFile(lines.join('\n'), 'ps1');

  try {
    await execFileAsync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptFile,
    ]);
    return { engine: 'powershell', spoken: true, note: outFileNote(opts) };
  } catch (err) {
    return engineError(err, 'powershell');
  } finally {
    await cleanup(textFile);
    await cleanup(scriptFile);
  }
}

// ─── macOS ────────────────────────────────────────────────────────────────────

async function speakMac(text: string, opts: SpeakOptions): Promise<SpeakResult> {
  const textFile = await writeTempFile(text, 'txt');

  const args: string[] = [];
  if (opts.rate !== undefined) args.push('-r', String(Math.round(opts.rate)));
  if (opts.voice) args.push('-v', opts.voice);
  if (opts.outFile) args.push('-o', opts.outFile);
  args.push('-f', textFile); // read manuscript text from file, not from argv

  try {
    await execFileAsync('say', args);
    return { engine: 'say', spoken: true, note: outFileNote(opts) };
  } catch (err) {
    return engineError(err, 'say');
  } finally {
    await cleanup(textFile);
  }
}

// ─── Linux ────────────────────────────────────────────────────────────────────

interface LinuxCandidate {
  engine: string;
  file: string;
  args: string[];
}

async function speakLinux(text: string, opts: SpeakOptions): Promise<SpeakResult> {
  const textFile = await writeTempFile(text, 'txt');

  try {
    const candidates = buildLinuxCandidates(text, textFile, opts);

    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate.file, candidate.args);
        return { engine: candidate.engine, spoken: true, note: outFileNote(opts) };
      } catch (err) {
        // Engine binary not installed → try the next candidate.
        if (isMissingBinary(err)) continue;
        // Engine exists but failed → report the failure, do not throw.
        return engineError(err, candidate.engine);
      }
    }

    return {
      engine: 'none',
      spoken: false,
      note: 'No TTS engine found (install espeak or spd-say)',
    };
  } finally {
    await cleanup(textFile);
  }
}

/**
 * Build the ordered list of Linux engines to attempt.
 *
 * `spd-say` cannot render to a file, so when `outFile` is requested we go
 * straight to espeak/espeak-ng (which support `-w <file>`). Otherwise spd-say
 * is preferred for live speech, with espeak variants as fallbacks.
 */
function buildLinuxCandidates(
  text: string,
  textFile: string,
  opts: SpeakOptions
): LinuxCandidate[] {
  const espeak = (bin: string): LinuxCandidate => {
    const args: string[] = [];
    if (opts.rate !== undefined) args.push('-s', String(Math.round(opts.rate)));
    if (opts.voice) args.push('-v', opts.voice);
    if (opts.outFile) args.push('-w', opts.outFile);
    args.push('-f', textFile); // read manuscript text from file
    return { engine: bin, file: bin, args };
  };

  const spdSay = (): LinuxCandidate => {
    const args: string[] = [];
    if (opts.rate !== undefined) args.push('-r', String(Math.round(opts.rate)));
    if (opts.voice) args.push('-y', opts.voice);
    args.push('-w'); // block until speech finishes
    // execFile spawns the binary directly (no shell), so passing the text as a
    // discrete argv entry is safe from injection.
    args.push(text);
    return { engine: 'spd-say', file: 'spd-say', args };
  };

  if (opts.outFile) {
    return [espeak('espeak'), espeak('espeak-ng')];
  }
  return [spdSay(), espeak('espeak'), espeak('espeak-ng')];
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Write `content` to a uniquely-named temp file and return its absolute path. */
async function writeTempFile(content: string, ext: string): Promise<string> {
  const file = join(tmpdir(), `novel-tts-${randomBytes(8).toString('hex')}.${ext}`);
  await writeFile(file, content, 'utf-8');
  return file;
}

/** Best-effort temp-file removal; never throws. */
async function cleanup(file: string): Promise<void> {
  try {
    await unlink(file);
  } catch {
    // Ignore — the OS will reap the temp directory eventually.
  }
}

/** True when an exec error indicates the engine binary is not installed. */
function isMissingBinary(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOENT';
}

/**
 * Map an exec failure to a non-throwing SpeakResult.
 * A missing binary degrades to `engine: 'none'`; any other failure reports the
 * named engine plus the underlying message.
 */
function engineError(err: unknown, engine: string): SpeakResult {
  if (isMissingBinary(err)) {
    return {
      engine: 'none',
      spoken: false,
      note: `TTS engine '${engine}' not found on this system.`,
    };
  }
  const message = (err as Error)?.message ?? String(err);
  return {
    engine,
    spoken: false,
    note: `TTS engine '${engine}' failed: ${message}`,
  };
}

/** Note describing the rendered output file, when one was requested. */
function outFileNote(opts: SpeakOptions): string | undefined {
  return opts.outFile ? `Wrote audio to ${opts.outFile}` : undefined;
}

/**
 * Clamp a rate to the SpeechSynthesizer.Rate range of -10..10.
 * Out-of-range values throw inside PowerShell, so we clamp defensively.
 */
function clampWindowsRate(rate: number): number {
  return Math.max(-10, Math.min(10, Math.round(rate)));
}

/**
 * Encode a string as a PowerShell single-quoted literal, doubling any embedded
 * single quotes. Used only for engine-config values (voice name, output path) —
 * never for the manuscript text itself.
 */
function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
