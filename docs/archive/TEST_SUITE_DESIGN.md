# Automated Test Suite Design

**Date**: 2025-10-26
**Status**: Design Phase
**Coverage Target**: 80%+ code coverage

## Overview

Comprehensive test suite for the Claude Novel Writer extension covering unit tests, integration tests, and end-to-end tests.

## Test Architecture

### Testing Pyramid

```
         /\
        /  \  E2E Tests (10%)
       /----\  - Complete workflows
      /      \ - Real database
     /--------\ Integration Tests (30%)
    /          \ - Command handlers
   /            \ - Multi-component interactions
  /--------------\ Unit Tests (60%)
 /                \ - Builders, Sync, Utils
/------------------\ - Isolated components
```

### Test Layers

1. **Unit Tests** (60% of tests)
   - Individual functions/methods
   - Mocked dependencies
   - Fast execution (< 1s per test)
   - Isolated from external systems

2. **Integration Tests** (30% of tests)
   - Multiple components working together
   - Real file system (temp directories)
   - In-memory or test database
   - Moderate execution time (< 5s per test)

3. **End-to-End Tests** (10% of tests)
   - Complete user workflows
   - Real file system and database
   - Full CLI command execution
   - Slower execution (< 30s per test)

## Test Framework Selection

### Recommended Stack

```typescript
// Test Runner
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mocking
import { vi } from 'vitest'; // Built-in mocking

// Assertions
import { expect } from 'vitest'; // Chai-compatible

// File System
import { vol } from 'memfs'; // In-memory file system

// Temp Directories
import tmp from 'tmp-promise';
```

**Why Vitest**:
- Native TypeScript support
- Fast (Vite-powered)
- Jest-compatible API
- Better ESM support
- Built-in coverage (via c8)
- Watch mode out of the box

### Package Installation

```bash
npm install -D vitest @vitest/ui
npm install -D memfs tmp-promise
npm install -D @types/tmp
```

## Test Organization

### Directory Structure

```
claudenovel_plugin/
├── src/
│   ├── builders/
│   │   ├── character-builder.ts
│   │   ├── location-builder.ts
│   │   └── plot-builder.ts
│   └── ...
├── tests/
│   ├── unit/
│   │   ├── builders/
│   │   │   ├── character-builder.test.ts
│   │   │   ├── location-builder.test.ts
│   │   │   └── plot-builder.test.ts
│   │   ├── sync/
│   │   │   ├── character-sync.test.ts
│   │   │   ├── location-sync.test.ts
│   │   │   └── plot-sync.test.ts
│   │   ├── cli/
│   │   │   ├── parser.test.ts
│   │   │   ├── registry.test.ts
│   │   │   └── output.test.ts
│   │   └── core/
│   │       └── database.test.ts
│   ├── integration/
│   │   ├── handlers/
│   │   │   ├── create-handler.test.ts
│   │   │   ├── list-handler.test.ts
│   │   │   └── sync-handler.test.ts
│   │   ├── workflows/
│   │   │   ├── character-workflow.test.ts
│   │   │   ├── location-workflow.test.ts
│   │   │   └── plot-workflow.test.ts
│   │   └── database/
│   │       └── crud-operations.test.ts
│   ├── e2e/
│   │   ├── full-project-lifecycle.test.ts
│   │   ├── edit-sync-cycle.test.ts
│   │   └── multi-user-scenario.test.ts
│   ├── fixtures/
│   │   ├── characters/
│   │   │   ├── valid-character.yml
│   │   │   └── invalid-character.yml
│   │   ├── locations/
│   │   ├── plots/
│   │   └── chapters/
│   ├── mocks/
│   │   ├── mcp-client.mock.ts
│   │   ├── prompt-function.mock.ts
│   │   └── output-formatter.mock.ts
│   └── helpers/
│       ├── test-project.ts
│       ├── mock-database.ts
│       └── test-utils.ts
├── vitest.config.ts
└── package.json
```

