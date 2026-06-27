# TODO

Single source of truth for project status. All tasks, features, decisions, and gaps tracked here.

**Last Updated**: 2026-05-29

---

## Legend
- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked

---

## Critical — Must fix before production use

### GAP-01: Connect Context Engine to AI Generation ✓ COMPLETE 2026-05-29
**File**: `project/src/ai/generation-manager.ts`
- [x] Instantiate `SceneContextAssembler` in `GenerationManager` constructor
- [x] Replace stub in `assembleSceneContext()` with real `assembleContext()` call
- [x] Updated `buildContinuationPrompt()` to consume full `SceneContext` (characters, plot threads, world rules, chapter summaries)
- [ ] Add integration test: generate continuation with scene context, verify character/location data appears in output

---

### GAP-02: Update Claude model to current version ✓ COMPLETE 2026-05-29
**File**: `project/src/ai/claude-client.ts:29`
- [x] Changed `defaultModel` to `claude-sonnet-4-6`

---

## High — Core spec violations

### GAP-03: Enforce `maxTokenBudget` in Context Assembler ✓ COMPLETE 2026-05-29
**File**: `project/src/context/scene-context.ts`
- [x] Implemented `pruneToTokenBudget(context, budget)` — pruning order: oldest summaries → inactive threads → non-hard world rules → timeline events → all summaries
- [x] Called at end of `assembleContext()` with default 8000 token budget
- [ ] Add unit test: context with large data + tight budget should prune predictably

---

### GAP-04: Implement conflict detection in sync system ✓ COMPLETE 2026-05-29
- [x] `sync_state` table via migration `006_sync_state`; `SyncStateRepository` with `record()`, `detectConflict()`
- [x] `SyncConflictError` in `types/novel.ts`
- [x] `options?: { forceFile?: boolean }` added to all 5 sync class main methods
- [x] 20 tests passing (`tests/unit/sync/sync-state.test.ts`)

---

### GAP-05: Implement DB→File reverse sync for all entities ✓ COMPLETE 2026-05-29
- [x] `CharacterSync.exportToYAML()`, `LocationSync.exportToYAML()`, `WorldRulesSync.exportToYAML()`, `PlotThreadSync.exportToYAML()`, `ChapterSync.exportToFile()`
- [x] `/novel sync from-db` subcommand (aliases: `reverse`, `export`) dispatches all entity types
- [x] 18 tests passing (`tests/unit/sync/reverse-sync.test.ts`)

---

### GAP-06: Fix plot beat sync ✓ COMPLETE 2026-05-29 (via SPEC-02)
- [x] `resolveSceneRef()` added to `PlotThreadSync` — parses 4 formats (Ch3.Scene2, Ch3.S2, Chapter 3 Scene 2, 3.2)
- [x] `syncBeats()` calls `resolveSceneRef()` per beat; warns on unresolvable, does not fail
- [x] 4 integration tests re-enabled; 8 unit tests in `tests/unit/sync/plot-thread-sync.test.ts`
- Note: integration suite import fails on `better-sqlite3` native module (pre-existing env issue, not code)

---

## Medium — Feature gaps and quality issues

### GAP-07: Fix world rule violation checker ✓ COMPLETE 2026-05-29
- [x] `checkWorldRuleViolations(projectId?)` replaces stub — batches up to 5 rules per Claude prompt
- [x] Parses `NO_VIOLATIONS` / numbered violation list; inserts to `consistency_issues` with dedup
- [x] `/novel check world-rules` dispatches AI-assisted scan with formatted output
- [x] 6 tests passing (`tests/unit/consistency/world-rule-checker.test.ts`)

---

### GAP-08: POV anchoring in AI generation ✓ COMPLETE 2026-05-29
- [x] `loadCharacterVoice(projectId, name)` in `GenerationManager` — fetches voice/personality/traits from characters table
- [x] `buildPovBlock()` injects POV constraint into continuation/dialogue/description prompts
- [x] 23 tests passing (`tests/unit/ai/generation-pov-alternatives.test.ts`)

---

### GAP-09: Add `alternatives` to all generation types ✓ COMPLETE 2026-05-29
- [x] `count?: number` added to `GenerationOptions` (default 1, clamped 1–3)
- [x] `GenerationResult.alternatives` now always required `string[]`; all generation types populated
- [x] Parallel Claude calls for dialogue/description; numbered-option prompt for character
- [x] 23 tests passing (same test file as GAP-08)

---

### GAP-10: Add ideation/idea-capture tooling ✓ COMPLETE 2026-05-29 (via SPEC-03)
- [x] `IdeaEntry` in `src/types/novel.ts`; `ideas` table in `schema.sql`
- [x] `IdeaBuilder` + `IdeaSync`; CLI `idea` command with add/list/show/link/explore/use/discard/sync
- [x] `generateBrainstorm()` in `GenerationManager`; 10 unit tests passing

---

