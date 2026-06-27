# BUGS

Log bugs immediately. Mark complete when resolved. Format: `[YYYY-MM-DD] description — status`

---

[2026-05-29] GAP-01: `assembleSceneContext()` in GenerationManager was a stub returning `{}` — SceneContextAssembler never called — RESOLVED: wired real assembler into constructor, replaced stub with `assembleContext()` call, updated `buildContinuationPrompt` to consume `SceneContext`
[2026-05-29] GAP-02: `defaultModel = 'claude-3-5-sonnet-20241022'` was 18 months stale — RESOLVED: updated to `claude-sonnet-4-6` in `claude-client.ts`
[2026-05-29] GAP-03: `maxTokenBudget` declared in `ContextOptions` but never enforced — RESOLVED: implemented `pruneToTokenBudget()` in `SceneContextAssembler`, called at end of `assembleContext()` with default 8000 token budget
[2026-05-29] PRE-EXISTING: 10 test suites fail due to native module resolution (`yaml/compose/composer.js`, `better-sqlite3/database`) — RESOLVED (stale): vitest.config aliases `yaml`/`better-sqlite3` to their real entry paths; full suite now runs (1376 tests passing as of 2026-06-27)
[2026-06-07] SQL-01: `analyze plot-holes` and `analyze subplots` failed with `no such column: pt.title` — RESOLVED: `pt.title` → `pt.thread_name`; `pb.thread_id` → `pb.plot_thread_id`; `pb.chapter_id` replaced with join through `scenes.chapter_id` in `developmental-analyzer.ts`
[2026-06-07] SQL-02: `analyze scenes` failed with `no such column: s.scene_order` — RESOLVED: `s.scene_order` → `s.scene_number` in `developmental-analyzer.ts`
[2026-06-07] SQL-03: `graph rebuild` failed with `no such column: s.project_id` — RESOLVED: added `JOIN chapters ch ON ch.id = s.chapter_id` and filtered on `ch.project_id` in `narrative-graph-service.ts`
[2026-06-07] CLI-01: `session progress` returned `Unknown subcommand: progress` — RESOLVED: added `progress` as a registered subcommand in `session.ts`
[2026-06-07] UX-01: `character show --name emilie` failed exact-match on Unicode name — RESOLVED: `findCharacterFile` now normalizes NFD and strips combining diacritics, with substring fallback after exact match
[2026-06-27] CODE-01: `create chapter` did not sync to the DB (commented out) and hardcoded chapter number 1 — RESOLVED: auto-numbers via `ChapterSync.getNextChapterNumber()` and calls `syncChapterFile()` after write (`create-handler.ts`)
[2026-06-27] CODE-02: CLI hardcoded `projectId = 1` in `cli/index.ts` — RESOLVED: resolves the real id via `DatabaseManager.getFirstProjectId()` / `NovelWriterExtension.loadProjectId()`
[2026-06-27] CODE-03: `context build` was a stub (Context engine unreachable from CLI) — RESOLVED: `getContextPolicyEngine()` factory wires all fetchers; handler renders assembled context
[2026-06-27] CODE-04: `ChapterSync.generateChapterSummary` wrote placeholder text into `chapters.summary` — RESOLVED: removed from sync; added `GenerationManager.generateChapterSummary` (<=5 sentences) via IClaudeClient passthrough + `generate summary --chapter N`
[2026-06-27] DOC-01: `PLOT_BEAT_SYNC_TODO.md` claimed plot-beat sync was disabled, but it was fixed in SPEC-02 (2026-05-29) — RESOLVED: archived the stale doc to docs/archive/
