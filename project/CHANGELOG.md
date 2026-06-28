# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-06-28

### Changed (MCP server — passthrough rewrite)
- The `novel-tools` MCP server was a parallel, hand-written set of ~40 tools
  that had drifted badly behind the CLI and was broken against the current
  schema (it queried a non-existent `projects.project_path` column and a
  `novel.db` file the app never creates). It is replaced by a **single `novel`
  passthrough tool** that runs any CLI command in a project and returns its
  output. The CLI's `CommandRegistry` is now the single source of truth, so the
  MCP surface can never drift again — the tool's description points callers at
  `help` / `help <command>` to discover the live command + argument list.
  (`mcp-server/novel-tools/`: `handlers.ts` + `tools.ts` removed; `index.ts`
  rewritten; `launch.js` refactored for testability.)

### Fixed (correctness bugs surfaced by coverage work)
- **`session`, `location`, and `timeline` commands were non-functional** on a
  real project: each handler built a `NovelWriterExtension` but never resolved
  the project id, so every DB operation threw "Project ID not set" (timeline was
  entirely broken; session start/end/stats and progress always failed). All
  three now call `loadProjectId()`. (BUGS.md CLI-02)
- **`/novel foreshadow` was unreachable** — the command and its handler existed
  and were tested, but the command was never registered in the CLI registry.
  Now registered. (BUGS.md CLI-03)
- **`check characters` / `check timeline` / `check plot-threads` silently
  reported no issues** (and `check list` showed `[undefined]` badges) — the
  handlers read camelCase fields off raw snake_case rows; `getOpenIssues()` now
  maps to the typed `ConsistencyIssue` shape. (BUGS.md CHECK-01/02)
- **`generate next-sentence` always failed** — it queried `scenes.content` /
  `scenes.project_id`, which don't exist; now reads the scene's chapter summary
  via a valid join. (BUGS.md SQL-04)
- **`world-rule established` could throw an FK violation** — a chapter *number*
  was written into the `established_chapter_id` (FK → `chapters.id`); both sync
  directions now resolve number↔id. (BUGS.md SQL-05)
- **Character files with a quote in an attribute** (e.g. `height: 5'9"`) produced
  invalid YAML that broke sync — values are now escaped. (BUGS.md DATA-01)
- `--tension 0` / `--mood 0` no longer bypass range validation. (BUGS.md VAL-01)
- `scene-handler` resolves the real project id instead of hardcoding 1. (BUGS.md ROBUST-01)

### Added (v0.2.0 craft features — round 2)
- **`novel revise <chapter> [--apply <categories>|--all]`** — diff-gated
  mechanical prose fixes (doubled words, redundant intensifiers, adverb dialogue
  tags, straight→curly quotes, multiple/trailing whitespace). Dry-run preview by
  default; applies only the categories you opt into. Distinct from `revision`
  (snapshots).
- **`novel structure list|apply <template>|status`** — story-structure beat
  templates (three-act, Save the Cat, Hero's Journey) mapped to word-count
  positions; `status` compares the applied plan against drafted word count.
- **`novel theme add|list|trace`** — register themes + motif words and trace
  motif density across chapters (sparkline, gaps, spikes). Deterministic.
- **`novel analyze hook [--chapter N]`** — deterministic opening-line
  hook-strength scorer (0–100) across six signals with advisory suggestions.
- **Advisory severity grading** — `analyze prose|sentences|dialogue` now grade
  flags as info/suggestion/warning relative to `style-targets.yml` (with an
  optional `allow:` list and softened wording); `--strict` restores hard flagging.
- **`novel help --json`** — machine-readable JSON schema of the whole CLI (or a
  single command), so tooling/agents can introspect commands + flags without
  parsing prose.

### Tests & coverage
- Removed `tests/e2e/gothic-horror-live.test.ts` (hardcoded to a personal
  absolute path; unrunnable elsewhere).
- Coverage scope corrected (excludes built `dist/`, `examples/`, config files).
- Comprehensive in-process handler tests added: **CLI at 96.6% statements**
  (every handler ≥90% except session-handler at 88%), **mcp-server at 93.9%**,
  project total 91.7% — up from a 55.5% project baseline. Suite: 2,445 tests.
- Six additional latent bugs documented in `BUGS.md` (CHECK-01/02, SQL-04/05,
  DATA-01, VAL-01, ROBUST-01) for follow-up.

### Fixed (Tier-0 correctness)
- `create chapter` now syncs the new chapter to the database and auto-numbers it
  (was: never synced, hardcoded chapter 1) — chapters are immediately visible to
  analysis/context/consistency.
- The CLI resolves the real project id from the database instead of hardcoding 1.
- `context build` is wired to the ContextPolicyEngine (was a stub) — assembles
  and renders real context blocks.
- Chapter summaries moved out of the deterministic sync layer (which wrote a
  placeholder) into the generation layer: `generate summary --chapter N`
  produces a ≤5-sentence summary via Claude, using the API when
  `ANTHROPIC_API_KEY` is set and otherwise the Claude Code session (passthrough).

### Added (v0.2.0 craft features)
- **`novel report`** — one-screen manuscript-health dashboard: tension sparkline,
  open plot threads, unresolved/overdue promises, scenes missing a purpose,
  chapters off their style targets, and total `[TK]` markers. Read-only.
- **`novel readaloud`** — actually speaks a chapter/scene/text via the OS TTS
  engine (Windows SAPI, macOS `say`, Linux espeak/spd-say); `--out` writes audio.
- **`novel analyze voice`** — manuscript-wide character-voice analysis: flags
  voices that sound too alike and voices that drift across chapters.
- **`novel extract --chapter N`** — discovery-writer path: scans drafted prose
  for new character/location candidates and proposes ready-to-run create commands.
- **`novel extract --file <path>`** — runs the same discovery scan over any
  prose file (e.g. a freeform outline), so a planner can bootstrap structured
  `characters/` / `plots/` entities before drafting begins.
- **`novel generate overview`** — summary of the **intended** book, assembled
  from the planned outline (plot threads + their beats) and the character
  roster (unlike `synopsis`, which summarizes drafted chapters). Works
  pre-draft; `--length brief|standard|full`, `--save` writes
  `export/overview.md`. Uses the API when `ANTHROPIC_API_KEY` is set, otherwise
  the Claude Code session (passthrough). Emits a guidance warning — pointing at
  `extract --file` — when no cast or outline exists yet.

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

[Unreleased]: https://github.com/mrskwiw/claude-novel-writer/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/mrskwiw/claude-novel-writer/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/mrskwiw/claude-novel-writer/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mrskwiw/claude-novel-writer/releases/tag/v0.1.0