## Unit Tests

### 1. Builder Tests

#### CharacterBuilder Tests (`tests/unit/builders/character-builder.test.ts`)

```typescript
describe('CharacterBuilder', () => {
  describe('create()', () => {
    it('should create valid character YAML file', async () => {
      // Test valid character creation
    });

    it('should generate correct filename from character name', async () => {
      // Test filename generation (spaces → hyphens, lowercase)
    });

    it('should throw error if character file already exists', async () => {
      // Test duplicate prevention
    });

    it('should validate required fields (name, role, summary)', async () => {
      // Test validation logic
    });

    it('should handle optional fields correctly', async () => {
      // Test physical, personality, background, etc.
    });

    it('should format YAML with proper indentation and comments', async () => {
      // Test YAML formatting
    });
  });

  describe('validate()', () => {
    it('should return empty array for valid character data', () => {
      // Test successful validation
    });

    it('should return errors for missing required fields', () => {
      // Test validation errors
    });

    it('should validate role enum values', () => {
      // Test role validation
    });
  });

  describe('list()', () => {
    it('should return all character files in directory', async () => {
      // Test listing characters
    });

    it('should exclude template files (starting with _)', async () => {
      // Test template exclusion
    });

    it('should return empty array for non-existent directory', async () => {
      // Test missing directory
    });
  });

  describe('generateFilename()', () => {
    it('should convert "Sarah Chen" to "sarah-chen.yml"', () => {
      // Test filename generation
    });

    it('should handle special characters', () => {
      // Test special character handling
    });

    it('should handle very long names', () => {
      // Test long name truncation
    });
  });
});
```

#### LocationBuilder Tests (`tests/unit/builders/location-builder.test.ts`)

```typescript
describe('LocationBuilder', () => {
  describe('create()', () => {
    it('should create valid location YAML file');
    it('should handle parent locations');
    it('should validate location type');
    it('should format nested structure correctly');
  });

  describe('validate()', () => {
    it('should validate required fields (name, description)');
    it('should validate location type if provided');
  });
});
```

#### PlotBuilder Tests (`tests/unit/builders/plot-builder.test.ts`)

```typescript
describe('PlotBuilder', () => {
  describe('create()', () => {
    it('should create valid plot YAML file');
    it('should handle beats array');
    it('should handle characters array');
    it('should handle themes and dependencies');
  });

  describe('validate()', () => {
    it('should validate required fields (name, type, status, description)');
    it('should validate plot type enum');
    it('should validate status enum');
    it('should validate priority range (1-5)');
  });
});
```

### 2. Sync Tests

#### CharacterSync Tests (`tests/unit/sync/character-sync.test.ts`)

```typescript
describe('CharacterSync', () => {
  describe('syncCharacterFile()', () => {
    it('should insert new character into database', async () => {
      // Test insert operation
    });

    it('should update existing character in database', async () => {
      // Test update operation
    });

    it('should throw error for invalid YAML', async () => {
      // Test error handling
    });

    it('should throw error for missing required fields', async () => {
      // Test validation
    });

    it('should handle character with all optional fields', async () => {
      // Test full character sync
    });
  });

  describe('syncAllCharacters()', () => {
    it('should sync all character files in directory', async () => {
      // Test batch sync
    });

    it('should skip template files', async () => {
      // Test template exclusion
    });

    it('should continue on individual file errors', async () => {
      // Test error resilience
    });
  });

  describe('upsertCharacter()', () => {
    it('should insert when character does not exist', async () => {
      // Test insert logic
    });

    it('should update when character exists', async () => {
      // Test update logic
    });

    it('should match by name', async () => {
      // Test uniqueness constraint
    });
  });
});
```

#### PlotSync Tests (`tests/unit/sync/plot-sync.test.ts`)

