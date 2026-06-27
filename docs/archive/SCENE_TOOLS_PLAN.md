# Scene-Level Tools - Implementation Plan

## Overview

Implement comprehensive scene management tools to enable writers to work at the natural granularity of storytelling. Scenes are the building blocks of chapters and the level at which writers actually think when composing fiction.

**Status**: Planning Phase
**Priority**: High (foundation for AI features)
**Complexity**: Low-Medium
**Estimated Effort**: 1-2 sessions

---

## Why Scenes Matter

From craft perspective (master novelists):
- **Scenes are units of change** (Dwight Swain) - Each scene changes something
- **Scene/sequel structure** (Bickham) - Scene (goal/conflict/disaster) → Sequel (reaction/dilemma/decision)
- **Show vs. Tell** - Scenes show; summaries tell. Balance needed.
- **Pacing control** - Short scenes = faster pace; long scenes = immersion
- **POV management** - Each scene typically has one POV character
- **Tension arcs** - Scenes should escalate tension then release

Writers need to:
- Track what each scene accomplishes (purpose/goal)
- Ensure each scene has conflict
- Balance scene types (action, dialogue, introspection)
- Manage POV shifts between scenes
- Control pacing through scene lengths

---

## Existing Foundation

### ✅ Already in Schema
```sql
CREATE TABLE scenes (
    id INTEGER PRIMARY KEY,
    chapter_id INTEGER NOT NULL,
    scene_number INTEGER NOT NULL,
    title TEXT,
    pov_character_id INTEGER,
    location_id INTEGER,
    time_of_day TEXT,
    word_count INTEGER DEFAULT 0,
    summary TEXT,
    purpose TEXT,           -- What this scene accomplishes
    emotional_tone TEXT,    -- mood/atmosphere
    tension_level INTEGER,  -- 1-10 scale
    created_at DATETIME,
    updated_at DATETIME,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
    FOREIGN KEY (pov_character_id) REFERENCES characters(id),
    FOREIGN KEY (location_id) REFERENCES locations(id),
    UNIQUE(chapter_id, scene_number)
);
```

### ✅ Already Exists
- `src/context/scene-context.ts` - SceneContextAssembler class for AI context loading
- Database schema supports scenes
- Chapter system to build upon

---

## Architecture Design

### File Organization

Scenes will be **embedded within chapter markdown files**, not separate files:

```markdown
<!-- chapters/01-opening.md -->
---
title: The Awakening
status: drafted
pov_character: Sarah Chen
---

<!-- scene:1 -->
<!-- pov: Sarah Chen -->
<!-- location: Chen Family Home -->
<!-- time: Dawn -->
<!-- purpose: Establish protagonist's normal world before inciting incident -->
<!-- tension: 2 -->

Sarah woke to the sound of rain...

<!-- /scene:1 -->

---

<!-- scene:2 -->
<!-- pov: Sarah Chen -->
<!-- location: Metro Station -->
<!-- time: Morning -->
<!-- purpose: Introduce mysterious stranger and first hint of conflict -->
<!-- tension: 5 -->

The metro platform was crowded...

<!-- /scene:2 -->
```

**Why embed scenes in chapters?**
- Writers work in continuous prose, not fragmented files
- Natural flow when reading/editing
- Scene breaks are part of the chapter narrative structure
- Easier to refactor scene boundaries
- Simpler export (already one file per chapter)

**Scene metadata via HTML comments:**
- Non-intrusive (invisible in rendered markdown)
- Machine-readable for database sync
- Human-readable when editing
- Easy to parse with regex

---

## Data Model

### TypeScript Interfaces