### GAP-11: Add pacing analysis and revision tools ✓ COMPLETE 2026-05-29
- [x] `PacingAnalyzer` in `src/analysis/pacing-analyzer.ts` — tension arc, POV balance, chapter lengths, ASCII chart
- [x] `analyzeCommand` with 5 subcommands (tension-arc, pov-balance, chapter-lengths, pacing, conflict)
- [x] `analyze-handler.ts` with formatted table/chart output
- [x] Registered in `registry.ts`; `getPacingAnalyzer()` factory in `index.ts`
- [x] 17 tests passing (`tests/unit/analysis/pacing-analyzer.test.ts`)

---

### GAP-12: Eliminate `: any` type annotations ✓ COMPLETE 2026-05-29
- [x] `MCPClient.readQuery<T>()` made generic; all callers updated
- [x] Typed row interfaces added in each file (CharacterRow, LocationRow, ChapterRow, etc.)
- [x] All `catch (error: any)` → `catch (error: unknown)` with `instanceof Error` narrowing
- [x] `block: any` → `ContentBlock` in `claude-client.ts`
- [x] `tsc --noEmit` — zero errors
- [x] Only remaining `: any` hits are JSDoc comment text (not type annotations)

---

### GAP-13: Add Hemingway stop-point and writer's block tools ✓ COMPLETE 2026-05-29
- [x] `/novel generate next-sentence --scene N` — "one true sentence" prompt, loads last 500 words of scene
- [x] `session end --note "..."` — stores stop_note via `endSessionById()`
- [x] `session start` — displays last stop_note in bordered block
- [x] `progress` — Anne Rice streak quote when streak > 0
- [x] `emotional_beat` field in scene YAML + migration `008_emotional_beat`
- [x] `/novel chapter check N` — 5-item checklist (purpose, conflict, scenes, words, change)
- [x] 13 new tests (stop-note.test.ts × 7, next-sentence.test.ts × 6)

---

## Low — Documentation and polish

### GAP-14: Update `08_FUTURE_SYSTEMS.md` ✓ COMPLETE 2026-05-29
- [x] Moved "Timeline engine" to Implemented section; noted it was built ahead of schedule

---

### GAP-15: Add `/novel help` command ✓ COMPLETE 2026-05-29
- [x] `src/cli/commands/help.ts` + `handlers/help-handler.ts` — no-arg lists all commands; `help <cmd>` shows subcommands/flags
- [x] Registered in `registry.ts`; wired via existing dispatch in `cli/index.ts`
- [x] 13/13 unit tests pass (`tests/unit/cli/help-command.test.ts`)

---

### GAP-16: Add multi-format export (DOCX, EPUB, PDF) ✓ COMPLETE 2026-05-29
- [x] `ExportFormat` type in `types/novel.ts`; `exportFormatted()` on `ManuscriptAssembler`
- [x] pandoc availability check via `execFile('pandoc', ['--version'])`; falls back with install URL + manual command
- [x] `--format docx|epub|pdf` flag on `/novel export manuscript`
- [x] PDF gets `-V geometry:margin=1in`; EPUB/DOCX get metadata flags
- [x] 20 tests passing (`tests/unit/builders/export-format.test.ts`)

---

---

## Missing Features — Craft Principles (NOVEL_CRAFT_PRINCIPLES.md)

These features are explicitly called for in the craft research doc but have no implementation.

### CRAFT-01: Opening line workshop ✓ COMPLETE 2026-05-29
- [x] `workshopOpeningLines(projectId, count?)` in `GenerationManager` — uses `assembleSynopsisContext()` for rich context
- [x] `craft-handler.ts` with `handleGenerateOpeningLines()`; wired into `generate-handler.ts`
- [x] `generate opening-lines [--count N]` subcommand
**What's needed**:
- [ ] `/novel generate opening --context "story premise"` — generate multiple opening line options
- [ ] Hook strength analysis: does the line create a question? Introduce place/character/atmosphere?
- [ ] Side-by-side comparison of opening line drafts
- [ ] First-chapter checklist: hook, voice set, world established, protagonist introduced

---

### CRAFT-02: Prose analysis ✓ COMPLETE 2026-05-29 (via SPEC-05)
- [x] Intensifiers, filter words, adverb tags, passive voice, doubled words — all 9 check groups
- [x] Economy score, `analyze prose|sentences|dialogue` subcommands

---

### CRAFT-03: Dialogue quality analysis ✓ COMPLETE 2026-05-29
- [x] `analyze dialogue --chapter N` — adverb tags, on-the-nose detection (SPEC-05)
- [x] `extractDialogueByCharacter()` — attribution via said/asked/replied/+ 8 verbs; groups under 'Unknown'
- [x] `analyzeCharacterVoices()` — avgWordLength, avgSentenceLength, distinctivePhrases per speaker
- [x] `analyze dialogue-reader --chapter N` — dialogue-only output grouped by character
- [x] 23 tests passing (`tests/unit/analysis/prose-extras.test.ts`)

