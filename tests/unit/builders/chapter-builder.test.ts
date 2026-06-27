/**
 * Unit Tests for ChapterBuilder
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChapterBuilder } from '../../../project/src/builders/chapter-builder.js';
import { getTestProjectPath } from '../../setup.js';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import type { ChapterMetadata } from '../../../project/src/builders/chapter-builder.js';

describe('ChapterBuilder', () => {
  let builder: ChapterBuilder;
  let projectPath: string;

  beforeEach(() => {
    projectPath = getTestProjectPath();
    builder = new ChapterBuilder({ projectPath });
  });

  describe('create()', () => {
    it('should create valid chapter markdown file with frontmatter', async () => {
      // Arrange
      const metadata: ChapterMetadata = {
        title: 'The Beginning',
        status: 'drafted',
      };

      // Act
      const filePath = await builder.create(1, metadata);

      // Assert
      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toContain('01-the-beginning.md');

      // Verify content
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('title: The Beginning');
      expect(content).toContain('status: drafted');
      expect(content).toContain('# The Beginning');
    });

    it('should handle chapter with POV character', async () => {
      // Arrange
      const metadata: ChapterMetadata = {
        title: 'Chapter One',
        status: 'drafted',
        povCharacter: 'Sarah Chen',
      };

      // Act
      const filePath = await builder.create(1, metadata);

      // Assert
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('povCharacter: Sarah Chen');
    });

    it('should handle chapter with summary', async () => {
      // Arrange
      const metadata: ChapterMetadata = {
        title: 'Chapter One',
        status: 'drafted',
        summary: 'Sarah discovers the signal',
      };

      // Act
      const filePath = await builder.create(1, metadata);

      // Assert
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('summary:');
      expect(content).toContain('Sarah discovers the signal');
    });

    it('should handle chapter with notes', async () => {
      // Arrange
      const metadata: ChapterMetadata = {
        title: 'Chapter One',
        status: 'drafted',
        notes: 'Remember to foreshadow the conflict',
      };

      // Act
      const filePath = await builder.create(1, metadata);

      // Assert
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('notes:');
      expect(content).toContain('Remember to foreshadow the conflict');
    });

    it('should handle chapter with scene outlines', async () => {
      // Arrange
      const metadata: ChapterMetadata = {
        title: 'Chapter One',
        status: 'drafted',
        scenes: [
          {
            number: 1,
            summary: 'Signal detected',
            location: 'Observatory',
            characters: ['Sarah', 'Alex'],
          },
          {
            number: 2,
            summary: 'First analysis',
            location: 'Lab',
          },
        ],
      };

      // Act
      const filePath = await builder.create(1, metadata);

      // Assert
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('scenes:');
      expect(content).toContain('Signal detected');
      expect(content).toContain('Observatory');
    });

    it('should include custom content if provided', async () => {
      // Arrange
      const metadata: ChapterMetadata = {
        title: 'Chapter One',
        status: 'drafted',
      };
      const customContent = 'The signal came at midnight...';

      // Act
      const filePath = await builder.create(1, metadata, customContent);

      // Assert
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain(customContent);
      expect(content).not.toContain('[Begin writing here...]');
    });

    it('should throw error if chapter file already exists', async () => {
      // Arrange
      const metadata: ChapterMetadata = {
        title: 'Chapter One',
        status: 'drafted',
      };

      // Act
      await builder.create(1, metadata);

      // Assert
      await expect(builder.create(1, metadata)).rejects.toThrow(
        'Chapter file already exists'
      );
    });

    it('should handle double-digit chapter numbers', async () => {
      // Arrange
      const metadata: ChapterMetadata = {
        title: 'The Climax',
        status: 'drafted',
      };

      // Act
      const filePath = await builder.create(15, metadata);

      // Assert
      expect(filePath).toContain('15-the-climax.md');
    });
  });

  describe('generateFilename()', () => {
    it('should convert "The Beginning" with chapter 1 to "01-the-beginning.md"', () => {
      // Act
      const filename = builder.generateFilename(1, 'The Beginning');

      // Assert
      expect(filename).toBe('01-the-beginning.md');
    });

    it('should pad single-digit chapter numbers', () => {
      // Act
      const filename = builder.generateFilename(5, 'Test');

      // Assert
      expect(filename).toBe('05-test.md');
    });

    it('should not pad double-digit chapter numbers', () => {
      // Act
      const filename = builder.generateFilename(15, 'Test');

      // Assert
      expect(filename).toBe('15-test.md');
    });

    it('should handle special characters in title', () => {
      // Act
      const filename = builder.generateFilename(1, "Sarah's Choice!");

      // Assert
      expect(filename).toBe('01-sarah-s-choice.md');
    });

    it('should handle multiple spaces', () => {
      // Act
      const filename = builder.generateFilename(1, 'The   Big   Moment');

      // Assert
      expect(filename).toBe('01-the-big-moment.md');
    });
  });

  describe('list()', () => {
    it('should return empty array when no chapters exist', async () => {
      // Act
      const files = await builder.list();

      // Assert
      expect(files).toEqual([]);
    });

    it('should return all chapter files', async () => {
      // Arrange
      await builder.create(1, { title: 'Chapter One', status: 'drafted' });
      await builder.create(2, { title: 'Chapter Two', status: 'drafted' });

      // Act
      const files = await builder.list();

      // Assert
      expect(files).toHaveLength(2);
      expect(files[0]).toContain('01-chapter-one.md');
      expect(files[1]).toContain('02-chapter-two.md');
    });

    it('should sort chapters numerically', async () => {
      // Arrange - Create out of order
      await builder.create(3, { title: 'Chapter Three', status: 'drafted' });
      await builder.create(1, { title: 'Chapter One', status: 'drafted' });
      await builder.create(2, { title: 'Chapter Two', status: 'drafted' });

      // Act
      const files = await builder.list();

      // Assert
      expect(files).toHaveLength(3);
      expect(files[0]).toContain('01-chapter-one.md');
      expect(files[1]).toContain('02-chapter-two.md');
      expect(files[2]).toContain('03-chapter-three.md');
    });

    it('should exclude template files (starting with _)', async () => {
      // Arrange
      const { writeFile, mkdir } = await import('fs/promises');
      const { join } = await import('path');
      const chaptersDir = join(projectPath, 'chapters');
      await mkdir(chaptersDir, { recursive: true });
      await writeFile(join(chaptersDir, '_template.md'), '# Template');

      await builder.create(1, { title: 'Chapter One', status: 'drafted' });

      // Act
      const files = await builder.list();

      // Assert
      expect(files).toHaveLength(1);
      expect(files.some((f) => f.includes('_template'))).toBe(false);
    });
  });

  describe('getNextChapterNumber()', () => {
    it('should return 1 when no chapters exist', async () => {
      // Act
      const nextNumber = await builder.getNextChapterNumber();

      // Assert
      expect(nextNumber).toBe(1);
    });

    it('should return next number after existing chapters', async () => {
      // Arrange
      await builder.create(1, { title: 'Chapter One', status: 'drafted' });
      await builder.create(2, { title: 'Chapter Two', status: 'drafted' });

      // Act
      const nextNumber = await builder.getNextChapterNumber();

      // Assert
      expect(nextNumber).toBe(3);
    });

    it('should handle gaps in chapter numbers', async () => {
      // Arrange
      await builder.create(1, { title: 'Chapter One', status: 'drafted' });
      await builder.create(5, { title: 'Chapter Five', status: 'drafted' });

      // Act
      const nextNumber = await builder.getNextChapterNumber();

      // Assert
      expect(nextNumber).toBe(6); // Next after max
    });
  });

  describe('validate()', () => {
    it('should return empty array for valid metadata', () => {
      // Arrange
      const metadata: ChapterMetadata = {
        title: 'Chapter One',
        status: 'drafted',
      };

      // Act
      const errors = builder.validate(metadata);

      // Assert
      expect(errors).toEqual([]);
    });

    it('should return error for missing title', () => {
      // Arrange
      const metadata = {
        status: 'drafted',
      } as any;

      // Act
      const errors = builder.validate(metadata);

      // Assert
      expect(errors).toContain('Missing required field: title');
    });

    it('should return error for empty title', () => {
      // Arrange
      const metadata = {
        title: '   ',
        status: 'drafted',
      } as any;

      // Act
      const errors = builder.validate(metadata);

      // Assert
      expect(errors).toContain('Missing required field: title');
    });

    it('should validate status enum', () => {
      // Arrange
      const metadata = {
        title: 'Chapter One',
        status: 'invalid-status',
      } as any;

      // Act
      const errors = builder.validate(metadata);

      // Assert
      expect(errors.some((e) => e.includes('Status must be'))).toBe(true);
    });

    it('should accept all valid status values', () => {
      // Arrange
      const validStatuses = ['planned', 'drafted', 'revised', 'polished', 'final'];

      // Act & Assert
      for (const status of validStatuses) {
        const metadata: ChapterMetadata = {
          title: 'Test',
          status: status as any,
        };
        const errors = builder.validate(metadata);
        expect(errors).toEqual([]);
      }
    });
  });

  describe('createFromTemplate()', () => {
    it('should create chapter from standard template', async () => {
      // Act
      const filePath = await builder.createFromTemplate(
        1,
        'Chapter One',
        'standard'
      );

      // Assert
      expect(existsSync(filePath)).toBe(true);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('# Chapter One');
      expect(content).toContain('[Begin writing here...]');
    });

    it('should create chapter from action template', async () => {
      // Act
      const filePath = await builder.createFromTemplate(
        1,
        'The Chase',
        'action'
      );

      // Assert
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('## Opening Action');
      expect(content).toContain('## Rising Tension');
      expect(content).toContain('## Climax');
      expect(content).toContain('notes:');
      expect(content).toContain('maintain fast pacing');
    });

    it('should create chapter from dialogue template', async () => {
      // Act
      const filePath = await builder.createFromTemplate(
        1,
        'The Conversation',
        'dialogue'
      );

      // Assert
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('## Conversation');
      expect(content).toContain('## Revelation');
    });

    it('should create chapter from introspection template', async () => {
      // Act
      const filePath = await builder.createFromTemplate(
        1,
        'Inner Thoughts',
        'introspection'
      );

      // Assert
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('## Internal Landscape');
      expect(content).toContain('## Realization/Decision');
    });

    it('should create chapter from flashback template', async () => {
      // Act
      const filePath = await builder.createFromTemplate(
        1,
        'The Memory',
        'flashback'
      );

      // Assert
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('## Trigger');
      expect(content).toContain('**[Past - Make timeline clear]**');
      expect(content).toContain('## Back to Present');
    });

    it('should throw error for invalid template', async () => {
      // Act & Assert
      await expect(
        builder.createFromTemplate(1, 'Test', 'invalid-template')
      ).rejects.toThrow('Template not found');
    });
  });
});
