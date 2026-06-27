/**
 * Scene Builder
 * Manages scenes embedded in chapter markdown files using HTML comment markers
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { SceneBeat } from '../types/novel.js';

export type EmotionalBeat =
  | 'hopeful' | 'determined' | 'fearful' | 'angry' | 'grieving'
  | 'joyful' | 'confused' | 'resigned' | 'transformed' | 'neutral'
  | 'tense' | 'melancholic';

export interface SceneMetadata {
  sceneNumber: number;
  title?: string;
  pov?: string; // Character name
  location?: string;
  timeOfDay?: string;
  purpose?: string;
  emotionalTone?: string;
  tensionLevel?: number; // 1-10
  emotionalBeat?: EmotionalBeat;
  /** Parsed from `<!-- character_states: Name=hopeful|Name2=fearful -->` */
  characterStates?: Array<{ name: string; state: string }>;
  /** AI-generated beats for this scene, stored as <!-- beat-N: ... --> comments */
  beats?: SceneBeat[];
}

export interface SceneContent {
  metadata: SceneMetadata;
  content: string;
  startIndex: number; // Character position in file where scene starts
  endIndex: number; // Character position in file where scene ends
}

export interface SceneBuilderOptions {
  chapterFilePath: string;
}

export class SceneBuilder {
  private chapterFilePath: string;

  constructor(options: SceneBuilderOptions) {
    this.chapterFilePath = options.chapterFilePath;
  }

  /**
   * Add new scene to chapter at specified position
   */
  async addScene(
    sceneData: Omit<SceneMetadata, 'sceneNumber'> & { insertAfterScene?: number },
    content?: string
  ): Promise<SceneMetadata> {
    // Read chapter file
    const chapterContent = await this.readChapterFile();

    // Parse existing scenes
    const existingScenes = this.parseScenesFromContent(chapterContent);

    // Determine scene number
    const sceneNumber = existingScenes.length + 1;

    // Build scene content
    const sceneMarker = this.generateSceneMarker({
      sceneNumber,
      ...sceneData,
    });

    const sceneContent = `${sceneMarker}\n${content || '*[Begin scene...]*\n'}\n<!-- /scene:${sceneNumber} -->\n\n`;

    // Insert scene
    let newContent: string;
    if (sceneData.insertAfterScene !== undefined) {
      // Insert after specific scene
      const afterScene = existingScenes.find(
        (s) => s.metadata.sceneNumber === sceneData.insertAfterScene
      );
      if (!afterScene) {
        throw new Error(`Scene ${sceneData.insertAfterScene} not found`);
      }
      newContent =
        chapterContent.slice(0, afterScene.endIndex) +
        '\n' +
        sceneContent +
        chapterContent.slice(afterScene.endIndex);
    } else {
      // Append to end
      newContent = chapterContent + sceneContent;
    }

    // Write updated file
    await writeFile(this.chapterFilePath, newContent, 'utf-8');

    return {
      sceneNumber,
      ...sceneData,
    };
  }

  /**
   * Parse all scenes from chapter file
   */
  async parseScenes(): Promise<SceneContent[]> {
    const content = await this.readChapterFile();
    return this.parseScenesFromContent(content);
  }

