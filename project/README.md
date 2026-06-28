# claude-novel-writer

[![CI](https://github.com/mrskwiw/claude-novel-writer/actions/workflows/ci.yml/badge.svg)](https://github.com/mrskwiw/claude-novel-writer/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/claude-novel-writer)](https://www.npmjs.com/package/claude-novel-writer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A [Claude Code](https://claude.ai/code) plugin for AI-assisted novel writing. Manages story structure, tracks consistency, assembles scene context for generation, and analyzes prose — all from within your Claude Code session.

## Installation

Two alternate methods — both install the same plugin globally, so use whichever you prefer:

```bash
# via npm
npm install -g claude-novel-writer
```

```bash
# via Claude Code's plugin manager
claude plugin install claude-novel-writer
```

Claude Code detects the extension automatically after installation. Restart Claude Code, then:

```
/novel help
```

### Local install (development / testing)

```bash
git clone https://github.com/mrskwiw/claude-novel-writer.git
cd claude-novel-writer/project
npm install && npm run build
claude --plugin-dir .
```

## How it works

Once installed, the plugin loads five skills into Claude's context. Claude reads the skill descriptions and **invokes them automatically** based on what you say — you don't need to remember command names.

- Say *"I want to write a novel"* in a blank folder → Claude initializes the project
- Say *"check my manuscript for inconsistencies"* → Claude runs consistency checks
- Say *"how's my pacing?"* → Claude runs the pacing analyzer
- Say *"I'm stuck, help me continue this scene"* → Claude loads scene context and generates

When you want direct control, use the `/novel` slash command or the `novel-writer` CLI.

## Requirements

- [Claude Code](https://claude.ai/code) ≥ 2.0
- Node.js ≥ 18
- pandoc (optional — for DOCX/EPUB/PDF export)
- `ANTHROPIC_API_KEY` (required for AI generation commands only)

## Starting a new novel

Open an empty folder in Claude Code and just say what you want:

> *"I want to write a novel called The Hollow Meridian"*

Claude will ask for your title, author name, and genre, then run the initializer. You'll end up with:

```
your-novel/
├── CLAUDE.md           ← tells Claude about this project on every session
├── .novel/
│   └── data.db         ← SQLite database (managed automatically)
├── characters/         ← YAML character profiles
├── chapters/           ← Markdown chapter files (YAML frontmatter)
├── locations/          ← YAML location files
├── plots/              ← YAML plot thread files
├── research/           ← Research notes and [VERIFY:] tracking
├── revisions/          ← Point-in-time snapshot archives
└── export/             ← Assembled and formatted manuscripts
```

The `CLAUDE.md` written here is the key: every future session in this folder, Claude reads it and knows what project this is, what structure it uses, and when to suggest each command.

Or skip the conversation and initialize directly:

```
/novel init --title "The Hollow Meridian" --author "Your Name" --genre "literary fiction"
```

## Proactive assistance

After initialization, Claude uses the loaded skills to assist without being prompted:

| When you say... | Claude does |
|---|---|
| "check for inconsistencies / contradictions" | runs `novel-writer check` |
| "how's my pacing / tension arc" | runs `novel-writer analyze pacing` |
| "give me feedback on my prose" | runs `novel-writer analyze prose` |
| "what still needs work" | runs `novel-writer draft scan` (finds `[TK]` markers) |
| "continue this scene / I'm stuck" | runs `novel-writer generate scene` |
| "write a synopsis / pitch / query letter" | runs the appropriate generator |
| "I'm about to do big revisions" | suggests saving a snapshot first |
| "any unresolved plot threads?" | runs `novel-writer check plot-threads` |

## Command reference

All commands are available as `/novel <command>` (slash command) or `novel-writer <command>` (CLI).

### Project

| Command | Description |
|---|---|
| `init` | Initialize project structure and database |
| `sync` | Sync all YAML/Markdown files to the database |
| `progress` | Writing session stats and word count |
| `session` | Start / end a timed writing session |

### Content creation

| Command | Description |
|---|---|
| `create character --name "Ada" --role protagonist` | Create a character profile |
| `create chapter --number 1 --title "The Arrival"` | Start a new chapter |
| `create scene --chapter 1` | Add a scene to a chapter |
| `create location --name "The Observatory"` | Add a location |
| `create plot --name "The Missing Letter"` | Add a plot thread |
| `create world-rule --name "No electricity"` | Add a world rule |
| `create timeline` | Add a timeline event |

### Viewing

| Command | Description |
|---|---|
| `list characters` | All characters |
| `list chapters` | Chapters with word counts |
| `list scenes` | Scenes (add `--chapter N` to filter) |
| `list locations` | Locations |
| `list plot` | Plot threads |
| `list world-rules` | World rules |
| `list timeline` | Timeline events |

### Consistency & analysis

| Command | Description |
|---|---|
| `check` | All consistency checks |
| `check characters` | Character attribute contradictions |
| `check timeline` | Timeline violation detection |
| `check world-rules` | World rule violations (AI-assisted) |
| `check plot-threads` | Unresolved plot threads |
| `analyze prose` | Economy score, show/tell ratio, sensory balance, character voices |
| `analyze pacing` | Tension arc, POV balance, chapter length distribution |
| `analyze copy` | POV slips, tense shifts, name variant detection |
| `analyze developmental` | Scene purpose audit, subplot balance, plot holes |
| `analyze style` | Grade prose against this project's `style-targets.yml` (`--chapter N` / `--all`) |
| `analyze voice` | Manuscript-wide voice analysis: flag too-similar voices and voices that drift |
| `analyze hook` | Score a chapter's opening-line hook strength (0–100) across six signals (`--chapter N`) |
| `revise <chapter>` | Diff-gated mechanical prose fixes — dry-run by default; `--apply <categories>` / `--all` |
| `structure apply\|status` | Beat templates (three-act / Save the Cat / Hero's Journey) vs word-count positions |
| `theme add\|list\|trace` | Register themes + motifs and trace motif density across chapters |
| `report` | One-screen manuscript-health dashboard (tension, threads, promises, `[TK]`s) |
| `readaloud` | Speak a chapter/scene/text aloud via the OS TTS engine (`--out` writes audio) |
| `extract --chapter N` | Scan drafted prose for new character/location candidates (or `--file outline.md` to bootstrap from a freeform outline) |
| `draft scan` | Find `[TK]`, `[TODO]`, `[CHECK]`, `[FIXME]` markers |
| `draft readaloud` | Rhythm analysis, accidental rhyme detection (text prep, not audio) |

### AI generation

Requires `ANTHROPIC_API_KEY`.

| Command | Description |
|---|---|
| `generate scene --scene-id N` | Scene continuation (3 alternatives, loads full context) |
| `generate next-sentence --scene-id N` | Hemingway one-true-sentence mode |
| `generate synopsis` | Full synopsis |
| `generate pitch` | One-paragraph pitch |
| `generate query` | Query letter draft |
| `generate comps` | Comparable titles |
| `generate character --id N` | Full character profile |
| `generate name` | Character or place name suggestions |
| `generate summary --chapter N` | ≤5-sentence chapter summary (API, or via the Claude Code session) |
| `generate overview` | Summary of the **intended** book from the planned outline + cast (pre-draft; `--length brief\|standard\|full`) |

### Research

| Command | Description |
|---|---|
| `research add --title "..." --url "..."` | Add a research note |
| `research list` | List notes (add `--tag history` to filter) |
| `research verify` | Scan manuscript for `[VERIFY: claim]` markers |
| `research mark-verified --id N` | Mark a note as verified |

### Revision & export

| Command | Description |
|---|---|
| `revision snapshot --label "draft-1"` | Save a named point-in-time snapshot |
| `revision list` | List saved snapshots |
| `revision diff --label "draft-1"` | Diff manuscript against a snapshot |
| `export markdown` | Assemble manuscript as a single Markdown file |
| `export docx` | Word document (requires pandoc) |
| `export epub` | EPUB (requires pandoc) |
| `export pdf` | PDF (requires pandoc) |

### Series & beta readers

| Command | Description |
|---|---|
| `series create --name "The Trilogy"` | Create a multi-book series |
| `series add-book` | Link current project to a series |
| `series bible` | View / edit shared series bible |
| `series threads` | Cross-book plot thread overview |
| `beta add --name "..." --email "..."` | Add a beta reader |
| `beta feedback add` | Log feedback |
| `beta summary` | Aggregated feedback overview |

### Intelligence layer

Tracks deeper narrative structure across the manuscript.

| Command | Description |
|---|---|
| `knowledge add` | Add a knowledge object (world fact, character detail) |
| `canon add` | Add a canon item; detect conflicts with existing canon |
| `promise add` | Record a narrative promise; track payoff |
| `context load --scene N` | Assemble full scene context for AI generation |
| `graph` | Show the narrative graph |

## Marking facts for verification

While drafting, tag anything you need to fact-check inline:

```markdown
She wore a [VERIFY: typical Victorian mourning dress, 1880s] of heavy crepe.
```

Scan all markers across your manuscript:

```
/novel research verify
```

## Architecture

The plugin stores all project data in a local SQLite database at `.novel/data.db`. The `novel-writer` CLI accesses it directly via `better-sqlite3`. When running inside Claude Code as a plugin, the same database is also accessible to Claude via an MCP SQLite server — allowing Claude to query story data directly during generation.

## Development

```bash
git clone https://github.com/mrskwiw/claude-novel-writer.git
cd claude-novel-writer/project
npm install
npm run build
npm test
```

Tests live in `../tests/` (workspace convention — never inside `project/`).

```bash
npm test                                                      # all tests
npx vitest run ../tests/unit/services/research-service.test.ts  # single file
npm run test:coverage                                         # coverage report
npx vitest run ../tests/smoke/install-smoke.test.ts          # install smoke test
```

## Contributing

Issues and pull requests welcome at [github.com/mrskwiw/claude-novel-writer](https://github.com/mrskwiw/claude-novel-writer).

## License

MIT — see [LICENSE](LICENSE).
