# Master Build Specification
## Claude Novel Writer Extension — Complete Implementation Guide

**Version**: 1.0  
**Date**: 2026-04-22  
**Purpose**: Single reference document for speccing and building all remaining features. Contains everything needed to pick up any task and implement it correctly without prior context.

---

## PART 1 — PROJECT STATE SNAPSHOT

### What exists and works today

| System | Status | Key Files | Commands |
|---|---|---|---|
| Project init | Complete | `src/cli/handlers/init-handler.ts` | `/novel init` |
| Chapter management | Complete | `src/builders/chapter-builder.ts` | `/novel chapter *` (5 cmds) |
| Scene management | Complete | `src/builders/scene-builder.ts` | `/novel scene *` (8 cmds) |
| Character system | Complete | `src/builders/character-builder.ts` | `/novel character *` (6 cmds) |
| Location system | Complete | `src/builders/location-builder.ts` | `/novel location *` (5 cmds) |
| Plot threads | Complete | `src/builders/plot-thread-builder.ts` | `/novel plot *` (8 cmds) |
| World rules | Complete | `src/builders/world-rules-builder.ts` | `/novel world-rule *` (11 cmds) |
| Timeline | Complete | `src/builders/timeline-builder.ts` | `/novel timeline *` (9 cmds) |
| Session tracking | Complete | `src/session/session-manager.ts` | `/novel session *` (4 cmds) |
| Consistency checker | Partial | `src/consistency/checker.ts` | `/novel check *` (9 cmds) |
| Export (Markdown) | Complete | `src/builders/manuscript-assembler.ts` | `/novel export *` (2 cmds) |
| AI generation | Complete | `src/ai/generation-manager.ts` | `/novel generate *` (6 cmds) |
| Context assembler | Partial | `src/context/scene-context.ts` | (internal only) |
| Sync (File→DB) | Complete | `src/sync/` | `/novel sync` |
| Sync (DB→File) | Partial | `src/sync/timeline-sync.ts` only | — |

### Critical bugs in existing code

| Bug | File | Line | Description |
|---|---|---|---|
| Context stub | `src/ai/generation-manager.ts` | 484–486 | `assembleSceneContext()` returns `{}` — SceneContextAssembler never called |
| Outdated model | `src/ai/claude-client.ts` | 29 | `claude-3-5-sonnet-20241022` — should be `claude-sonnet-4-6` |
| Token budget | `src/context/scene-context.ts` | 18 | `maxTokenBudget` declared but never enforced |
| Beat sync | `src/sync/plot-thread-sync.ts` | — | Scene name strings never resolved to scene IDs |
| No conflict detect | all `src/sync/*.ts` | — | Sync does blind upsert, no dirty-flag comparison |

---

## PART 2 — ARCHITECTURE REFERENCE CARD

Every new feature must follow these exact patterns. An AI builder should read this section before touching any code.

### 2.1 Layer order (strict, no skipping)

```
CLI command definition   → src/cli/commands/{entity}.ts
CLI handler              → src/cli/handlers/{entity}-handler.ts
Builder (file ops)       → src/builders/{entity}-builder.ts
Sync manager (DB ops)    → src/sync/{entity}-sync.ts
Types                    → src/types/novel.ts
DB schema                → claudenovel_plugin/schema.sql
Registry registration    → src/cli/registry.ts
Extension API            → src/index.ts
```

### 2.2 Naming conventions

```
Files:      kebab-case             (idea-builder.ts)
Classes:    PascalCase             (IdeaBuilder)
Commands:   lowercase + hyphen     (idea-capture)
DB tables:  snake_case plural      (idea_entries)
DB cols:    snake_case             (linked_entity_id)
YAML keys:  snake_case             (linked_entity_id)
TS props:   camelCase              (linkedEntityId)
```

### 2.3 Builder pattern (copy this exactly)

```typescript
// src/builders/{entity}-builder.ts
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';

export interface EntityData {
  name: string;
  // ... entity-specific fields (NO 'any')
}

export class EntityBuilder {
  private dir: string;

  constructor(private projectPath: string) {
    this.dir = join(projectPath, '{entities}');  // plural
  }

  async create(data: EntityData): Promise<string> {
    const filename = this.slugify(data.name) + '.yml';
    const filePath = join(this.dir, filename);
    await writeFile(filePath, yaml.stringify(data), 'utf-8');
    return filePath;
  }

  async list(): Promise<EntityData[]> {
    const files = await readdir(this.dir).catch(() => []);
    const results: EntityData[] = [];
    for (const f of files.filter(f => f.endsWith('.yml'))) {
      const raw = await readFile(join(this.dir, f), 'utf-8');
      results.push(yaml.parse(raw) as EntityData);
    }
    return results;
  }

  async get(name: string): Promise<EntityData | null> {
    const filePath = join(this.dir, this.slugify(name) + '.yml');
    const raw = await readFile(filePath, 'utf-8').catch(() => null);
    return raw ? (yaml.parse(raw) as EntityData) : null;
  }

  async update(name: string, patch: Partial<EntityData>): Promise<void> {
    const existing = await this.get(name);
    if (!existing) throw new Error(`Entity not found: ${name}`);
    const updated = { ...existing, ...patch };
    const filePath = join(this.dir, this.slugify(name) + '.yml');
    await writeFile(filePath, yaml.stringify(updated), 'utf-8');
  }

  async delete(name: string): Promise<void> {
    const { unlink } = await import('fs/promises');
    await unlink(join(this.dir, this.slugify(name) + '.yml'));
  }

  private slugify(name: string): string {
    return name.trim().toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'untitled';
  }
}
```

### 2.4 Sync manager pattern (File→DB + DB→File)