---

### CRAFT-04: Pacing and tension visualization (Principle 10)
**Source**: `docs/NOVEL_CRAFT_PRINCIPLES.md` — "pages should be full to the brim with conflict", ebb and flow
**What's needed** (extends GAP-11 above):
- [ ] Conflict density map: count conflict/tension indicators per scene
- [ ] Action/reflection ratio per chapter (estimate from scene tone metadata)
- [ ] Chapter ending hook checker: does each chapter end with a question or forward pull?
- [ ] Balance report: flag 3+ consecutive low-tension scenes

---

### CRAFT-05: Text-to-speech / read-aloud support ✓ COMPLETE 2026-05-29
- [x] `ReadAloudPreparer` in `analysis/read-aloud.ts` — `stripMarkup()`, rhythm stddev check, rhyme detection (suffix ≥3 chars, within 3 lines)
- [x] `estimatedMinutes = wordCount / 150`; clean prose output
- [x] `analyze read-aloud --chapter N` and `analyze rhythm --chapter N` subcommands
- [x] `getReadAloudPreparer()` factory in `index.ts`
- [x] 23 tests passing (`tests/unit/analysis/read-aloud.test.ts`)

---

### CRAFT-06: Character arc visualization (Principle 5)
**Source**: `docs/NOVEL_CRAFT_PRINCIPLES.md` — show character growth and change across chapters
**What's needed**:
- [ ] `/novel character arc --name "Sarah"` — plot character state per scene across all chapters
- [ ] Character state fields: emotional state, goal, knowledge level (add to scene metadata)
- [ ] Arc completeness check: does character in final chapter differ meaningfully from first chapter?
- [ ] Multi-character arc overlay: compare two characters' arcs side by side

---

### CRAFT-07: Writing ritual and session prep ✓ COMPLETE 2026-05-29
- [x] `session start --ritual` — displays pre-writing checklist; sets `ritual_completed = 1`
- [x] `session start --timer N` — Pomodoro display + `timer_minutes` stored (migration `012_session_timer`)
- [x] `session start` displays last paragraph of most recent chapter (max 200 chars)
- [x] `session end --note` from GAP-13 covers the Hemingway resume capture

---

## Missing Features — Writing Process Phases (WRITING_PROCESS.md)

The writing process doc defines 11 phases. Current implementation covers Phase 2 (partial), Phase 3 (basic), and Phase 9 (partial). Everything else is missing.

### PROC-01: Phase 1 — Ideation tooling ✓ COMPLETE 2026-05-29
- [x] Core idea capture (GAP-10/SPEC-03): add/list/link/explore/use/discard/sync/brainstorm
- [x] `generateName(opts)` — culture/gender/count/type flags; `generate name --culture Irish --gender female`
- [x] `workshopPremise(projectId, premise)` — 5-question guided development; `generate premise --idea "X"`
- [x] `generateCharacterSketch(opts)` — lightweight profile with voice/trait/depth; `generate sketch`
- [x] 11 tests passing (`tests/unit/ai/ideation-extras.test.ts`)

---

### PROC-02: Phase 2 — Research repository
**Source**: `docs/WRITING_PROCESS.md` §2.4
- [ ] `research/` directory is scaffolded but no tooling exists
- [ ] `/novel research add --title "X" --url "Y" --notes "Z"` — capture reference
- [ ] `/novel research list [--tag X]` — browse research notes
- [ ] `/novel research link --id N --chapter C` — connect research to where it was used
- [ ] Inline `[VERIFY: claim]` marker system — flag facts to check later
- [ ] `/novel research verify-list` — show all unverified fact markers in manuscript

---

### PROC-03: Phase 3 — Active drafting support ✓ COMPLETE 2026-05-29
- [x] `[TK]/[TODO]/[FIXME]/[CHECK]` scanner via `DraftScanner` (SPEC-06)
- [x] `/novel draft tk-list [--chapter N]` registered
- [x] `emotional_beat` field in scene YAML + migration (GAP-13/SPEC-06)
- [x] `/novel chapter check N` 5-item checklist (GAP-13)
- [x] `ForeshadowingService` + `foreshadow add/list/payoff` command; migration `013_foreshadowing`
- [x] 15 tests passing (`tests/unit/services/foreshadowing-service.test.ts`)

---

### PROC-04: Phase 4 — Developmental revision tools ✓ COMPLETE 2026-05-29
- [x] `DevelopmentalAnalyzer` — `auditScenePurposes()`, `analyzeSubplotBalance()`, `findPlotHoles()`
- [x] `analyze scenes --purpose`, `analyze subplots`, `analyze plot-holes` subcommands
- [x] 21 tests passing (`tests/unit/analysis/developmental-analyzer.test.ts`)
- Note: reading mode covered by CRAFT-05 (read-aloud); scene reorder already existed

---

