/**
 * DraftScanner — SPEC-06 Drafting Support Tools
 *
 * Scans chapter Markdown files for placeholder markers (TK, TODO, FIXME, CHECK)
 * and generates chapter checklists.
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';

/** A single placeholder marker found inside a chapter file. */
export interface PlaceholderMark {
  /** The marker keyword. */
  marker: 'TK' | 'TODO' | 'FIXME' | 'CHECK';
  /** Text after the colon inside the brackets, e.g. `[TK: write this scene]` → `write this scene`. Empty string when no note is present. */
  note: string;
  /** Basename of the chapter file (e.g. `chapter-01.md`). */
  chapterFilename: string;
  /** 1-based line number where the marker was found. */
  lineNumber: number;
  /** The full trimmed line that contains the marker. */
  context: string;
}

/** Regex that matches `[TK]`, `[TK: some note]`, `[TODO]`, `[FIXME]`, `[CHECK: note]`, etc. */
const MARKER_RE = /\[(TK|TODO|FIXME|CHECK)(?::\s*([^\]]*))?\]/gi;

/**
 * Scans chapter Markdown files for placeholder markers and generates checklists.
 */
export class DraftScanner {
  constructor(private readonly projectPath: string) {}

  /**
   * Find all placeholder markers in the `chapters/` directory.
   *
   * @param chapterFilter - When provided, only the chapter file whose
   *   leading numeric prefix matches this number is scanned.
   * @returns Markers sorted by chapterFilename ASC, then lineNumber ASC.
   */
  async findPlaceholders(chapterFilter?: number): Promise<PlaceholderMark[]> {
    const chaptersDir = join(this.projectPath, 'chapters');

    // Gather .md files
    let files: string[];
    try {
      const entries = await readdir(chaptersDir);
      files = entries.filter((f) => f.endsWith('.md'));
    } catch {
      // Directory doesn't exist yet → no placeholders
      return [];
    }

    if (chapterFilter !== undefined) {
      files = files.filter((f) => {
        const match = f.match(/^(\d+)/);
        return match !== null && parseInt(match[1], 10) === chapterFilter;
      });
    }

    // Sort filenames so output is deterministic
    files.sort();

    const results: PlaceholderMark[] = [];

    for (const filename of files) {
      const filePath = join(chaptersDir, filename);
      const content = await readFile(filePath, 'utf-8');
      const marks = this.scanContent(content, filename);
      results.push(...marks);
    }

    return results;
  }

  /**
   * Generate a structured checklist string for a single chapter.
   *
   * @param projectPath - Root path of the novel project (unused here but kept
   *   for symmetry with the rest of the API — the class already holds it).
   * @param chapterNumber - Chapter number to check.
   * @returns A multi-line checklist string.
   */
  static async checkChapter(
    projectPath: string,
    chapterNumber: number
  ): Promise<string> {
    const scanner = new DraftScanner(projectPath);
    const chaptersDir = join(projectPath, 'chapters');

    // Find the chapter file
    let files: string[];
    try {
      const entries = await readdir(chaptersDir);
      files = entries.filter((f) => f.endsWith('.md'));
    } catch {
      files = [];
    }

    const chapterFile = files.find((f) => {
      const match = f.match(/^(\d+)/);
      return match !== null && parseInt(match[1], 10) === chapterNumber;
    });

    let content = '';
    if (chapterFile) {
      try {
        content = await readFile(join(chaptersDir, chapterFile), 'utf-8');
      } catch {
        content = '';
      }
    }

    // --- Checklist checks ---

    // Purpose declared: HTML comment `<!-- purpose: ... -->`
    const hasPurpose = /<!--\s*purpose\s*:/i.test(content);

    // Has conflict: tension_level > 0 in YAML frontmatter, or scene markers
    const tensionMatch = content.match(/tension_level\s*:\s*(\d+)/i);
    const tensionLevel = tensionMatch ? parseInt(tensionMatch[1], 10) : 0;
    const hasConflict = tensionLevel > 0 || /<!--\s*conflict\s*:/i.test(content);

    // POV declared: `pov:` in YAML frontmatter
    const hasPov = /^pov\s*:/im.test(content);

    // TK markers count
    const placeholders = await scanner.findPlaceholders(chapterNumber);
    const tkCount = placeholders.length;

    const check = (ok: boolean) => (ok ? '[x]' : '[ ]');

    const lines: string[] = [
      `Chapter ${chapterNumber} checklist:`,
      `${check(hasPurpose)} Purpose declared (has <!-- purpose: ... --> marker)`,
      `${check(hasConflict)} Has conflict (tension_level > 0 in frontmatter or scene markers)`,
      `${check(hasPov)} POV declared`,
      `[?] Open TK markers: ${tkCount} found`,
    ];

    return lines.join('\n');
  }

  // ── private ─────────────────────────────────────────────────────────────────

  /**
   * Scan the text content of a single file for placeholder markers,
   * skipping lines inside code fences (` ``` `).
   */
  private scanContent(content: string, filename: string): PlaceholderMark[] {
    const marks: PlaceholderMark[] = [];
    const lines = content.split('\n');

    let insideCodeFence = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Toggle code fence state
      if (trimmed.startsWith('```')) {
        insideCodeFence = !insideCodeFence;
        continue;
      }

      if (insideCodeFence) continue;

      // Reset regex lastIndex before each line scan
      MARKER_RE.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = MARKER_RE.exec(line)) !== null) {
        marks.push({
          marker: match[1].toUpperCase() as PlaceholderMark['marker'],
          note: match[2] ? match[2].trim() : '',
          chapterFilename: filename,
          lineNumber: i + 1, // 1-based
          context: trimmed,
        });
      }
    }

    return marks;
  }
}
