# BUGS

Log bugs immediately. Mark complete when resolved. Format: `[YYYY-MM-DD] description — status`

---

[2026-05-29] GAP-01: `assembleSceneContext()` in GenerationManager was a stub returning `{}` — SceneContextAssembler never called — RESOLVED: wired real assembler into constructor, replaced stub with `assembleContext()` call, updated `buildContinuationPrompt` to consume `SceneContext`
[2026-05-29] GAP-02: `defaultModel = 'claude-3-5-sonnet-20241022'` was 18 months stale — RESOLVED: updated to `claude-sonnet-4-6` in `claude-client.ts`
[2026-05-29] GAP-03: `maxTokenBudget` declared in `ContextOptions` but never enforced — RESOLVED: implemented `pruneToTokenBudget()` in `SceneContextAssembler`, called at end of `assembleContext()` with default 8000 token budget
[2026-05-29] PRE-EXISTING: 10 test suites fail due to native module resolution (`yaml/compose/composer.js`, `better-sqlite3/database`) — not caused by application code changes — open
[2026-06-07] SQL-01: `analyze plot-holes` and `analyze subplots` failed with `no such column: pt.title` — RESOLVED: `pt.title` → `pt.thread_name`; `pb.thread_id` → `pb.plot_thread_id`; `pb.chapter_id` replaced with join through `scenes.chapter_id` in `developmental-analyzer.ts`
[2026-06-07] SQL-02: `analyze scenes` failed with `no such column: s.scene_order` — RESOLVED: `s.scene_order` → `s.scene_number` in `developmental-analyzer.ts`
[2026-06-07] SQL-03: `graph rebuild` failed with `no such column: s.project_id` — RESOLVED: added `JOIN chapters ch ON ch.id = s.chapter_id` and filtered on `ch.project_id` in `narrative-graph-service.ts`
[2026-06-07] CLI-01: `session progress` returned `Unknown subcommand: progress` — RESOLVED: added `progress` as a registered subcommand in `session.ts`
[2026-06-07] UX-01: `character show --name emilie` failed exact-match on Unicode name — RESOLVED: `findCharacterFile` now normalizes NFD and strips combining diacritics, with substring fallback after exact match