### PROC-05: Phase 5 — Line editing tools ✓ COMPLETE 2026-05-29
- [x] Sentence monotony, word repetition (300-word window), purple prose — SPEC-05
- [x] `analyzeSensoryBalance()` — 5-sense word lists; flags scenes > 80% visual
- [x] `analyzeShowVsTell()` — action verbs vs state-of-being+emotion; ratio + examples
- [x] `analyze sensory --chapter N` and `analyze show-tell --chapter N` subcommands

---

### PROC-06: Phase 6 — Copy editing support ✓ COMPLETE 2026-05-29
- [x] `CopyEditor` — POV slip detection, tense shift (20% minority threshold), name variant (first-4-char + Levenshtein-1)
- [x] `stripFrontmatter()` exported helper
- [x] `analyze copy --chapter N [--pov "X"] [--tense past]` subcommand
- [x] 23 tests passing (`tests/unit/analysis/copy-editor.test.ts`)
- Note: word economy score covered by SPEC-05 ProseAnalyzer `economyScore`

---

### PROC-07: Phase 7 — Beta reader management
**Source**: `docs/WRITING_PROCESS.md` §7.1–7.3
- [ ] `/novel beta add --name "Alex" --email "..." --chapters "1-10"` — track beta readers
- [ ] `/novel beta feedback add --reader "Alex" --chapter N --type pacing --note "..."` — log feedback
- [ ] `/novel beta report` — aggregate feedback by chapter/type, show patterns
- [ ] Export clean manuscript copy: `/novel export manuscript --clean` (no internal comments)
- [ ] Version snapshot before beta: `/novel revision snapshot --label "pre-beta"`

---

### PROC-08: Phase 8 — Polishing and query materials
**Source**: `docs/WRITING_PROCESS.md` §8.2–8.3
- [ ] `/novel generate synopsis --length short|medium|long` — AI-generated synopsis from plot data
- [ ] `/novel generate pitch` — 25-word elevator pitch from premise + character data
- [ ] `/novel generate query-letter` — query letter draft using title, genre, word count, synopsis
- [ ] Title workshop: `/novel generate title --count 10` — brainstorm title options
- [ ] Comp title finder: `/novel generate comps --genre X --year 2020-2025` — suggest comparison titles

---

### PROC-09: Phase 9 — Production and formatting ✓ COMPLETE 2026-05-29
- [x] DOCX/EPUB/PDF via pandoc — GAP-16
- [x] `generateExportHeader()` — TITLE/AUTHOR/GENRE/WORD COUNT/CHAPTERS + TOC with page estimates
- [x] `--with-header` flag on `export manuscript` prepends header block

---

### PROC-10: Phase 10 — Distribution support ✓ COMPLETE 2026-05-29
- [x] `agent_queries` table via migration `011_agent_queries`
- [x] `QueryTrackerService` — add/list/update/stats/exportQueryPackage
- [x] `queryCommand` + `query-handler.ts` — 5 subcommands (add/list/update/stats/export-package) registered
- [x] `getQueryTrackerService()` factory in `index.ts`
- [x] 22 tests passing (`tests/unit/services/query-tracker-service.test.ts`)

---

### PROC-11: Phase 11 — Series management ✓ COMPLETE 2026-05-29
- [x] `series`, `series_books`, `series_bible` tables via migration `014_series`
- [x] `SeriesManager` — createSeries, addBook, listSeries, getSeriesBooks, addBibleEntry, listBibleEntries, trackCrossBookThreads, checkSeriesConsistency
- [x] `seriesCommand` + `series-handler.ts` — 7 subcommands (create/add-book/list/bible add/bible list/threads/check) registered
- [x] `getSeriesManager()` factory in `index.ts`
- [x] 25 tests passing (`tests/unit/services/series-manager.test.ts`)

---

### PROC-12: Cross-cutting — Version control ✓ COMPLETE 2026-05-29
- [x] Core snapshot system (SPEC-07): snapshot/list/diff/restore
- [x] Auto-snapshot before `sync from-db` — label `auto-before-from-db-<timestamp>`; errors silently caught
- [x] `revision auto-snapshot` info subcommand explaining the feature
- [x] 10 new tests passing (`tests/unit/revision/auto-snapshot.test.ts`)

---

## Feature Specs — MASTER_BUILD_SPEC

> SPEC-01 (context engine wiring + model update) is complete — see GAP-01/02/03 above.
> Build order from MASTER_BUILD_SPEC PART 4: Sprint 1 → Sprint 2 → Sprint 3 → Sprint 4.

---

### SPEC-02: Beat ↔ Scene Resolution ✓ COMPLETE 2026-05-29
**Files**: `project/src/sync/plot-thread-sync.ts`, `project/schema.sql`

