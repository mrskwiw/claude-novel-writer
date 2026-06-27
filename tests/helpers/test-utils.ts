/**
 * Test utility functions
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import YAML from 'yaml';
import type { CharacterYAML, LocationYAML, PlotYAML } from '../../project/src/types/novel.js';

/**
 * Create a test character YAML file
 */
export async function createTestCharacterFile(
  projectPath: string,
  name: string,
  data?: Partial<CharacterYAML>
): Promise<string> {
  const charactersDir = join(projectPath, 'characters');
  if (!existsSync(charactersDir)) {
    await mkdir(charactersDir, { recursive: true });
  }

  const character: CharacterYAML = {
    name,
    role: data?.role || 'major',
    summary: data?.summary || 'Test character',
    ...data,
  };

  const filename = name.toLowerCase().replace(/\s+/g, '-') + '.yml';
  const filePath = join(charactersDir, filename);
  await writeFile(filePath, YAML.stringify(character));

  return filePath;
}

/**
 * Create a test location YAML file
 */
export async function createTestLocationFile(
  projectPath: string,
  name: string,
  data?: Partial<LocationYAML>
): Promise<string> {
  const locationsDir = join(projectPath, 'locations');
  if (!existsSync(locationsDir)) {
    await mkdir(locationsDir, { recursive: true });
  }

  const location: LocationYAML = {
    name,
    description: data?.description || 'Test location',
    ...data,
  };

  const filename = name.toLowerCase().replace(/\s+/g, '-') + '.yml';
  const filePath = join(locationsDir, filename);
  await writeFile(filePath, YAML.stringify(location));

  return filePath;
}

/**
 * Create a test plot YAML file
 */
export async function createTestPlotFile(
  projectPath: string,
  name: string,
  data?: Partial<PlotYAML>
): Promise<string> {
  const plotsDir = join(projectPath, 'plots');
  if (!existsSync(plotsDir)) {
    await mkdir(plotsDir, { recursive: true });
  }

  const plot: PlotYAML = {
    name,
    type: data?.type || 'subplot',
    status: data?.status || 'planned',
    priority: data?.priority || 3,
    description: data?.description || 'Test plot',
    ...data,
  };

  const filename = name.toLowerCase().replace(/\s+/g, '-') + '.yml';
  const filePath = join(plotsDir, filename);
  await writeFile(filePath, YAML.stringify(plot));

  return filePath;
}

/**
 * Read and parse a YAML file
 */
export async function readYAMLFile<T = any>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return YAML.parse(content) as T;
}

/**
 * Create a test chapter markdown file
 */
export async function createTestChapterFile(
  projectPath: string,
  number: number,
  title: string,
  content?: string
): Promise<string> {
  const chaptersDir = join(projectPath, 'chapters');
  if (!existsSync(chaptersDir)) {
    await mkdir(chaptersDir, { recursive: true });
  }

  const chapterNum = number.toString().padStart(2, '0');
  const titleSlug = title.toLowerCase().replace(/\s+/g, '-');
  const filename = `${chapterNum}-${titleSlug}.md`;
  const filePath = join(chaptersDir, filename);

  const chapterContent = content || `---
chapter: ${number}
title: "${title}"
---

# Chapter ${number}: ${title}

## Scene 1

[Write your scene here]
`;

  await writeFile(filePath, chapterContent);
  return filePath;
}

/**
 * Wait for a specified time (for async tests)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a simple test database path
 */
export function getTestDbPath(projectPath: string): string {
  return join(projectPath, '.novel', 'data.db');
}