```typescript
// src/types/novel.ts

export interface Scene {
  id: number;
  chapterId: number;
  sceneNumber: number;
  title?: string;
  povCharacterId?: number;
  locationId?: number;
  timeOfDay?: string;
  wordCount: number;
  summary?: string;
  purpose?: string;              // Scene goal/accomplishment
  emotionalTone?: string;        // Mood (tense, peaceful, melancholic)
  tensionLevel?: number;         // 1-10 scale
  createdAt: string;
  updatedAt: string;
}

export interface SceneMetadata {
  sceneNumber: number;
  title?: string;
  pov?: string;                  // Character name (resolved to ID)
  location?: string;             // Location name (resolved to ID)
  time?: string;                 // time_of_day
  purpose?: string;
  tone?: string;                 // emotional_tone
  tension?: number;              // 1-10
}

export interface SceneContent {
  metadata: SceneMetadata;
  content: string;               // Prose between scene markers
  startOffset: number;           // Character offset in file
  endOffset: number;
}

export interface ChapterWithScenes {
  chapter: Chapter;
  scenes: SceneContent[];
}
```

---

## Component Breakdown

### 1. SceneBuilder (`src/builders/scene-builder.ts`)

**Purpose**: Create and manage scenes within chapters

```typescript
export class SceneBuilder {
  constructor(private options: { projectPath: string }) {}

  /**
   * Add a new scene to a chapter markdown file
   */
  async addScene(
    chapterFilePath: string,
    sceneData: {
      position?: 'end' | 'start' | number;  // Where to insert
      title?: string;
      pov?: string;
      location?: string;
      timeOfDay?: string;
      purpose?: string;
      tension?: number;
    }
  ): Promise<SceneMetadata>;

  /**
   * Parse scenes from chapter markdown
   */
  async parseScenes(chapterFilePath: string): Promise<SceneContent[]>;

  /**
   * Update scene metadata in chapter file
   */
  async updateSceneMetadata(
    chapterFilePath: string,
    sceneNumber: number,
    updates: Partial<SceneMetadata>
  ): Promise<void>;

  /**
   * Delete a scene from chapter file
   */
  async deleteScene(
    chapterFilePath: string,
    sceneNumber: number
  ): Promise<void>;

  /**
   * Reorder scenes within chapter
   */
  async reorderScenes(
    chapterFilePath: string,
    newOrder: number[]  // [3, 1, 2] means scene 3 first, then 1, then 2
  ): Promise<void>;

  /**
   * Count words in a scene
   */
  private countSceneWords(sceneContent: string): number;

  /**
   * Generate scene markers (HTML comments)
   */
  private generateSceneMarker(
    sceneNumber: number,
    metadata: SceneMetadata,
    isClosing: boolean
  ): string;
}
```

### 2. SceneSync (`src/sync/scene-sync.ts`)

**Purpose**: Bidirectional sync between chapter files and database

```typescript
export class SceneSync {
  constructor(
    private mcpClient: MCPClient,
    private projectId: number
  ) {}

  /**
   * Sync all scenes in a chapter file to database
   */
  async syncChapterScenes(chapterFilePath: string): Promise<void>;

  /**
   * Sync all scenes in all chapters
   */
  async syncAllScenes(): Promise<void>;

  /**
   * Load scenes from database for a chapter
   */
  async loadChapterScenes(chapterId: number): Promise<Scene[]>;

  /**
   * Update scene in database
   */
  async updateScene(sceneId: number, updates: Partial<Scene>): Promise<void>;

  /**
   * Delete scene from database
   */
  async deleteScene(sceneId: number): Promise<void>;

  /**
   * Resolve character name to ID
   */
  private async resolveCharacterId(name: string): Promise<number | null>;

  /**
   * Resolve location name to ID
   */
  private async resolveLocationId(name: string): Promise<number | null>;
}
```

### 3. CLI Commands (`src/cli/commands/scene.ts`)

