# Implementation Plan
## Claude Novel Writer — v1.0
**Version**: 1.0  
**Date**: 2026-05-29  
**Based on**: MASTER_BUILD_SPEC.md, IMPLEMENTATION_STARTER_PACK.md, ACCEPTANCE_TEST_CHECKLIST.md, TODO.md

---

## 1. Current State

### Works today
- 68+ CLI commands across 15 systems (init, chapters, scenes, characters, locations, plot threads, world rules, timeline, sessions, consistency checker, export, AI generation, sync)
- 240+ tests passing, zero build errors
- Real Claude API integration via `@anthropic-ai/sdk`

### Critical bugs (blocking production use)
| ID | File | Problem |
|---|---|---|
| GAP-01 | `src/ai/generation-manager.ts:484` | `assembleSceneContext()` stub returns `{}` — context never reaches AI |
| GAP-02 | `src/ai/claude-client.ts:29` | Model `claude-3-5-sonnet-20241022` is 18+ months stale |
| GAP-03 | `src/context/scene-context.ts:18` | `maxTokenBudget` declared but never enforced |
| GAP-06 | `src/sync/plot-thread-sync.ts` | Beat sync disabled: scene name strings never resolved to IDs |

### Architecture gap
The current system has solid data infrastructure but no "intelligence spine." `SceneContextAssembler` assembles context via ad-hoc MCP queries with no contracts, no scoring, no determinism, and no canon/promise tracking. The `IMPLEMENTATION_STARTER_PACK.md` defines the foundation that makes AI assistance reliable.

---

## 2. Two Work Tracks

Every sprint runs both tracks in parallel. Neither blocks the other, but Track B's completion unlocks far richer AI assistance than the Track A patch in Phase 0 provides.

### Track A — Feature Completeness (MASTER_BUILD_SPEC SPEC-01 through SPEC-12)
Pragmatic additions to the existing CLI. Most are self-contained; all follow the established Builder → Sync → CLI handler pattern. Directly fills gaps in the novel writing process support.

### Track B — Intelligence Foundation (IMPLEMENTATION_STARTER_PACK Tickets 001–013)
A deeper architectural layer beneath the existing systems:

```
Knowledge Objects → Canon → Promises → Context Contracts
→ Context Policy Engine → Narrative Graph
→ Constrained AI Generation
```

When Track B is complete, `SceneContextAssembler` is superseded by the Context Policy Engine, which is contract-governed, deterministic, and fingerprinted. This is the gate before advanced AI features (character arc AI, style learning, multi-agent).

---

## 3. Phase Breakdown

---

### PHASE 0 — Critical Bug Fixes
**Duration**: 1–2 days  
**Objective**: Get the existing AI generation working correctly with real context.

| Task | File(s) | Spec ref |
|---|---|---|
| Wire `SceneContextAssembler` into `GenerationManager` constructor | `src/ai/generation-manager.ts` | SPEC-01 / GAP-01 |
| Replace stub `assembleSceneContext()` with real `assembleContext()` call | `src/ai/generation-manager.ts:484` | SPEC-01 / GAP-01 |
| Inject assembled context into `buildContinuationPrompt()`, `buildPlotPrompt()` | `src/ai/generation-manager.ts` | SPEC-01 / GAP-01 |
| Update `defaultModel` to `claude-sonnet-4-6` | `src/ai/claude-client.ts:29` | SPEC-01 / GAP-02 |
| Implement `pruneToTokenBudget()` in `SceneContextAssembler` | `src/context/scene-context.ts` | SPEC-01 / GAP-03 |
| Enforce `maxTokenBudget` at end of `assembleContext()` | `src/context/scene-context.ts` | SPEC-01 / GAP-03 |

**Quality gate**: `npm run build && npm test` — all 240+ tests pass. Manual: `/novel generate continue --scene 1` returns output that references character names.

---

