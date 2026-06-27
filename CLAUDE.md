# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`claudenovel_plugin` is a TypeScript Claude Code extension that provides AI-assisted novel writing capabilities. It exposes a `/novel` slash command and an MCP SQLite server that Claude queries directly for story metadata.

The publishable npm package lives under `project/`. There is no separate front-end or server — everything runs locally inside Claude Code.

## Repository structure — PROJECT-SPECIFIC OVERRIDE

> **This overrides the global `~/.claude/CLAUDE.md` layout rules for this project only.**
> The global rules say `/project` is "application code only, pushed to dev" and that
> `/tests` and `/docs` are "never pushed". For **this** repo those rules do NOT apply.

- **The git repository is rooted at the workspace root** (`/`), not at `project/`.
  There is exactly one repo; do not create a nested `.git` inside `project/`.
- **All dev files live in the repo and are pushed**: `tests/`, `docs/`, `archive/`,
  `BUGS.md`, `TODO.md`, `CLAUDE.md`, `.claude/`, plus the package under `project/`.
- **The publishable npm package is `project/`.** `npm publish` runs from there;
  `package.json`'s `files` field controls what ships to npm (a subset of `project/`).
  Repo contents and npm-package contents are intentionally different sets.
- **Tests stay in the top-level `tests/`** (not inside `project/`), and run via the
  vitest config in `project/` (which includes `../tests/**`).

### Development setup

```bash
cd project && npm install   # restores node_modules (never committed)
npm run build               # tsc → project/dist
npm test                    # vitest
```

`node_modules/` and `dist/` are gitignored — clone, then `npm install` to restore
them. `package-lock.json` is committed so `npm ci` reproduces the exact tree.

### Release branching convention (MANDATORY)

**Every time we push to `main`, also create and push a `release/v<version>` branch
on the remote** pointing at the same commit, where `<version>` is the current
version in `project/package.json`. This preserves a per-version snapshot for history
and maintenance.

```bash
# after the push to main:
VERSION=$(node -p "require('./project/package.json').version")
git branch "release/v$VERSION" main          # skip if it already exists
git push origin "refs/heads/release/v$VERSION:refs/heads/release/v$VERSION"
```

- The branch name is `release/v<major>.<minor>.<patch>` (e.g. `release/v0.1.1`).
- If a `release/v<version>` branch already exists for the current version, update it
  to the new `main` commit instead of erroring.
- Use the `release/` prefix — never a bare `v<version>` branch — so it never
  collides with the matching `v<version>` git tag.

## Build & Dev Commands

All commands run from `claudenovel_plugin/`:

```bash
npm run build          # tsc compile to dist/
npm run dev            # tsc --watch
npm run lint           # eslint src --ext .ts
npm run format         # prettier --write "src/**/*.ts"
npm test               # vitest (all tests)
npm run test:unit      # vitest run tests/unit
npm run test:coverage  # vitest run --coverage
```

Requires Node ≥ 18. The compiled output goes to `dist/`; the entry point is `dist/index.js`.

## Architecture

### Data layer: MCP SQLite server

The extension never touches SQLite directly. Instead it talks to an `mcp-sqlite` server process (spawned by Claude Code via the `claudeCode.extension.mcpServers` config in `package.json`) using the `MCPClient` interface in `src/core/database.ts`. All reads use `mcpClient.readQuery()`, all writes use `mcpClient.writeQuery()`. The database lives at `<project>/.novel/data.db` and is initialised from `schema.sql` on first run.

`DatabaseManager` wraps `MCPClient` and exposes higher-level helpers (project CRUD, health views, plot threads, writing streak). Every subsystem receives `mcpClient` + `projectId` at construction time — there is no global state.

### NovelWriterExtension (src/index.ts)

The facade that wires everything together. Callers:
1. Construct it with a `projectPath`.
2. Call `initialize()` (new project) or `setProjectId()` (existing).
3. Access subsystems via `get*()` factory methods (e.g. `getCharacterSync()`, `getConsistencyChecker()`).

### CLI layer (src/cli/)