```typescript
export const sceneCommand: Command = {
  name: 'scene',
  description: 'Manage scenes within chapters',
  subcommands: [
    {
      name: 'add',
      description: 'Add a new scene to a chapter',
    },
    {
      name: 'list',
      description: 'List all scenes in a chapter',
    },
    {
      name: 'edit',
      description: 'Edit scene metadata',
    },
    {
      name: 'delete',
      description: 'Delete a scene from a chapter',
    },
    {
      name: 'reorder',
      description: 'Reorder scenes within a chapter',
    },
    {
      name: 'stats',
      description: 'Show scene statistics and analysis',
    },
  ],
  flags: [
    { name: 'chapter', alias: 'c', type: 'number', description: 'Chapter number' },
    { name: 'scene', alias: 's', type: 'number', description: 'Scene number' },
    { name: 'title', alias: 't', type: 'string', description: 'Scene title' },
    { name: 'pov', type: 'string', description: 'POV character name' },
    { name: 'location', alias: 'l', type: 'string', description: 'Location name' },
    { name: 'time', type: 'string', description: 'Time of day' },
    { name: 'purpose', alias: 'p', type: 'string', description: 'Scene purpose' },
    { name: 'tension', type: 'number', description: 'Tension level (1-10)' },
    { name: 'position', type: 'string', description: 'Insert position (start/end/N)' },
  ],
};
```

### 4. CLI Handlers (`src/cli/handlers/scene-handler.ts`)

```typescript
/**
 * Handle: /novel scene add --chapter 1 --title "Opening Scene" --pov "Sarah"
 */
async function handleSceneAdd(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void>;

/**
 * Handle: /novel scene list --chapter 1
 */
async function handleSceneList(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void>;

/**
 * Handle: /novel scene edit --chapter 1 --scene 2 --tension 7
 */
async function handleSceneEdit(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void>;

/**
 * Handle: /novel scene delete --chapter 1 --scene 2
 */
async function handleSceneDelete(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void>;

/**
 * Handle: /novel scene reorder --chapter 1 --order "3,1,2"
 */
async function handleSceneReorder(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void>;

/**
 * Handle: /novel scene stats --chapter 1
 */
async function handleSceneStats(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void>;
```

---

## Usage Examples

### Adding Scenes

```bash
# Add scene to end of chapter
/novel scene add --chapter 1 --title "The Meeting" --pov "Sarah" --location "Coffee Shop"

# Add scene at specific position
/novel scene add --chapter 1 --position 2 --title "Flashback" --pov "Sarah"

# Add scene with purpose and tension
/novel scene add --chapter 1 --title "Confrontation" --pov "Sarah" --purpose "Reveal antagonist's motivation" --tension 8
```

**Output**:
```
✓ Scene added to Chapter 1

Scene 3: "The Meeting"
  POV: Sarah Chen
  Location: Coffee Shop
  File: chapters/01-opening.md

You can now write this scene in the chapter file between:
  <!-- scene:3 -->
  [Write here]
  <!-- /scene:3 -->
```

### Listing Scenes

```bash
# List all scenes in a chapter
/novel scene list --chapter 1

# List with detailed stats
/novel scene stats --chapter 1
```

**Output**:
```
=== Scenes in Chapter 1: "The Awakening" ===

Scene 1: "Normal Morning"
  POV: Sarah Chen
  Location: Chen Family Home
  Time: Dawn
  Words: 847
  Purpose: Establish protagonist's world
  Tension: 2/10 😌

Scene 2: "The Stranger"
  POV: Sarah Chen
  Location: Metro Station
  Time: Morning
  Words: 1,203
  Purpose: Introduce mystery
  Tension: 5/10 😐

Scene 3: "Confrontation"
  POV: Sarah Chen
  Location: Metro Station
  Time: Morning
  Words: 1,589
  Purpose: First conflict with antagonist
  Tension: 8/10 😰

Total: 3 scenes, 3,639 words
Average tension: 5.0/10
POV distribution: Sarah Chen (100%)
```

### Editing Scene Metadata

```bash
# Update scene purpose
/novel scene edit --chapter 1 --scene 2 --purpose "Introduce the MacGuffin"

# Update tension level
/novel scene edit --chapter 1 --scene 3 --tension 9

# Change POV character
/novel scene edit --chapter 1 --scene 4 --pov "Marcus"
```

### Reordering Scenes

```bash
# Reorder scenes (current: 1,2,3 → new: 3,1,2)
/novel scene reorder --chapter 1 --order "3,1,2"
```

