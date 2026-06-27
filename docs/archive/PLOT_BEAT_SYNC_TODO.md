# Plot Beat Sync — TODO (ARCHIVED — RESOLVED 2026-05-29)

**Status: RESOLVED.** Beat ↔ scene resolution was implemented in SPEC-02
(2026-05-29). This planning doc is retained only as a historical record.

What was built (`src/sync/plot-thread-sync.ts`):
- `resolveSceneRef(ref)` parses scene-reference strings (e.g. `Ch1.Scene1`) to a
  numeric `scene_id`.
- `syncBeats(threadId, beats)` (called from `syncPlotThreadFile`) deletes and
  re-inserts `plot_beats` with the resolved `scene_id` and `resolved_at`,
  warning (and leaving `scene_id` null) when a reference can't be resolved.
- `getBeats(threadId)` returns beats from the DB.
- The previously-skipped beat tests in `tests/integration/plot-workflow.test.ts`
  are active and passing.

The original doc claimed beat sync was "disabled due to a data model mismatch" —
that mismatch was resolved by the scene-name → scene-id lookup above.