```typescript
describe('PlotSync', () => {
  describe('syncPlotFile()', () => {
    it('should sync plot with beats to database');
    it('should handle plot without beats');
    it('should sync characters array');
    it('should sync themes and dependencies');
  });

  describe('syncBeats()', () => {
    it('should delete existing beats before inserting new ones');
    it('should maintain beat order');
    it('should handle scene references');
  });
});
```

### 3. CLI Tests

#### Parser Tests (`tests/unit/cli/parser.test.ts`)

```typescript
describe('CommandParser', () => {
  describe('parse()', () => {
    it('should parse simple command: "/novel init"', () => {
      // Test basic command parsing
    });

    it('should parse command with flags: "/novel create character --name Sarah"', () => {
      // Test flag parsing
    });

    it('should parse command with boolean flags: "/novel list --detailed"', () => {
      // Test boolean flags
    });

    it('should parse command with subcommand: "/novel create character"', () => {
      // Test subcommand parsing
    });

    it('should handle quoted values: --name "Sarah Chen"', () => {
      // Test quoted value parsing
    });

    it('should parse multiple flags', () => {
      // Test multiple flags
    });

    it('should handle flag aliases: -n vs --name', () => {
      // Test aliases
    });

    it('should throw error for unknown flags', () => {
      // Test validation
    });

    it('should throw error for invalid command', () => {
      // Test error handling
    });
  });

  describe('tokenize()', () => {
    it('should tokenize simple string', () => {
      // Test tokenization
    });

    it('should handle quoted strings with spaces', () => {
      // Test quoted strings
    });

    it('should handle escaped quotes', () => {
      // Test escape sequences
    });
  });
});
```

#### Registry Tests (`tests/unit/cli/registry.test.ts`)

```typescript
describe('CommandRegistry', () => {
  describe('register()', () => {
    it('should register command by name');
    it('should register command aliases');
    it('should register subcommands');
  });

  describe('get()', () => {
    it('should retrieve command by name');
    it('should retrieve command by alias');
    it('should retrieve subcommand by full name');
    it('should return undefined for non-existent command');
  });

  describe('findSimilar()', () => {
    it('should find similar commands by prefix');
    it('should find similar commands by Levenshtein distance');
    it('should return empty array when no similar commands');
  });
});
```

### 4. Database Tests

#### DatabaseManager Tests (`tests/unit/core/database.test.ts`)

```typescript
describe('DatabaseManager', () => {
  describe('initialize()', () => {
    it('should create database file');
    it('should create all tables');
    it('should create indices');
    it('should be idempotent (safe to call multiple times)');
  });

  describe('createProject()', () => {
    it('should insert project record');
    it('should return project ID');
    it('should set default values');
  });

  describe('getProjectHealth()', () => {
    it('should return project statistics');
    it('should calculate word counts');
    it('should count characters, locations, chapters');
  });
});
```

## Integration Tests

### 1. Command Handler Tests

#### CreateHandler Tests (`tests/integration/handlers/create-handler.test.ts`)

```typescript
describe('CreateHandler Integration', () => {
  describe('handleCreateCharacter()', () => {
    it('should create character YAML file in correct directory', async () => {
      // Test file creation
    });

    it('should sync character to database', async () => {
      // Test database sync
    });

    it('should display success message', async () => {
      // Test output
    });

    it('should handle duplicate character names', async () => {
      // Test error handling
    });

    it('should validate required flags', async () => {
      // Test validation
    });
  });

  describe('handleCreatePlot()', () => {
    it('should create plot YAML file with beats');
    it('should sync plot and beats to database');
    it('should handle complex plot structures');
  });
});
```

#### SyncHandler Tests (`tests/integration/handlers/sync-handler.test.ts`)

```typescript
describe('SyncHandler Integration', () => {
  describe('handleSyncAll()', () => {
    it('should sync all content types', async () => {
      // Create test files for each type
      // Run sync all
      // Verify database records
    });

    it('should report sync counts correctly', async () => {
      // Test progress reporting
    });

    it('should handle partial failures', async () => {
      // Mix valid and invalid files
      // Verify partial success
    });
  });

  describe('handleSyncCharacters()', () => {
    it('should sync multiple character files');
    it('should update existing characters');
    it('should report errors for invalid files');
  });
});
```

