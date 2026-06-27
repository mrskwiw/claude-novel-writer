/**
 * Manuscript Assembler
 * Combines chapters into a complete manuscript
 */

import { join } from 'path';
import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import YAML from 'yaml';
import type { ChapterMetadata, ExportFormat } from '../types/novel.js';

const execFileAsync = promisify(execFile);

export interface ManuscriptMetadata {
  title: string;
  author: string;
  genre?: string;
  copyright?: string;
  dedication?: string;
  acknowledgments?: string;
  about?: string;
}

export interface AssembleOptions {
  includeMetadata?: boolean;
  includeFrontMatter?: boolean;
  includeChapterNumbers?: boolean;
  sceneBreak?: string;
  chapterBreak?: string;
  filter?: {
    chapters?: number[]; // Specific chapter numbers
    status?: string[];   // Only chapters with these statuses
  };
}

export class ManuscriptAssembler {
  constructor(private projectPath: string) {}

  /**
   * Assemble all chapters into a single manuscript
   */
  async assemble(
    metadata: ManuscriptMetadata,
    options: AssembleOptions = {}
  ): Promise<string> {
    const {
      includeMetadata = true,
      includeFrontMatter = true,
      includeChapterNumbers = true,
      sceneBreak = '\n\n* * *\n\n',
      chapterBreak = '\n\n---\n\n',
    } = options;

    const parts: string[] = [];

    // Add metadata/title page
    if (includeMetadata) {
      parts.push(this.buildTitlePage(metadata));
    }

    // Add front matter (dedication, acknowledgments)
    if (includeFrontMatter && metadata.dedication) {
      parts.push(this.buildDedication(metadata.dedication));
    }

    // Get all chapters
    const chapters = await this.loadChapters(options.filter);

    // Add each chapter
    for (const chapter of chapters) {
      const chapterText = await this.assembleChapter(chapter, {
        includeChapterNumbers,
        sceneBreak,
      });
      parts.push(chapterText);
    }

    // Add back matter (about the author, acknowledgments)
    if (includeFrontMatter) {
      if (metadata.acknowledgments) {
        parts.push(this.buildAcknowledgments(metadata.acknowledgments));
      }
      if (metadata.about) {
        parts.push(this.buildAboutAuthor(metadata.about));
      }
    }

    // Join all parts with chapter breaks
    return parts.join(chapterBreak);
  }

  /**
   * Load all chapter files, sorted by chapter number
   */
  private async loadChapters(filter?: AssembleOptions['filter']): Promise<
    Array<{ number: number; title: string; path: string; metadata: ChapterMetadata }>
  > {
    const chaptersDir = join(this.projectPath, 'chapters');

    if (!existsSync(chaptersDir)) {
      return [];
    }

    const files = await readdir(chaptersDir);
    const chapterFiles = files.filter(
      (f) => f.endsWith('.md') || f.endsWith('.markdown')
    );

    const chapters = [];

    for (const file of chapterFiles) {
      const filePath = join(chaptersDir, file);
      const content = await readFile(filePath, 'utf-8');

      // Parse frontmatter
      const { metadata, number } = this.parseChapterFile(content);

      // Apply filters
      if (filter?.chapters && !filter.chapters.includes(number)) {
        continue;
      }

      if (filter?.status && !filter.status.includes(metadata.status || 'drafted')) {
        continue;
      }

      chapters.push({
        number,
        title: metadata.title || `Chapter ${number}`,
        path: filePath,
        metadata,
      });
    }

    // Sort by chapter number
    chapters.sort((a, b) => a.number - b.number);

    return chapters;
  }

  /**
   * Parse chapter file to extract metadata and number
   */
  private parseChapterFile(content: string): { metadata: ChapterMetadata; number: number } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    let metadata: ChapterMetadata = {
      title: '',
      status: 'drafted',
    };

    let number = 1;

    if (frontmatterMatch) {
      try {
        const parsed = YAML.parse(frontmatterMatch[1]);
        metadata = parsed;
        number = parsed.number || 1;
      } catch (error) {
        console.warn('Failed to parse chapter frontmatter:', error);
      }
    }