**Output**:
```
✓ Scenes reordered in Chapter 1

New order:
  1. "Confrontation" (was scene 3)
  2. "Normal Morning" (was scene 1)
  3. "The Stranger" (was scene 2)

✓ Chapter file updated
✓ Scene numbers renumbered
```

### Scene Statistics

```bash
# Detailed scene analysis
/novel scene stats --chapter 1
```

**Output**:
```
=== Scene Analysis: Chapter 1 ===

📊 Overview:
  Total scenes: 5
  Total words: 6,247
  Average per scene: 1,249 words
  Shortest: 847 words (Scene 1)
  Longest: 1,589 words (Scene 3)

⚡ Tension Arc:
  Scene 1: 2/10 😌
  Scene 2: 5/10 😐
  Scene 3: 8/10 😰
  Scene 4: 6/10 😐
  Scene 5: 9/10 😱

  Pattern: Rising tension with dip at scene 4
  💡 Tip: Scene 4's tension drop might slow pacing

👁️ POV Distribution:
  Sarah Chen: 4 scenes (80%)
  Marcus Torres: 1 scene (20%)

📍 Locations:
  Metro Station: 3 scenes
  Chen Family Home: 1 scene
  Office Building: 1 scene

🎯 Scene Purposes:
  ✓ All scenes have defined purposes
  ✓ No duplicate purposes
```

---

## Scene Marker Format

Scenes use HTML comment markers (invisible in rendered markdown):

### Opening Marker
```html
<!-- scene:1 -->
<!-- pov: Sarah Chen -->
<!-- location: Coffee Shop -->
<!-- time: Morning -->
<!-- purpose: Establish the mentor relationship -->
<!-- tone: Tense -->
<!-- tension: 6 -->
```

### Closing Marker
```html
<!-- /scene:1 -->
```

### Parsing Strategy
1. Read chapter markdown file
2. Find all `<!-- scene:N -->` markers via regex
3. Extract metadata from comment lines below opening marker
4. Content = everything between opening and closing markers
5. Calculate word count (excluding markers)
6. Sync to database with resolved character/location IDs

---

## Integration with Existing Systems

### Chapter Builder Integration
```typescript
// When creating new chapter, optionally create first scene
const chapterBuilder = extension.getChapterBuilder();
await chapterBuilder.create(5, {
  title: 'The Revelation',
  createFirstScene: true,  // NEW OPTION
  firstSceneMetadata: {
    title: 'Discovery',
    pov: 'Sarah Chen',
    location: 'Research Lab'
  }
});
```

### Scene Context Assembly (Already Exists!)
```typescript
// Load full context for AI when writing a scene
const contextAssembler = extension.getContextAssembler();
const context = await contextAssembler.assembleContext(sceneId, {
  recentChapterCount: 3,
  detailedCharacters: true,
  includeWorldRules: true
});

// context includes:
// - Scene metadata
// - POV character details
// - Location description
// - Recent chapter summaries
// - Active plot threads
// - Character relationships
```

### Session Tracking Integration
```typescript
// Track scenes written during session
const sessionManager = await extension.getSessionManager();
await sessionManager.startSession({ sessionType: 'drafting' });

// ... writer works on scenes ...

const metrics = await sessionManager.endSession({
  chaptersPath: 'chapters',
  // NEW: Also track which scenes were worked on
  scenesModified: [1, 2, 3]  // Scene IDs
});

console.log(`Wrote ${metrics.wordsWritten} words across ${metrics.sceneCount} scenes`);
```

---

## Testing Strategy

### Unit Tests (`tests/unit/builders/scene-builder.test.ts`)
- Parse scenes from markdown
- Add scene at different positions
- Update scene metadata
- Delete scenes
- Reorder scenes
- Word count calculation
- Marker generation

### Integration Tests (`tests/integration/workflows/scene-workflow.test.ts`)
- Complete scene workflow (create chapter → add scenes → edit → list)
- Scene sync to database
- Character/location resolution
- Scene reordering
- Scene deletion
- Stats calculation

