# TODO — completed history (archived 2026-06-28)

Concise summary of the large body of completed/stale work that previously lived
in `TODO.md`. Pruned because the items below are all shipped (verify against the
code, `CHANGELOG.md`, and `BUGS.md` — the canonical records). Kept here for
provenance only.

## Foundational gaps (GAP-01…GAP-11, May–June 2026) — all COMPLETE
- GAP-01 Context engine ↔ AI generation wired (`SceneContextAssembler` in `GenerationManager`).
- GAP-02 Claude model updated to `claude-sonnet-4-6`.
- GAP-03 `maxTokenBudget` enforced via `pruneToTokenBudget()` (default 8000).
- GAP-04 Sync conflict detection (`sync_state` table, `SyncStateRepository`, `SyncConflictError`).
- GAP-05 DB→file reverse sync for all entities.
- GAP-11 Pacing/structure analysis (`analyze tension-arc|pov-balance|chapter-lengths|conflict|scenes`).

## Shipped feature sprints (now part of the product) — all COMPLETE
- Research repository (`research add|list|verify|mark-verified`).
- Beta readers (`beta add|feedback|report`; `beta_readers`/`beta_feedback` tables).
- Submission materials (`generate synopsis|pitch|query-letter|comps`).
- Opening-line workshop (`generate opening-lines`), ideation extras (`generate name|premise|sketch`).
- Character arc service, foreshadowing service, query tracker, series manager, snapshot/revision.
- Plot beats ↔ scene sync (SPEC-02), developmental analysis, copy editor, draft scanner, read-aloud prep.
- Intelligence layer: knowledge, canon, narrative promises, context policy engine, narrative graph.

## v0.2.0 craft additions — COMPLETE
- `report`, `readaloud` (OS TTS), `analyze voice`, `extract` (incl. `--file`),
  `generate overview`, `generate summary`, `revise --apply`, `structure`, `theme`,
  `analyze hook` + severity tuning, `help --json`.

See `CHANGELOG.md` for the user-facing record and `BUGS.md` for the bug history.
