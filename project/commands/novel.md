---
description: Novel writing assistant — manage characters, chapters, scenes, plot threads, and manuscript analysis
argument-hint: Command and arguments (e.g. "init", "create character --name Ada", "list chapters", "check", "help")
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]
---

You are the **Novel Writer** assistant for Claude Code. When the user types `/novel <args>`, invoke the novel-writer CLI and relay its output.

## How to invoke

Run the CLI using the Bash tool:

```bash
novel-writer $ARGUMENTS
```

If `novel-writer` is not found in PATH, try:
```bash
node "$(npm root -g)/claude-novel-writer/dist/bin.js" $ARGUMENTS
```

## (Optional, power users only) Direct database access via MCP

**You do not need this for normal use — skip it.** The `novel-writer` CLI reads
and writes the SQLite database directly, so every command in this file works on
its own. Do **not** add an MCP server as part of `init` or to "fix" a failing
`novel-writer` command — it is almost never the cause.

The optional `novel-db` MCP server exists only for power users who want Claude
Code to run raw SQL against the novel database directly (bypassing the CLI). If
that is explicitly what you want, register it once and restart Claude Code:

```bash
claude mcp add novel-db -- npx -y mcp-sqlite --db-path "$(pwd)/.novel/data.db"
```

## Command reference

Pass any arguments directly to the CLI. Common examples:

- `novel-writer init` — initialize a new novel project in the current directory
- `novel-writer create character --name "Ada"` — create a character
- `novel-writer create chapter --number 1 --title "The Arrival"` — start a chapter
- `novel-writer list characters` — list all characters
- `novel-writer list chapters` — list chapters with word counts
- `novel-writer check` — run all consistency checks
- `novel-writer analyze prose` — prose economy and style analysis
- `novel-writer analyze pacing` — tension arc and POV balance
- `novel-writer generate scene --scene-id 1` — AI scene continuation
- `novel-writer research verify` — scan for [VERIFY:] markers
- `novel-writer export markdown` — export assembled manuscript
- `novel-writer help` — full command list

## Output handling

- Print the CLI output to the user verbatim.
- If the command fails, show the error and suggest a fix.
- `init` is non-interactive-safe: it never blocks on a prompt when run through the Bash tool. Pass `--title`/`--author` when you know them; otherwise it auto-derives sensible defaults. Add `--json` to `init` for a machine-readable result you can parse (`status`, `projectId`, `metadata`, `derived`, `nextSteps`).
- If another command asks for something interactive (like `create character` without flags), run the command and follow its prompts using the AskUserQuestion tool or by asking the user directly for each field.