  /**
   * Parse scenes from content string (internal helper)
   */
  private parseScenesFromContent(content: string): SceneContent[] {
    const scenes: SceneContent[] = [];

    // Regex to match scene markers
    const sceneRegex = /<!-- scene:(\d+) -->\s*((?:<!-- .+? -->\s*)*)([\s\S]*?)<!-- \/scene:\1 -->/g;

    let match: RegExpExecArray | null;
    while ((match = sceneRegex.exec(content)) !== null) {
      const sceneNumber = parseInt(match[1]);
      const metadataSection = match[2];
      const sceneContent = match[3].trim();

      // Parse metadata from comment lines
      const metadata = this.parseSceneMetadata(sceneNumber, metadataSection);

      scenes.push({
        metadata,
        content: sceneContent,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return scenes;
  }

  /**
   * Parse scene metadata from HTML comments
   */
  private parseSceneMetadata(
    sceneNumber: number,
    metadataSection: string
  ): SceneMetadata {
    const metadata: SceneMetadata = { sceneNumber };

    // Extract metadata from comment lines
    const titleMatch = metadataSection.match(/<!-- title: (.+?) -->/);
    if (titleMatch) metadata.title = titleMatch[1].trim();

    const povMatch = metadataSection.match(/<!-- pov: (.+?) -->/);
    if (povMatch) metadata.pov = povMatch[1].trim();

    const locationMatch = metadataSection.match(/<!-- location: (.+?) -->/);
    if (locationMatch) metadata.location = locationMatch[1].trim();

    const timeMatch = metadataSection.match(/<!-- time: (.+?) -->/);
    if (timeMatch) metadata.timeOfDay = timeMatch[1].trim();

    const purposeMatch = metadataSection.match(/<!-- purpose: (.+?) -->/);
    if (purposeMatch) metadata.purpose = purposeMatch[1].trim();

    const toneMatch = metadataSection.match(/<!-- tone: (.+?) -->/);
    if (toneMatch) metadata.emotionalTone = toneMatch[1].trim();

    const tensionMatch = metadataSection.match(/<!-- tension: (\d+) -->/);
    if (tensionMatch) metadata.tensionLevel = parseInt(tensionMatch[1]);

    const validBeats: EmotionalBeat[] = [
      'hopeful', 'determined', 'fearful', 'angry', 'grieving',
      'joyful', 'confused', 'resigned', 'transformed', 'neutral',
      'tense', 'melancholic',
    ];
    const beatMatch = metadataSection.match(/<!-- emotional_beat: (.+?) -->/);
    if (beatMatch) {
      const raw = beatMatch[1].trim() as EmotionalBeat;
      if (validBeats.includes(raw)) {
        metadata.emotionalBeat = raw;
      }
    }

    // Parse character_states: Name=hopeful|Name2=fearful
    const csMatch = metadataSection.match(/<!-- character_states: (.+?) -->/);
    if (csMatch) {
      const pairs = csMatch[1].trim().split('|');
      const characterStates: Array<{ name: string; state: string }> = [];
      for (const pair of pairs) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx !== -1) {
          const name = pair.slice(0, eqIdx).trim();
          const state = pair.slice(eqIdx + 1).trim();
          if (name && state) {
            characterStates.push({ name, state });
          }
        }
      }
      if (characterStates.length > 0) {
        metadata.characterStates = characterStates;
      }
    }

    // Parse beat-N comments: <!-- beat-1: description -->
    const beatLineRegex = /<!-- beat-(\d+): (.+?) -->/g;
    const beats: SceneBeat[] = [];
    let beatLineMatch: RegExpExecArray | null;
    while ((beatLineMatch = beatLineRegex.exec(metadataSection)) !== null) {
      beats.push({
        beatNumber: parseInt(beatLineMatch[1], 10),
        description: beatLineMatch[2].trim(),
      });
    }
    if (beats.length > 0) {
      beats.sort((a, b) => a.beatNumber - b.beatNumber);
      metadata.beats = beats;
    }

    return metadata;
  }

  /**
   * Update scene metadata
   */
  async updateSceneMetadata(
    sceneNumber: number,
    updates: Partial<Omit<SceneMetadata, 'sceneNumber'>>
  ): Promise<void> {
    const content = await this.readChapterFile();
    const scenes = this.parseScenesFromContent(content);

    const scene = scenes.find((s) => s.metadata.sceneNumber === sceneNumber);
    if (!scene) {
      throw new Error(`Scene ${sceneNumber} not found`);
    }

    // Build updated metadata
    const updatedMetadata: SceneMetadata = {
      ...scene.metadata,
      ...updates,
    };

    // Generate new marker
    const newMarker = this.generateSceneMarker(updatedMetadata);

    // Replace old marker with new marker
    const sceneStart = content.indexOf(`<!-- scene:${sceneNumber} -->`);
    if (sceneStart === -1) {
      throw new Error(`Scene ${sceneNumber} marker not found`);
    }

    // Find end of metadata section (first line that's not a comment or empty)
    let metadataEnd = sceneStart;
    const lines = content.slice(sceneStart).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('<!--')) {
        metadataEnd = sceneStart + lines.slice(0, i).join('\n').length;
        break;
      }
    }