```typescript
// src/sync/{entity}-sync.ts
import type { MCPClient } from '../core/database.js';
import { EntityBuilder } from '../builders/{entity}-builder.js';

export class EntitySync {
  private builder: EntityBuilder;

  constructor(
    private mcpClient: MCPClient,
    private projectId: number,
    private projectPath: string
  ) {
    this.builder = new EntityBuilder(projectPath);
  }

  // File → DB
  async syncToDb(name?: string): Promise<void> {
    const items = name ? [await this.builder.get(name)].filter(Boolean) : await this.builder.list();
    for (const item of items) {
      await this.upsertRecord(item!);
    }
  }

  // DB → File
  async syncToFiles(name?: string): Promise<void> {
    const query = name
      ? 'SELECT * FROM {entities} WHERE project_id = ? AND name = ?'
      : 'SELECT * FROM {entities} WHERE project_id = ?';
    const params = name ? [this.projectId, name] : [this.projectId];
    const rows = await this.mcpClient.readQuery(query, params);
    for (const row of rows) {
      await this.builder.update(row.name, this.rowToData(row));
    }
  }

  private async upsertRecord(data: EntityData): Promise<void> {
    const existing = await this.mcpClient.readQuery(
      'SELECT id FROM {entities} WHERE project_id = ? AND name = ?',
      [this.projectId, data.name]
    );
    if (existing.length > 0) {
      await this.mcpClient.writeQuery(
        'UPDATE {entities} SET ... WHERE id = ?',
        [...fields, existing[0].id]
      );
    } else {
      await this.mcpClient.writeQuery(
        'INSERT INTO {entities} (project_id, name, ...) VALUES (?, ?, ...)',
        [this.projectId, data.name, ...fields]
      );
    }
  }

  private rowToData(row: Record<string, unknown>): EntityData {
    // map snake_case DB cols back to EntityData shape
  }
}
```

### 2.5 CLI command + handler pattern

```typescript
// src/cli/commands/{entity}.ts
import type { Command } from '../types.js';

export const entityCommand: Command = {
  name: '{entity}',
  description: 'Manage {entities}',
  handler: async (args, context) => {
    const { handle{Entity}Command } = await import('../handlers/{entity}-handler.js');
    await handle{Entity}Command(args, context.cwd, context.output);
  },
  subcommands: [
    { name: 'add',    description: 'Add a new {entity}' },
    { name: 'list',   description: 'List all {entities}' },
    { name: 'show',   description: 'Show {entity} details' },
    { name: 'edit',   description: 'Edit {entity}' },
    { name: 'delete', description: 'Delete {entity}' },
    { name: 'sync',   description: 'Sync {entities} to database' },
  ]
};
```

```typescript
// src/cli/handlers/{entity}-handler.ts
import type { ParsedArgs } from '../types.js';
import type { OutputFormatter } from '../output.js';

export async function handle{Entity}Command(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const subcommand = args.positional[0];

  switch (subcommand) {
    case 'add':    return handle{Entity}Add(args, projectPath, output);
    case 'list':   return handle{Entity}List(args, projectPath, output);
    case 'show':   return handle{Entity}Show(args, projectPath, output);
    case 'edit':   return handle{Entity}Edit(args, projectPath, output);
    case 'delete': return handle{Entity}Delete(args, projectPath, output);
    case 'sync':   return handle{Entity}Sync(args, projectPath, output);
    default:
      output.error(`Unknown subcommand: ${subcommand}`);
      output.info('Usage: /novel {entity} <add|list|show|edit|delete|sync>');
  }
}
```

### 2.6 Schema additions pattern

Every new entity gets this minimum schema in `schema.sql`:

```sql
-- {entities} table
CREATE TABLE IF NOT EXISTS {entities} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  -- entity-specific columns --
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_{entities}_project ON {entities}(project_id);
```

### 2.7 Test patterns

Every builder gets:
- `tests/unit/builders/{entity}-builder.test.ts` — pure file operations, no DB
- `tests/integration/workflows/{entity}-workflow.test.ts` — full create→sync→query cycle with MockMCPClient

```typescript
// Unit test skeleton
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EntityBuilder } from '../../../src/builders/{entity}-builder.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('EntityBuilder', () => {
  let builder: EntityBuilder;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), 'test-'));
    await mkdir(join(projectPath, '{entities}'), { recursive: true });
    builder = new EntityBuilder(projectPath);
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it('creates an entity and reads it back', async () => { ... });
  it('lists all entities', async () => { ... });
  it('updates an entity', async () => { ... });
  it('deletes an entity', async () => { ... });
  it('handles missing entity gracefully', async () => { ... });
});
```

### 2.8 TypeScript rules

- NO `: any` — use `Record<string, unknown>` for DB rows, `unknown` in catch blocks
- All DB row results: define a typed interface `interface {Entity}Row { ... }`
- All public methods: explicit return types
- Prefer `const` over `let`; never `var`
- Async/await everywhere; no `.then()` chains

---

## PART 3 — FEATURE SPECS (ORDERED BY BUILD DEPENDENCY)

Build in this order. Later features depend on earlier ones.

---

### SPEC-01: Fix Context Engine → AI Connection (Bug Fix)

**Priority**: Critical  
**Effort**: Small  
**Dependencies**: None  
**Files touched**: `src/ai/generation-manager.ts`, `src/context/scene-context.ts`

#### What to build

Replace the stub `assembleSceneContext()` with a real call to `SceneContextAssembler`. Add token budget enforcement.

#### Detailed changes

**1. `generation-manager.ts` — wire SceneContextAssembler**

