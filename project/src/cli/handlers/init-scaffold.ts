/**
 * init scaffolding — copies the plugin's starter template files into a new
 * project.
 *
 * Two destinations:
 *   - Functional files go to the PROJECT ROOT, where the tools read them:
 *       style-targets.yml            → `analyze style`
 *       STRUCTURAL_STYLE_GUIDE.md    → Copy Editor agent
 *       COMPOSITIONAL_STYLE_GUIDE.md → Developmental / Line Editor agents
 *   - Entity templates go to `<project>/templates/`, a reference library the
 *     user copies into the content dirs (characters/, locations/, …) and edits.
 *     They live OUTSIDE the content dirs so `sync` never imports them as junk.
 *
 * Source templates ship with the plugin under `<plugin-root>/templates/`.
 * Never overwrites an existing destination file.
 */

import { existsSync } from 'fs';
import { copyFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// This file compiles to dist/cli/handlers/init-scaffold.js; the plugin root
// (which holds templates/) is three levels up — same relative depth in src/.
const HANDLER_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(HANDLER_DIR, '..', '..', '..', 'templates');

/** Functional files copied to the project root. */
const ROOT_FILES = [
  'style-targets.yml',
  'STRUCTURAL_STYLE_GUIDE.md',
  'COMPOSITIONAL_STYLE_GUIDE.md',
];

/** Entity templates copied into the project's templates/ reference dir. */
const TEMPLATE_DIR_FILES = [
  'character.yml',
  'location.yml',
  'plot.yml',
  'world-rule.yml',
  'timeline.yml',
  'chapter.md',
  'README.md',
];

/**
 * Copy one template into place if the source exists and the destination does
 * not. Returns the project-relative label when a file was written, else null.
 */
async function copyTemplate(name: string, dest: string, label: string): Promise<string | null> {
  const src = join(TEMPLATES_DIR, name);
  if (!existsSync(src) || existsSync(dest)) return null;
  await copyFile(src, dest);
  return label;
}

/**
 * Scaffold the plugin's template files into a project directory. Never
 * overwrites an existing file. Returns the list of project-relative paths
 * actually written (e.g. "style-targets.yml", "templates/character.yml").
 */
export async function scaffoldStyleFiles(cwd: string): Promise<string[]> {
  const written: string[] = [];

  for (const name of ROOT_FILES) {
    const result = await copyTemplate(name, join(cwd, name), name);
    if (result) written.push(result);
  }

  const templatesDir = join(cwd, 'templates');
  await mkdir(templatesDir, { recursive: true });
  for (const name of TEMPLATE_DIR_FILES) {
    const result = await copyTemplate(name, join(templatesDir, name), `templates/${name}`);
    if (result) written.push(result);
  }

  return written;
}
