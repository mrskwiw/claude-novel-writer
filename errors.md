# Plugin Errors — novel-writer

Logged: 2026-06-07

---

## Confirmed Bugs (hard errors)

### 1. `analyze plot-holes` — SQL schema error
**Command:** `novel-writer analyze plot-holes`
**Error:** `❌ Plot-hole detection failed: no such column: pt.title`
**Cause:** Query references `pt.title` but the `plot_threads` table column is likely named differently (possibly `pt.name` or `pt.thread_name`).

---

### 2. `analyze scenes` — SQL schema error
**Command:** `novel-writer analyze scenes`
**Error:** `❌ Scene purpose audit failed: no such column: s.scene_order`
**Cause:** Query references `s.scene_order` but the column does not exist in the `scenes` table schema.

---

### 3. `analyze subplots` — SQL schema error
**Command:** `novel-writer analyze subplots`
**Error:** `❌ Subplot balance analysis failed: no such column: pt.title`
**Cause:** Same root cause as `analyze plot-holes` — shared query against `plot_threads` references a non-existent `pt.title` column.

---

### 4. `graph rebuild` — SQL schema error
**Command:** `novel-writer graph rebuild`
**Error:** `❌ Failed to rebuild graph: no such column: s.project_id`
**Cause:** Graph rebuild query references `s.project_id` on the `scenes` table, which does not exist in the current schema.

---

### 5. `session progress` — Unknown subcommand
**Command:** `novel-writer session progress`
**Error:** `❌ Unknown subcommand: progress`
**Cause:** `progress` is listed in the CLAUDE.md command reference table and in the `help` output's session entry, but is not implemented. The actual session subcommands are `start`, `end`, and `stats`.

---

### 6. `character show` — Case/encoding sensitivity
**Command:** `novel-writer character show --name emilie` (and variants)
**Error:** `❌ Character not found: emilie`
**Cause:** The lookup is exact-match and case-sensitive, and does not handle partial names or ASCII approximations of Unicode characters. The only working invocation requires the exact Unicode name: `--name "Émilie de Sainte-Amaranthe"`. The `list characters` output truncates the leading `É` to `m` in the display, which makes it harder to copy the correct name.

---

## Functional Gaps (silent/misleading output, not hard crashes)

### 7. `analyze tension-arc` — All chapters show 0.0
**Command:** `novel-writer analyze tension-arc`
**Output:** All three chapters report `0.0 (0 scenes)`.
**Cause:** Tension scores are sourced from scene-level metadata; since no scenes have been formally added via `novel-writer scene add`, there is no scene data in the database. The chapters exist as flat markdown files with no structured scene entries. Not a bug per se, but the tool silently produces misleading output rather than explaining why.

---

### 8. `analyze pov-balance` — No data
**Command:** `novel-writer analyze pov-balance`
**Output:** `No POV scenes found.`
**Cause:** Same as #7 — POV is tracked at the scene level in the database, not read from chapter frontmatter. The chapter YAML frontmatter contains a `pov` field, but it is not used by this command.

---

### 9. `generate synopsis` — Outputs raw prompt in context-prompt mode
**Command:** `novel-writer generate synopsis`
**Behavior:** When `ANTHROPIC_API_KEY` is not set, the tool dumps the assembled Claude prompt to stdout rather than a useful message. `MAIN CONFLICT: Unknown` and `WORLD RULES: None` also reveal that the synopsis context builder does not pull from `plot/` YAML files or `world-rules/` files.

---

## Notes

- Three separate `no such column` errors (#1, #2, #3, #4) suggest the database schema has drifted from what the query layer expects — likely an incomplete migration.
- Errors #7 and #8 are expected behaviour for a project that hasn't used `novel-writer scene add`, but the help table in CLAUDE.md implies these commands work on chapters, not scenes. Worth clarifying in documentation.