```typescript
// Add import
import { SceneContextAssembler } from '../context/scene-context.js';

// In constructor, add:
private contextAssembler: SceneContextAssembler;

constructor(private mcpClient: MCPClient, private projectId: number) {
  this.claude = new ClaudeClient();
  this.contextAssembler = new SceneContextAssembler(mcpClient, projectId);
}

// Replace stub:
private async assembleSceneContext(sceneId: number): Promise<SceneContext | null> {
  try {
    return await this.contextAssembler.assembleContext(sceneId, {
      maxTokenBudget: 6000,
      detailedCharacters: true,
      includeWorldRules: true,
    });
  } catch {
    return null;  // scene not in DB yet — degrade gracefully
  }
}
```

**2. `generation-manager.ts` — use context in continuation/plot prompts**

In `buildContinuationPrompt()` and `buildPlotPrompt()`: after assembling context, if it's non-null, call `contextAssembler.formatContextAsMarkdown(context)` and prepend to prompt before the generation instruction.

**3. `scene-context.ts` — enforce maxTokenBudget**

```typescript
// After assembling all fields, before returning:
if (options.maxTokenBudget) {
  return this.pruneToTokenBudget(context, options.maxTokenBudget);
}

private pruneToTokenBudget(context: SceneContext, budget: number): SceneContext {
  const pruned = { ...context };
  // Priority: drop oldest chapter summaries first, then inactive plot threads, then non-hard world rules
  while (this.estimateTokenCount(pruned) > budget && pruned.recentChapterSummaries.length > 1) {
    pruned.recentChapterSummaries = pruned.recentChapterSummaries.slice(1);
  }
  while (this.estimateTokenCount(pruned) > budget && pruned.plotThreads.length > 2) {
    pruned.plotThreads = pruned.plotThreads.slice(0, -1);
  }
  while (this.estimateTokenCount(pruned) > budget && pruned.worldRules.length > 0) {
    pruned.worldRules = pruned.worldRules.filter(r => r.isHardRule)
      .slice(0, pruned.worldRules.length - 1);
  }
  return pruned;
}
```

**4. `claude-client.ts` — update model**

```typescript
private defaultModel: string = 'claude-sonnet-4-6';
```

#### Tests needed
- Unit: `pruneToTokenBudget` drops chapter summaries before plot threads before world rules
- Integration: generate continuation with real scene context, verify context appears in prompt (spy on claude.generate)

---

### SPEC-02: Beat ↔ Scene Resolution

**Priority**: High  
**Effort**: Medium  
**Dependencies**: None  
**Files touched**: `src/sync/plot-thread-sync.ts`, `src/cli/handlers/plot-handler.ts`, `src/cli/commands/plot.ts`

#### What to build

Per `docs/claude_novel_writer_composite_specification_v_1.md` §5, add scene reference resolution to beat sync.

#### Accepted scene reference formats

- `Ch3.Scene2` or `Ch3.S2` or `Chapter 3 Scene 2`
- Parser: extract chapter number + scene number, look up in DB
- If not found: store null for `scene_id`, log warning, continue

#### Schema addition (schema.sql)

```sql
-- No schema change needed — plot_beats.scene_id already exists
-- Add: canonical_key column for audit
ALTER TABLE plot_beats ADD COLUMN scene_reference TEXT;  -- raw string from YAML
ALTER TABLE plot_beats ADD COLUMN resolved_at DATETIME;  -- when resolution occurred
```

#### New method in plot-thread-sync.ts

```typescript
private async resolveSceneRef(
  ref: string
): Promise<{ sceneId: number; canonicalKey: string } | null> {
  // Parse "Ch3.Scene2", "Ch3.S2", "Chapter 3 Scene 2"
  const match = ref.match(/ch(?:apter)?\s*(\d+)[.\s]+s(?:cene)?\s*(\d+)/i);
  if (!match) return null;
  const [, chNum, scNum] = match;
  const rows = await this.mcpClient.readQuery(`
    SELECT s.id, s.scene_number, c.chapter_number
    FROM scenes s JOIN chapters c ON s.chapter_id = c.id
    WHERE c.project_id = ? AND c.chapter_number = ? AND s.scene_number = ?
  `, [this.projectId, Number(chNum), Number(scNum)]);
  if (rows.length === 0) return null;
  return {
    sceneId: rows[0].id as number,
    canonicalKey: `scene::${chNum}::${scNum}`,
  };
}
```

#### New CLI command

- `/novel plot beat resolve [--thread "Name"]` — attempts resolution for all unresolved beats
- Output: table showing beat / scene ref / resolved? / scene ID or "NOT FOUND"

#### Tests needed
- Unit: `resolveSceneRef` correctly parses all accepted formats
- Unit: returns null for unrecognized format
- Integration: plot thread with beats syncs; beats with valid refs get scene_id; invalid refs get null with warning

---

### SPEC-03: Idea Capture System (Phase 1 Ideation)

**Priority**: High  
**Effort**: Medium  
**Dependencies**: None  
**Files touched**: New files, `schema.sql`, `src/cli/registry.ts`, `src/index.ts`

#### What to build

Lightweight quick-capture system for fleeting ideas. The fastest possible path from thought to persistent storage.

#### File structure in novel project

```
{project}/
└── .novel/
    └── ideas/
        ├── 2026-04-22-what-if-protagonist-is-villain.yml
        └── ...
```

#### YAML format

```yaml
id: abc123          # 6-char hash of timestamp + content
content: "What if the protagonist is actually the villain from the start?"
tags: [plot-twist, protagonist, structure]
created_at: "2026-04-22T14:30:00Z"
linked_to: []       # [{type: character|plot|scene, name: "Sarah Chen"}]
status: raw         # raw | explored | used | discarded
notes: ""
```

#### DB schema (schema.sql addition)