### PHASE 1 — Foundation Start + Sprint 1 Features
**Duration**: ~2 weeks  
**Objective**: Lay the intelligence foundation (types + DB + utilities + knowledge service) while delivering the four highest-value independent features.

#### Track A — Sprint 1 Features

**SPEC-02: Beat ↔ Scene Resolution**
- Add `resolveSceneRef()` to `plot-thread-sync.ts` (parses `Ch3.Scene2`, `Ch3.S2`, `Chapter 3 Scene 2`)
- Schema: `ALTER TABLE plot_beats ADD COLUMN scene_reference TEXT` + `resolved_at DATETIME`
- New CLI: `/novel plot beat resolve [--thread "Name"]`
- Re-enable 4 skipped beat sync tests
- Ref: `docs/PLOT_BEAT_SYNC_TODO.md` for exact SQL and acceptance criteria

**SPEC-03: Idea Capture System**
- New: `src/builders/idea-builder.ts` — `quickAdd()`, `list(filter)`, `get(key)`, `updateStatus()`, `link()`
- New: `src/sync/idea-sync.ts`
- New: `src/cli/commands/idea.ts` + `src/cli/handlers/idea-handler.ts`
- Schema: `ideas` table (see SPEC-03 in MASTER_BUILD_SPEC for DDL)
- Types: `IdeaEntry` in `src/types/novel.ts`
- Commands: `idea add`, `idea list`, `idea show`, `idea link`, `idea explore`, `idea use`, `idea discard`, `idea sync`
- AI: add `generateBrainstorm()` to `GenerationManager`

**SPEC-07: Draft Snapshots**
- New: `src/revision/snapshot-manager.ts`
- New: `src/cli/commands/revision.ts` + handler
- Commands: `revision snapshot`, `revision list`, `revision show`, `revision diff`, `revision restore`
- Snapshot format: `revisions/[label]-[date]/` with `_snapshot.json` metadata
- Diff: Myers algorithm on word-tokenized text
- Auto-snapshot trigger: before any `--from-db` reverse sync

#### Track B — Intelligence Foundation (Tickets 001–005)

**Ticket 001 — Shared Types**  
Create type files (do NOT put these in `src/types/novel.ts` — new separate files):
```
src/types/common.ts         — ID, ValidationResult, Timestamped
src/types/story-location.ts — StoryLocation
src/types/knowledge.ts      — KnowledgeObject, KnowledgeObjectType
src/types/canon.ts          — CanonItem, CanonConflict, CanonType, CanonStatus, CanonStrength
src/types/context.ts        — ContextContract, ContextBlock, ContextResult, ContextBuildRequest
src/types/promise.ts        — NarrativePromise, PromisePayoff, PromiseHealth
src/types/graph.ts          — NarrativeNode, NarrativeEdge, node/edge types
src/types/index.ts          — re-exports all of the above
```
Acceptance: zero circular imports; every type importable from `src/types`.

**Ticket 002 — Database Migrations**  
Create migration SQL files in `src/db/migrations/`:
```
001_knowledge_objects.sql
002_canon.sql
003_promises.sql
004_narrative_graph.sql
005_context_contracts.sql
```
Full DDL is in `IMPLEMENTATION_STARTER_PACK.md §4`. Each migration must be `IF NOT EXISTS` (idempotent). Wire into `DatabaseManager.initialize()` — run all 5 after existing schema.sql.

**Ticket 003 — Utilities**  
Create:
```
src/utils/stable-json.ts   — stableStringify(obj): same string regardless of key insertion order
src/utils/hash.ts          — sha256Hex(input): deterministic hex hash
src/utils/ids.ts           — generateId(): UUID-style string ID; generateKey(): 6-char hex
src/utils/token-count.ts   — estimateTokens(text): Math.ceil(text.length / 4) with model-aware floor
```

