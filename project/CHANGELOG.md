# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-06-26

### Changed

**`init` command — automation-friendly (works in the Claude Code / AI environment)**
- `init` no longer blocks on interactive `readline` prompts. It now prompts
  **only** when attached to a real interactive TTY; in the Bash tool, CI, or any
  non-TTY context it runs non-interactively and never hangs.
- When `--title`/`--author` are missing in non-interactive mode, they are
  auto-derived (title from the directory name, author from `git config
  user.name`, falling back to `"Unknown Author"`) and the chosen values are
  reported instead of erroring.
- Added `--json` flag: emits a single machine-readable JSON result on stdout
  (`status`, `projectId`, `path`, `metadata`, `derived`, `created`,
  `hasExistingContent`, `nextSteps`). Implies non-interactive.
- dotenv startup banner is now suppressed (`config({ quiet: true })`) so it can
  no longer corrupt `--json` output on stdout.
- `--skip-prompts` is retained as an explicit non-interactive override; it now
  auto-derives missing fields rather than failing.

**Docs**
- Clarified in the `/novel` command guide that the `novel-db` MCP server is
  optional and for power users only. The CLI accesses the SQLite database
  directly, so the MCP server is not needed for normal use and should not be
  added during `init` or to "fix" CLI errors. (Previously the wording implied
  the MCP server was required, which confused agents during setup.)

**CLI help entries**
- Every command now ships realistic `examples` in its `/novel help <command>`
  entry. Added `examples` to: `character`, `check`, `export`, `foreshadow`,
  `generate`, `location`, `plot`, `scene`, `session`, `progress`, `timeline`,
  `world-rule`.
- `help <command>` renderer now shows a `Usage:` line, a positional
  **Arguments** section, and flag **required / choices / default** metadata
  (previously only name, alias, type, and description were shown).
- Sharpened name-echo flag descriptions on `character` (`eye-color`,
  `hair-color`, `height`).

### Added

- **Style-target engine (deterministic).** New `style-targets.yml` declares
  quantitative prose targets (sentence length, adjective/adverb density, passive
  %, show/tell, sensory coverage, em-dash/semicolon/ellipsis cadence, fragments,
  single-sentence paragraphs). New `novel-writer analyze style [--chapter N | --all]`
  measures a chapter and grades each metric against the targets (✓ / ⚠ low / ⚠ high).
  Falls back to general-fiction defaults when no file is present.
- **Starter templates shipped + scaffolded.** New `templates/` directory in the
  plugin holds starter files: `style-targets.yml`, `STRUCTURAL_STYLE_GUIDE.md`,
  `COMPOSITIONAL_STYLE_GUIDE.md`, and schema-accurate entity templates
  (`character.yml`, `location.yml`, `plot.yml`, `world-rule.yml`, `timeline.yml`,
  `chapter.md`, `README.md`). `init` now **copies** these (instead of embedding
  strings): the three functional files to the project root, and the entity
  templates into the project's `templates/` reference dir (kept out of the
  content dirs so `sync` never imports them). The generated CLAUDE.md documents
  how to use them. `init` also records an **editing-mode preference**
  (deterministic | ai) in CLAUDE.md and via `--editing-mode`.
- **Editor agents now ship with the plugin.** The Copy / Line / Developmental
  Editor (and other novel) agents moved into `agents/` at the plugin root and
  their style-guide paths were corrected to project-root-relative (were pointing
  at the `novel/` sample subdir, so they never resolved in real projects).
  `package.json` `files` now includes `agents`, `commands`, `skills`,
  `.claude-plugin`.
- `NovelWriterExtension.getProjectId()` accessor.
- **`analyze copy` now consumes the style guide.** It reads canonical character
  names from `characters/*.yml` (drives the misspelled-name check) and defaults
  the expected narrative tense from `style-targets.yml` when `--tense` is omitted.

### Fixed

- **`canon show` / `canon promote` now find their `<id>`.** The handlers read the
  positional id in a dispatch-aware way; previously they looked one slot too far
  and always reported the id as missing under real CLI dispatch.
- **MCP `novel-db` server now points at the real database.** The config pointed
  at `.novel/novel.db`, but the code uses `.novel/data.db` — corrected so the
  optional MCP server attaches to the actual database.

## [0.1.0] - 2026-06-09

### Added

**Core infrastructure**
- MCP SQLite server integration — all DB access via `MCPClient` interface
- 19-table schema with full migration system (`runMigrations`, `getMigrationTables`)
- `NovelWriterExtension` facade with lazy-loaded subsystems
- `CommandRegistry` with Levenshtein "did you mean" suggestions
- `CommandParser` with quoted-string tokenisation and short-flag support

**Content creation & sync**
- `CharacterSync`, `ChapterSync`, `SceneSync`, `LocationSync`, `PlotSync`
- `PlotThreadSync`, `WorldRulesSync`, `TimelineSync` — YAML/Markdown → DB upsert
- Interactive builders for characters, chapters, scenes, locations, plots, world rules
- `ManuscriptAssembler` with pandoc export (Markdown, DOCX, EPUB, PDF)

**Analysis layer**
- `ProseAnalyzer` — economy score, show/tell ratio, sensory balance, character voice analysis
- `PacingAnalyzer` — tension arc, POV balance, chapter lengths, ASCII chart
- `ConsistencyChecker` — attribute contradictions, timeline violations, unresolved promises
- `DraftScanner` — [TK], [TODO], [FIXME], [CHECK] marker detection with code-fence skip
- `CopyEditor` — POV slip, tense shift, name variant detection
- `DevelopmentalAnalyzer` — scene purpose audit, subplot balance, plot hole detection
- `ReadAloudPreparer` — rhythm analysis, rhyme detection, markup stripping

**Intelligence layer**
- `KnowledgeService` — narrative knowledge objects with tag and relevance queries
- `CanonService` — canon items, conflict detection and resolution
- `NarrativePromiseService` — promise/payoff tracking with fulfillment status
- `ContextPolicyEngine` — deterministic context fingerprinting (SHA-256)
- `NarrativeGraphService` — scene-level narrative graph with edge traversal

**Extended features**
- `ResearchService` — research notes with tag filtering and `[VERIFY:]` marker scanning
- `CharacterArcService` — arc milestone tracking with static-run detection
- `BetaReaderService` — reader management with feedback aggregation
- `ForeshadowingService` — foreshadowing note tracking with chapter payoff linking
- `SeriesManager` — multi-book series with shared bible and cross-book thread tracking
- `QueryTrackerService` — AI query log with tag-based retrieval
- `SnapshotManager` — LCS-based revision snapshots
- `SyncStateRepository` — conflict detection for external file edits

**AI generation**
- Scene continuation with 3 alternatives and configurable count
- Character profile, location description, dialogue enhancement
- Plot thread development suggestions
- Synopsis, query letter, pitch, and comp title generation
- POV-anchored generation with character voice loading
- Hemingway one-true-sentence mode (`generateNextSentence`)
- Name generation, premise workshopping, character sketch generation
- Opening-line workshop (`workshopOpeningLines`)

**CLI commands**
- `init`, `create`, `list`, `sync`, `chapter`, `scene`, `character`, `location`
- `plot`, `world-rule`, `timeline`, `session`, `progress`, `check`, `export`
- `generate`, `idea`, `knowledge`, `canon`, `promise`, `context`, `graph`
- `revision`, `draft`, `analyze`, `research`, `beta`, `query`, `series`, `help`

[Unreleased]: https://github.com/mrskwiw/claude-novel-writer/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/mrskwiw/claude-novel-writer/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mrskwiw/claude-novel-writer/releases/tag/v0.1.0
