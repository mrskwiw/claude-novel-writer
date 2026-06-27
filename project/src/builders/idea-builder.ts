/**
 * Idea Builder
 * Creates and manages idea/brainstorming YAML files in the .novel/ideas directory.
 */

import { writeFile, readFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import type { IdeaEntry } from '../types/novel.js';

/** Filter options for listing ideas */
export interface IdeaFilter {
  tag?: string;
  status?: 'active' | 'used' | 'discarded';
}

/**
 * Manages idea YAML files under `<projectPath>/.novel/ideas/`.
 * The sync layer is responsible for pushing ideas to the database.
 */
export class IdeaBuilder {
  private ideasDir: string;

  constructor(projectPath: string) {
    this.ideasDir = join(projectPath, '.novel', 'ideas');
  }

  /**
   * Derive a filesystem-safe slug key from content text, appending a
   * base-36 timestamp to guarantee uniqueness.
   */
  private ideaKey(content: string): string {
    const slug = content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join('-');
    const ts = Date.now().toString(36);
    return `${slug}-${ts}`;
  }

  /**
   * Quickly capture a new idea with optional tags.
   * Writes a YAML file and returns the in-memory `IdeaEntry`.
   *
   * @param content - The idea text
   * @param tags    - Optional tag strings
   * @returns The created `IdeaEntry` (projectId = 0 until synced)
   */
  async quickAdd(content: string, tags: string[] = []): Promise<IdeaEntry> {
    if (!existsSync(this.ideasDir)) {
      await mkdir(this.ideasDir, { recursive: true });
    }

    const idea: IdeaEntry = {
      projectId: 0, // filled by sync layer
      ideaKey: this.ideaKey(content),
      content,
      tags,
      status: 'active',
    };

    const filePath = join(this.ideasDir, `${idea.ideaKey}.yml`);
    await writeFile(filePath, YAML.stringify(idea), 'utf-8');
    return idea;
  }

  /**
   * List all ideas, optionally filtered by tag and/or status.
   * Results are sorted newest-first by `createdAt`.
   *
   * @param filter - Optional `IdeaFilter`
   * @returns Array of matching `IdeaEntry` objects
   */
  async list(filter?: IdeaFilter): Promise<IdeaEntry[]> {
    if (!existsSync(this.ideasDir)) return [];

    const files = await readdir(this.ideasDir);
    const ymlFiles = files.filter(f => f.endsWith('.yml'));

    const ideas: IdeaEntry[] = [];
    for (const file of ymlFiles) {
      const raw = await readFile(join(this.ideasDir, file), 'utf-8');
      const idea = YAML.parse(raw) as IdeaEntry;

      if (filter?.status && idea.status !== filter.status) continue;
      if (filter?.tag && !idea.tags.includes(filter.tag)) continue;

      ideas.push(idea);
    }

    return ideas.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }

  /**
   * Retrieve a single idea by its key.
   *
   * @param key - The idea key (filename without `.yml`)
   * @returns The `IdeaEntry` or `null` if not found
   */
  async get(key: string): Promise<IdeaEntry | null> {
    const filePath = join(this.ideasDir, `${key}.yml`);
    if (!existsSync(filePath)) return null;
    const raw = await readFile(filePath, 'utf-8');
    return YAML.parse(raw) as IdeaEntry;
  }

  /**
   * Change the status of an existing idea.
   *
   * @param key    - Idea key
   * @param status - New status value
   */
  async updateStatus(key: string, status: 'active' | 'used' | 'discarded'): Promise<void> {
    const filePath = join(this.ideasDir, `${key}.yml`);
    if (!existsSync(filePath)) throw new Error(`Idea not found: ${key}`);
    const raw = await readFile(filePath, 'utf-8');
    const idea = YAML.parse(raw) as IdeaEntry;
    idea.status = status;
    idea.updatedAt = new Date().toISOString();
    await writeFile(filePath, YAML.stringify(idea), 'utf-8');
  }

  /**
   * Link an idea to a named story entity.
   *
   * @param key  - Idea key
   * @param type - Entity type
   * @param name - Entity name
   */
  async link(
    key: string,
    type: 'character' | 'plot' | 'location' | 'scene' | 'world-rule',
    name: string
  ): Promise<void> {
    const filePath = join(this.ideasDir, `${key}.yml`);
    if (!existsSync(filePath)) throw new Error(`Idea not found: ${key}`);
    const raw = await readFile(filePath, 'utf-8');
    const idea = YAML.parse(raw) as IdeaEntry;
    idea.linkedEntityType = type;
    idea.linkedEntityName = name;
    idea.updatedAt = new Date().toISOString();
    await writeFile(filePath, YAML.stringify(idea), 'utf-8');
  }

  /**
   * Append a note to an existing idea (newline-separated).
   *
   * @param key  - Idea key
   * @param note - Note text to append
   */
  async addNote(key: string, note: string): Promise<void> {
    const filePath = join(this.ideasDir, `${key}.yml`);
    if (!existsSync(filePath)) throw new Error(`Idea not found: ${key}`);
    const raw = await readFile(filePath, 'utf-8');
    const idea = YAML.parse(raw) as IdeaEntry;
    idea.notes = idea.notes ? `${idea.notes}\n${note}` : note;
    idea.updatedAt = new Date().toISOString();
    await writeFile(filePath, YAML.stringify(idea), 'utf-8');
  }
}