**Ticket 004 — Knowledge Repository**  
Create `src/db/repositories/knowledge-repository.ts`:
- Methods: `insert`, `update`, `getById`, `listByType`, `listByStatus`, `filterContextEligible`, `search`
- All JSON fields (`structuredData`, `scope`, `source`) serialize/deserialize with `JSON.parse`/`JSON.stringify`
- No `any` — DB rows typed as `KnowledgeObjectRow` interface

**Ticket 005 — Knowledge Service**  
Create `src/services/knowledge-service.ts`:
- Validates required fields (projectId, type, title, confidence 0–1, valid status)
- Wraps KnowledgeRepository
- Supports CRUD + search by type/status/eligibility flag
- Returns `ValidationResult` on invalid input rather than throwing

**Phase 1 tests**:
- Unit: `resolveSceneRef` all formats, IdeaBuilder CRUD, snapshot directory structure
- Unit: stable-json determinism, hash determinism, knowledge service validation
- Integration: beat sync with valid/invalid refs; idea add → sync → query; knowledge CRUD

---

### PHASE 2 — Sprint 2 Features + Canon/Promises
**Duration**: ~2 weeks  
**Objective**: Add the three analysis features; build canon and promise tracking.

#### Track A — Sprint 2 Features

**SPEC-04: Research Repository**
- New: `src/builders/research-builder.ts`
- Schema: `research_notes` + `research_usage` tables (DDL in SPEC-04)
- Commands: `research add`, `research list`, `research show`, `research link`, `research verify`, `research sync`
- `[VERIFY: claim]` marker scanner: `/novel research verify-list` — regex `/\[VERIFY:\s*([^\]]+)\]/g` across all chapter files
- Output: `Chapter N, line L: [VERIFY: ...]`

**SPEC-05: Prose Analysis System**
- New: `src/analysis/prose-analyzer.ts`
- Checks: intensifiers, filter words, adverb dialogue tags, passive voice, doubled words, sentence length variance, word repetition (300-word window), dialogue quality
- Types: `ProseAnalysisResult`, `ProseCheck` in `src/types/novel.ts`
- Commands: `analyze prose --chapter N [--type intensifiers]`, `analyze dialogue --chapter N`, `analyze sentences --chapter N`, `analyze prose --all`
- Economy score (0–100): based on filter + intensifier density
- No NLP libraries — pure regex + pattern matching per PART 6 constraints

**SPEC-08: Pacing & Structure Analysis**
- New: `src/analysis/pacing-analyzer.ts`
- Types: `PacingReport`, `PacingFlag` in `src/types/novel.ts`
- Commands: `analyze tension-arc`, `analyze pov-balance`, `analyze chapter-lengths`, `analyze scenes --purpose`, `analyze conflict`
- ASCII bar chart output (████░░░ format)
- Flags: tension dip after 3+ rising chapters; POV imbalance; chapter > 2× or < 0.5× average; 3+ consecutive scenes tension < 4

#### Track B — Canon + Promises (Tickets 006–007)

**Ticket 006 — Canon Repository + Service**  
Create `src/db/repositories/canon-repository.ts` + `src/services/canon-service.ts`:
- `createFact`, `createRule`, `createSituation`, `createAssertion`
- `listBySubject(projectId, subject)`, `listByType`, `listActiveCanon`
- `detectConflict(newItem)` — same subject + predicate, different object → insert `canon_conflicts` row
- `promoteAssertion(id)` — sets status to `active`
- `deprecate(id)`
- Mirror: every canon create/update/deprecate upserts matching row in `knowledge_objects`

**Ticket 007 — Promise Repository + Service**  
Create `src/db/repositories/promise-repository.ts` + `src/services/promise-service.ts`:
- `createPromise`, `listOpen`, `listByProject`, `addPayoff(promiseId, payoff)`
- Resolving payoff → sets promise `status = 'paid_off'`
- `reportHealth(projectId)` → returns `PromiseHealth[]` (aging = open > 5 chapters, overdue = past expected window)
- Mirror: create/update promise → upsert `knowledge_objects`