---

## Implementation Phases

### Phase 1: Core Scene Building (Session 1)
1. ✅ Design schema review (already exists!)
2. Implement SceneBuilder class
   - Parse scenes from markdown
   - Add new scenes with markers
   - Update scene metadata
   - Count words
3. Basic CLI commands
   - `/novel scene add`
   - `/novel scene list`
4. Unit tests for SceneBuilder

### Phase 2: Database Sync & Advanced Features (Session 2)
1. Implement SceneSync class
   - Bidirectional sync
   - Character/location resolution
   - Batch sync all chapters
2. Advanced CLI commands
   - `/novel scene edit`
   - `/novel scene delete`
   - `/novel scene reorder`
   - `/novel scene stats`
3. Integration with ChapterBuilder
4. Integration with SessionManager
5. Full integration tests

---

## Success Criteria

✅ **Core Functionality**:
- Writers can add scenes to chapters via CLI
- Scenes appear as markers in markdown files
- Scenes sync to database automatically
- Scene list command shows all scenes

✅ **Advanced Features**:
- Scene reordering works correctly
- Scene statistics provide useful insights
- POV and location tracking integrated
- Tension arc visualization

✅ **Quality**:
- 100% test coverage (unit + integration)
- Works with existing chapter/character/location systems
- Non-intrusive markdown format
- Fast performance (even with 50+ scenes)

✅ **User Experience**:
- Clear, helpful command output
- Intuitive scene numbering
- Easy metadata editing
- Useful statistics and analysis

---

## Future Enhancements (Post-MVP)

### Scene Templates
```bash
/novel scene add --chapter 1 --template "action-sequence"
# Pre-fills purpose, tension levels, typical structure
```

### Scene Goals Checker
```typescript
// Validate each scene has:
// - Clear goal for POV character
// - Conflict/obstacle
// - Outcome (disaster or success)
// - Change (something different at end)
```

### Scene-to-Scene Transitions
```typescript
// Analyze transitions between scenes
// - Time jumps
// - Location changes
// - POV switches
// - Emotional shift continuity
```

### Scene Type Tagging
```typescript
// Tag scenes by type:
// - Action
// - Dialogue
// - Introspection
// - Exposition
// - Transition
// Then analyze balance across chapter/book
```

### Pacing Heatmap
```
Chapter 1: ██░░███░██ (Fast start, slow middle, tense end)
Chapter 2: ████████░░ (Sustained tension, calm ending)
Chapter 3: ░░████████ (Slow build to climax)
```

---

## Resources

### Craft References
- **Dwight Swain** - *Techniques of the Selling Writer* (Scene/Sequel structure)
- **Jack Bickham** - *Scene & Structure* (Scene dynamics)
- **Robert McKee** - *Story* (Scene design principles)
- **James Scott Bell** - *Plot & Structure* (Scene goals)

### Technical References
- HTML comment parsing in Markdown
- Regex for scene marker extraction
- Word counting algorithms (excluding markup)
- Chapter file manipulation strategies

---

## Open Questions

1. **Scene breaks in prose**: Use `---` (horizontal rule) or `* * *` (asterisks) or both?
   - **Decision**: Support both, let writer choose via project settings

2. **Scene titles**: Required or optional?
   - **Decision**: Optional (many scenes don't have titles)

3. **Automatic scene detection**: Try to detect scene breaks without markers?
   - **Decision**: Phase 2 feature - suggest scene breaks based on patterns

4. **Scene summary auto-generation**: Use AI to summarize scenes?
   - **Decision**: Phase 2 - tie into AI features

5. **Maximum scenes per chapter**: Set a limit?
   - **Decision**: No hard limit, but warn if >10 scenes (might be too fragmented)

---

## Implementation Status

- [x] Planning complete
- [ ] SceneBuilder implementation
- [ ] SceneSync implementation
- [ ] CLI commands
- [ ] CLI handlers
- [ ] Unit tests
- [ ] Integration tests
- [ ] Documentation

**Next Step**: Implement SceneBuilder class