- `NovelCLI` / `handleNovelCommand()` — parses the slash-command string and dispatches to registered commands.
- `CommandRegistry` — maps command names → `Command` objects; supports aliases and Levenshtein-based "did you mean" suggestions.
- `parser.ts` — tokenises the command string, validates flags, and converts types.
- Each command is declared in `src/cli/commands/*.ts` and its handler in `src/cli/handlers/*.ts`.

Registered commands: `init`, `create`, `list`, `sync`, `chapter`, `scene`, `character`, `location`, `plot`, `world-rule`, `timeline`, `session`, `progress`, `check`, `export`, `generate`.

### Sync layer (src/sync/)

One sync class per entity type (`CharacterSync`, `ChapterSync`, `SceneSync`, `LocationSync`, `PlotSync`, `PlotThreadSync`, `WorldRulesSync`, `TimelineSync`). Each reads a YAML/Markdown file and upserts into the database via the MCP client. Chapter files use YAML frontmatter; character/location/plot/world-rule files are plain YAML.

### Builders (src/builders/)

Interactive constructors that prompt the user (via a `PromptFunction` callback) and write YAML/Markdown files. After creation, callers typically invoke the corresponding sync class to push the new entity into the database. `ManuscriptAssembler` collects chapter files and produces an assembled export.

### Context assembly (src/context/scene-context.ts)

`SceneContextAssembler.assembleContext(sceneId)` fires ~6 parallel MCP queries to load the scene, its chapter, characters, location, world rules, plot threads, recent chapter summaries, and timeline events. The result is a typed `SceneContext` that `formatContextAsMarkdown()` turns into a prompt block for AI generation calls.

### Consistency checker (src/consistency/checker.ts)

`ConsistencyChecker.checkAll()` runs four checks in parallel:
- Character attribute contradictions (same attribute, different values across chapters)
- Timeline dependency violations (timestamps out of order)
- Undocumented hard world rules
- High-priority unresolved plot threads

Issues are de-duplicated and written back to the `consistency_issues` table.

### AI generation (src/ai/)

`ClaudeClient` wraps `@anthropic-ai/sdk`. `GenerationManager` assembles project context via MCP queries and calls Claude for character profiles, location descriptions, scene continuations (3 alternatives), dialogue enhancement, and plot development suggestions. All prompts embed the author-voice principle: "Suggest, don't dictate."

## Key Files

| Path | Purpose |
|---|---|
| `src/types/novel.ts` | All shared TypeScript types and YAML schema interfaces |
| `src/core/database.ts` | `DatabaseManager`, `MCPClient` interface, `MCPSQLiteClient` |
| `src/index.ts` | `NovelWriterExtension` facade + all re-exports |
| `src/cli/index.ts` | `NovelCLI`, `handleNovelCommand` entry point |
| `src/cli/registry.ts` | Command registration and lookup |
| `schema.sql` | SQLite schema (26 tables, views, indexes) |
| `package.json` | `claudeCode.extension.mcpServers` MCP config |

## Novel Project Structure (at runtime)

When a user runs `/novel init`, the following is created inside their novel directory:

```
<novel>/
├── .novel/
│   └── data.db          # SQLite database
├── characters/          # YAML character profiles
├── locations/           # YAML location files
├── chapters/            # Markdown chapter files (YAML frontmatter)
├── research/
├── revisions/
└── export/
```

## Deployment

After any round of changes, rebuild and the global symlink picks up the new `dist/` automatically:

```bash
cd claudenovel_plugin && npm run build
```

The package is installed globally as a symlink (`npm list -g claude-novel-writer` shows the path). No `npm install -g` needed after a build.

## Type Conventions

- All entities have a numeric `id` and `projectId` — never use raw SQL without binding both.
- YAML file interfaces (`CharacterYAML`, `LocationYAML`, `PlotYAML`, `WorldRuleYAML`) in `src/types/novel.ts` are the contract between disk files and the sync layer.
- `MCPClient` is always injected, never instantiated inside subsystems — makes mocking straightforward.
- `strict: true` TypeScript; avoid `any` except in MCP query results where the shape is not statically known.