**Phase 2 tests**:
- Unit: each prose check (intensifiers, filter words, passives) catches target, misses non-targets
- Unit: pacing flag generation (dip detection, length outlier)
- Unit: canon conflict detection (same subject+predicate, different object → conflict created)
- Unit: promise health report (overdue, weak payoff)
- Integration: scan test chapter for prose issues; run pacing report on fixture project

---

### PHASE 3 — Foundation Completion + Sprint 3
**Duration**: ~1 week  
**Objective**: Complete the intelligence foundation to the acceptance gate; add character arc and synopsis.

#### Track A — Sprint 3 Features

**SPEC-09: Character Arc Visualization**
- Schema: `character_scene_states` table (DDL in SPEC-09)
- Scene marker extension: `<!-- character_states: Sarah Chen=determined|Alex=fearful -->`
- `SceneSync` extension: parse `character_states` marker on sync, upsert `character_scene_states`
- Commands: `character arc --name "X"`, `character arc --name "X" --compare "Y"`, `character states --chapter N`
- Valid states: `hopeful|determined|fearful|angry|grieving|joyful|confused|resigned|transformed|neutral`
- Arc completeness: first state ≠ last state = complete; flag static runs ≥ 3 consecutive scenes

**SPEC-10: Synopsis and Query Materials**
- Extend `GenerationManager`: `generateSynopsis(length)`, `generatePitch()`, `generateQueryLetter(compTitles?)`, `generateComps()`
- Add `assembleSynopsisContext(projectId)` — loads project metadata, protagonist profile, main plot thread, chapter summaries, world rules
- Commands: `generate synopsis --length short|medium|long [--save]`, `generate pitch`, `generate query-letter`, `generate comps`

#### Track B — Context Engine + Graph (Tickets 008–013)

**Ticket 008 — Context Contract Service**  
Create `src/services/context-contract-service.ts` + `src/context/contracts/*.ts`:
- Three default contracts loaded at startup: `scene.continuation.v1`, `continuity.check.v1`, `developmental.edit.v1`
- Each contract: required blocks, optional blocks, maxTokens, orderingPolicy, truncationPolicy, deterministic flag
- `getById(id)`, `listAll()`, `validate(contract)` — validates all required fields present
- Contracts stored in DB via migration 005

**Ticket 009 — Context Fetchers**  
Create one fetcher per context type needed by default contracts:
```
src/context/fetchers/scene-fetcher.ts
src/context/fetchers/character-fetcher.ts
src/context/fetchers/canon-fetcher.ts
src/context/fetchers/promise-fetcher.ts
```
Each implements `ContextFetcher` interface: `fetch(projectId, scope): Promise<ContextBlock[]>`. Missing optional context returns `[]`, not an error.

**Ticket 010 — Context Policy Engine**  
Create `src/services/context-policy-engine.ts` + support files:
```
src/context/scoring.ts     — relevanceScore(block, queryText): number
src/context/ordering.ts    — applyOrderingPolicy(blocks, policy): blocks
src/context/token-budget.ts — enforcebudget(blocks, required, budget, policy): {included, omitted}
src/context/fingerprint.ts — deterministicFingerprint(result): string (hash of stable-json of blocks)
```
Core method: `buildContext(request: ContextBuildRequest): Promise<ContextResult>`
- Loads contract; fetches candidates from all required + optional fetchers; scores; orders; enforces budget; fingerprints
- Required blocks never dropped (returns error if they exceed budget)
- Same input → same fingerprint (determinism gate)

**Ticket 011 — Narrative Graph**  
Create `src/db/repositories/graph-repository.ts` + `src/services/narrative-graph-service.ts`:
- `upsertNode`, `upsertEdge` (idempotent by ID)
- `getNeighbors(nodeId)`, `findPath(fromId, toId)`, `getNode(id)`
- `rebuild(projectId)` — traverses all characters, scenes, promises, canon items and creates nodes + edges:
  - character → `appears_in` → scene (from `character_appearances` table)
  - promise → `introduced_in` → scene
  - canon_item → `applies_to` → character (from canon subject matching character names)
