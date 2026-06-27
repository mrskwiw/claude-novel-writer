/**
 * Integration Tests: Chapter Workflow
 * Tests complete chapter creation and management workflow
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NovelWriterExtension } from '../../../project/src/index.js';
import { getTestProjectPath } from '../../setup.js';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';

describe('Chapter Workflow (Integration)', () => {
  let extension: NovelWriterExtension;
  let projectPath: string;

  beforeEach(() => {
    projectPath = getTestProjectPath();
    extension = new NovelWriterExtension(projectPath);
  });

  it('should complete chapter creation workflow', async () => {
    // Step 1: Create first chapter
    const builder = extension.getChapterBuilder();

    const chapter1 = await builder.create(1, {
      title: 'The Signal',
      status: 'drafted',
      povCharacter: 'Sarah Chen',
      summary: 'Sarah detects an unusual signal from deep space',
    });

    // Verify file created
    expect(existsSync(chapter1)).toBe(true);

    // Verify content
    const content1 = await readFile(chapter1, 'utf-8');
    expect(content1).toContain('title: The Signal');
    expect(content1).toContain('povCharacter: Sarah Chen');
    expect(content1).toContain('# The Signal');

    // Step 2: Create second chapter
    const chapter2 = await builder.create(2, {
      title: 'The Analysis',
      status: 'drafted',
      povCharacter: 'Alex Rivers',
    });

    expect(existsSync(chapter2)).toBe(true);

    // Step 3: List all chapters
    const chapters = await builder.list();
    expect(chapters).toHaveLength(2);

    // Step 4: Verify ordering
    expect(chapters[0]).toContain('01-the-signal.md');
    expect(chapters[1]).toContain('02-the-analysis.md');

    // Step 5: Get next chapter number
    const nextNumber = await builder.getNextChapterNumber();
    expect(nextNumber).toBe(3);
  });

  it('should handle chapter creation with templates', async () => {
    const builder = extension.getChapterBuilder();

    // Create action scene
    const actionChapter = await builder.createFromTemplate(
      1,
      'The Chase',
      'action'
    );

    expect(existsSync(actionChapter)).toBe(true);

    const actionContent = await readFile(actionChapter, 'utf-8');
    expect(actionContent).toContain('## Opening Action');
    expect(actionContent).toContain('## Climax');

    // Create dialogue scene
    const dialogueChapter = await builder.createFromTemplate(
      2,
      'The Confrontation',
      'dialogue'
    );

    expect(existsSync(dialogueChapter)).toBe(true);

    const dialogueContent = await readFile(dialogueChapter, 'utf-8');
    expect(dialogueContent).toContain('## Conversation');

    // List should show both
    const chapters = await builder.list();
    expect(chapters).toHaveLength(2);
  });

  it('should handle chapter with scene outlines', async () => {
    const builder = extension.getChapterBuilder();

    // Create chapter with structured scenes
    const chapter = await builder.create(1, {
      title: 'Chapter One',
      status: 'planned',
      scenes: [
        {
          number: 1,
          summary: 'Sarah at work, receives alert',
          location: 'Observatory',
          characters: ['Sarah'],
        },
        {
          number: 2,
          summary: 'Sarah calls Alex for help',
          location: 'Observatory',
          characters: ['Sarah', 'Alex'],
        },
        {
          number: 3,
          summary: 'Initial analysis reveals anomaly',
          location: 'Lab',
          characters: ['Sarah', 'Alex', 'Dr. Martinez'],
        },
      ],
    });

    // Verify scenes are in frontmatter
    const content = await readFile(chapter, 'utf-8');
    expect(content).toContain('scenes:');
    expect(content).toContain('Sarah at work, receives alert');
    expect(content).toContain('Observatory');
    expect(content).toContain('Sarah calls Alex for help');
  });

  it('should handle multiple status types', async () => {
    const builder = extension.getChapterBuilder();

    // Create chapters with different statuses
    await builder.create(1, { title: 'Planned Chapter', status: 'planned' });
    await builder.create(2, { title: 'Draft Chapter', status: 'drafted' });
    await builder.create(3, { title: 'Revised Chapter', status: 'revised' });
    await builder.create(4, { title: 'Polished Chapter', status: 'polished' });
    await builder.create(5, { title: 'Final Chapter', status: 'final' });

    // All should be created
    const chapters = await builder.list();
    expect(chapters).toHaveLength(5);

    // Verify each status
    const contents = await Promise.all(
      chapters.map((path) => readFile(path, 'utf-8'))
    );

    expect(contents[0]).toContain('status: planned');
    expect(contents[1]).toContain('status: drafted');
    expect(contents[2]).toContain('status: revised');
    expect(contents[3]).toContain('status: polished');
    expect(contents[4]).toContain('status: final');
  });

  it('should handle chapters with custom content', async () => {
    const builder = extension.getChapterBuilder();

    const customContent = `The signal came at midnight.

Sarah stared at the screen, her coffee forgotten. The pattern was unmistakable—and impossible.

"This can't be right," she whispered.`;

    const chapter = await builder.create(
      1,
      {
        title: 'Opening Scene',
        status: 'drafted',
        povCharacter: 'Sarah',
      },
      customContent
    );

    // Verify custom content included
    const content = await readFile(chapter, 'utf-8');
    expect(content).toContain('The signal came at midnight');
    expect(content).toContain('Sarah stared at the screen');
    expect(content).not.toContain('[Begin writing here...]');
  });

  it('should prevent duplicate chapter numbers with same title', async () => {
    const builder = extension.getChapterBuilder();

    // Create first chapter
    await builder.create(1, { title: 'Chapter One', status: 'drafted' });

    // Attempt to create duplicate with same title (same filename)
    await expect(
      builder.create(1, { title: 'Chapter One', status: 'drafted' })
    ).rejects.toThrow('Chapter file already exists');
  });

  it('should auto-increment chapter numbers', async () => {
    const builder = extension.getChapterBuilder();

    // Create several chapters
    await builder.create(1, { title: 'One', status: 'drafted' });
    await builder.create(2, { title: 'Two', status: 'drafted' });
    await builder.create(3, { title: 'Three', status: 'drafted' });

    // Get next number
    const nextNumber = await builder.getNextChapterNumber();
    expect(nextNumber).toBe(4);

    // Create using that number
    await builder.create(nextNumber, {
      title: 'Four',
      status: 'drafted',
    });

    const chapters = await builder.list();
    expect(chapters).toHaveLength(4);
  });

  it('should handle chapters with all metadata fields', async () => {
    const builder = extension.getChapterBuilder();

    const chapter = await builder.create(1, {
      title: 'Complex Chapter',
      status: 'revised',
      povCharacter: 'Sarah Chen',
      summary: 'Sarah makes a critical discovery about the signal',
      notes: 'Foreshadow the revelation in Chapter 10. Show Sarah\'s internal conflict.',
      scenes: [
        {
          number: 1,
          summary: 'Morning routine',
          location: 'Sarah\'s apartment',
        },
        {
          number: 2,
          summary: 'Discovery at work',
          location: 'Observatory',
          characters: ['Sarah', 'Alex'],
        },
      ],
    });

    // Verify all fields present
    const content = await readFile(chapter, 'utf-8');
    expect(content).toContain('title: Complex Chapter');
    expect(content).toContain('status: revised');
    expect(content).toContain('povCharacter: Sarah Chen');
    expect(content).toContain('summary:');
    expect(content).toContain('critical discovery');
    expect(content).toContain('notes:');
    expect(content).toContain('Foreshadow');
    expect(content).toContain('scenes:');
    expect(content).toContain('Morning routine');
  });
});