### 2. Workflow Tests

#### Character Workflow (`tests/integration/workflows/character-workflow.test.ts`)

```typescript
describe('Character Workflow', () => {
  it('should complete create-edit-sync cycle', async () => {
    // 1. Create character via CLI
    const args = {
      command: 'create',
      subcommand: 'character',
      flags: {
        name: 'Sarah Chen',
        role: 'protagonist',
        summary: 'A brilliant scientist',
      },
    };
    await handleCreateCharacter(args, context);

    // 2. Verify file created
    const filePath = join(projectPath, 'characters', 'sarah-chen.yml');
    expect(existsSync(filePath)).toBe(true);

    // 3. Verify database record
    const result = await mcpClient.readQuery(
      'SELECT * FROM characters WHERE name = ?',
      ['Sarah Chen']
    );
    expect(result).toHaveLength(1);

    // 4. Edit file (add personality traits)
    const content = await readFile(filePath, 'utf-8');
    const character = YAML.parse(content);
    character.personality = { traits: ['curious', 'determined'] };
    await writeFile(filePath, YAML.stringify(character));

    // 5. Sync changes
    await handleSyncCharacters({ command: 'sync', subcommand: 'characters' }, context);

    // 6. Verify database updated
    const updated = await mcpClient.readQuery(
      'SELECT * FROM characters WHERE name = ?',
      ['Sarah Chen']
    );
    expect(updated[0].personality).toBeDefined();
  });
});
```

#### Plot Workflow (`tests/integration/workflows/plot-workflow.test.ts`)

```typescript
describe('Plot Workflow', () => {
  it('should create plot with beats and sync to database', async () => {
    // Create plot with beats
    // Verify plot_threads and plot_beats tables
    // Edit plot file to add more beats
    // Sync and verify updates
  });
});
```

## End-to-End Tests

### Full Project Lifecycle (`tests/e2e/full-project-lifecycle.test.ts`)

```typescript
describe('Full Project Lifecycle (E2E)', () => {
  it('should complete full novel project workflow', async () => {
    const tmpDir = await tmp.dir({ unsafeCleanup: true });
    const projectPath = tmpDir.path;

    // 1. Initialize project
    const extension = new NovelWriterExtension(projectPath);
    await extension.initialize({
      title: 'Test Novel',
      author: 'Test Author',
      genre: 'Science Fiction',
      targetWordCount: 80000,
    });

    // 2. Create characters
    await handleCreateCharacter(
      { flags: { name: 'Sarah', role: 'protagonist', summary: 'Scientist' } },
      { extension, cwd: projectPath, output: mockOutput }
    );
    await handleCreateCharacter(
      { flags: { name: 'Alex', role: 'major', summary: 'Engineer' } },
      { extension, cwd: projectPath, output: mockOutput }
    );

    // 3. Create locations
    await handleCreateLocation(
      { flags: { name: 'SETI Lab', description: 'Research facility' } },
      { extension, cwd: projectPath, output: mockOutput }
    );

    // 4. Create plot threads
    await handleCreatePlot(
      { flags: { name: 'The Mystery', type: 'main', description: 'Strange signal' } },
      { extension, cwd: projectPath, output: mockOutput }
    );

    // 5. Create chapters
    await handleCreateChapter(
      { flags: { title: 'The Signal', number: 1 } },
      { extension, cwd: projectPath, output: mockOutput }
    );

    // 6. Edit files manually (simulate user editing)
    const charFile = join(projectPath, 'characters', 'sarah.yml');
    const charData = YAML.parse(await readFile(charFile, 'utf-8'));
    charData.physical = { age: '32', hair: 'brown' };
    await writeFile(charFile, YAML.stringify(charData));

    // 7. Sync all changes
    await handleSyncAll(
      { command: 'sync', subcommand: 'all' },
      { extension, cwd: projectPath, output: mockOutput }
    );

    // 8. List all content
    const characters = await handleListCharacters(
      { command: 'list', subcommand: 'characters' },
      { extension, cwd: projectPath, output: mockOutput }
    );
    expect(characters).toHaveLength(2);

    // 9. Verify project health
    const health = await extension.getProjectHealth();
    expect(health.characterCount).toBe(2);
    expect(health.locationCount).toBe(1);
    expect(health.plotThreadCount).toBe(1);
    expect(health.chapterCount).toBe(1);

    // Cleanup
    await tmpDir.cleanup();
  });
});
```

