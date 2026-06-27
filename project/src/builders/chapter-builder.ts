/**
 * Chapter Builder
 * Creates and manages chapter markdown files with YAML frontmatter
 */

import { writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { Chapter } from '../types/novel.js';

export interface ChapterBuilderOptions {
  projectPath: string;
  outputDir?: string; // Default: 'chapters'
}

export interface ChapterMetadata {
  title: string;
  status?: 'planned' | 'drafted' | 'revised' | 'polished' | 'final';
  povCharacter?: string; // Character name for POV
  summary?: string;
  notes?: string;
  scenes?: SceneOutline[];
}

export interface SceneOutline {
  number: number;
  summary: string;
  location?: string;
  characters?: string[];
}

export interface ChapterTemplate {
  name: string;
  description: string;
  frontmatter: Partial<ChapterMetadata>;
  content: string;
}

export type PromptFunction = (
  prompt: string,
  options?: PromptOptions
) => Promise<string>;

export interface PromptOptions {
  required?: boolean;
  default?: string;
  multiline?: boolean;
  validate?: (value: string) => boolean;
}

export class ChapterBuilder {
  private projectPath: string;
  private outputDir: string;

  constructor(options: ChapterBuilderOptions) {
    this.projectPath = options.projectPath;
    this.outputDir = options.outputDir || 'chapters';
  }

  /**
   * Create chapter from metadata (programmatic API)
   */
  async create(
    chapterNumber: number,
    metadata: ChapterMetadata,
    content?: string
  ): Promise<string> {
    // Ensure chapters directory exists
    const dirPath = join(this.projectPath, this.outputDir);
    await mkdir(dirPath, { recursive: true });

    // Generate filename
    const filename = this.generateFilename(chapterNumber, metadata.title);
    const filePath = join(dirPath, filename);

    // Check if file already exists
    if (existsSync(filePath)) {
      throw new Error(`Chapter file already exists: ${filename}`);
    }

    // Build chapter content
    const chapterContent = this.buildChapterContent(metadata, content);

    // Write file
    await writeFile(filePath, chapterContent, 'utf-8');

    return filePath;
  }

  /**
   * Interactive chapter creation - prompts for all fields
   */
  async createInteractive(promptFn: PromptFunction): Promise<string> {
    console.log('=== Interactive Chapter Creation ===\n');

    // Get next chapter number automatically
    const nextNumber = await this.getNextChapterNumber();
    console.log(`Creating Chapter ${nextNumber}\n`);

    // Basic Information
    const title = await promptFn('Chapter title', { required: true });

    const status = await promptFn(
      'Status (planned/drafted/revised/polished/final)',
      {
        default: 'drafted',
        validate: (v) =>
          ['planned', 'drafted', 'revised', 'polished', 'final'].includes(v),
      }
    );

    const povCharacter = await promptFn('POV character (optional)', {});

    const summary = await promptFn('Chapter summary (optional)', {
      multiline: true,
    });

    const notes = await promptFn('Author notes (optional)', {
      multiline: true,
    });

    // Scene outlines
    console.log('\n--- Scene Outlines (optional) ---');
    const addScenes = await promptFn('Add scene outlines? (yes/no)', {
      default: 'no',
    });

    const scenes: SceneOutline[] = [];
    if (addScenes.toLowerCase() === 'yes') {
      let sceneNumber = 1;
      while (true) {
        console.log(`\nScene ${sceneNumber}:`);
        const sceneSummary = await promptFn('Scene summary (empty to finish)', {});
        if (!sceneSummary) break;

        const location = await promptFn('Location (optional)', {});

        // Characters in scene
        const charactersInput = await promptFn(
          'Characters (comma-separated, optional)',
          {}
        );
        const characters = charactersInput
          ? charactersInput.split(',').map((c) => c.trim())
          : [];

        scenes.push({
          number: sceneNumber,
          summary: sceneSummary,
          location: location || undefined,
          characters: characters.length > 0 ? characters : undefined,
        });

        sceneNumber++;
      }
    }

    // Template selection
    console.log('\n--- Template ---');
    const useTemplate = await promptFn('Use a template? (yes/no)', {
      default: 'no',
    });

    let content = '';
    if (useTemplate.toLowerCase() === 'yes') {
      const templates = this.getTemplates();
      console.log('\nAvailable templates:');
      templates.forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.name} - ${t.description}`);
      });

      const templateChoice = await promptFn('Template number', {
        required: true,
        validate: (v) => {
          const num = parseInt(v);
          return num > 0 && num <= templates.length;
        },
      });

      const template = templates[parseInt(templateChoice) - 1];
      content = template.content;
    }

    // Build metadata
    const metadata: ChapterMetadata = {
      title,
      status: status as ChapterMetadata['status'],
      povCharacter: povCharacter || undefined,
      summary: summary || undefined,
      notes: notes || undefined,
      scenes: scenes.length > 0 ? scenes : undefined,
    };

    // Create chapter
    return await this.create(nextNumber, metadata, content);
  }

  /**
   * Create chapter from template
   */
  async createFromTemplate(
    chapterNumber: number,
    title: string,
    templateName: string
  ): Promise<string> {
    const templates = this.getTemplates();
    const template = templates.find((t) => t.name === templateName);

    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    const metadata: ChapterMetadata = {
      title,
      ...template.frontmatter,
    };

    return await this.create(chapterNumber, metadata, template.content);
  }

  /**
   * Get next available chapter number
   */
  async getNextChapterNumber(): Promise<number> {
    const dirPath = join(this.projectPath, this.outputDir);

    if (!existsSync(dirPath)) {
      return 1;
    }

    const files = await readdir(dirPath);
    const chapterFiles = files.filter(
      (f) => (f.endsWith('.md') || f.endsWith('.markdown')) && !f.startsWith('_')
    );

    if (chapterFiles.length === 0) {
      return 1;
    }

    // Extract chapter numbers and find max
    const numbers = chapterFiles
      .map((f) => {
        const match = f.match(/^(\d+)/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter((n) => n > 0);

    return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  }

  /**
   * List all chapter files
   */
  async list(): Promise<string[]> {
    const dirPath = join(this.projectPath, this.outputDir);

    if (!existsSync(dirPath)) {
      return [];
    }

    const files = await readdir(dirPath);

    return files
      .filter(
        (f) =>
          (f.endsWith('.md') || f.endsWith('.markdown')) && !f.startsWith('_')
      )
      .sort() // Sort alphabetically (will sort by chapter number naturally)
      .map((f) => join(dirPath, f));
  }

  /**
   * Generate filename from chapter number and title
   */
  generateFilename(chapterNumber: number, title: string): string {
    // Format: 01-title-slug.md
    const paddedNumber = chapterNumber.toString().padStart(2, '0');
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return `${paddedNumber}-${slug}.md`;
  }

  /**
   * Build chapter content with frontmatter
   */
  private buildChapterContent(
    metadata: ChapterMetadata,
    content?: string
  ): string {
    const frontmatter: Record<string, any> = {
      title: metadata.title,
      status: metadata.status || 'drafted',
    };

    if (metadata.povCharacter) {
      frontmatter.povCharacter = metadata.povCharacter;
    }

    if (metadata.summary) {
      frontmatter.summary = metadata.summary;
    }

    if (metadata.notes) {
      frontmatter.notes = metadata.notes;
    }

    if (metadata.scenes && metadata.scenes.length > 0) {
      frontmatter.scenes = metadata.scenes;
    }

    // Build YAML frontmatter
    let result = '---\n';

    for (const [key, value] of Object.entries(frontmatter)) {
      if (typeof value === 'string' && (value.includes('\n') || value.includes(':'))) {
        // Multiline or contains colon - use block scalar
        result += `${key}: |\n`;
        result += value
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n') + '\n';
      } else if (Array.isArray(value)) {
        // Array - use YAML list
        result += `${key}:\n`;
        value.forEach((item) => {
          if (typeof item === 'object') {
            result += `  - `;
            const entries = Object.entries(item);
            entries.forEach(([k, v], i) => {
              if (i === 0) {
                result += `${k}: ${v}\n`;
              } else {
                result += `    ${k}: ${v}\n`;
              }
            });
          } else {
            result += `  - ${item}\n`;
          }
        });
      } else {
        result += `${key}: ${value}\n`;
      }
    }

    result += '---\n\n';

    // Add chapter heading
    result += `# ${metadata.title}\n\n`;

    // Add content or placeholder
    if (content) {
      result += content;
    } else {
      result += '*[Begin writing here...]*\n';
    }

    return result;
  }

  /**
   * Get available chapter templates
   */
  private getTemplates(): ChapterTemplate[] {
    return [
      {
        name: 'standard',
        description: 'Standard chapter template',
        frontmatter: {},
        content: '*[Begin writing here...]*\n',
      },
      {
        name: 'action',
        description: 'Action/high-tension scene template',
        frontmatter: {
          notes: 'Action scene - maintain fast pacing, short sentences',
        },
        content: `## Opening Action

*[Start with immediate action - drop reader into the moment]*

## Rising Tension

*[Escalate the stakes, increase pressure]*

## Climax

*[Peak of the action - most intense moment]*

## Aftermath

*[Consequences, character reactions, transitions to next scene]*
`,
      },
      {
        name: 'dialogue',
        description: 'Dialogue-heavy scene template',
        frontmatter: {
          notes: 'Dialogue-driven scene - reveal character through conversation',
        },
        content: `## Opening

*[Set the scene - where are they, what's the tension?]*

## Conversation

*[Let characters speak - use subtext, conflict, and body language]*

## Revelation

*[Key information revealed or relationship shift]*

## Closing

*[How has the dynamic changed? What's next?]*
`,
      },
      {
        name: 'introspection',
        description: 'Character reflection/internal scene',
        frontmatter: {
          notes: 'Internal scene - character processing emotions, memories, decisions',
        },
        content: `## Current Moment

*[Where is the character? What triggered this reflection?]*

## Internal Landscape

*[Thoughts, memories, feelings - show their internal world]*

## Realization/Decision

*[What do they understand now? What will they do?]*

## Return to Action

*[Connect back to external plot - how does this change them?]*
`,
      },
      {
        name: 'flashback',
        description: 'Flashback scene template',
        frontmatter: {
          notes: 'Flashback - make transition clear, ensure relevance to current story',
        },
        content: `## Trigger

*[What in the present moment triggers the memory?]*

---

**[Past - Make timeline clear]**

## The Memory

*[Show the past event - use sensory details]*

## The Impact

*[Why did this moment matter? What shaped the character?]*

---

## Back to Present

*[Return to now - how does this memory affect current action?]*
`,
      },
    ];
  }

  /**
   * Validate chapter metadata
   */
  validate(metadata: Partial<ChapterMetadata>): string[] {
    const errors: string[] = [];

    if (!metadata.title || metadata.title.trim().length === 0) {
      errors.push('Missing required field: title');
    }

    if (
      metadata.status &&
      !['planned', 'drafted', 'revised', 'polished', 'final'].includes(
        metadata.status
      )
    ) {
      errors.push(
        'Status must be: planned, drafted, revised, polished, or final'
      );
    }

    return errors;
  }
}