```sql
CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  idea_key TEXT NOT NULL,            -- 6-char hash
  content TEXT NOT NULL,
  tags TEXT,                         -- JSON array
  linked_entity_type TEXT,           -- character, plot, scene, chapter, location
  linked_entity_name TEXT,
  status TEXT DEFAULT 'raw',         -- raw, explored, used, discarded
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ideas_project ON ideas(project_id);
CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(project_id, status);
```

#### TypeScript type (src/types/novel.ts addition)

```typescript
export interface IdeaEntry {
  id?: number;
  projectId?: number;
  ideaKey: string;
  content: string;
  tags: string[];
  linkedEntityType?: 'character' | 'plot' | 'scene' | 'chapter' | 'location';
  linkedEntityName?: string;
  status: 'raw' | 'explored' | 'used' | 'discarded';
  notes?: string;
  createdAt?: Date;
}
```

#### CLI commands

```
/novel idea add "text"                          Quick capture
/novel idea add --tag plot,twist "text"         Add with tags  
/novel idea list                                All ideas
/novel idea list --tag plot                     Filter by tag
/novel idea list --status raw                   Filter by status
/novel idea show --id abc123                    Show single idea
/novel idea link --id abc123 --to character "Sarah Chen"   Link to entity
/novel idea explore --id abc123                 Mark as explored, open for notes
/novel idea use --id abc123                     Mark as used
/novel idea discard --id abc123                 Mark as discarded
/novel idea sync                                Sync YAML → DB
```

#### Builder interface

```typescript
export class IdeaBuilder {
  async quickAdd(content: string, tags?: string[]): Promise<IdeaEntry>
  async list(filter?: { tag?: string; status?: string }): Promise<IdeaEntry[]>
  async get(key: string): Promise<IdeaEntry | null>
  async updateStatus(key: string, status: IdeaEntry['status']): Promise<void>
  async link(key: string, entityType: string, entityName: string): Promise<void>
  async addNote(key: string, note: string): Promise<void>
  private generateKey(): string   // crypto.randomBytes(3).toString('hex')
}
```

#### AI integration

Add to `GenerationManager`:
```typescript
async generateBrainstorm(prompt: string, options: GenerationOptions): Promise<GenerationResult>
// Prompt: "Generate 5 distinct 'what if' story ideas for: [prompt]"
// Returns alternatives array with 5 options
// Command: /novel generate brainstorm --prompt "what if the magic system is actually technology"
```

#### Tests needed
- Unit: IdeaBuilder.quickAdd creates file with correct key format
- Unit: list with tag filter returns only matching ideas
- Integration: add → sync → query DB returns correct record
- Integration: link → verify linked_entity fields stored

---

### SPEC-04: Research Repository (Phase 2)

**Priority**: Medium  
**Effort**: Medium  
**Dependencies**: None  
**Files touched**: New files, `schema.sql`, `src/cli/registry.ts`

#### What to build

Capture and organize research notes with citation tracking and manuscript linkage. The `research/` folder is already scaffolded by `/novel init` but has no tooling.

#### File format

```yaml
# research/victorian-corset-construction.yml
title: "Victorian Corset Construction Methods"
url: "https://..."
type: article         # article, book, interview, personal-experience, observation
notes: |
  Steel boning replaced whalebone after 1860. Lacing always at back.
  Front busk closure was a Victorian innovation.
tags: [victorian, clothing, historical]
used_in: []           # [{chapter: 3, scene: 1, quote: "She tightened her corset..."}]
verify_by: null       # date if time-sensitive
verified: false
created_at: "2026-04-22"
```

#### DB schema

```sql
CREATE TABLE IF NOT EXISTS research_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  source_type TEXT DEFAULT 'article',
  notes TEXT,
  tags TEXT,                    -- JSON array
  verified BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  research_id INTEGER NOT NULL,
  chapter_id INTEGER,
  scene_id INTEGER,
  quote TEXT,                   -- the sentence in the manuscript using this research
  FOREIGN KEY (research_id) REFERENCES research_notes(id) ON DELETE CASCADE
);
```

#### CLI commands

```
/novel research add --title "X" [--url "Y"] [--type article] [--tag "A,B"]
/novel research list [--tag X] [--unverified]
/novel research show --title "X"
/novel research link --title "X" --chapter N [--scene S] [--quote "text"]
/novel research verify --title "X"
/novel research sync
```

#### [VERIFY] marker system

Scan chapter files for `[VERIFY: claim text]` inline markers:

```
/novel research verify-list    — find all [VERIFY:...] in all chapters, list with location
```

Regex: `/\[VERIFY:\s*([^\]]+)\]/g`

Output:
```
Chapter 3, line 47: [VERIFY: Steel boning replaced whalebone after 1860]
Chapter 7, line 12: [VERIFY: Chloroform was available to civilians in 1870]
```

#### Tests needed
- Unit: ResearchBuilder creates YAML file correctly
- Unit: verify-list scan finds all [VERIFY:] markers with correct line numbers
- Integration: add → link → show usage list

---

### SPEC-05: Prose Analysis System (Line Editing Phase)

**Priority**: Medium  
**Effort**: Large  
**Dependencies**: Chapter system (complete)  
**Files touched**: New `src/analysis/prose-analyzer.ts`, new CLI command/handler

#### What to build

Text analysis engine that scans chapter markdown and flags prose quality issues. Pure text analysis — no DB writes. Output is a report.

#### Analysis checks to implement

**Group A — Weak language (implement first)**

```typescript
interface ProseCheck {
  type: 'intensifier' | 'filter_word' | 'adverb_tag' | 'passive' | 'repetition';
  severity: 'warning' | 'info';
  lineNumber: number;
  matchedText: string;
  suggestion?: string;
}
```

