/**
 * Unit tests for EntityExtractor — "discovery writer" entity proposal.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { EntityExtractor } from '../../../project/src/analysis/entity-extractor.js';

// ─── Fixture helpers ───────────────────────────────────────────────────────────

/**
 * Build a temp novel project with a chapters/ dir, plus optional
 * characters/ and locations/ YAML fixtures. Returns the project dir and the
 * chapter file basename.
 */
async function makeProject(opts: {
  chapter: string;
  characters?: Record<string, string>; // filename → yaml body
  locations?: Record<string, string>;
}): Promise<{ dir: string; chapterFile: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extract-test-'));
  await fs.mkdir(path.join(dir, 'chapters'));
  const chapterFile = 'chapter-01.md';
  await fs.writeFile(path.join(dir, 'chapters', chapterFile), opts.chapter, 'utf-8');

  if (opts.characters) {
    await fs.mkdir(path.join(dir, 'characters'));
    for (const [name, body] of Object.entries(opts.characters)) {
      await fs.writeFile(path.join(dir, 'characters', name), body, 'utf-8');
    }
  }
  if (opts.locations) {
    await fs.mkdir(path.join(dir, 'locations'));
    for (const [name, body] of Object.entries(opts.locations)) {
      await fs.writeFile(path.join(dir, 'locations', name), body, 'utf-8');
    }
  }

  return { dir, chapterFile };
}

let createdDirs: string[] = [];

async function project(opts: Parameters<typeof makeProject>[0]) {
  const res = await makeProject(opts);
  createdDirs.push(res.dir);
  return res;
}