### Edit-Sync Cycle (`tests/e2e/edit-sync-cycle.test.ts`)

```typescript
describe('Edit-Sync Cycle (E2E)', () => {
  it('should handle concurrent edits to multiple files', async () => {
    // Create multiple characters
    // Edit multiple files simultaneously
    // Sync all
    // Verify all changes persisted
  });

  it('should handle conflicts gracefully', async () => {
    // Create character
    // Edit file to have invalid data
    // Attempt sync
    // Verify error handling
    // Fix file
    // Sync successfully
  });
});
```

## Test Fixtures

### Character Fixtures (`tests/fixtures/characters/`)

**valid-character.yml**:
```yaml
name: "Sarah Chen"
role: protagonist
summary: |
  A brilliant astrophysicist haunted by her past.

physical:
  age: "32"
  hair: "dark brown"
  eyes: "brown"
  height: "5'6\""

personality:
  traits: "Curious, determined, haunted"
  fears: "Failure, being alone"

arc:
  startingState: "Isolated and driven"
  endingState: "Connected and balanced"
```

**invalid-character-missing-name.yml**:
```yaml
role: protagonist
summary: "Missing name field"
```

**invalid-character-bad-role.yml**:
```yaml
name: "Test"
role: "invalid-role"
summary: "Bad role value"
```

### Plot Fixtures (`tests/fixtures/plots/`)

**valid-plot-with-beats.yml**:
```yaml
name: "The Mystery"
type: main
status: active
priority: 5
description: |
  A strange signal from space.

beats:
  - scene: "1.1"
    description: "Signal detected"
    type: setup
  - scene: "3.5"
    description: "Source discovered"
    type: climax
```

## Test Mocks

### MCP Client Mock (`tests/mocks/mcp-client.mock.ts`)

```typescript
export class MockMCPClient implements MCPClient {
  private data: Map<string, any[]> = new Map();

  async readQuery(query: string, params: any[]): Promise<any[]> {
    // Mock implementation that simulates database reads
    const table = this.extractTableName(query);
    return this.data.get(table) || [];
  }

  async writeQuery(query: string, params: any[]): Promise<void> {
    // Mock implementation that simulates database writes
    const table = this.extractTableName(query);
    if (query.includes('INSERT')) {
      this.mockInsert(table, params);
    } else if (query.includes('UPDATE')) {
      this.mockUpdate(table, params);
    }
  }

  // Helper methods
  private mockInsert(table: string, params: any[]): void { /* ... */ }
  private mockUpdate(table: string, params: any[]): void { /* ... */ }
  private extractTableName(query: string): string { /* ... */ }

  // Test helpers
  reset(): void {
    this.data.clear();
  }

  seed(table: string, records: any[]): void {
    this.data.set(table, records);
  }
}
```

### Output Formatter Mock (`tests/mocks/output-formatter.mock.ts`)

```typescript
export class MockOutputFormatter implements OutputFormatter {
  public messages: Array<{ type: string; message: string }> = [];

  success(message: string): void {
    this.messages.push({ type: 'success', message });
  }

  error(message: string): void {
    this.messages.push({ type: 'error', message });
  }

  // ... other methods

  // Test helpers
  getMessages(type?: string): string[] {
    if (type) {
      return this.messages
        .filter((m) => m.type === type)
        .map((m) => m.message);
    }
    return this.messages.map((m) => m.message);
  }

  clear(): void {
    this.messages = [];
  }

  hasMessage(type: string, content: string): boolean {
    return this.messages.some(
      (m) => m.type === type && m.message.includes(content)
    );
  }
}
```

