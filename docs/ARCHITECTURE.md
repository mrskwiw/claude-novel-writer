# Architecture

**Last Updated**: 2025-10-28
**Project**: Claude Novel Writer Extension

This document describes the system architecture, design patterns, and organizational structure of the Claude Novel Writer extension.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Project Structure](#project-structure)
3. [Database Schema](#database-schema)
4. [Builder Pattern](#builder-pattern)
5. [Code Organization](#code-organization)
6. [Design Patterns](#design-patterns)
7. [MCP Integration](#mcp-integration)

---

## System Overview

### Architecture Principles

1. **Hybrid File + Database**: Human-editable files (markdown, YAML) as source of truth, SQLite for fast queries
2. **Builder Pattern**: Consistent API for creating and managing novel entities
3. **Bidirectional Sync**: Files ↔ Database synchronization
4. **MCP-First**: Database access through Model Context Protocol
5. **Context Assembly**: Optimized for loading story context into AI prompts
6. **Scale Ready**: Handles 100k+ word manuscripts efficiently

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI Interface                            │
│  (/novel chapter, /novel scene, /novel character, etc.)     │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                 Command Handlers                             │
│  (Parse args, validate, call builders, format output)       │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   Builder Layer                              │
│  (ChapterBuilder, SceneBuilder, CharacterBuilder, etc.)     │
│  - Create/edit entities                                      │
│  - Generate files                                            │
│  - Validate data                                             │
└─────────┬───────────────────────────┬───────────────────────┘
          │                           │
┌─────────▼────────────┐   ┌──────────▼────────────────────┐
│   File System        │   │     Sync Managers             │
│  (Markdown, YAML)    │◄──┤  (Bidirectional sync)         │
│  Source of Truth     │   │  - ChapterSync                │
└──────────────────────┘   │  - SceneSync                  │
                           │  - CharacterSync              │
                           └──────────┬────────────────────┘
                                      │
                           ┌──────────▼────────────────────┐
                           │   Database Layer              │
                           │   (SQLite via MCP)            │
                           │  - Fast queries               │
                           │  - Context assembly           │
                           │  - Consistency checking       │
                           └───────────────────────────────┘
```

---

## Project Structure

### Repository Organization

The repository is organized into three main areas:

```
claudenovel/
├── docs/                              # Documentation (consolidated)
│   └── archive/                       # Historical documentation
│
├── claudenovel_plugin/                # Distributable plugin
│   ├── src/                           # TypeScript source
│   │   ├── builders/                  # Entity builders
│   │   ├── cli/                       # CLI system
│   │   ├── sync/                      # Sync managers
│   │   ├── core/                      # Database & core
│   │   ├── context/                   # Context assembly
│   │   ├── consistency/               # Consistency checking
│   │   ├── session/                   # Session tracking
│   │   └── types/                     # TypeScript types
│   │
│   ├── dist/                          # Compiled JavaScript
│   ├── tests/                         # Test suite
│   │   ├── unit/                      # Unit tests
│   │   ├── integration/               # Integration tests
│   │   └── mocks/                     # Test mocks
│   │
│   ├── schema.sql                     # Database schema
│   ├── package.json                   # NPM configuration
│   └── tsconfig.json                  # TypeScript config
│
└── [Documentation Files]              # Core documentation
    ├── CLAUDE.md                      # Project instructions
    ├── README.md                      # Project overview
    ├── ARCHITECTURE.md                # This file
    ├── DEVELOPER_GUIDE.md             # Setup guide
    ├── CLI_REFERENCE.md               # Command reference
    ├── NOVEL_CRAFT_PRINCIPLES.md      # Writing philosophy
    └── WRITING_PROCESS.md             # Writing process guide
```

### Novel Project Structure

When an author runs `/novel init`, this structure is created:

```
my-novel/
├── .novel/                            # Extension metadata
│   ├── novel.db                       # SQLite database
│   └── config.json                    # Project settings
│
├── chapters/                          # Chapter files (Markdown)
│   ├── 01-opening.md
│   ├── 02-the-signal.md
│   └── ...
│
├── characters/                        # Character profiles (YAML)
│   ├── sarah-chen.yml
│   ├── alex-rivera.yml
│   └── ...
│
├── locations/                         # Location profiles (YAML)
│   ├── observatory.yml
│   ├── coffee-shop.yml
│   └── ...
│
├── research/                          # Research materials
│   └── notes.md
│
├── revisions/                         # Previous drafts
│   └── draft-1/
│
└── export/                            # Generated manuscripts
    └── manuscript.md
```

### File Formats

**Chapter Files** (Markdown with YAML frontmatter):
```markdown
---
title: The Signal
status: drafted
povCharacter: Sarah Chen
summary: Sarah discovers an unusual signal
---

# The Signal

<!-- scene:1 -->
<!-- title: Discovery -->
<!-- pov: Sarah Chen -->
<!-- tension: 5 -->

Sarah sat at the console, reviewing the night's data...

<!-- /scene:1 -->
```

**Character Profiles** (YAML):
```yaml
name: Sarah Chen
role: protagonist
age: 28
physical:
  height: 5'7"
  build: Athletic
personality:
  traits: [Curious, Stubborn]
arc:
  start: Isolated scientist
  end: Collaborative leader
```

**Location Profiles** (YAML):
```yaml
name: Observatory
type: building
description: Remote mountain facility
atmosphere: Isolated, scientific
```

---

## Database Schema

### Design Philosophy

1. **Files as Source of Truth**: Database can be rebuilt from files anytime
2. **Optimized for Queries**: Fast context assembly and consistency checking
3. **Consistency Tracking**: Auto-detect contradictions in character/world details
4. **Session Tracking**: Support writing habits and motivation
5. **Timeline Management**: Track chronological order and dependencies

### Core Tables

#### Manuscript Structure (5 tables)

```sql
-- Project metadata
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  genre TEXT,
  target_word_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Chapters
CREATE TABLE chapters (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  chapter_number INTEGER NOT NULL,
  title TEXT,
  file_path TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'planned',
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Scenes (within chapters)
CREATE TABLE scenes (
  id INTEGER PRIMARY KEY,
  chapter_id INTEGER NOT NULL,
  scene_number INTEGER NOT NULL,
  title TEXT,
  pov_character_id INTEGER,
  location_id INTEGER,
  time_of_day TEXT,
  word_count INTEGER DEFAULT 0,
  tension_level INTEGER CHECK(tension_level BETWEEN 1 AND 10),
  purpose TEXT,
  emotional_tone TEXT,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  UNIQUE(chapter_id, scene_number)
);

-- Plot threads
CREATE TABLE plot_threads (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  thread_name TEXT NOT NULL,
  thread_type TEXT DEFAULT 'main',
  description TEXT,
  status TEXT DEFAULT 'active',
  introduced_chapter_id INTEGER,
  resolved_chapter_id INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Plot beats (developments in threads)
CREATE TABLE plot_beats (
  id INTEGER PRIMARY KEY,
  plot_thread_id INTEGER NOT NULL,
  scene_id INTEGER,
  beat_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'planned',
  FOREIGN KEY (plot_thread_id) REFERENCES plot_threads(id)
);
```

#### Character System (4 tables)

```sql
-- Character profiles
CREATE TABLE characters (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  age INTEGER,
  description TEXT,
  arc_start TEXT,
  arc_end TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Character attributes (for consistency tracking)
CREATE TABLE character_attributes (
  id INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL,
  attribute_name TEXT NOT NULL,
  attribute_value TEXT NOT NULL,
  first_mentioned_chapter_id INTEGER,
  first_mentioned_scene_id INTEGER,
  confidence REAL DEFAULT 1.0,
  FOREIGN KEY (character_id) REFERENCES characters(id)
);

-- Character appearances in scenes
CREATE TABLE character_appearances (
  id INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL,
  scene_id INTEGER NOT NULL,
  is_present BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (character_id) REFERENCES characters(id),
  FOREIGN KEY (scene_id) REFERENCES scenes(id)
);

-- Relationships between characters
CREATE TABLE character_relationships (
  id INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL,
  related_character_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL,
  description TEXT,
  FOREIGN KEY (character_id) REFERENCES characters(id),
  FOREIGN KEY (related_character_id) REFERENCES characters(id)
);
```

#### World Building (2 tables)

```sql
-- Locations
CREATE TABLE locations (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  location_type TEXT,
  description TEXT,
  parent_location_id INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (parent_location_id) REFERENCES locations(id)
);

-- World rules (magic, tech, social norms)
CREATE TABLE world_rules (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  rule_name TEXT NOT NULL,
  rule_category TEXT,
  description TEXT,
  limitations TEXT,
  is_hard_rule BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

#### Timeline System (2 tables)

```sql
-- Timeline events
CREATE TABLE timeline_events (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  description TEXT,
  story_timestamp TEXT,
  chapter_id INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Event dependencies
CREATE TABLE event_dependencies (
  id INTEGER PRIMARY KEY,
  event_before_id INTEGER NOT NULL,
  event_after_id INTEGER NOT NULL,
  FOREIGN KEY (event_before_id) REFERENCES timeline_events(id),
  FOREIGN KEY (event_after_id) REFERENCES timeline_events(id)
);
```

#### Session Tracking (2 tables)

```sql
-- Writing sessions
CREATE TABLE writing_sessions (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  session_date DATE NOT NULL,
  start_time DATETIME,
  end_time DATETIME,
  word_count_goal INTEGER,
  words_written INTEGER DEFAULT 0,
  session_type TEXT DEFAULT 'drafting',
  notes TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Milestones
CREATE TABLE milestones (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  milestone_type TEXT NOT NULL,
  description TEXT,
  achieved_date DATE,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

### Key Indexes

```sql
-- Context assembly performance
CREATE INDEX idx_scenes_chapter ON scenes(chapter_id);
CREATE INDEX idx_scenes_location ON scenes(location_id);
CREATE INDEX idx_character_appearances_scene ON character_appearances(scene_id);
CREATE INDEX idx_character_appearances_character ON character_appearances(character_id);
CREATE INDEX idx_plot_beats_scene ON plot_beats(scene_id);
CREATE INDEX idx_chapters_project ON chapters(project_id);

-- Consistency checking
CREATE INDEX idx_character_attributes_character ON character_attributes(character_id);
CREATE INDEX idx_character_attributes_name ON character_attributes(attribute_name);
```

### Consistency Detection

**Character Attribute Contradictions**:
```sql
-- Find conflicting character attributes
SELECT ca1.character_id, ca1.attribute_name,
       ca1.attribute_value as first_value,
       ca2.attribute_value as conflicting_value
FROM character_attributes ca1
JOIN character_attributes ca2 ON
    ca1.character_id = ca2.character_id AND
    ca1.attribute_name = ca2.attribute_name AND
    ca1.attribute_value != ca2.attribute_value
WHERE ca1.id < ca2.id;
```

**Timeline Violations**:
```sql
-- Find events out of chronological order
SELECT * FROM timeline_events e1
JOIN event_dependencies ed ON e1.id = ed.event_before_id
JOIN timeline_events e2 ON ed.event_after_id = e2.id
WHERE e1.story_timestamp > e2.story_timestamp;
```

---

## Builder Pattern

### Design Philosophy

Builders provide a consistent, fluent API for creating and managing novel entities. All builders follow the same pattern.

### Builder Interface

```typescript
interface Builder<T> {
  // Create new entity
  create(data: Partial<T>): Promise<string>;

  // List all entities
  list(): Promise<string[]>;

  // Validate entity data
  validate(data: Partial<T>): ValidationResult;
}
```

### Implemented Builders

1. **ChapterBuilder** - Chapter management
2. **SceneBuilder** - Scene management within chapters
3. **CharacterBuilder** - Character profiles
4. **LocationBuilder** - Location management
5. **PlotBuilder** - Plot thread tracking
6. **PlotThreadBuilder** - Plot beat management
7. **WorldRulesBuilder** - World-building rules

### Example: ChapterBuilder

```typescript
class ChapterBuilder {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  // Create chapter with metadata
  async create(
    chapterNumber: number,
    metadata: ChapterMetadata,
    content?: string
  ): Promise<string> {
    // Generate filename
    const filename = this.generateFilename(chapterNumber, metadata.title);
    const chapterPath = join(this.projectPath, 'chapters', filename);

    // Build YAML frontmatter
    const frontmatter = this.buildFrontmatter(metadata);

    // Combine frontmatter + content
    const fileContent = `---\n${frontmatter}\n---\n\n${content || ''}`;

    // Write file
    await writeFile(chapterPath, fileContent, 'utf-8');

    return chapterPath;
  }

  // List all chapters
  async list(): Promise<string[]> {
    const chaptersDir = join(this.projectPath, 'chapters');
    const files = await readdir(chaptersDir);
    return files.filter(f => f.endsWith('.md')).sort();
  }
}
```

### Builder Benefits

1. **Consistent API**: All builders work the same way
2. **Validation**: Built-in data validation
3. **File Generation**: Handles file creation and formatting
4. **Type Safety**: Full TypeScript support
5. **Testability**: Easy to unit test
6. **Extensibility**: Add new builders following same pattern

---

## Code Organization

### Organizational Principles

1. **Separation of Concerns**: Each layer has a clear responsibility
2. **Dependency Direction**: CLI → Handlers → Builders → Core
3. **No Circular Dependencies**: Strict layering
4. **Single Responsibility**: Each module does one thing well
5. **Open/Closed**: Open for extension, closed for modification

### Layer Structure

```
src/
├── cli/                    # CLI Interface Layer
│   ├── commands/           # Command definitions
│   ├── handlers/           # Command handlers
│   ├── parser.ts           # Argument parsing
│   ├── registry.ts         # Command registry
│   └── output.ts           # Formatted output
│
├── builders/               # Builder Pattern Layer
│   ├── chapter-builder.ts
│   ├── scene-builder.ts
│   ├── character-builder.ts
│   └── ...
│
├── sync/                   # Synchronization Layer
│   ├── chapter-sync.ts
│   ├── scene-sync.ts
│   ├── character-sync.ts
│   └── ...
│
├── core/                   # Core Infrastructure
│   ├── database.ts         # Database manager
│   └── mcp-client.ts       # MCP integration
│
├── context/                # Context Assembly
│   └── scene-context.ts    # Scene context for AI
│
├── consistency/            # Consistency Checking
│   └── checker.ts          # Consistency checker
│
├── session/                # Session Tracking
│   └── session-manager.ts  # Writing sessions
│
└── types/                  # Type Definitions
    └── novel.ts            # Shared types
```

### Module Dependencies

```
┌─────────────┐
│     CLI     │ (User interface)
└──────┬──────┘
       │
┌──────▼──────┐
│  Handlers   │ (Business logic)
└──────┬──────┘
       │
┌──────▼──────┐
│  Builders   │ (Entity management)
└──────┬──────┘
       │
┌──────▼──────┬─────────────┐
│    Sync     │   Session   │ (Data operations)
└──────┬──────┴─────┬───────┘
       │            │
┌──────▼────────────▼───┐
│       Core            │ (Database & infrastructure)
└───────────────────────┘
```

### File Naming Conventions

- **Builders**: `{entity}-builder.ts` (e.g., `chapter-builder.ts`)
- **Sync Managers**: `{entity}-sync.ts` (e.g., `chapter-sync.ts`)
- **CLI Commands**: `{command}.ts` (e.g., `chapter.ts`)
- **CLI Handlers**: `{command}-handler.ts` (e.g., `chapter-handler.ts`)
- **Tests**: `{file}.test.ts` (e.g., `chapter-builder.test.ts`)

---

## Design Patterns

### 1. Builder Pattern

**Purpose**: Construct complex objects step by step

**Implementation**: All entity builders (Chapter, Character, Scene, etc.)

**Benefits**:
- Fluent API for object creation
- Validation before construction
- Consistent interface across entities

### 2. Registry Pattern

**Purpose**: Centralized command registration and lookup

**Implementation**: CLI command registry

```typescript
class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  register(command: Command): void {
    this.commands.set(command.name, command);
  }

  get(name: string): Command | undefined {
    return this.commands.get(name);
  }
}
```

### 3. Strategy Pattern

**Purpose**: Select algorithm at runtime

**Implementation**: Sync managers (different strategies for different entities)

### 4. Template Method Pattern

**Purpose**: Define skeleton of algorithm, let subclasses override steps

**Implementation**: Base builder class with overridable methods

### 5. Facade Pattern

**Purpose**: Simplified interface to complex subsystem

**Implementation**: `NovelWriterExtension` class provides simple API

```typescript
class NovelWriterExtension {
  getChapterBuilder(): ChapterBuilder { }
  getSceneBuilder(chapterPath: string): SceneBuilder { }
  getCharacterBuilder(): CharacterBuilder { }
  // ... simple methods hide complex initialization
}
```

---

## MCP Integration

### Model Context Protocol

The extension uses MCP (Model Context Protocol) for database access. This provides:

1. **Standardized Interface**: Consistent database operations
2. **Security**: Sandboxed database access
3. **Portability**: Works across different runtimes
4. **Tool Compatibility**: Integrates with Claude Code

### MCP Client Architecture

```typescript
class MCPSQLiteClient {
  // Read query (returns data)
  async readQuery(sql: string, params: any[]): Promise<any[]> {
    return await this.callMCPTool('read_query', { sql, params });
  }

  // Write query (inserts/updates)
  async writeQuery(sql: string, params: any[]): Promise<void> {
    await this.callMCPTool('write_query', { sql, params });
  }

  // Call MCP tool
  private async callMCPTool(tool: string, args: any): Promise<any> {
    // Implementation provided by Claude Code runtime
  }
}
```

### Database Manager

```typescript
class DatabaseManager {
  private client: MCPSQLiteClient;
  private dbPath: string;

  async initialize(): Promise<void> {
    // Run schema.sql to create tables
    await this.runSchema();
  }

  async readQuery(sql: string, params: any[]): Promise<any[]> {
    return await this.client.readQuery(sql, params);
  }

  async writeQuery(sql: string, params: any[]): Promise<void> {
    await this.client.writeQuery(sql, params);
  }
}
```

### Benefits of MCP

- **No direct file access**: Database operations go through MCP
- **Permission model**: User controls database access
- **Audit trail**: All operations logged
- **Type safety**: Structured queries
- **Error handling**: Consistent error reporting

---

## Performance Characteristics

### File Operations
- **Async I/O**: All file operations non-blocking
- **Lazy Loading**: Content loaded only when needed
- **Efficient Parsing**: Regex-based for markdown/YAML

### Database Operations
- **Batch Writes**: Multiple inserts in transactions
- **Indexed Queries**: All common queries use indexes
- **Connection Pooling**: Via MCP server
- **Query Optimization**: Prepared statements

### Memory Usage
- **Moderate**: ~50-100 MB typical usage
- **Scalable**: Handles 100+ chapters efficiently
- **No Leaks**: Proper cleanup and disposal

### Build Performance
- **Full Build**: ~3-5 seconds (TypeScript → JavaScript)
- **Incremental**: ~1-2 seconds
- **Test Suite**: ~2-3 seconds (140+ tests)

---

## Extensibility

### Adding New Entity Types

1. Create builder in `src/builders/`
2. Create sync manager in `src/sync/`
3. Add database tables to `schema.sql`
4. Create CLI command in `src/cli/commands/`
5. Create CLI handler in `src/cli/handlers/`
6. Register in `src/cli/registry.ts`
7. Write unit tests
8. Write integration tests

### Adding New CLI Commands

1. Define command in `src/cli/commands/`
2. Implement handler in `src/cli/handlers/`
3. Register in command registry
4. Add flags and validation
5. Write tests

### Adding New Sync Strategies

1. Implement sync manager extending base pattern
2. Define sync options interface
3. Add bidirectional sync methods
4. Handle conflict resolution
5. Test with integration tests

---

## Security Considerations

1. **Database Access**: Through MCP only, no direct SQLite access
2. **File Operations**: Restricted to project directories
3. **Input Validation**: All user input validated before processing
4. **SQL Injection**: Prevented by parameterized queries
5. **Path Traversal**: All paths validated against project root

---

## Testing Strategy

### Unit Tests
- Test individual builders in isolation
- Mock database and file system
- Fast execution (<100ms per test)
- 100% coverage for core logic

### Integration Tests
- Test complete workflows end-to-end
- Use real file system (temp directories)
- Mock MCP client for database
- Verify file ↔ database sync

### Test Organization
```
tests/
├── unit/
│   ├── builders/           # Builder unit tests
│   ├── sync/              # Sync manager tests
│   └── session/           # Session tests
├── integration/
│   └── workflows/         # End-to-end tests
└── mocks/
    └── mcp-client.mock.ts # Mock MCP client
```

---

## Conclusion

The Claude Novel Writer extension architecture is designed for:

- **Maintainability**: Clear separation of concerns
- **Extensibility**: Easy to add new features
- **Performance**: Efficient operations at scale
- **Reliability**: Comprehensive test coverage
- **Usability**: Consistent, intuitive APIs

The hybrid file + database approach provides both human editability and machine query performance, supporting the complete novel writing process from ideation to publication.