| Check | Pattern | Suggestion |
|---|---|---|
| Intensifiers | `\b(very|really|quite|just|rather|extremely|incredibly|absolutely)\b` | Remove or replace with stronger word |
| Filter words | `\b(saw|heard|felt|noticed|wondered|realized|thought|knew)\b` | Rewrite to direct sensory detail |
| Adverb tags | `(said|whispered|shouted|replied)\s+\w+ly\b` | Trust the dialogue to carry tone |
| Passive voice | `\b(was|were|been|being)\s+\w+ed\b` | Consider active construction |
| Doubled words | `\b(end result|past history|future plans|added bonus|final outcome)\b` | Cut redundant word |

**Group B — Sentence variety**

```typescript
// Per paragraph: calculate sentence lengths, flag if stddev < 3 words
// (all sentences nearly identical length = monotonous rhythm)
```

**Group C — Repetition**

```typescript
// Per chapter: find content words (excl. stopwords) used > 3x within 300 words
// Flag: "The word 'grim' appears 4 times within 300 words of line 47"
```

**Group D — Dialogue quality**

```typescript
// Extract all dialogue (text in quotes)
// Check: does each speaker have at least one distinct vocabulary marker?
// Check: count "said [adverb]" patterns
// Check: flag on-the-nose exposition ("As you know, Bob..." patterns)
```

#### CLI commands

```
/novel analyze prose --chapter N              Run all checks on chapter N
/novel analyze prose --chapter N --type intensifiers   Run specific check
/novel analyze prose --all                    Run on all chapters (slow)
/novel analyze dialogue --chapter N           Dialogue-specific checks only
/novel analyze sentences --chapter N          Sentence variety report
```

#### Output format

```
=== Prose Analysis: Chapter 3 ===

INTENSIFIERS (12 found):
  Line  47: "very dark" → consider "pitch-black" or just "dark"
  Line  89: "really wanted" → cut "really", strengthen verb
  Line 134: "quite suddenly" → cut "quite"; "suddenly" alone is weaker than showing it

FILTER WORDS (8 found):
  Line  23: "She felt cold" → "Cold bit through her coat"
  Line  67: "He noticed the door" → "The door stood open"

PASSIVE VOICE (3 found):
  Line 112: "was carried" → consider "carried" or rephrase

REPETITION:
  "darkness" × 5 within 250 words of line 89

DIALOGUE ADVERBS (2 found):
  Line  78: "he said quietly" → let silence/action show quiet

---
Summary: 25 issues (3 warnings, 22 info)
Word count: 3,847 | Economy score: 71/100
```

#### TypeScript types to add (src/types/novel.ts)

```typescript
export interface ProseAnalysisResult {
  chapterNumber: number;
  checks: ProseCheck[];
  warnings: number;
  info: number;
  wordCount: number;
  economyScore: number;    // 0–100, based on filter/intensifier density
}

export interface ProseCheck {
  type: 'intensifier' | 'filter_word' | 'adverb_tag' | 'passive' | 'repetition' | 'dialogue_adverb';
  severity: 'warning' | 'info';
  lineNumber: number;
  columnNumber?: number;
  matchedText: string;
  context: string;         // surrounding sentence for display
  suggestion?: string;
}
```

#### Tests needed
- Unit: each check catches its target patterns and ignores non-matches
- Unit: repetition detector finds correct word with correct surrounding window
- Unit: economyScore calculation
- Integration: analyze a test chapter file, verify expected issues found

---

### SPEC-06: Drafting Support Tools ([TK] Markers + Session Prep)

**Priority**: Medium  
**Effort**: Small  
**Dependencies**: Chapter system (complete), Session system (complete)  
**Files touched**: `src/session/session-manager.ts`, new `src/analysis/draft-scanner.ts`

#### What to build

Drafting quality-of-life features that remove friction during first draft phase.

#### [TK] Marker System

Scan all chapter files for `[TK]`, `[TODO]`, `[FIXME]`, `[CHECK]` inline markers.

```typescript
// src/analysis/draft-scanner.ts
export class DraftScanner {
  async findPlaceholders(projectPath: string): Promise<Placeholder[]>
}

export interface Placeholder {
  marker: string;        // [TK], [TODO], etc.
  note: string;          // text after the marker, e.g. "[TK: find real street name]"
  chapterNumber: number;
  lineNumber: number;
  context: string;       // surrounding sentence
}
```

CLI:
```
/novel draft tk-list                    All unresolved placeholders
/novel draft tk-list --chapter N        Filter to chapter
```

#### Session Prep — Hemingway Resume

Add `stopNote` field to WritingSession. On session end, prompt for it. On session start, display it.

**Schema addition:**
```sql
ALTER TABLE writing_sessions ADD COLUMN stop_note TEXT;    -- "what happens next"
ALTER TABLE writing_sessions ADD COLUMN ritual_completed BOOLEAN DEFAULT FALSE;
```

**Session start changes** (`session-manager.ts`):
1. Query last session: `SELECT stop_note FROM writing_sessions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`
2. If stop_note found: display "Last session note: [stop_note]"
3. Display last 200 words of most recent chapter (calls ChapterBuilder)

**Session end changes:**
```
/novel session end [--note "what happens next"]
```
If `--note` not provided: prompt "What happens next? (Hemingway stop note):"

#### Emotional Beat Tracker

Add `emotional_beat` field to scene metadata:

**YAML scene marker addition:**
```html
<!-- emotional_beat: fear -->
```

**Valid values**: `joy | fear | anger | sadness | disgust | surprise | anticipation | trust | neutral`

Add to scene update command:
```
/novel scene edit --chapter N --scene S --emotional-beat fear
```