afterEach(async () => {
  for (const dir of createdDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  createdDirs = [];
});

// ─── stripMarkup ───────────────────────────────────────────────────────────────

describe('EntityExtractor.stripMarkup()', () => {
  it('removes frontmatter, comments, markers, and scene delimiters', () => {
    const raw = `---
title: Ch 1
---
<!-- a note -->
[TK: fix this]
--- Scene 1 ---
The rain fell on the city.`;
    const clean = EntityExtractor.stripMarkup(raw);
    expect(clean).not.toContain('title:');
    expect(clean).not.toContain('a note');
    expect(clean).not.toContain('[TK');
    expect(clean).not.toContain('Scene 1');
    expect(clean).toContain('The rain fell on the city.');
  });
});

// ─── Character extraction ──────────────────────────────────────────────────────

describe('EntityExtractor.extractFromChapter() — characters', () => {
  it('proposes a NEW dialogue speaker and excludes an existing character', async () => {
    const chapter = `---
title: Chapter 1
---
The hall was quiet when Mara stepped inside.

"We should not be here," said Mara.

Borin shook his head. Borin had warned her about this place.

"It is too late now," Borin replied. Mara nodded slowly.

Mara crossed the floor while Borin watched.`;

    const { dir, chapterFile } = await project({
      chapter,
      characters: {
        // Existing character — must be excluded from proposals.
        'borin.yml': 'name: Borin\nrole: mentor\n',
      },
    });

    const extractor = new EntityExtractor(dir);
    const result = await extractor.extractFromChapter(chapterFile);

    const names = result.characters.map((c) => c.name);

    // NEW speaker is proposed.
    expect(names).toContain('Mara');
    // Existing character is excluded (case-insensitive match on YAML `name`).
    expect(names).not.toContain('Borin');

    // Mention count is positive and result is sorted descending.
    const mara = result.characters.find((c) => c.name === 'Mara');
    expect(mara?.mentions).toBeGreaterThanOrEqual(2);
  });

  it('excludes a known character matched by a fullName token', async () => {
    const chapter = `The road was long. Mara walked it alone.

"Keep moving," said Mara. Mara did not stop.`;

    const { dir, chapterFile } = await project({
      chapter,
      characters: {
        'mara.yml': 'name: Mara Quill\nrole: lead\n',
      },
    });

    const extractor = new EntityExtractor(dir);
    const result = await extractor.extractFromChapter(chapterFile);

    expect(result.characters.map((c) => c.name)).not.toContain('Mara');
  });

  it('does not propose sentence-start words as characters', async () => {
    // "Then" / "Suddenly" are capitalised only by position.
    const chapter = `Then the door opened. Then it closed.
Suddenly the wind rose. Suddenly all was still.`;

    const { dir, chapterFile } = await project({ chapter });
    const extractor = new EntityExtractor(dir);
    const result = await extractor.extractFromChapter(chapterFile);

    const names = result.characters.map((c) => c.name);
    expect(names).not.toContain('Then');
    expect(names).not.toContain('Suddenly');
  });
});

// ─── Location extraction ───────────────────────────────────────────────────────

describe('EntityExtractor.extractFromChapter() — locations', () => {
  it('proposes a NEW place-suffixed location and excludes an existing one', async () => {
    const chapter = `She hurried to Ironhold Keep before dusk fell.
Later they met at the Copper Market to trade.
He had grown up in Ironhold Keep.`;

    const { dir, chapterFile } = await project({
      chapter,
      locations: {
        'market.yml': 'name: Copper Market\n',
      },
    });

    const extractor = new EntityExtractor(dir);
    const result = await extractor.extractFromChapter(chapterFile);

    const places = result.locations.map((l) => l.name);
    expect(places).toContain('Ironhold Keep');
    // Existing location excluded.
    expect(places).not.toContain('Copper Market');
  });

  it('does not classify a character name as a location', async () => {
    const chapter = `He turned to Mara. "Wait," said Mara. Mara frowned at him.`;

    const { dir, chapterFile } = await project({ chapter });
    const extractor = new EntityExtractor(dir);
    const result = await extractor.extractFromChapter(chapterFile);

    expect(result.locations.map((l) => l.name)).not.toContain('Mara');
  });
});

// ─── extractFromFile / extractFromText — arbitrary outline source ───────────────

describe('EntityExtractor.extractFromFile() — outline bootstrap', () => {
  const OUTLINE = `Our protagonist is Mara, a smuggler with a debt.

"I will not go back," said Mara. Mara has one chance to clear her name.

The climax unfolds at Ironhold Keep, where Mara confronts the man who framed her.`;

  it('proposes characters and locations from a project-relative file path', async () => {
    const { dir } = await project({ chapter: 'placeholder' });
    await fs.writeFile(path.join(dir, 'outline.md'), OUTLINE, 'utf-8');

    const extractor = new EntityExtractor(dir);
    const result = await extractor.extractFromFile('outline.md');

    expect(result.characters.map((c) => c.name)).toContain('Mara');
    expect(result.locations.map((l) => l.name)).toContain('Ironhold Keep');
  });

  it('accepts an absolute file path', async () => {
    const { dir } = await project({ chapter: 'placeholder' });
    const abs = path.join(dir, 'plan.md');
    await fs.writeFile(abs, OUTLINE, 'utf-8');

    const extractor = new EntityExtractor(dir);
    const result = await extractor.extractFromFile(abs);

    expect(result.characters.map((c) => c.name)).toContain('Mara');
  });

  it('cross-references existing characters from the outline source too', async () => {
    const { dir } = await project({
      chapter: 'placeholder',
      characters: { 'mara.yml': 'name: Mara\nrole: lead\n' },
    });
    await fs.writeFile(path.join(dir, 'outline.md'), OUTLINE, 'utf-8');

    const extractor = new EntityExtractor(dir);
    const result = await extractor.extractFromFile('outline.md');

    // Already-known character is not re-proposed.
    expect(result.characters.map((c) => c.name)).not.toContain('Mara');
  });

  it('rejects a missing file by throwing (handler surfaces a friendly error)', async () => {
    const { dir } = await project({ chapter: 'placeholder' });
    const extractor = new EntityExtractor(dir);

    await expect(extractor.extractFromFile('does-not-exist.md')).rejects.toThrow();
  });
});

describe('EntityExtractor.extractFromText() — raw string source', () => {
  it('extracts from a raw string with markup stripped internally', async () => {
    const { dir } = await project({ chapter: 'placeholder' });
    const extractor = new EntityExtractor(dir);

    const result = await extractor.extractFromText(
      `## Beat sheet
"Run," said Borin. Borin leads them out through the Sunken Gate.`
    );

    expect(result.characters.map((c) => c.name)).toContain('Borin');
    expect(result.locations.map((l) => l.name)).toContain('Sunken Gate');
  });
});

// ─── Sorting ───────────────────────────────────────────────────────────────────

describe('EntityExtractor — result ordering', () => {
  it('sorts characters by mention count descending', async () => {
    const chapter = `Mara saw Borin. "Hello," said Mara. Mara waved.
Mara smiled. Borin nodded once.`;

    const { dir, chapterFile } = await project({ chapter });
    const extractor = new EntityExtractor(dir);
    const result = await extractor.extractFromChapter(chapterFile);

    const counts = result.characters.map((c) => c.mentions);
    const sorted = [...counts].sort((a, b) => b - a);
    expect(counts).toEqual(sorted);
  });
});