## Test Helpers

### Test Project Helper (`tests/helpers/test-project.ts`)

```typescript
export class TestProject {
  public path: string;
  private cleanup?: () => Promise<void>;

  static async create(): Promise<TestProject> {
    const tmpDir = await tmp.dir({ unsafeCleanup: true });
    const project = new TestProject();
    project.path = tmpDir.path;
    project.cleanup = async () => await tmpDir.cleanup();

    // Create directory structure
    await mkdir(join(project.path, 'characters'), { recursive: true });
    await mkdir(join(project.path, 'locations'), { recursive: true });
    await mkdir(join(project.path, 'plots'), { recursive: true });
    await mkdir(join(project.path, 'chapters'), { recursive: true });
    await mkdir(join(project.path, '.novel'), { recursive: true });

    return project;
  }

  async destroy(): Promise<void> {
    if (this.cleanup) {
      await this.cleanup();
    }
  }

  // Helper methods
  characterPath(name: string): string {
    return join(this.path, 'characters', `${name}.yml`);
  }

  locationPath(name: string): string {
    return join(this.path, 'locations', `${name}.yml`);
  }

  plotPath(name: string): string {
    return join(this.path, 'plots', `${name}.yml`);
  }

  chapterPath(number: number): string {
    return join(this.path, 'chapters', `${number.toString().padStart(2, '0')}.md`);
  }

  async createCharacterFile(name: string, data: any): Promise<string> {
    const path = this.characterPath(name);
    await writeFile(path, YAML.stringify(data));
    return path;
  }

  async readCharacterFile(name: string): Promise<any> {
    const content = await readFile(this.characterPath(name), 'utf-8');
    return YAML.parse(content);
  }
}
```

## Configuration

### Vitest Config (`vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types/',
        '**/*.d.ts',
      ],
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
    testTimeout: 10000, // 10 seconds
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
});
```

### Test Setup (`tests/setup.ts`)

```typescript
import { beforeEach, afterEach, vi } from 'vitest';
import { TestProject } from './helpers/test-project';

// Global test project instance
let testProject: TestProject | null = null;

// Setup before each test
beforeEach(async () => {
  // Create fresh test project
  testProject = await TestProject.create();

  // Reset all mocks
  vi.clearAllMocks();
});

// Cleanup after each test
afterEach(async () => {
  // Cleanup test project
  if (testProject) {
    await testProject.destroy();
    testProject = null;
  }

  // Clear all timers
  vi.clearAllTimers();
});

// Make test project available globally
declare global {
  var testProject: TestProject;
}

global.testProject = testProject as any;
```

## Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "vitest run tests/e2e",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

## Coverage Targets

### Overall Target: 80%+

- **Unit Tests**: 90%+ coverage
  - Builders: 95%+
  - Sync: 95%+
  - CLI: 85%+
  - Utils: 95%+

- **Integration Tests**: 70%+ coverage
  - Handlers: 80%+
  - Workflows: 70%+

- **E2E Tests**: 50%+ coverage
  - Critical paths only

### Excluded from Coverage

- Type definitions (`.d.ts`)
- Test files
- Configuration files
- Generated code
- Third-party code

## Test Execution Strategy

### Development Workflow

```bash
# Run tests in watch mode during development
npm run test:watch

# Run specific test file
npx vitest tests/unit/builders/character-builder.test.ts

# Run tests for specific pattern
npx vitest character
```

### CI/CD Pipeline

```bash
# Run all tests with coverage
npm run test:coverage

# Run tests by layer
npm run test:unit
npm run test:integration
npm run test:e2e