Add to consistency check: flag chapters with all scenes at the same emotional beat (no emotional variation).

#### Chapter Completion Checklist

```
/novel chapter check N
```

Output:
```
=== Chapter 3 Checklist ===

Purpose & Conflict:
  [?] Does this chapter have a declared purpose? → Missing 'purpose' in frontmatter
  [?] Are there any scenes with tension > 5?     → Scenes 1,3 have tension ≥ 5 ✓

Character:
  [?] Is POV character consistent?               → povCharacter: Sarah Chen ✓
  [?] Does POV character change or learn?        → No 'arc' note this chapter

Continuity:
  [?] Any [TK] placeholders in this chapter?     → 2 found (lines 47, 89)
  [?] Any unresolved VERIFY markers?             → 1 found (line 112)
  [?] Is timeline updated for events here?       → No timeline events linked to Ch3

Progress:
  Word count: 3,847 | Status: drafted
```

#### Tests needed
- Unit: findPlaceholders finds all [TK]/[TODO] with correct line numbers
- Unit: does not flag commented-out or code-block markers
- Integration: session end with stop-note; session start displays it

---

### SPEC-07: Version Control / Draft Snapshots

**Priority**: Medium  
**Effort**: Small  
**Dependencies**: Chapter system (complete)  
**Files touched**: New `src/revision/snapshot-manager.ts`, new CLI command

#### What to build

Manual snapshot system — copy current `chapters/` to `revisions/[label]/` for version comparison.

#### Snapshot format

```
{project}/revisions/
├── pre-beta-2026-04-22/
│   ├── 01-opening.md
│   ├── 02-the-signal.md
│   └── _snapshot.json    ← metadata
└── draft-2-2026-05-01/
    └── ...
```

`_snapshot.json`:
```json
{
  "label": "pre-beta",
  "createdAt": "2026-04-22T14:30:00Z",
  "chapterCount": 12,
  "totalWordCount": 45230,
  "chapterWordCounts": { "1": 3847, "2": 4120, ... }
}
```

#### CLI commands

```
/novel revision snapshot --label "pre-beta"     Create snapshot of current chapters/
/novel revision list                             List all snapshots with metadata
/novel revision show --label "pre-beta"          Show snapshot details
/novel revision diff --from "draft-1" --to "draft-2" --chapter N   Word diff
/novel revision restore --label "pre-beta"       Overwrite chapters/ from snapshot (confirms first)
```

#### `revision diff` implementation

Use Myers diff algorithm on word tokenized text:
```typescript
// Show added/removed words per paragraph, not line-by-line
// Output: +added words in green, -removed words in red (using ANSI codes via output formatter)
```

#### Auto-snapshot trigger

Before any `--from-db` reverse sync: auto-create snapshot labeled `pre-sync-[timestamp]`.

#### Tests needed
- Unit: snapshot creates correct directory structure
- Unit: `_snapshot.json` has correct word count
- Integration: snapshot → modify a chapter → diff shows changes

---

### SPEC-08: Pacing & Structure Analysis

**Priority**: Medium  
**Effort**: Medium  
**Dependencies**: Scene system (complete), Chapter system (complete)  
**Files touched**: New `src/analysis/pacing-analyzer.ts`, new CLI command

#### What to build

Visual analysis of pacing, tension, and structure across the full manuscript.

#### Analysis types

**Tension Arc** (uses existing `tension_level` scene field):
```
/novel analyze tension-arc

Chapter 1  ████░░░░░░  4.2 avg  (scenes: 3/5/5)
Chapter 2  ███████░░░  7.1 avg  (scenes: 6/8/7)
Chapter 3  █████░░░░░  5.0 avg  (scenes: 5/5/5)  ← dip warning
Chapter 4  ████████░░  8.3 avg  (scenes: 8/9/8)
Chapter 5  ██████████ 10.0 avg  (scenes: 10)     ← CLIMAX
```

Flag: 3+ consecutive chapters with tension dip after rising action.

**POV Balance:**
```
/novel analyze pov-balance

Sarah Chen      ██████████████████  18 scenes (72%)
Marcus Webb     ████                 4 scenes (16%)
Dr. Reyes       ███                  3 scenes (12%)

⚠ Sarah dominates — consider if Marcus/Dr. Reyes get enough development
```

**Chapter Lengths:**
```
/novel analyze chapter-lengths

Ch1   3,847w  ████████
Ch2   4,120w  █████████
Ch3   1,204w  ██         ← SHORT — under 2,000w average
Ch4   5,891w  ████████████  ← LONG — over 2x average
```

Flag: chapters > 2× or < 0.5× the average word count.

**Scene Purpose Audit:**
```
/novel analyze scenes --purpose

Missing purpose declaration (13 scenes):
  Ch2.Scene3 — no purpose field set
  Ch4.Scene1 — no purpose field set
  ...

Scenes by declared purpose:
  introduce character  ██████  8
  advance plot         ████████████  16
  reveal information   ████  6
  transition           ██  3
  character moment     ████  6
```

**Conflict Density:**
```
/novel analyze conflict

Chapters with low conflict density (tension avg < 4):
  Chapter 3: avg 2.1 — 3 consecutive scenes with tension ≤ 3
  Chapter 7: avg 3.0 — consider adding an obstacle or complication

Action/Reflection balance:
  Action-dominant (tension > 6):   8 chapters
  Reflection-dominant (tension < 4): 3 chapters
  Balanced:                          4 chapters
```

#### TypeScript types