    // Replace metadata section
    const newContent =
      content.slice(0, sceneStart) +
      newMarker +
      '\n' +
      content.slice(metadataEnd);

    await writeFile(this.chapterFilePath, newContent, 'utf-8');
  }

  /**
   * Delete scene from chapter
   */
  async deleteScene(sceneNumber: number): Promise<void> {
    const content = await this.readChapterFile();
    const scenes = this.parseScenesFromContent(content);

    const scene = scenes.find((s) => s.metadata.sceneNumber === sceneNumber);
    if (!scene) {
      throw new Error(`Scene ${sceneNumber} not found`);
    }

    // Remove scene from content
    const newContent =
      content.slice(0, scene.startIndex) +
      content.slice(scene.endIndex);

    // Renumber remaining scenes
    const renumbered = this.renumberScenes(newContent, sceneNumber);

    await writeFile(this.chapterFilePath, renumbered, 'utf-8');
  }

  /**
   * Reorder scenes in chapter
   */
  async reorderScenes(newOrder: number[]): Promise<void> {
    const content = await this.readChapterFile();
    const scenes = this.parseScenesFromContent(content);

    // Validate new order
    if (newOrder.length !== scenes.length) {
      throw new Error(
        `New order must include all ${scenes.length} scenes`
      );
    }

    const uniqueNumbers = new Set(newOrder);
    if (uniqueNumbers.size !== newOrder.length) {
      throw new Error('New order contains duplicate scene numbers');
    }

    // Extract non-scene content (frontmatter, etc.)
    const firstScene = scenes[0];
    const preamble = firstScene ? content.slice(0, firstScene.startIndex) : content;

    // Reorder scene blocks
    const reorderedScenes = newOrder.map((oldNum) => {
      const scene = scenes.find((s) => s.metadata.sceneNumber === oldNum);
      if (!scene) {
        throw new Error(`Scene ${oldNum} not found`);
      }
      return scene;
    });

    // Build new content with renumbered scenes
    let newContent = preamble;
    reorderedScenes.forEach((scene, index) => {
      const newSceneNumber = index + 1;
      const updatedMetadata = {
        ...scene.metadata,
        sceneNumber: newSceneNumber,
      };

      const marker = this.generateSceneMarker(updatedMetadata);
      newContent += `${marker}\n${scene.content}\n<!-- /scene:${newSceneNumber} -->\n\n`;
    });

    await writeFile(this.chapterFilePath, newContent, 'utf-8');
  }

  /**
   * Count words in scene (excluding markers and metadata)
   */
  countSceneWords(sceneContent: string): number {
    // Remove HTML comments
    const withoutComments = sceneContent.replace(/<!--[\s\S]*?-->/g, '');

    // Remove markdown frontmatter if present
    const withoutFrontmatter = withoutComments.replace(/^---[\s\S]*?---\n*/m, '');

    // Remove markdown syntax (headers, bold, italic, etc.)
    const plainText = withoutFrontmatter
      .replace(/^#+\s+/gm, '') // Headers
      .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1') // Bold/italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      .replace(/`{1,3}[^`]*`{1,3}/g, '') // Code
      .trim();

    // Count words
    const words = plainText
      .split(/\s+/)
      .filter((w) => w.length > 0);

    return words.length;
  }

  /**
   * Get scene statistics
   */
  async getSceneStats(): Promise<{
    totalScenes: number;
    totalWords: number;
    averageWordsPerScene: number;
    scenes: Array<{ sceneNumber: number; wordCount: number }>;
  }> {
    const scenes = await this.parseScenes();

    const sceneWordCounts = scenes.map((scene) => ({
      sceneNumber: scene.metadata.sceneNumber,
      wordCount: this.countSceneWords(scene.content),
    }));

    const totalWords = sceneWordCounts.reduce((sum, s) => sum + s.wordCount, 0);

    return {
      totalScenes: scenes.length,
      totalWords,
      averageWordsPerScene: scenes.length > 0 ? totalWords / scenes.length : 0,
      scenes: sceneWordCounts,
    };
  }

  /**
   * Generate scene marker with metadata
   */
  private generateSceneMarker(metadata: SceneMetadata): string {
    let marker = `<!-- scene:${metadata.sceneNumber} -->`;

    if (metadata.title) {
      marker += `\n<!-- title: ${metadata.title} -->`;
    }

    if (metadata.pov) {
      marker += `\n<!-- pov: ${metadata.pov} -->`;
    }

    if (metadata.location) {
      marker += `\n<!-- location: ${metadata.location} -->`;
    }

    if (metadata.timeOfDay) {
      marker += `\n<!-- time: ${metadata.timeOfDay} -->`;
    }

    if (metadata.purpose) {
      marker += `\n<!-- purpose: ${metadata.purpose} -->`;
    }

    if (metadata.emotionalTone) {
      marker += `\n<!-- tone: ${metadata.emotionalTone} -->`;
    }

    if (metadata.tensionLevel !== undefined) {
      marker += `\n<!-- tension: ${metadata.tensionLevel} -->`;
    }

    if (metadata.beats && metadata.beats.length > 0) {
      for (const beat of metadata.beats) {
        // Strip --> from description so it doesn't break the HTML comment
        const safe = beat.description.replace(/-->/g, '—');
        marker += `\n<!-- beat-${beat.beatNumber}: ${safe} -->`;
      }
    }

    return marker;
  }

  /**
   * Write AI-generated beats into a scene's metadata block.
   * Replaces any existing beats for that scene number.
   */
  async writeBeats(sceneNumber: number, beats: SceneBeat[]): Promise<void> {
    await this.updateSceneMetadata(sceneNumber, { beats });
  }

  /**
   * Remove all beats from a scene's metadata block.
   */
  async clearBeats(sceneNumber: number): Promise<void> {
    await this.updateSceneMetadata(sceneNumber, { beats: [] });
  }

  /**
   * Renumber scenes after deletion
   */
  private renumberScenes(content: string, deletedSceneNumber: number): string {
    let result = content;

    // Find all scenes with number > deletedSceneNumber
    const sceneMarkerRegex = /<!-- scene:(\d+) -->/g;
    const closeMarkerRegex = /<!-- \/scene:(\d+) -->/g;

    // Renumber opening markers
    result = result.replace(sceneMarkerRegex, (match, numStr) => {
      const num = parseInt(numStr);
      if (num > deletedSceneNumber) {
        return `<!-- scene:${num - 1} -->`;
      }
      return match;
    });

    // Renumber closing markers
    result = result.replace(closeMarkerRegex, (match, numStr) => {
      const num = parseInt(numStr);
      if (num > deletedSceneNumber) {
        return `<!-- /scene:${num - 1} -->`;
      }
      return match;
    });

    return result;
  }

  /**
   * Read chapter file with error handling
   */
  private async readChapterFile(): Promise<string> {
    if (!existsSync(this.chapterFilePath)) {
      throw new Error(`Chapter file not found: ${this.chapterFilePath}`);
    }

    return await readFile(this.chapterFilePath, 'utf-8');
  }

  /**
   * Validate scene metadata
   */
  validate(metadata: Partial<SceneMetadata>): string[] {
    const errors: string[] = [];

    if (metadata.tensionLevel !== undefined) {
      if (metadata.tensionLevel < 1 || metadata.tensionLevel > 10) {
        errors.push('Tension level must be between 1 and 10');
      }
    }

    if (metadata.sceneNumber !== undefined && metadata.sceneNumber < 1) {
      errors.push('Scene number must be positive');
    }

    return errors;
  }
}