# Generate coverage report
npm run test:coverage -- --reporter=html
```

### Pre-commit Hook

```bash
# Run fast tests only (unit tests)
npm run test:unit -- --run
```

## Testing Best Practices

### 1. Test Naming Convention

```typescript
// Pattern: should [expected behavior] when [condition]
it('should create character file when valid data provided', async () => {
  // ...
});

it('should throw error when required field missing', async () => {
  // ...
});
```

### 2. AAA Pattern

```typescript
it('should sync character to database', async () => {
  // Arrange - Set up test data
  const character = { name: 'Sarah', role: 'protagonist', summary: 'Scientist' };
  const sync = new CharacterSync(mockClient, projectId);

  // Act - Execute the operation
  await sync.syncCharacterFile(characterPath);

  // Assert - Verify the results
  expect(mockClient.writeQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO characters'),
    expect.arrayContaining(['Sarah'])
  );
});
```

### 3. One Assertion Per Test (Generally)

```typescript
// Good - Focused test
it('should generate lowercase filename', () => {
  const filename = builder.generateFilename('Sarah Chen');
  expect(filename).toBe('sarah-chen.yml');
});

// Acceptable - Related assertions
it('should create valid YAML file', async () => {
  const path = await builder.create(data);
  expect(existsSync(path)).toBe(true);
  const content = await readFile(path, 'utf-8');
  expect(() => YAML.parse(content)).not.toThrow();
});
```

### 4. Avoid Test Interdependence

```typescript
// Bad - Tests depend on each other
describe('CharacterBuilder', () => {
  let characterPath: string;

  it('should create character', async () => {
    characterPath = await builder.create(data); // Sets variable
  });

  it('should list character', async () => {
    const list = await builder.list(); // Depends on previous test
    expect(list).toContain(characterPath);
  });
});

// Good - Each test is independent
describe('CharacterBuilder', () => {
  it('should create character', async () => {
    const path = await builder.create(data);
    expect(existsSync(path)).toBe(true);
  });

  it('should list characters', async () => {
    // Create test data within this test
    await builder.create(data);
    const list = await builder.list();
    expect(list).toHaveLength(1);
  });
});
```

### 5. Test Edge Cases

```typescript
describe('generateFilename()', () => {
  it('should handle normal names', () => {
    expect(generateFilename('Sarah Chen')).toBe('sarah-chen.yml');
  });

  it('should handle special characters', () => {
    expect(generateFilename("O'Brien")).toBe('obrien.yml');
  });

  it('should handle very long names', () => {
    const longName = 'A'.repeat(300);
    const filename = generateFilename(longName);
    expect(filename.length).toBeLessThan(255); // Max filename length
  });

  it('should handle empty string', () => {
    expect(() => generateFilename('')).toThrow();
  });

  it('should handle only special characters', () => {
    expect(generateFilename('!@#$%')).toBe('.yml');
  });
});
```

## Performance Targets

- **Unit tests**: < 1s per test
- **Integration tests**: < 5s per test
- **E2E tests**: < 30s per test
- **Full suite**: < 5 minutes

## Continuous Improvement

### Test Metrics to Track

1. **Coverage percentage** (target: 80%+)
2. **Test execution time** (track trends)
3. **Flaky test rate** (target: < 1%)
4. **Test failure rate** in CI/CD
5. **Time to debug failures**

### Regular Reviews

- **Weekly**: Review failed tests and flaky tests
- **Monthly**: Review coverage trends and add tests for uncovered code
- **Quarterly**: Refactor tests for maintainability

## Next Steps

1. ✅ Design complete (this document)
2. ⏳ Install test dependencies
3. ⏳ Configure Vitest
4. ⏳ Create test helpers and mocks
5. ⏳ Implement unit tests (builders first)
6. ⏳ Implement unit tests (sync classes)
7. ⏳ Implement unit tests (CLI components)
8. ⏳ Implement integration tests
9. ⏳ Implement E2E tests
10. ⏳ Set up CI/CD integration

---

**Status**: Design complete, ready for implementation
