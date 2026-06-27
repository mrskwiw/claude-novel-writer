/**
 * SnapshotManager
 * Creates, lists, diffs, and restores draft snapshots of the chapters/ directory.
 * Uses only Node.js built-ins — no external packages.
 */

import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';

/** Per-snapshot metadata stored as `_snapshot.json` inside each snapshot directory. */
export interface SnapshotMeta {
  /** Human-readable label supplied by the caller (e.g. "before-act-2"). */
  label: string;
  /** ISO-8601 timestamp of when the snapshot was created. */
  createdAt: string;
  /** Number of chapter files copied. */
  chapterCount: number;
  /** Sum of word counts across all chapter files. */
  totalWordCount: number;
  /** Per-file word counts keyed by filename (not full path). */
  chapterWordCounts: Record<string, number>;
}

/** Sanitise a label so it is safe as a directory name component. */
function sanitiseLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

/**
 * Estimate the word count of a chapter Markdown file.
 *
 * Words in the YAML frontmatter block (between the first and second `---`
 * delimiters) are excluded — only prose content is counted.
 *
 * @param content - Raw UTF-8 file content
 * @returns Approximate word count (split on whitespace)
 */
function estimateWordCount(content: string): number {
  const lines = content.split('\n');

  // Strip YAML frontmatter: skip lines before the closing `---`
  let bodyStart = 0;
  if (lines[0]?.trim() === '---') {
    const closingIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (closingIdx !== -1) {
      bodyStart = closingIdx + 1;
    }
  }

  const body = lines.slice(bodyStart).join('\n');
  const tokens = body.split(/\s+/).filter(Boolean);
  return tokens.length;
}

/**
 * Compute a simple LCS-based line diff between two strings.
 *
 * Returns lines prefixed with `+` (added in `b`), `-` (removed from `a`),
 * or ` ` (unchanged). Unchanged context lines are omitted — only changed
 * lines appear in the output, each on its own line.
 *
 * @param a - Original text
 * @param b - New text
 * @returns Formatted diff string
 */
function lineDiff(a: string, b: string): string {
  const aLines = a.split('\n');
  const bLines = b.split('\n');

  const m = aLines.length;
  const n = bLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aLines[i - 1] === bLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const result: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
      // Unchanged — skip (no context lines)
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push(`+${bLines[j - 1]}`);
      j--;
    } else {
      result.push(`-${aLines[i - 1]}`);
      i--;
    }
  }

  result.reverse();

  if (result.length === 0) {
    return '(no differences)';
  }

  return result.join('\n');
}

/**
 * Manages draft snapshots for a novel project.
 *
 * Snapshots live under `<projectPath>/revisions/` in timestamped subdirectories.
 * Each subdirectory contains a copy of `chapters/` plus a `_snapshot.json` file.
 */
export class SnapshotManager {
  private readonly revisionsDir: string;
  private readonly chaptersDir: string;

  constructor(private readonly projectPath: string) {
    this.revisionsDir = join(projectPath, 'revisions');
    this.chaptersDir = join(projectPath, 'chapters');
  }

  // ── public API ─────────────────────────────────────────────────────────────

  /**
   * Create a new snapshot of the current `chapters/` directory.
   *
   * Copies all `.md` files from `chapters/` into
   * `revisions/<sanitised-label>-<timestamp>/chapters/` and writes
   * `_snapshot.json` with metadata.
   *
   * @param label - Human-readable label for the snapshot (e.g. "before-act-2")
   * @returns The `SnapshotMeta` written to disk
   */
  async create(label: string): Promise<SnapshotMeta> {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotName = `${sanitiseLabel(label)}-${ts}`;
    const snapshotDir = join(this.revisionsDir, snapshotName);
    const snapshotChaptersDir = join(snapshotDir, 'chapters');

    await mkdir(snapshotChaptersDir, { recursive: true });

    // Gather chapter files
    let chapterFiles: string[] = [];
    if (existsSync(this.chaptersDir)) {
      const entries = await readdir(this.chaptersDir);
      chapterFiles = entries.filter(f => f.endsWith('.md'));
    }

    const chapterWordCounts: Record<string, number> = {};
    let totalWordCount = 0;

    for (const filename of chapterFiles) {
      const src = join(this.chaptersDir, filename);
      const dest = join(snapshotChaptersDir, filename);
      await copyFile(src, dest);

      const content = await readFile(dest, 'utf-8');
      const wc = estimateWordCount(content);
      chapterWordCounts[filename] = wc;
      totalWordCount += wc;
    }

    const meta: SnapshotMeta = {
      label,
      createdAt: new Date().toISOString(),
      chapterCount: chapterFiles.length,
      totalWordCount,
      chapterWordCounts,
    };

    await writeFile(
      join(snapshotDir, '_snapshot.json'),
      JSON.stringify(meta, null, 2),
      'utf-8'
    );

    return meta;
  }