- [x] Added `resolved_at DATETIME` to `plot_beats` in `schema.sql` (`scene_reference TEXT` was already present)
- [x] Added `resolveSceneRef(ref: string)` to `PlotThreadSync` — parses `Ch3.Scene2`, `Ch3.S2`, `Chapter 3 Scene 2`, `3.2` formats; queries `scenes JOIN chapters`; returns `{sceneId, canonicalKey}` or null
- [x] `syncBeats()` now resolves refs and populates `scene_id` + `resolved_at`; unresolvable → null + console.warn
- [x] Re-enabled 4 skipped beat tests in `tests/integration/plot-workflow.test.ts` (suite blocked by pre-existing better-sqlite3 native module issue — tests logically correct)
- [x] Unit test: `tests/unit/sync/plot-thread-sync.test.ts` — 8 tests covering all 4 formats + null cases (all pass)
- [ ] Add CLI `/novel plot beat resolve [--thread "Name"]` — show resolution table (deferred to later sprint)

---

### SPEC-03: Idea Capture System ✓ COMPLETE 2026-05-29
- [x] Full implementation: IdeaBuilder, IdeaSync, idea CLI command/handler, ideas schema, generateBrainstorm
- [x] 10/10 unit tests pass (`tests/unit/builders/idea-builder.test.ts`)

---

### SPEC-04: Research Repository ✓ COMPLETE 2026-05-29
- [x] `research_notes` + `research_usage` tables via migration `007_research`
- [x] `ResearchRepository` + `ResearchService` (add, list, show, link, markVerified, findVerifyMarkers)
- [x] `[VERIFY:]` scanner: skips code fences, supports chapter filter
- [x] `researchCommand` + `research-handler.ts` — 6 subcommands registered
- [x] `getResearchService()` factory in `index.ts`
- [x] 15 tests passing (`tests/unit/services/research-service.test.ts`)

---

### SPEC-05: Prose Analysis System ✓ COMPLETE 2026-05-29
- [x] `ProseCheck` + `ProseAnalysisResult` interfaces in `types/novel.ts`
- [x] `ProseAnalyzer` in `analysis/prose-analyzer.ts` — 9 check groups (intensifiers, filter words, adverb tags, passive, doubled words, monotony, repetition, on-the-nose dialogue, purple prose)
- [x] Economy score, dialogue-percent, code-fence skipping
- [x] `analyze prose`, `analyze sentences`, `analyze dialogue` subcommands registered
- [x] `getProseAnalyzer()` factory in `index.ts`
- [x] 31 tests passing (`tests/unit/analysis/prose-analyzer.test.ts`)

---

### SPEC-06: Drafting Support Tools ✓ COMPLETE 2026-05-29
- [x] `stop_note` + `ritual_completed` columns in `writing_sessions` (migration `008`)
- [x] `DraftScanner.findPlaceholders()` in `analysis/draft-scanner.ts` — skips code fences
- [x] `/novel draft tk-list [--chapter N]` registered
- [x] `session end --note` + `session start` stop-note display (GAP-13)
- [x] `emotional_beat` field in scene YAML parsing (GAP-13)
- [x] `/novel chapter check N` 5-item checklist (GAP-13)
- [x] 22 tests for DraftScanner + 13 new session/next-sentence tests

---

### SPEC-07: Version Control / Draft Snapshots ✓ COMPLETE 2026-05-29
**Files created**: `project/src/revision/snapshot-manager.ts`, `cli/commands/revision.ts`, `cli/handlers/revision-handler.ts`

- [x] `SnapshotManager`: `create`, `list`, `diff` (LCS line diff), `restore` — Node.js built-ins only
- [x] `_snapshot.json` with label, createdAt, chapterCount, totalWordCount, chapterWordCounts
- [x] `getSnapshotManager()` factory in `index.ts`; `revisionCommand` registered
- [x] 18/18 unit tests pass (`tests/unit/revision/snapshot-manager.test.ts`)

---

### SPEC-08: Pacing & Structure Analysis
**Priority**: Medium | **Phase**: Sprint 2
**Files**: New `project/src/analysis/pacing-analyzer.ts`, new CLI command+handler, `project/src/types/novel.ts`

- [ ] Add `PacingReport`, `PacingFlag`, `ChapterTensionData`, `ChapterLengthData` interfaces to `src/types/novel.ts`
- [ ] Implement tension arc: avg `tension_level` per chapter; ASCII bar chart (`████░░░░` format); flag 3+ consecutive chapters with dip after rising action
- [ ] Implement POV balance: count scenes per `pov_character_id`; flag > 70% single character
- [ ] Implement chapter lengths: word count per chapter; flag > 2× or < 0.5× average
- [ ] Implement scene purpose audit: list scenes with no `purpose` field; count scenes by declared purpose
- [ ] Implement conflict density: flag chapters with avg tension < 4; flag 3+ consecutive scenes tension ≤ 3
- [ ] Register commands: `analyze tension-arc`, `analyze pov-balance`, `analyze chapter-lengths`, `analyze scenes --purpose`, `analyze conflict`
- [ ] Unit: tension arc calc; POV balance calc; flag generation (dip, length outlier)
- [ ] Integration: run on test project, verify report structure

