# TODO

Single source of truth for **open** project work. Shipped features live in
`CHANGELOG.md`; bug history lives in `BUGS.md`; completed historical sprints are
summarized in `archive/todo-completed-history.md`. Trust the code + those files
over any stale prose.

**Last Updated**: 2026-06-28

## Legend
- `[ ]` Not started · `[~]` In progress · `[x]` Complete

---

## Recently completed (2026-06-28)

- [x] Test cleanup + coverage: CLI **96.6%**, mcp-server **93.9%** statements (was 52.9% / 0%); removed hardcoded `gothic-horror-live` e2e; 2,500+ tests
- [x] MCP server rehab → single `novel` passthrough tool (routes through the CLI; stays in sync by construction)
- [x] Bug fixes (see BUGS.md): CHECK-01/02 (check subcommands now report issues), SQL-04 (`generate next-sentence`), SQL-05 (world-rule established FK), DATA-01 (CharacterBuilder YAML quoting), VAL-01 (tension/mood `0` validation), ROBUST-01 (scene-handler projectId), CLI-02 (session/location/timeline projectId), CLI-03 (foreshadow registration)
- [x] **v0.2.0 craft features**: `revise --apply` (mechanical fixes), `structure` (beat templates), `theme` (motif tracking), `analyze hook` (hook-strength scorer), severity tuning (advisory grading + `--strict`), `help --json` (machine-readable CLI schema)
- [x] Hygiene: populated `project/src/data/features.ts` (novel-accurate type union + shipped feature list); pruned stale TODO history → `archive/todo-completed-history.md`

---

## Open

### Docs hygiene
- [ ] Reconcile/rewrite stale status docs in `docs/` against the current code:
      `IMPLEMENTATION_STATUS.md`, the core `spec.md`, `FUTURE_FEATURES.md`
      (they omit ~v0.2.0 features and list shipped work as pending). Summarize +
      archive per the archive protocol.

### Minor test depth (nice-to-have)
- [ ] Integration test: `generate continue` with scene context, assert character/location data appears
- [ ] Unit test: context assembly with large data + tight `maxTokenBudget` prunes predictably

### Deferred ideas
- [ ] `plot beat resolve [--thread]` resolution table (low priority)
- [ ] cli-operator / agentic harness over `help --json` (the schema now exists)

---

## Release
- v0.2.0 is unreleased on `main` (local). Per the repo convention, pushing `main`
  also creates/updates `release/v<version>`.