- Rebuild idempotent: same node/edge count on second run

**Ticket 012 — CLI Commands (intelligence layer)**  
Register in `registry.ts`:
```
src/cli/commands/knowledge.ts   src/cli/handlers/knowledge-handler.ts
src/cli/commands/canon.ts       src/cli/handlers/canon-handler.ts
src/cli/commands/promise.ts     src/cli/handlers/promise-handler.ts
src/cli/commands/context.ts     src/cli/handlers/context-handler.ts
src/cli/commands/graph.ts       src/cli/handlers/graph-handler.ts
```
Commands per IMPLEMENTATION_STARTER_PACK §6. Handlers call services, not repositories directly.

**Ticket 013 — Vertical Slice Test + Fixture**  
Create fixture project:
```
tests/fixtures/mini-novel/
├── chapters/01-opening.md
├── characters/mira.yml
└── .novel/
```
Create `tests/integration/vertical-slice.test.ts`:
- Full flow: init → create Mira character → canon fact (silver eyes) → scene (sealed archive) → promise (why sealed?) → build context (scene.continuation.v1) → graph rebuild
- Assert context contains: scene text, Mira profile, canon fact, promise
- Assert graph edges: Mira→appears_in→scene, promise→introduced_in→scene, canon→applies_to→Mira

Create `tests/integration/context-determinism.test.ts` — same request ×3 → same fingerprint.  
Create `tests/integration/graph-rebuild.test.ts` — rebuild ×2 → no duplicate nodes/edges.

**Phase 3 acceptance gate**: All 14 items in `ACCEPTANCE_TEST_CHECKLIST.md` must pass before any subagent, style-learning, or advanced generation work begins.

---

### PHASE 4 — Quality Pass + Drafting Support
**Duration**: ~1 week  
**Objective**: Eliminate the most damaging technical debt; deliver SPEC-06.

**SPEC-06: Drafting Support Tools**
- New: `src/analysis/draft-scanner.ts` — `findPlaceholders()` scans for `[TK]`, `[TODO]`, `[FIXME]`, `[CHECK]`
- Schema: `ALTER TABLE writing_sessions ADD COLUMN stop_note TEXT` + `ritual_completed BOOLEAN`
- Session start: query last `stop_note`, display last 200 words of most recent chapter
- Session end: `--note "..."` flag; prompt if not provided
- New command: `draft tk-list [--chapter N]`
- Chapter completion checklist: `chapter check N` — purpose, conflict, POV, placeholders, timeline

**GAP-04: Sync conflict detection**
- Add `last_synced_at` to relevant tables or a `sync_state` table
- On sync: compare file mtime vs `last_synced_at`; flag conflicts
- Options: `--force-file`, `--force-db`, interactive
- Applies to: chapter, character, location, world-rules, plot-thread sync

**GAP-05: Reverse sync (DB→File) for all entities**
- Add `exportToYAML()` / `exportToFile()` to: `character-sync`, `location-sync`, `world-rules-sync`, `scene-sync`
- Chapter reverse: reconstruct markdown frontmatter from DB record
- Wire into `/novel sync --from-db` flag (with auto-snapshot first — see SPEC-07)

**GAP-08: POV anchoring in AI generation**
- Add `loadCharacterVoice(name)` to `GenerationManager` — fetches voice patterns from `characters` table
- Inject into `buildContinuationPrompt()`, `buildDialoguePrompt()`, `buildDescriptionPrompt()`

**GAP-12: Eliminate `: any` (97 occurrences)**
- Create typed row interfaces for all DB query results
- Replace `any[]` returns in `mcpClient.readQuery()` with generic `T[]`
- Fix `claude-client.ts:75` — use Anthropic SDK `ContentBlock` type
- All `catch (error: any)` → `catch (error: unknown)` with narrowing
- Target: zero `: any` in `src/`