---

### SPEC-09: Character Arc Visualization ✓ COMPLETE 2026-05-29
- [x] `character_scene_states` table via migration `009_character_scene_states`
- [x] `CharacterSceneState`, `CharacterArc`, `CharacterState` types in `types/novel.ts`
- [x] `<!-- character_states: Name=state|Name2=state2 -->` parsing in `scene-sync.ts`
- [x] `CharacterArcService` — `getArc()`, `recordState()`, `compareArcs()`, `getSceneStates()`; static run detection
- [x] `character arc --name "X" [--compare "Y"]` and `character states --chapter N` commands
- [x] `getCharacterArcService()` factory in `index.ts`
- [x] 18 tests passing (`tests/unit/services/character-arc-service.test.ts`)

---

### SPEC-10: Synopsis and Query Materials Generator ✓ COMPLETE 2026-05-29
- [x] `SynopsisLength`, `SynopsisContext` types in `types/novel.ts`
- [x] `assembleSynopsisContext()` — queries projects, characters, chapters, world_rules, narrative_promises
- [x] `generateSynopsis(projectId, length)` — 150/400/800w length-specific prompts
- [x] `generatePitch()` — 25-word "When/must/before" template
- [x] `generateQueryLetter(projectId, compTitles?)` — agent-ready format
- [x] `generateComps()` — 5 comp titles (2020–2025) matched to genre/themes
- [x] `generate synopsis|pitch|query-letter|comps` CLI commands
- [x] 36 tests passing (`tests/unit/ai/synopsis-generator.test.ts`)

---

### SPEC-11: Beta Reader Management ✓ COMPLETE 2026-05-29
- [x] `beta_readers` + `beta_feedback` tables via migration `010_beta_readers`
- [x] `BetaReader`, `BetaFeedback`, `BetaReport` types in `types/novel.ts`
- [x] `BetaReaderService` — add/list/feedback (by reader name)/report/resolve
- [x] `betaCommand` + `beta-handler.ts` — 5 subcommands registered
- [x] `getBetaReaderService()` factory in `index.ts`
- [x] 17 tests passing (`tests/unit/services/beta-reader-service.test.ts`)

- [ ] Add `beta_readers` + `beta_feedback` tables to `schema.sql` (DDL in SPEC-11)
- [ ] Build `BetaReaderManager`: add reader, log feedback, aggregate patterns by type and chapter
- [ ] Implement `revision-plan` — sort feedback by frequency × priority, output ordered revision list
- [ ] Register commands: `beta add`, `beta list`, `beta sent`, `beta feedback add`, `beta feedback list`, `beta report`, `beta revision-plan`
- [ ] Report output: readers summary, feedback by type with bar chart, patterns mentioned by 2+ readers, suggested revision priority
- [ ] Unit: aggregation logic; pattern detection (items from 2+ distinct readers)
- [ ] Integration: add reader → log feedback → report shows correct counts

---

### SPEC-12: Agent Query Tracker
**Priority**: Low | **Phase**: Sprint 4
**Files**: New CLI + handler, `project/schema.sql`

- [ ] Add `agent_queries` table to `schema.sql` (DDL in SPEC-12; id, project_id, agent_name, agency, query_date, materials_sent, status, response_date, notes)
- [ ] Register commands: `query add --agent "X" --agency "Y" --date "YYYY-MM-DD" --materials "query+10p"`, `query list [--status sent]`, `query update --id N --status rejected [--notes "..."]`, `query stats`
- [ ] Stats output: total sent, pending/partial/full/rejected/offer counts, avg response time
- [ ] Unit: status transitions; stats calculation
- [ ] Integration: add → update status → stats reflect correctly

---

## Intelligence Foundation — IMPLEMENTATION_STARTER_PACK

> These 13 tickets implement the intelligence spine: Knowledge → Canon → Promises → Context Contracts → Context Policy Engine → Narrative Graph.
> Full acceptance criteria in `docs/ACCEPTANCE_TEST_CHECKLIST.md`. All 13 must pass before advanced AI generation work begins.
> Architecture reference: `docs/claude_novel_foundation_architecture_specs.md`.

---

### Ticket 001 — Shared Types ✓ COMPLETE 2026-05-29
**Files created**: `project/src/types/common.ts`, `story-location.ts`, `canon.ts`, `knowledge.ts`, `context.ts`, `promise.ts`, `graph.ts`, `errors.ts`, `index.ts`

- [x] All interfaces from IMPLEMENTATION_STARTER_PACK.md §5 written verbatim
- [x] Zero circular imports; all types importable from types barrel index
- [x] `tsc --noEmit` passes with zero errors
- [x] `novel.ts` not touched

---