  /**
   * List all snapshots under `revisions/`, sorted newest-first by `createdAt`.
   *
   * @returns Array of `SnapshotMeta` objects (may be empty)
   */
  async list(): Promise<SnapshotMeta[]> {
    if (!existsSync(this.revisionsDir)) return [];

    const entries = await readdir(this.revisionsDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());

    const metas: SnapshotMeta[] = [];

    for (const dir of dirs) {
      const metaPath = join(this.revisionsDir, dir.name, '_snapshot.json');
      if (!existsSync(metaPath)) continue;
      try {
        const raw = await readFile(metaPath, 'utf-8');
        const meta = JSON.parse(raw) as SnapshotMeta;
        metas.push(meta);
      } catch {
        // Skip malformed snapshot directories silently
      }
    }

    return metas.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Produce a line-level diff of a single chapter file between two snapshots.
   *
   * Lines added in `toLabel` are prefixed with `+`; lines removed from
   * `fromLabel` are prefixed with `-`. Unchanged lines are not shown.
   *
   * @param fromLabel       - Source snapshot label
   * @param toLabel         - Target snapshot label
   * @param chapterFilename - Chapter filename (e.g. `chapter-01.md`)
   * @returns Formatted diff string
   */
  async diff(
    fromLabel: string,
    toLabel: string,
    chapterFilename: string
  ): Promise<string> {
    const fromDir = await this.resolveSnapshotDir(fromLabel);
    const toDir = await this.resolveSnapshotDir(toLabel);

    const fromFile = join(fromDir, 'chapters', chapterFilename);
    const toFile = join(toDir, 'chapters', chapterFilename);

    const fromContent = existsSync(fromFile)
      ? await readFile(fromFile, 'utf-8')
      : '';
    const toContent = existsSync(toFile)
      ? await readFile(toFile, 'utf-8')
      : '';

    const header = `--- ${fromLabel}/${chapterFilename}\n+++ ${toLabel}/${chapterFilename}\n`;
    return header + lineDiff(fromContent, toContent);
  }

  /**
   * Restore `chapters/` from a named snapshot.
   *
   * **Warning:** This overwrites the current `chapters/` directory.
   * The CLI handler is responsible for any user confirmation prompt.
   *
   * @param label - Snapshot label to restore from
   */
  async restore(label: string): Promise<void> {
    const snapshotDir = await this.resolveSnapshotDir(label);
    const snapshotChaptersDir = join(snapshotDir, 'chapters');

    // Clear existing chapters directory
    if (existsSync(this.chaptersDir)) {
      await rm(this.chaptersDir, { recursive: true, force: true });
    }
    await mkdir(this.chaptersDir, { recursive: true });

    if (!existsSync(snapshotChaptersDir)) return;

    const files = await readdir(snapshotChaptersDir);
    for (const filename of files) {
      await copyFile(
        join(snapshotChaptersDir, filename),
        join(this.chaptersDir, filename)
      );
    }
  }

  // ── private helpers ────────────────────────────────────────────────────────

  /**
   * Resolve the on-disk path for a snapshot identified by its label.
   *
   * Scans `revisions/` for a directory whose `_snapshot.json` has a matching
   * label. If multiple snapshots share the same label, the most recent one is
   * returned (sorted by `createdAt` DESC).
   *
   * @param label - Snapshot label to look up
   * @returns Absolute path to the snapshot directory
   * @throws Error if no matching snapshot is found
   */
  private async resolveSnapshotDir(label: string): Promise<string> {
    if (!existsSync(this.revisionsDir)) {
      throw new Error(`No revisions directory found at: ${this.revisionsDir}`);
    }

    const entries = await readdir(this.revisionsDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());

    const candidates: Array<{ dir: string; createdAt: string }> = [];

    for (const dirent of dirs) {
      const metaPath = join(this.revisionsDir, dirent.name, '_snapshot.json');
      if (!existsSync(metaPath)) continue;
      try {
        const raw = await readFile(metaPath, 'utf-8');
        const meta = JSON.parse(raw) as SnapshotMeta;
        if (meta.label === label) {
          candidates.push({
            dir: join(this.revisionsDir, dirent.name),
            createdAt: meta.createdAt,
          });
        }
      } catch {
        // skip
      }
    }

    if (candidates.length === 0) {
      throw new Error(`Snapshot not found: "${label}"`);
    }

    // Return most recent if duplicates
    candidates.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return candidates[0].dir;
  }
}