```typescript
export interface PacingReport {
  chapterCount: number;
  totalScenes: number;
  tensionArc: ChapterTensionData[];
  povBalance: Record<string, number>;  // characterName → sceneCount
  chapterLengths: ChapterLengthData[];
  flags: PacingFlag[];
}

export interface PacingFlag {
  type: 'tension_dip' | 'pov_imbalance' | 'chapter_length' | 'low_conflict';
  severity: 'warning' | 'info';
  description: string;
  chapterNumber?: number;
}
```

#### Tests needed
- Unit: tension arc calculation from mock scene data
- Unit: POV balance calculation
- Unit: flag generation (dip detection, length outlier detection)
- Integration: run on a test project, verify report structure

---

### SPEC-09: Character Arc Visualization

**Priority**: Medium  
**Effort**: Medium  
**Dependencies**: Character system (complete), Scene system (complete)  
**Files touched**: `src/types/novel.ts`, `src/builders/character-builder.ts` (extend), new analysis module

#### What to build

Track character emotional/knowledge state per scene to visualize arc across manuscript.

#### Scene metadata extension

Add to scene YAML marker:
```html
<!-- character_states: Sarah Chen=determined|Alex Rivera=frightened -->
```

Format: `characterName=state` pairs separated by `|`

Valid states: `hopeful | determined | fearful | angry | grieving | joyful | confused | resigned | transformed | neutral`

#### Character arc data flow

1. Author sets `character_states` in scene markers
2. `SceneSync` parses and stores in new `character_scene_states` DB table
3. Arc visualization queries table to build timeline

#### DB schema

```sql
CREATE TABLE IF NOT EXISTS character_scene_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  scene_id INTEGER NOT NULL,
  state TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  UNIQUE(character_id, scene_id)
);
```

#### CLI commands

```
/novel character arc --name "Sarah Chen"        Print arc across all chapters
/novel character arc --name "Sarah" --compare "Alex"   Overlay two arcs
/novel character states --chapter N             Show all character states in chapter
```

#### Arc output format

```
=== Character Arc: Sarah Chen ===

Ch1.S1  determined
Ch1.S2  determined
Ch2.S1  fearful       ← shift
Ch2.S2  fearful
Ch3.S1  angry         ← shift
Ch3.S2  resigned      ← shift
Ch4.S1  hopeful       ← shift
Ch5.S1  transformed   ← final state

Arc completeness: ✓ (character changes from 'determined' to 'transformed')
State shifts: 5 across 15 scenes
⚠ Long static run: 'fearful' for Ch2.S1–S2 (consider adding micro-shift)
```

#### Tests needed
- Unit: parse `character_states` marker format
- Unit: arc completeness check (first state ≠ last state = complete)
- Integration: set states in scenes, sync, run arc command

---

### SPEC-10: Synopsis and Query Materials Generator

**Priority**: Medium  
**Effort**: Medium  
**Dependencies**: AI generation (complete), Chapter system (complete), Character system (complete)  
**Files touched**: `src/ai/generation-manager.ts` (extend), new CLI command

#### What to build

AI-powered generation of query materials using actual project data as context.

#### Generation types

**Synopsis (short / medium / long):**
- Input: project title, genre, protagonist name+role+arc, main plot thread, word count
- Short (1 paragraph, 150 words): hook + central conflict + stakes
- Medium (1 page, 400 words): full plot summary without resolution
- Long (2 pages, 800 words): full synopsis with resolution (for editors)

**Elevator pitch (25 words):**
```
When [protagonist] [inciting incident], they must [goal] before [stakes/deadline].
```

**Query letter draft:**
```
[Opening hook — 1 sentence]
[Premise — 2 sentences]  
[Stakes — 1 sentence]
[Comp titles — 1 sentence]
[Word count + genre + author bio]
```

**Comp title suggestions:**
- Input: genre + themes + tone (from world rules + plot threads)
- Prompt Claude with: "Suggest 5 recently published (2020–2025) comparison titles for a [genre] novel with themes of [themes] and a tone of [tone]."

#### CLI commands

```
/novel generate synopsis --length short|medium|long [--save]
/novel generate pitch
/novel generate query-letter [--comp-titles "Book A, Book B"]
/novel generate comps
```

#### Data assembly for synopsis generation

```typescript
async assembleSynopsisContext(projectId: number): Promise<SynopsisContext> {
  // Load: project metadata, protagonist character, main plot thread,
  //       all chapter summaries (ordered), world rules (for genre flavor)
  // Build structured context for prompt
}
```

#### Tests needed
- Unit: assembleSynopsisContext loads correct data
- Manual: generated synopsis is coherent (human review)

---

### SPEC-11: Beta Reader Management (Phase 7)

**Priority**: Low  
**Effort**: Medium  
**Dependencies**: Export system (complete)  
**Files touched**: New files, schema.sql additions

#### What to build

Track beta readers, log their feedback, aggregate patterns, manage revision cycles based on feedback.

#### DB schema

```sql
CREATE TABLE IF NOT EXISTS beta_readers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  chapters_assigned TEXT,   -- JSON array of chapter numbers
  sent_at DATE,
  due_at DATE,
  status TEXT DEFAULT 'pending',  -- pending, reading, feedback_received, complete
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS beta_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reader_id INTEGER NOT NULL,
  chapter_number INTEGER,
  feedback_type TEXT,   -- pacing, character, plot, confusion, positive, other
  note TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',  -- high, medium, low
  status TEXT DEFAULT 'open',      -- open, addressed, rejected
  rejection_reason TEXT,
  FOREIGN KEY (reader_id) REFERENCES beta_readers(id) ON DELETE CASCADE
);
```

#### CLI commands

```
/novel beta add --name "Alex" [--email "x@y.com"] [--chapters "1-10"]
/novel beta list
/novel beta sent --name "Alex" [--date "2026-05-01"]
/novel beta feedback add --reader "Alex" --chapter N --type pacing --note "..."
/novel beta feedback list [--type pacing] [--status open]
/novel beta report                   Aggregate all feedback by type, find patterns
/novel beta revision-plan            Generate prioritized revision task list from feedback
```