---

### PHASE 5 — Later Value
**Duration**: Ongoing  
**Objective**: Complete the writing process coverage and distribution features.

| Item | Source | Description |
|---|---|---|
| SPEC-11 | MASTER_BUILD_SPEC | Beta reader management |
| SPEC-12 | MASTER_BUILD_SPEC | Agent query tracker |
| GAP-07 | TODO | AI-assisted world rule violation checker |
| GAP-09 | TODO | Generation alternatives for all types |
| CRAFT-01 | TODO | Opening line workshop |
| CRAFT-05 | TODO | Read-aloud / TTS export |
| GAP-15 | TODO | `/novel help` command |
| GAP-16 | TODO | Multi-format export (DOCX/EPUB/PDF via mcp-pandoc) |
| PROC-05 | TODO | Line editing tools (sentence length, repetition, show/tell) |
| PROC-06 | TODO | Copy editing (POV slip, tense consistency, name consistency) |
| PROC-11 | TODO | Series management / series bible |

---

## 4. Build Rules (enforced on every PR)

From MASTER_BUILD_SPEC Part 2 and Part 7:

1. **Layer order**: types → schema → builder → sync → CLI command → CLI handler → registry → index
2. **No `: any`** — `Record<string, unknown>` for DB rows, `unknown` in catch
3. **No test/doc files in `project/src/`**
4. **New builder**: unit tests (min 5) + integration test (min 3 scenarios)
5. **Schema**: always `IF NOT EXISTS`; document additions in `schema.sql`
6. **Registry**: every new command registered in `src/cli/registry.ts`
7. **Types**: all new entities typed in `src/types/novel.ts` or appropriate types file

Quality gate checklist (run before marking any spec complete):
```
[ ] npm run build         — zero TypeScript errors
[ ] npm run lint          — zero lint errors
[ ] npm test              — all tests pass (including pre-existing 240+)
[ ] grep -c ': any' src/  — count must not increase
[ ] TODO.md updated       — item marked [x]
[ ] features.ts updated   — status reflects change
```

---

## 5. Dependency Map

```
PHASE 0  ─────────────────────────────────────────────────────────────────────
  SPEC-01 (context bug fix, model update, token budget)

PHASE 1  ─────────────────────────────────────────────────────────────────────
  Track A:  SPEC-02 (beat sync) ──────────────────────────────────┐
            SPEC-03 (ideas)                                        │
            SPEC-07 (snapshots)                                    │
  Track B:  T001 types → T002 migrations → T003 utils             │
            → T004 knowledge repo → T005 knowledge service        │
                                                                   ↓
PHASE 2  ────────────────────────────────────────── requires Phase 1 T001-005
  Track A:  SPEC-04 (research)
            SPEC-05 (prose analysis)  ← needs chapter system ✓
            SPEC-08 (pacing)          ← needs scene tension data ✓
  Track B:  T006 (canon) → T007 (promises)

PHASE 3  ────────────────────────────────────────── requires Phase 2
  Track A:  SPEC-09 (char arc)     ← needs SPEC-06 scene extension
            SPEC-10 (synopsis)     ← needs SPEC-01 AI fix ✓
  Track B:  T008 (contracts) → T009 (fetchers) → T010 (policy engine)
            → T011 (graph) → T012 (CLI) → T013 (vertical slice)
  GATE:     ACCEPTANCE_TEST_CHECKLIST — all 14 items

PHASE 4  ────────────────────────────────────────── requires Phase 3
  SPEC-06 (drafting)  GAP-04 (conflict)  GAP-05 (reverse sync)
  GAP-08 (POV)        GAP-12 (any types)

PHASE 5  ────────────────────────────────────────── ongoing
  SPEC-11, SPEC-12, GAP-07, GAP-09, CRAFT-*, PROC-05/06/11
```