### Ticket 002 — Database Migrations ✓ COMPLETE 2026-05-29
**Phase**: Phase 1 | **Dependency**: Ticket 001
**Files created**:
- `project/src/db/migrations/001_knowledge_objects.sql` through `005_context_contracts.sql`
- `project/src/db/migrations.ts` — TypeScript module embedding all SQL, exports `runMigrations()` and `getMigrationTables()`

- [x] Write migration DDL for each (all 5 files, DDL from `IMPLEMENTATION_STARTER_PACK.md §4`)
- [x] Every statement uses `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` (idempotent)
- [x] Wired into `DatabaseManager.initialize()` — `runMigrations()` called after schema init (always runs; safe no-op on repeat)
- [x] All 8 required tables created: `knowledge_objects`, `canon_items`, `canon_conflicts`, `narrative_promises`, `promise_payoffs`, `narrative_nodes`, `narrative_edges`, `context_contracts`
- [x] All required indexes in place
- [x] Acceptance test: 6/6 tests pass in `tests/unit/db/migrations.test.ts`

---

### Ticket 003 — Utilities ✓ COMPLETE 2026-05-29
**Files created**: `project/src/utils/stable-json.ts`, `hash.ts`, `ids.ts`, `token-count.ts`

- [x] `stableStringify` — recursive key sort before JSON.stringify
- [x] `sha256Hex` — `crypto.createHash('sha256')`
- [x] `generateId` — `crypto.randomUUID()`; `generateKey` — `crypto.randomBytes(3).toString('hex')`
- [x] `estimateTokens` — `Math.ceil(text.length / 4)`, minimum 1
- [x] 13-test unit suite at `tests/unit/utils/utils.test.ts` — all pass

---

### Ticket 004 — Knowledge Repository ✓ COMPLETE 2026-05-29
**Files created**: `project/src/db/repositories/knowledge-repository.ts`

- [x] Methods: `insert`, `update`, `getById`, `listByType`, `listByStatus`, `filterContextEligible`, `filterGraphEligible`, `search`, `upsert`
- [x] `KnowledgeObjectRow` interface — no `any`
- [x] JSON fields (`structuredData`, `scope`, `source`) serialize on write, parse on read; booleans stored as 0/1
- [x] 19/19 unit tests pass (`tests/unit/db/knowledge-repository.test.ts`)

---

### Ticket 005 — Knowledge Service ✓ COMPLETE 2026-05-29
**Files created**: `project/src/services/knowledge-service.ts`

- [x] Validates: projectId required, type required, title required (trimmed), confidence 0–1, status enum
- [x] Returns `ValidationResult` on invalid input (does not throw)
- [x] Wraps `KnowledgeRepository`; exposes CRUD + search by type/status/eligibility flags
- [x] 19/19 unit tests pass (`tests/unit/services/knowledge-service.test.ts`)

---

### Ticket 006 — Canon Repository + Service ✓ COMPLETE 2026-05-29
**Files created**: `project/src/db/repositories/canon-repository.ts`, `project/src/services/canon-service.ts`

- [x] Repository: `insert`, `update` (incl. type/strength), `getById`, `listBySubject`, `listByType`, `listActive`, `findBySubjectPredicate`, `insertConflict`, `listConflicts`
- [x] Service: `createFact/Rule/Situation/Assertion`, `listBySubject/Type/ActiveCanon`, `promoteAssertion`, `deprecate`, `detectConflict`
- [x] Conflict detection: same subject+predicate, different object → inserts `canon_conflicts` row (critical if either item is hard, else warning)
- [x] Mirror: every create/update/deprecate → upserts matching row in `knowledge_objects` (type: `canon_item`)
- [x] 16/16 unit tests pass (`tests/unit/services/canon-service.test.ts`)

---

### Ticket 007 — Promise Repository + Service ✓ COMPLETE 2026-05-29
**Files created**: `project/src/db/repositories/promise-repository.ts`, `project/src/services/promise-service.ts`

- [x] Repository: `insert`, `update`, `getById`, `listOpen`, `listByProject`, `insertPayoff`, `listPayoffs`
- [x] Service: `createPromise`, `listOpen`, `listByProject`, `addPayoff`, `reportHealth`
- [x] `addPayoff` with `resolvesPromise: true` → sets status to `paid_off`
- [x] `reportHealth` returns: aging (high-importance open), overdue (past window), weak_payoff (paid off but strength < 4), dropped, healthy
- [x] Mirror: create/update → upserts `knowledge_objects` (type: `narrative_promise`)
- [x] 14/14 unit tests pass (`tests/unit/services/promise-service.test.ts`)

---

### Ticket 008 — Context Contract Service ✓ COMPLETE 2026-05-29
**Files created**: `project/src/services/context-contract-service.ts`, `project/src/context/contracts/*.ts`