    return { metadata, number };
  }

  /**
   * Assemble a single chapter with its scenes
   */
  private async assembleChapter(
    chapter: { number: number; title: string; path: string; metadata: ChapterMetadata },
    options: { includeChapterNumbers: boolean; sceneBreak: string }
  ): Promise<string> {
    const content = await readFile(chapter.path, 'utf-8');

    // Remove frontmatter
    const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = bodyMatch ? bodyMatch[1] : content;

    // Build chapter heading
    let chapterText = '';

    if (options.includeChapterNumbers) {
      chapterText += `# Chapter ${chapter.number}: ${chapter.metadata.title}\n\n`;
    } else {
      chapterText += `# ${chapter.metadata.title}\n\n`;
    }

    // Process scenes
    const processedBody = this.processScenes(body, options.sceneBreak);

    chapterText += processedBody;

    return chapterText;
  }

  /**
   * Process scene markers in chapter content
   */
  private processScenes(content: string, sceneBreak: string): string {
    // Remove scene comment markers
    let processed = content.replace(/<!-- scene:\d+ -->/g, '');
    processed = processed.replace(/<!-- \/scene:\d+ -->/g, '');

    // Remove scene metadata comments
    processed = processed.replace(/<!-- title: .*? -->/g, '');
    processed = processed.replace(/<!-- pov: .*? -->/g, '');
    processed = processed.replace(/<!-- location: .*? -->/g, '');
    processed = processed.replace(/<!-- time: .*? -->/g, '');
    processed = processed.replace(/<!-- purpose: .*? -->/g, '');
    processed = processed.replace(/<!-- tone: .*? -->/g, '');
    processed = processed.replace(/<!-- tension: \d+ -->/g, '');

    // Replace multiple blank lines with scene breaks
    // Look for 3+ newlines and replace with scene break
    processed = processed.replace(/\n{4,}/g, sceneBreak);

    return processed.trim();
  }

  /**
   * Build title page
   */
  private buildTitlePage(metadata: ManuscriptMetadata): string {
    let page = `# ${metadata.title}\n\n`;
    page += `*by ${metadata.author}*\n\n`;

    if (metadata.genre) {
      page += `*${metadata.genre}*\n\n`;
    }

    if (metadata.copyright) {
      page += `\n\n${metadata.copyright}\n`;
    }

    return page;
  }

  /**
   * Build dedication page
   */
  private buildDedication(dedication: string): string {
    return `\n\n*${dedication}*\n\n`;
  }

  /**
   * Build acknowledgments section
   */
  private buildAcknowledgments(ack: string): string {
    return `# Acknowledgments\n\n${ack}`;
  }

  /**
   * Build about the author section
   */
  private buildAboutAuthor(about: string): string {
    return `# About the Author\n\n${about}`;
  }

  /**
   * Check whether pandoc is available on the system PATH.
   * Resolves to true if `pandoc --version` exits cleanly, false otherwise.
   */
  private async isPandocAvailable(): Promise<boolean> {
    try {
      await execFileAsync('pandoc', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Export the manuscript in the requested format.
   *
   * - 'markdown': writes assembled markdown directly to outputPath.
   * - 'docx' | 'epub' | 'pdf': assemble markdown to a temp file then invoke
   *   pandoc to convert it.  If pandoc is not installed an error is thrown with
   *   a helpful message that includes the manual pandoc command the user can run.
   *
   * @param projectId  Project identifier (used to derive a temp markdown path).
   * @param format     Target export format.
   * @param outputPath Destination file path (the caller decides extension).
   * @param metadata   Manuscript front-matter (title, author, …).
   * @param options    Assemble options (chapter filters, etc.).
   * @returns          Resolved output path and format; may include an optional warning.
   */
  async exportFormatted(
    projectId: string,
    format: ExportFormat,
    outputPath: string,
    metadata: ManuscriptMetadata,
    options: AssembleOptions = {}
  ): Promise<{ path: string; format: ExportFormat; warning?: string }> {
    const { dirname: pathDirname } = await import('path');
    const { mkdir: mkdirFn } = await import('fs/promises');

    // Ensure the output directory exists.
    await mkdirFn(pathDirname(outputPath), { recursive: true });

    // Assemble the markdown content first.
    const markdownContent = await this.assemble(metadata, options);

    if (format === 'markdown') {
      await writeFile(outputPath, markdownContent, 'utf-8');
      return { path: outputPath, format };
    }

    // For binary formats, we need pandoc.
    const pandocAvailable = await this.isPandocAvailable();

    // Write intermediate markdown to a temp file regardless so the path is
    // available for the fallback error message.
    const markdownPath = outputPath.replace(/\.[^.]+$/, '.md');
    await writeFile(markdownPath, markdownContent, 'utf-8');

    if (!pandocAvailable) {
      const manualCmd =
        `pandoc -f markdown -t ${format} -o "${outputPath}" "${markdownPath}"`;
      throw new Error(
        `pandoc is not installed. To export as ${format.toUpperCase()}, install pandoc: ` +
        `https://pandoc.org/installing.html — then re-run: ${manualCmd}`
      );
    }

    // Build pandoc arguments.
    const pandocArgs: string[] = [
      '-f', 'markdown',
      '-t', format,
      '-o', outputPath,
      `--metadata=title:${metadata.title}`,
      `--metadata=author:${metadata.author}`,
    ];

    // Format-specific extras.
    if (format === 'pdf') {
      pandocArgs.push('-V', 'geometry:margin=1in');
    }

    pandocArgs.push(markdownPath);

    await execFileAsync('pandoc', pandocArgs);

    return { path: outputPath, format };
  }

  /**
   * Generate an export header block including title, author, genre, word count,
   * and a simple Table of Contents with estimated page numbers (250 words/page).
   *
   * @param metadata  Manuscript metadata (title, author, genre).
   * @param filter    Optional chapter filter (same as assemble).
   * @returns         A formatted header string ready to prepend to the manuscript.
   */
  async generateExportHeader(
    metadata: ManuscriptMetadata,
    filter?: AssembleOptions['filter']
  ): Promise<string> {
    const chapters = await this.loadChapters(filter);

    // Compute per-chapter word counts
    const chapterWordCounts: Array<{ number: number; title: string; wordCount: number }> = [];
    let totalWords = 0;

    for (const chapter of chapters) {
      const content = await readFile(chapter.path, 'utf-8');
      const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      const body = bodyMatch ? bodyMatch[1] : content;
      const words = body.split(/\s+/).filter((w) => w.length > 0);
      const wordCount = words.length;
      totalWords += wordCount;
      chapterWordCounts.push({
        number: chapter.number,
        title: chapter.title,
        wordCount,
      });
    }

    const WORDS_PER_PAGE = 250;

    // Build header lines
    const lines: string[] = [];
    lines.push(`TITLE: ${metadata.title}`);
    if (metadata.author) lines.push(`AUTHOR: ${metadata.author}`);
    if (metadata.genre) lines.push(`GENRE: ${metadata.genre}`);
    lines.push(`WORD COUNT: ${totalWords.toLocaleString()} words`);
    lines.push(`CHAPTERS: ${chapters.length}`);
    lines.push('');
    lines.push('TABLE OF CONTENTS');

    let cumulativeWords = 0;
    for (const ch of chapterWordCounts) {
      const pageNum = Math.floor(cumulativeWords / WORDS_PER_PAGE) + 1;
      const chapterLabel = `Chapter ${ch.number} — ${ch.title}`;
      const pageLabel = pageNum === 1 ? 'p.1' : `p.~${pageNum}`;
      // Pad with dots to fill 60 chars
      const dotFill = Math.max(
        1,
        60 - chapterLabel.length - pageLabel.length
      );
      lines.push(`${chapterLabel} ${'.' .repeat(dotFill)} ${pageLabel}`);
      cumulativeWords += ch.wordCount;
    }

    return lines.join('\n');
  }

  /**
   * Get manuscript statistics
   */
  async getStats(filter?: AssembleOptions['filter']): Promise<{
    totalChapters: number;
    totalWords: number;
    totalCharacters: number;
    averageChapterLength: number;
    chapters: Array<{
      number: number;
      title: string;
      wordCount: number;
      characterCount: number;
    }>;
  }> {
    const chapters = await this.loadChapters(filter);

    const chapterStats = [];
    let totalWords = 0;
    let totalCharacters = 0;

    for (const chapter of chapters) {
      const content = await readFile(chapter.path, 'utf-8');

      // Remove frontmatter
      const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      const body = bodyMatch ? bodyMatch[1] : content;

      // Remove scene markers
      const cleanBody = this.processScenes(body, '');

      // Count words (simple split on whitespace)
      const words = cleanBody.split(/\s+/).filter((w) => w.length > 0);
      const wordCount = words.length;
      const characterCount = cleanBody.length;

      totalWords += wordCount;
      totalCharacters += characterCount;

      chapterStats.push({
        number: chapter.number,
        title: chapter.title,
        wordCount,
        characterCount,
      });
    }

    return {
      totalChapters: chapters.length,
      totalWords,
      totalCharacters,
      averageChapterLength: chapters.length > 0 ? Math.round(totalWords / chapters.length) : 0,
      chapters: chapterStats,
    };
  }

  /**
   * Export manuscript to file
   */
  async exportToFile(
    outputPath: string,
    metadata: ManuscriptMetadata,
    options: AssembleOptions = {}
  ): Promise<void> {
    const manuscript = await this.assemble(metadata, options);

    // Ensure output directory exists
    const { dirname } = await import('path');
    const { mkdir } = await import('fs/promises');
    const outputDir = dirname(outputPath);
    await mkdir(outputDir, { recursive: true });

    await writeFile(outputPath, manuscript, 'utf-8');
  }
}