---

## 6. Files to Create Per Phase

### Phase 0 (modify only)
- `project/src/ai/generation-manager.ts`
- `project/src/context/scene-context.ts`
- `project/src/ai/claude-client.ts`

### Phase 1 — New files
```
project/src/builders/idea-builder.ts
project/src/sync/idea-sync.ts
project/src/cli/commands/idea.ts
project/src/cli/handlers/idea-handler.ts
project/src/revision/snapshot-manager.ts
project/src/cli/commands/revision.ts
project/src/cli/handlers/revision-handler.ts
project/src/types/common.ts
project/src/types/story-location.ts
project/src/types/knowledge.ts
project/src/types/canon.ts
project/src/types/context.ts
project/src/types/promise.ts
project/src/types/graph.ts
project/src/types/index.ts
project/src/db/migrations/001_knowledge_objects.sql
project/src/db/migrations/002_canon.sql
project/src/db/migrations/003_promises.sql
project/src/db/migrations/004_narrative_graph.sql
project/src/db/migrations/005_context_contracts.sql
project/src/db/repositories/knowledge-repository.ts
project/src/services/knowledge-service.ts
project/src/utils/stable-json.ts
project/src/utils/hash.ts
project/src/utils/ids.ts
project/src/utils/token-count.ts
tests/unit/builders/idea-builder.test.ts
tests/integration/workflows/idea-workflow.test.ts
tests/unit/revision/snapshot-manager.test.ts
tests/unit/services/knowledge-service.test.ts
```

### Phase 2 — New files
```
project/src/builders/research-builder.ts
project/src/sync/research-sync.ts
project/src/cli/commands/research.ts
project/src/cli/handlers/research-handler.ts
project/src/cli/commands/analyze.ts
project/src/cli/handlers/analyze-handler.ts
project/src/analysis/prose-analyzer.ts
project/src/analysis/pacing-analyzer.ts
project/src/db/repositories/canon-repository.ts
project/src/db/repositories/promise-repository.ts
project/src/services/canon-service.ts
project/src/services/promise-service.ts
tests/unit/analysis/prose-analyzer.test.ts
tests/unit/analysis/pacing-analyzer.test.ts
tests/integration/workflows/research-workflow.test.ts
tests/unit/services/canon-service.test.ts
tests/unit/services/promise-service.test.ts
```

### Phase 3 — New files
```
project/src/context/contracts/scene-continuation.contract.ts
project/src/context/contracts/continuity-check.contract.ts
project/src/context/contracts/developmental-edit.contract.ts
project/src/context/fetchers/scene-fetcher.ts
project/src/context/fetchers/character-fetcher.ts
project/src/context/fetchers/canon-fetcher.ts
project/src/context/fetchers/promise-fetcher.ts
project/src/context/scoring.ts
project/src/context/ordering.ts
project/src/context/token-budget.ts
project/src/context/fingerprint.ts
project/src/db/repositories/graph-repository.ts
project/src/services/context-contract-service.ts
project/src/services/context-policy-engine.ts
project/src/services/narrative-graph-service.ts
project/src/cli/commands/knowledge.ts
project/src/cli/commands/canon.ts
project/src/cli/commands/promise.ts
project/src/cli/commands/context.ts
project/src/cli/commands/graph.ts
project/src/cli/handlers/knowledge-handler.ts
project/src/cli/handlers/canon-handler.ts
project/src/cli/handlers/promise-handler.ts
project/src/cli/handlers/context-handler.ts
project/src/cli/handlers/graph-handler.ts
tests/fixtures/mini-novel/chapters/01-opening.md
tests/fixtures/mini-novel/characters/mira.yml
tests/integration/vertical-slice.test.ts
tests/integration/context-determinism.test.ts
tests/integration/graph-rebuild.test.ts
```