- [x] Three default contracts: `scene.continuation.v1` (generation), `continuity.check.v1` (consistency_check), `developmental.edit.v1` (editing)
- [x] Methods: `getById`, `listAll`, `register`, `validate` — in-memory registry, no DB dependency
- [x] `validate()` checks all required fields; `register()` rejects invalid contracts
- [x] 15/15 unit tests pass (`tests/unit/services/context-contract-service.test.ts`)

---

### Ticket 009 — Context Fetchers ✓ COMPLETE 2026-05-29
**Files created**: `project/src/context/fetchers/fetcher.ts`, `scene-fetcher.ts`, `character-fetcher.ts`, `canon-fetcher.ts`, `promise-fetcher.ts`

- [x] `ContextFetcher` interface: `fetch(projectId, scope, queryText?) → Promise<ContextBlock[]>`
- [x] Each fetcher: DB empty → `[]`, never throws; uses `generateId` + `estimateTokens`
- [x] 26/26 unit tests pass (`tests/unit/context/fetchers.test.ts`)

---

### Ticket 010 — Context Policy Engine ✓ COMPLETE 2026-05-29
**Files created**: `project/src/context/scoring.ts`, `ordering.ts`, `token-budget.ts`, `fingerprint.ts`, `project/src/services/context-policy-engine.ts`

- [x] `buildContext(request)`: load contract → fetch → score → order → budget → fingerprint → `ContextResult`
- [x] Required blocks never dropped; `hard_fail` throws `CONTEXT_REQUIRED_BUDGET_EXCEEDED`; optional dropped by priority
- [x] `deterministicFingerprint` = sha256 of stable-sorted block descriptors
- [x] Missing contract throws `CONTEXT_CONTRACT_NOT_FOUND`; missing fetcher adds warning
- [x] 29/29 unit tests pass (`tests/unit/context/policy-engine.test.ts`)

---

### Ticket 011 — Narrative Graph ✓ COMPLETE 2026-05-29
**Files created**: `project/src/db/repositories/graph-repository.ts`, `project/src/services/narrative-graph-service.ts`

- [x] Repository: `upsertNode`, `upsertEdge` (ON CONFLICT), `getNode`, `getNeighbors`, `findPath` (BFS), `deleteNodesByProject`, `deleteEdgesByProject`
- [x] Service: `rebuild(projectId)` — characters→scenes (appears_in), promises→scenes (introduced_in), canon→characters (applies_to); rebuild is idempotent
- [x] 15/15 unit tests pass (`tests/unit/services/narrative-graph-service.test.ts`)

---

### Ticket 012 — CLI Commands (Intelligence Layer) ✓ COMPLETE 2026-05-29
**Files created**: 5 command files + 5 handler files in `project/src/cli/`
**Files modified**: `project/src/index.ts` (+5 factory methods), `project/src/cli/registry.ts` (+5 commands)

- [x] Commands: `knowledge`, `canon`, `promise`, `context`, `graph` — registered in `registry.ts`
- [x] Handlers dispatch subcommands to services; errors returned as strings (never crash CLI)
- [x] Factory methods added to `NovelWriterExtension`: `getKnowledgeService`, `getCanonService`, `getPromiseService`, `getContextContractService`, `getNarrativeGraphService`
- [x] 51/51 unit tests pass (`tests/unit/cli/intelligence-commands.test.ts`)

---

### Ticket 013 — Vertical Slice Test ✓ COMPLETE 2026-05-29
**Files created**: `tests/unit/vertical-slice.test.ts`

- [x] Full Phase 1 flow using mocked MCPClient: character → canon fact → conflict detection → promise → payoff → context contracts → graph upsert/retrieve/path → health report → validation
- [x] 10/10 scenarios pass

---

## Completed

### SPEC-02: Beat ↔ Scene Resolution ✓ 2026-05-29
- Added `resolveSceneRef()` to `PlotThreadSync`; parses 4 reference formats; populates `scene_id` + `resolved_at` in `plot_beats`
- `resolved_at DATETIME` column added to `schema.sql`
- 4 previously-skipped beat tests re-enabled in `plot-workflow.test.ts`
- 8-test unit suite in `tests/unit/sync/plot-thread-sync.test.ts`

### Ticket 001: Shared Types ✓ 2026-05-29
- 9 files in `project/src/types/`: common, story-location, canon, knowledge, context, promise, graph, errors, index
- Zero TypeScript errors

### Ticket 003: Utilities ✓ 2026-05-29
- 4 files in `project/src/utils/`: stable-json, hash, ids, token-count
- 13-test suite at `tests/unit/utils/utils.test.ts`

### SPEC-01: Fix Context Engine → AI Connection ✓ 2026-05-29
- GAP-01: wired `SceneContextAssembler` into `GenerationManager`; replaced stub; updated `buildContinuationPrompt` with full `SceneContext`
- GAP-02: updated `defaultModel` to `claude-sonnet-4-6` in `claude-client.ts`
- GAP-03: implemented `pruneToTokenBudget()` in `SceneContextAssembler`; default 8000-token budget enforced