#### Report output

```
=== Beta Reader Report ===

Readers: 3 total | 2 feedback received | 1 pending

Feedback by type:
  pacing       ████████  8 items  (3 high priority)
  character    █████     5 items
  confusion    ███       3 items
  positive     ██████    6 items

Patterns (mentioned by 2+ readers):
  ⚠ Chapter 7 pacing (3 readers flagged)
  ⚠ Marcus Webb motivation unclear (2 readers)
  ✓ Opening hook praised (2 readers)

Suggested revision priority:
  1. Chapter 7 — pacing (3 readers)
  2. Marcus Webb arc — motivation (2 readers)
```

---

### SPEC-12: Agent Query Tracker (Phase 10)

**Priority**: Low  
**Effort**: Small  
**Dependencies**: None  
**Files touched**: New files, schema.sql

#### DB schema

```sql
CREATE TABLE IF NOT EXISTS agent_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  agent_name TEXT NOT NULL,
  agency TEXT,
  query_date DATE NOT NULL,
  materials_sent TEXT,    -- "query + 10 pages", "full manuscript", etc.
  status TEXT DEFAULT 'sent',  -- sent, partial_request, full_request, rejected, offer, withdrawn
  response_date DATE,
  notes TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

#### CLI commands

```
/novel query add --agent "Janet Reid" --agency "New Leaf" --date "2026-05-01" --materials "query+10p"
/novel query list [--status sent]
/novel query update --id N --status rejected [--notes "..."]
/novel query stats
```

---

## PART 4 — BUILD ORDER AND DEPENDENCY MAP

```
IMMEDIATE (bugs, no dependencies):
  SPEC-01  Fix context engine → AI connection + model update
  
SPRINT 1 (independent, high value):
  SPEC-02  Beat ↔ Scene resolution
  SPEC-03  Idea capture system
  SPEC-06  Drafting support ([TK], session prep)
  SPEC-07  Version snapshots

SPRINT 2 (depends on Sprint 1):
  SPEC-04  Research repository            (needs init scaffold ✓)
  SPEC-05  Prose analysis                 (needs chapter system ✓)
  SPEC-08  Pacing analysis                (needs scene tension data ✓)

SPRINT 3 (depends on Sprint 2):
  SPEC-09  Character arc visualization    (needs scene system extension from SPEC-06)
  SPEC-10  Synopsis generator             (needs AI system fix from SPEC-01)

SPRINT 4 (later value):
  SPEC-11  Beta reader management
  SPEC-12  Agent query tracker
```

---

## PART 5 — SCHEMA ADDITIONS SUMMARY

All new DB tables to add to `claudenovel_plugin/schema.sql` across all specs:

```sql
-- SPEC-03: Ideas
CREATE TABLE IF NOT EXISTS ideas ( ... );

-- SPEC-04: Research  
CREATE TABLE IF NOT EXISTS research_notes ( ... );
CREATE TABLE IF NOT EXISTS research_usage ( ... );

-- SPEC-06: Session extensions
ALTER TABLE writing_sessions ADD COLUMN stop_note TEXT;
ALTER TABLE writing_sessions ADD COLUMN ritual_completed BOOLEAN DEFAULT FALSE;

-- SPEC-09: Character arc states
CREATE TABLE IF NOT EXISTS character_scene_states ( ... );

-- SPEC-11: Beta readers
CREATE TABLE IF NOT EXISTS beta_readers ( ... );
CREATE TABLE IF NOT EXISTS beta_feedback ( ... );

-- SPEC-12: Query tracker
CREATE TABLE IF NOT EXISTS agent_queries ( ... );

-- SPEC-02: Beat resolution
ALTER TABLE plot_beats ADD COLUMN scene_reference TEXT;
ALTER TABLE plot_beats ADD COLUMN resolved_at DATETIME;
```

Full DDL for each table is in the individual spec sections above.

---

## PART 6 — DECISIONS AND CONSTRAINTS

These are architectural decisions already made. Do not re-litigate them.

| Decision | Rationale |
|---|---|
| Files are source of truth, DB is derived | Allows human editing without running the app |
| SQLite via MCP only, no direct file access | Sandboxing, audit trail, portability |
| YAML for all entity files (not JSON) | Human-readable, editable in any text editor |
| Markdown + HTML comments for scene markers | Chapters remain readable prose files |
| Vitest for testing | TypeScript-native, fast |
| No external NLP libraries | Keep bundle size small; use regex + pattern matching |
| AI analysis (world rules violations) requires Claude API | Acceptable — user opted into AI features |
| Export is Markdown first; other formats via mcp-pandoc | Avoid bundling heavy format libraries |
| Timeline in DB as numeric `story_timestamp` | Enables chronological ordering and conflict detection |

---

## PART 7 — QUALITY GATES

Every implementation must pass all of these before being considered done:

```
[ ] npm run build                     — zero TypeScript errors
[ ] npm run lint                      — zero lint errors  
[ ] npm test                          — all tests pass (including pre-existing 240+)
[ ] No ': any' added                  — grep -c ': any' src/ must not increase
[ ] No test/doc files in src/         — only .ts source files
[ ] New builder has unit tests        — min 5 tests
[ ] New workflow has integration test — min 3 end-to-end scenarios
[ ] CLI command registered            — appears in registry.ts
[ ] Types added for new entities      — in src/types/novel.ts
[ ] Schema changes documented         — in schema.sql with IF NOT EXISTS
[ ] TODO.md updated                   — item marked [x] when done
```
