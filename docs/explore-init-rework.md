# Explore: `init` command rework for automated / AI use (v0.1.1)

**Status:** implemented
**Branch:** `release/v0.1.1`

## Problem

`/novel init` (and `novel-writer init`) hung when an AI invoked it through the
Claude Code Bash tool. Root cause: `init-handler.ts` used `readline` against
`process.stdin` to prompt for missing `--title`/`--author`. With no interactive
TTY and no stdin, `rl.question()` never resolved → the Bash call deadlocked
until timeout. The only escape (`--skip-prompts`) hard-errored on missing
fields, so a forgotten flag still broke the flow.

## Decisions (confirmed with user)

1. **Auto-derive + proceed** when non-interactive and fields are missing —
   title from directory name, author from `git config user.name` (fallback
   `"Unknown Author"`). Never blocks, never hard-errors on missing metadata.
2. **TTY auto-detection** — prompt only when `process.stdin.isTTY`. Keep
   `--skip-prompts` as an explicit override (also auto-derives now).
3. **`--json` flag** — single machine-readable result line on stdout for
   reliable AI consumption. Implies non-interactive.

## Changes

| File | Change |
|---|---|
| `src/cli/handlers/init-handler.ts` | Rewrite: TTY-gated prompting, auto-derive helpers (`deriveTitleFromDir`, `deriveAuthorFromGit`), `--json` result emission, console.log silencing during init in JSON mode, `writeProjectClaudeMd` returns whether it wrote |
| `src/cli/commands/init.ts` | Added `--json` flag; reframed `--skip-prompts` description |
| `src/cli/index.ts` | `config({ quiet: true })` — suppress dotenv banner that corrupted `--json` stdout |
| `src/index.ts` | Added `getProjectId()` accessor |
| `commands/novel.md`, `skills/novel-setup.md` | Documented non-interactive contract + `--json` |
| `tests/integration/workflows/init-handler.test.ts` | Replaced stale "errors on missing field" tests with auto-derive + `--json` coverage |

## Integration Verification

Change is contained within the CLI subsystem plus a one-line additive accessor
on the facade (`getProjectId`). No shared interface/type contract changed.
Verified by:
- `tsc --noEmit` clean; `eslint` clean.
- 17 init-handler integration tests + full `unit/cli` suite (172 tests) green.
- Manual end-to-end against built `dist/bin.js`:
  - `init` with no flags and stdin closed (`</dev/null`) → completes, exit 0,
    derives title/author, no hang.
  - `init --json --title A --author B </dev/null` → exactly one JSON line on
    stdout, parses cleanly (`status: ok`).
