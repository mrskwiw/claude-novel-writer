# Developer Guide

**Last Updated**: 2025-10-28
**Project**: Claude Novel Writer Extension

Complete guide for setting up, developing, and extending the Claude Novel Writer extension.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Setup](#project-setup)
3. [MCP Server Configuration](#mcp-server-configuration)
4. [Project Initialization](#project-initialization)
5. [Builder System Usage](#builder-system-usage)
6. [Adding New Features](#adding-new-features)
7. [Testing](#testing)
8. [Publishing](#publishing)

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Claude Code CLI installed
- Git

### 5-Minute Setup

```bash
# Clone repository
git clone <repository-url>
cd claudenovel

# Install and build plugin
cd claudenovel_plugin
npm install
npm run build

# Run tests
npm test

# Initialize a test project
mkdir ../test-novel
cd ../test-novel
# Use /novel init command in Claude Code
```

---

## Project Setup

### Repository Structure

```
claudenovel/
├── claudenovel_plugin/        # Main plugin code
│   ├── src/                   # TypeScript source
│   ├── dist/                  # Compiled JavaScript
│   ├── tests/                 # Test suite
│   ├── schema.sql             # Database schema
│   ├── package.json           # NPM configuration
│   └── tsconfig.json          # TypeScript config
│
└── [Documentation Files]      # Project documentation
```

### Installation

```bash
cd claudenovel_plugin

# Install dependencies
npm install

# Install includes:
# - typescript (compiler)
# - vitest (testing)
# - yaml (YAML parsing)
# - zod (validation)
# - mcp-sqlite (database server)
```

### Building

```bash
# Full build (TypeScript → JavaScript)
npm run build

# Watch mode (auto-rebuild on changes)
npm run build -- --watch

# Build output goes to dist/
```

### Development Workflow

```bash
# 1. Make changes in src/
vim src/builders/chapter-builder.ts

# 2. Build
npm run build

# 3. Test
npm test

# 4. Test with real project
cd ../test-novel
# Use Claude Code CLI commands
```

---

## MCP Server Configuration

### What is MCP?

Model Context Protocol (MCP) provides standardized access to external resources like databases. The extension uses MCP for SQLite database access.

### MCP Server Setup

The extension uses **mcp-sqlite** (Node.js-based SQLite MCP server).

**Package**: `mcp-sqlite@^1.0.7`

**Why this package?**
- Node.js-based (matches our TypeScript stack)
- No Python required (unlike official Anthropic server)
- npm-distributable (bundles with plugin)
- Full SQL support

**Configuration** (`package.json`):

```json
{
  "claudeCode": {
    "extension": {
      "mcpServers": {
        "novel-db": {
          "description": "SQLite database for novel metadata",
          "command": "npx",
          "args": [
            "-y",
            "mcp-sqlite",
            "${workspaceFolder}/.novel/novel.db"
          ],
          "autoStart": true,
          "capabilities": {
            "readQuery": true,
            "writeQuery": true
          }
        }
      }
    }
  }
}
```

### Database Location

- **Default**: `.novel/novel.db` (in project root)
- **Created on**: First `/novel init` command
- **Schema**: From `schema.sql` (20+ tables)
- **Size**: ~5-10 MB for full novel project

### MCP Tools Used

```typescript
// Read query (SELECT)
const results = await mcpClient.readQuery(
  'SELECT * FROM chapters WHERE project_id = ?',
  [projectId]
);

// Write query (INSERT/UPDATE/DELETE)
await mcpClient.writeQuery(
  'INSERT INTO chapters (project_id, title) VALUES (?, ?)',
  [projectId, 'Chapter 1']
);
```

### Testing Without MCP

For unit tests, use the mock MCP client:

```typescript
import { MockMCPClient } from '../tests/mocks/mcp-client.mock.js';

const mockClient = new MockMCPClient();
extension.setMCPClient(mockClient);
```

---

## Project Initialization

### Initialization Flow

When a user runs `/novel init`:

```
1. Check directory is empty or get confirmation
2. Check for existing .novel/ directory
3. Create directory structure:
   ├── .novel/
   │   ├── novel.db (created)
   │   └── config.json
   ├── chapters/
   ├── characters/
   ├── locations/
   ├── research/
   ├── revisions/
   └── export/

4. Initialize SQLite database with schema.sql
5. Create project record in database
6. Prompt for project metadata:
   - Title (required)
   - Author (optional)
   - Genre (optional)
   - Target word count (default: 80,000)

7. Success! Project ready for use
```

### Manual Initialization

For development/testing:

```typescript
import { NovelWriterExtension } from './src/index.js';

const projectPath = '/path/to/novel';
const extension = new NovelWriterExtension(projectPath);

await extension.initialize({
  title: 'My Novel',
  author: 'Jane Doe',
  genre: 'Science Fiction',
  targetWordCount: 100000
});
```

### Database Schema

Schema is defined in `schema.sql` (600+ lines):

**Core Tables**:
- `projects` - Project metadata
- `chapters` - Chapter tracking
- `scenes` - Scene details
- `characters` - Character profiles
- `locations` - Location details
- `plot_threads` - Plot tracking
- `world_rules` - World-building
- `writing_sessions` - Session tracking

**Full schema**: See `schema.sql` or ARCHITECTURE.md

---

## Builder System Usage

### Builder Pattern

All entity management uses the builder pattern for consistency.

### Available Builders

1. **ChapterBuilder** - Chapter management
2. **SceneBuilder** - Scene management
3. **CharacterBuilder** - Character profiles
4. **LocationBuilder** - Location management
5. **PlotBuilder** - Plot thread tracking
6. **PlotThreadBuilder** - Plot beat management
7. **WorldRulesBuilder** - World rules

### Example: Using ChapterBuilder

```typescript
import { NovelWriterExtension } from './src/index.js';

const extension = new NovelWriterExtension('/path/to/project');
const chapterBuilder = extension.getChapterBuilder();

// Create chapter
const chapterPath = await chapterBuilder.create(1, {
  title: 'The Opening',
  status: 'drafted',
  summary: 'Protagonist introduced'
});

// List chapters
const chapters = await chapterBuilder.list();
console.log('Chapters:', chapters);

// Get next chapter number
const nextNum = await chapterBuilder.getNextChapterNumber();
```

### Example: Using SceneBuilder

```typescript
const sceneBuilder = extension.getSceneBuilder(chapterPath);

// Add scene to chapter
await sceneBuilder.addScene({
  title: 'The Discovery',
  pov: 'Sarah Chen',
  location: 'Observatory',
  tensionLevel: 7
}, 'Scene content here...');

// Parse scenes from chapter
const scenes = await sceneBuilder.parseScenes();

// Update scene metadata
await sceneBuilder.updateSceneMetadata(1, {
  tensionLevel: 8,
  emotionalTone: 'Tense'
});

// Get scene statistics
const stats = await sceneBuilder.getSceneStats();
```

### Example: Using CharacterBuilder

```typescript
const characterBuilder = extension.getCharacterBuilder();

// Create character profile
await characterBuilder.create({
  name: 'Sarah Chen',
  role: 'protagonist',
  age: 28,
  description: 'Brilliant astrophysicist'
});

// List characters
const characters = await characterBuilder.list();

// Sync to database
const characterSync = extension.getCharacterSync();
await characterSync.syncAll();
```

### Sync Managers

Each builder has a corresponding sync manager for database synchronization:

```typescript
// Chapter sync
const chapterSync = extension.getChapterSync();
await chapterSync.syncChapter(chapterPath);

// Scene sync
const sceneSync = extension.getSceneSync();
await sceneSync.syncChapterScenes(chapterPath);

// Character sync
const characterSync = extension.getCharacterSync();
await characterSync.syncAll();
```

---

## Adding New Features

### Adding a New Entity Type

Follow this pattern to add new entity types (e.g., "themes", "symbols"):

#### 1. Create Builder

```typescript
// src/builders/theme-builder.ts

export class ThemeBuilder {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async create(data: ThemeData): Promise<string> {
    // Create theme YAML file
  }

  async list(): Promise<string[]> {
    // List all themes
  }

  validate(data: ThemeData): ValidationResult {
    // Validate theme data
  }
}
```

#### 2. Add Database Tables

```sql
-- Add to schema.sql

CREATE TABLE themes (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  theme_name TEXT NOT NULL,
  description TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX idx_themes_project ON themes(project_id);
```

#### 3. Create Sync Manager

```typescript
// src/sync/theme-sync.ts

export class ThemeSync {
  async syncTheme(themePath: string): Promise<void> {
    // Read YAML file
    // Insert/update database
  }

  async loadThemes(projectId: number): Promise<Theme[]> {
    // Query database
    // Return themes
  }
}
```

#### 4. Add CLI Command

```typescript
// src/cli/commands/theme.ts

export const themeCommand: Command = {
  name: 'theme',
  description: 'Manage themes',
  handler: async (args, context) => {
    await handleThemeCommand(args, context.cwd, context.output);
  },
  subcommands: [
    { name: 'create', description: 'Create theme' },
    { name: 'list', description: 'List themes' }
  ]
};
```

#### 5. Add CLI Handler

```typescript
// src/cli/handlers/theme-handler.ts

export async function handleThemeCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const subcommand = args.positional[0];

  switch (subcommand) {
    case 'create':
      await handleThemeCreate(args, projectPath, output);
      break;
    case 'list':
      await handleThemeList(args, projectPath, output);
      break;
  }
}
```

#### 6. Register Command

```typescript
// src/cli/registry.ts

import { themeCommand } from './commands/theme.js';

export class CommandRegistry {
  private registerDefaults(): void {
    // ... existing commands
    this.register(themeCommand);
  }
}
```

#### 7. Write Tests

```typescript
// tests/unit/builders/theme-builder.test.ts

describe('ThemeBuilder', () => {
  it('should create theme', async () => {
    const builder = new ThemeBuilder(projectPath);
    const path = await builder.create({
      name: 'Isolation',
      description: 'Protagonist struggles with loneliness'
    });
    expect(path).toBeDefined();
  });
});
```

#### 8. Update Extension API

```typescript
// src/index.ts

export class NovelWriterExtension {
  getThemeBuilder(): ThemeBuilder {
    return new ThemeBuilder(this.projectPath);
  }

  getThemeSync(): ThemeSync {
    return new ThemeSync(this.db, this.projectId);
  }
}
```

### Adding CLI Commands

To add new commands to existing entities:

```typescript
// Add to existing command definition
{
  name: 'analyze',
  description: 'Analyze chapter structure',
  handler: async (args, context) => {
    await handleChapterAnalyze(args, context.cwd, context.output);
  }
}

// Add handler
async function handleChapterAnalyze(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  // Implementation
}
```

---

## Testing

### Test Framework

**Framework**: Vitest (TypeScript-native test runner)

**Test Types**:
- Unit tests (fast, isolated)
- Integration tests (end-to-end workflows)

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npx vitest tests/unit/builders/chapter-builder.test.ts

# Watch mode
npx vitest --watch
```

### Test Organization

```
tests/
├── unit/
│   ├── builders/           # Builder unit tests
│   │   ├── chapter-builder.test.ts
│   │   ├── scene-builder.test.ts
│   │   └── character-builder.test.ts
│   ├── sync/              # Sync manager tests
│   └── session/           # Session manager tests
│
├── integration/
│   └── workflows/         # End-to-end workflow tests
│       ├── chapter-workflow.test.ts
│       ├── scene-workflow.test.ts
│       └── session-workflow.test.ts
│
└── mocks/
    └── mcp-client.mock.ts  # Mock MCP client
```

### Writing Unit Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ChapterBuilder } from '../../../src/builders/chapter-builder.js';

describe('ChapterBuilder', () => {
  let builder: ChapterBuilder;
  let projectPath: string;

  beforeEach(() => {
    projectPath = '/tmp/test-project';
    builder = new ChapterBuilder(projectPath);
  });

  it('should create chapter with metadata', async () => {
    const chapterPath = await builder.create(1, {
      title: 'Opening',
      status: 'drafted'
    });

    expect(chapterPath).toBeDefined();
    expect(chapterPath).toContain('01-opening.md');
  });

  it('should validate chapter number', () => {
    const result = builder.validate({ chapterNumber: -1 });
    expect(result.valid).toBe(false);
  });
});
```

### Writing Integration Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NovelWriterExtension } from '../../../src/index.js';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { rm } from 'fs/promises';

describe('Chapter Workflow (Integration)', () => {
  let extension: NovelWriterExtension;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = '/tmp/test-workflow-' + Date.now();
    const mockClient = new MockMCPClient();

    extension = new NovelWriterExtension(projectPath);
    (extension as any).mcpClient = mockClient;

    await extension.initialize({
      title: 'Test Novel'
    });
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it('should complete full chapter workflow', async () => {
    // Create chapter
    const chapterBuilder = extension.getChapterBuilder();
    const path = await chapterBuilder.create(1, {
      title: 'Opening'
    });

    // Sync to database
    const chapterSync = extension.getChapterSync();
    await chapterSync.syncChapter(path);

    // Verify in database
    const chapters = await chapterSync.loadChapters(1);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe('Opening');
  });
});
```

### Mock MCP Client

For testing without real database:

```typescript
// tests/mocks/mcp-client.mock.ts

export class MockMCPClient {
  private data: Map<string, any[]> = new Map();

  async readQuery(sql: string, params: any[]): Promise<any[]> {
    // Return mock data based on SQL
  }

  async writeQuery(sql: string, params: any[]): Promise<void> {
    // Store mock data
  }
}
```

---

## Publishing

### Pre-Publish Checklist

- [ ] All tests passing
- [ ] Build succeeds with no errors
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated
- [ ] README.md updated
- [ ] Documentation reviewed
- [ ] Examples tested

### Version Bumping

```bash
# Patch version (1.0.0 → 1.0.1)
npm version patch

# Minor version (1.0.0 → 1.1.0)
npm version minor

# Major version (1.0.0 → 2.0.0)
npm version major
```

### Publishing to NPM

```bash
cd claudenovel_plugin

# Build
npm run build

# Test
npm test

# Publish
npm publish

# Or publish as beta
npm publish --tag beta
```

### Distribution

Package includes:
- Compiled JavaScript (`dist/`)
- Type definitions (`.d.ts` files)
- Database schema (`schema.sql`)
- Package configuration
- README and documentation

**Package size**: ~500 KB

---

## Troubleshooting

### Build Errors

**TypeScript errors**:
```bash
# Check TypeScript version
npx tsc --version

# Clean build
rm -rf dist/
npm run build
```

**Missing dependencies**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### MCP Server Issues

**MCP server not starting**:
- Check `package.json` mcpServers configuration
- Verify `mcp-sqlite` is installed
- Check database path exists

**Database connection errors**:
- Ensure `.novel/novel.db` exists
- Check file permissions
- Verify schema was applied

### Test Failures

**Mock client issues**:
- Ensure using MockMCPClient for tests
- Check test setup/teardown
- Verify test isolation

**File system errors**:
- Check temp directory permissions
- Verify cleanup in afterEach
- Use unique paths for each test

---

## Resources

### Documentation
- [README.md](./README.md) - Project overview
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [CLI_REFERENCE.md](./CLI_REFERENCE.md) - Command reference
- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) - Feature status

### External Resources
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vitest Documentation](https://vitest.dev/)
- [MCP Protocol Spec](https://github.com/anthropics/mcp)
- [SQLite Documentation](https://www.sqlite.org/docs.html)

### Support
- GitHub Issues: Report bugs and feature requests
- Discussions: Ask questions and share ideas

---

## Contributing

### Code Style

- TypeScript strict mode
- Async/await for all I/O
- Clear, descriptive names
- JSDoc comments for public APIs
- Follow existing patterns

### Pull Request Process

1. Fork repository
2. Create feature branch
3. Write tests
4. Implement feature
5. Update documentation
6. Submit PR with description

### Code Review

All PRs require:
- Tests passing
- Code review approval
- Documentation updates
- No breaking changes (or migration plan)

---

## Conclusion

You now have everything needed to develop, test, and extend the Claude Novel Writer extension. The builder pattern, consistent architecture, and comprehensive test suite make adding new features straightforward.

For questions or issues, see the troubleshooting section or open a GitHub issue.

Happy coding! 📝
