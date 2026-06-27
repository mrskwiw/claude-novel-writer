/**
 * ResearchService — SPEC-04
 *
 * Manages research notes, usage links, and scanning chapter files for
 * [VERIFY: claim] markers.
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { MCPClient } from '../core/database.js';
import type { ResearchNote, ResearchUsage } from '../types/novel.js';
import { ResearchRepository } from '../db/repositories/research-repository.js';
import { generateId } from '../utils/ids.js';

/** A [VERIFY: claim] marker found in a chapter file. */
export interface VerifyMark {
  /** The claim text extracted from [VERIFY: <claim>] */
  claim: string;
  /** Filename (basename) of the chapter file */
  chapterFilename: string;
  /** 1-based line number */
  lineNumber: number;
  /** Full text of the matching line (surrounding context) */
  context: string;
}

const VERIFY_REGEX = /\[VERIFY:\s*([^\]]+)\]/gi;

/**
 * Returns true if the line is inside a code fence (``` or ~~~).
 * Called with a running `inFence` state that the caller toggles.
 */
function isCodeFenceDelimiter(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('```') || trimmed.startsWith('~~~');
}

/** Parse chapter number from a filename like "chapter-03.md" or "03-title.md". */
function chapterNumberFromFilename(filename: string): number | null {
  const match = /(\d+)/.exec(filename);
  return match ? parseInt(match[1], 10) : null;
}

export class ResearchService {
  private readonly repo: ResearchRepository;

  constructor(private readonly client: MCPClient) {
    this.repo = new ResearchRepository(client);
  }

  /**
   * Create and persist a new research note.
   */
  async add(
    projectId: string,
    title: string,
    opts: { url?: string; notes?: string; tags?: string[] } = {}
  ): Promise<ResearchNote> {
    const now = new Date().toISOString();
    const note: ResearchNote = {
      id: generateId(),
      projectId,
      title: title.trim(),
      url: opts.url,
      notes: opts.notes,
      tags: opts.tags ?? [],
      verified: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.insert(note);
    return note;
  }

  /**
   * List research notes for a project, optionally filtered by tag.
   */
  async list(projectId: string, tag?: string): Promise<ResearchNote[]> {
    return this.repo.list(projectId, tag);
  }

  /**
   * Retrieve a single research note by id.
   */
  async getById(id: string): Promise<ResearchNote | null> {
    return this.repo.getById(id);
  }

  /**
   * Link a research note to a chapter or scene.
   */
  async link(
    researchId: string,
    target: { chapterId?: number; sceneId?: number },
    note?: string
  ): Promise<void> {
    const usage: ResearchUsage = {
      id: generateId(),
      researchId,
      chapterId: target.chapterId,
      sceneId: target.sceneId,
      note,
      linkedAt: new Date().toISOString(),
    };
    await this.repo.addUsage(usage);
  }

  /**
   * Mark a research note as verified.
   */
  async markVerified(id: string): Promise<void> {
    await this.repo.update(id, { verified: true });
  }

  /**
   * Scan chapter Markdown files in `<projectPath>/chapters/` for `[VERIFY: claim]` markers.
   *
   * - Skips lines inside code fences (``` or ~~~).
   * - When `chapterFilter` is provided, only the file whose name contains that
   *   chapter number is scanned.
   *
   * @param projectPath    - Absolute path to the novel project directory
   * @param chapterFilter  - Optional chapter number to restrict the scan to
   */
  async findVerifyMarkers(
    projectPath: string,
    chapterFilter?: number
  ): Promise<VerifyMark[]> {
    const chaptersDir = join(projectPath, 'chapters');

    let filenames: string[];
    try {
      const entries = await readdir(chaptersDir);
      filenames = entries.filter((f) => /\.(md|markdown)$/i.test(f));
    } catch {
      // Directory does not exist or is not readable — return empty
      return [];
    }

    // Apply chapter filter
    if (chapterFilter !== undefined) {
      filenames = filenames.filter((f) => {
        const num = chapterNumberFromFilename(f);
        return num === chapterFilter;
      });
    }

    const results: VerifyMark[] = [];

    for (const filename of filenames) {
      const filePath = join(chaptersDir, filename);
      let content: string;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      let inFence = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Toggle fence state
        if (isCodeFenceDelimiter(line)) {
          inFence = !inFence;
          continue;
        }

        // Skip lines inside code fences
        if (inFence) continue;

        // Reset regex lastIndex before each line search
        VERIFY_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = VERIFY_REGEX.exec(line)) !== null) {
          results.push({
            claim: match[1].trim(),
            chapterFilename: filename,
            lineNumber: i + 1,
            context: line,
          });
        }
      }
    }

    return results;
  }
}
