# core spec.md — archived 2026-06-28

The original ("🚀 Claude Novel — Phase 1 Full Implementation Spec") was the
Phase-1 design/implementation spec. The project is well past Phase 1; the spec's
concrete structure no longer matches the code, and its content is superseded by
the numbered architecture docs (`docs/01_CORE_ARCHITECTURE.md` … `08_*`) and the
actual source.

Its **evergreen design constraints still hold** and are reflected throughout the
codebase + `CLAUDE.md`:

- **Files (Markdown + YAML) are canonical; the SQLite database is a derived index.**
- **Determinism first** — the context engine is reproducible (same input → same
  output; SHA-256 fingerprinting).
- **CLI-first** — all functionality is exposed via the CLI; agents (and the MCP
  passthrough server) call the CLI as tools.

(The "no compression layer in Phase 1" constraint has since relaxed: optional AI
chapter summaries exist, but selection-based context assembly remains the default.)
