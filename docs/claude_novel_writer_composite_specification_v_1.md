# Claude Novel Writer — Composite Specification v1.0

> **Status**: Spec Complete (Authoritative)
>
> This document consolidates *all finalized specifications* for the Claude Novel Writer extension into a single, canonical reference. It supersedes fragmented specs and is intended to be the source of truth for implementation, review, and future evolution.

---

## 1. Purpose & Philosophy

### 1.1 Core Goal
Build an AI-assisted novel writing system that **supports the full creative lifecycle** of long-form fiction while:
- Respecting authorial intent and voice
- Supporting discovery writing (“follow the headlights”)
- Reducing friction to flow
- Tracking consistency across long manuscripts
- Encouraging completion over perfection

### 1.2 Design Ethos
- **Suggest, don’t dictate**
- **Files are canonical**; databases are derived
- **Determinism over magic**
- **Explainability over cleverness**
- **Scales to 100k–200k+ words**

---

## 2. Canonical Architecture

### 2.1 Hybrid Model
- **Human-editable files** (Markdown, YAML) are the source of truth
- **SQLite database (via MCP)** is an indexed, query-optimized mirror
- Database can always be rebuilt from files

### 2.2 Layering
```
CLI
 └─ Handlers
     └─ Builders
         ├─ File System (canonical)
         └─ Sync Managers
             └─ Database (derived)
```

### 2.3 Core Components
- Builders (chapters, scenes, characters, locations, plot threads, world rules, timeline)
- Sync managers (bidirectional, deterministic)
- Context assembly engine
- Consistency checker
- AI generation manager
- Export system

---

## 3. Determinism Contract

### 3.1 Slugging Rules (Global)
1. trim
2. lowercase
3. `& → and`
4. non-alphanumeric → `-`
5. collapse `-`
6. trim edges
7. empty → `untitled`
8. max 64 chars; overflow → `-<hash6>`

### 3.2 Canonical Entity Keys
- `chapter::<chapter_number>`
- `scene::<chapter_number>::<scene_number>`
- `character::<slug(name)>`
- `location::<slug(name)>`
- `plot_thread::<slug(name)>`
- `world_rule::<slug(name)>`
- `timeline_event::<slug(name)>`

### 3.3 Sync Guarantees
- **Order-stable**
- **Idempotent**
- **Monotonic** (DB IDs may change; meaning does not)

### 3.4 AI Auditability
All AI outputs must record:
- model
- temperature
- prompt hash
- timestamp
- optional seed

---

## 4. Core Domain Specs

### 4.1 Chapters
- Markdown files with YAML frontmatter
- Canonical filename: `NN-title.md`
- Parsed deterministically

### 4.2 Scenes
- Embedded in chapters using HTML comment markers
- Stable identity via chapter + scene number
- Parsed before prose analysis

### 4.3 Characters
- YAML profiles
- Track: physical facts, personality, voice, arc
- Used for consistency + context

### 4.4 Locations
- YAML profiles
- Hierarchical allowed
- Sensory + constraint-aware

### 4.5 Plot Threads
- YAML + DB
- Priority-scored
- Status tracked (planned / active / resolved)

### 4.6 World Rules
- YAML
- Categories (magic, tech, social, political, physics)
- Hard vs flexible rules enforced

### 4.7 Timeline
- YAML + DB
- Events + dependencies
- Chronological validation

---

## 5. Beat ↔ Scene Resolution (Final)

### 5.1 Accepted Scene References
- `Ch3.Scene2`
- `Ch3.S2`
- `Chapter 3 Scene 2`

### 5.2 Resolution Algorithm
1. Parse chapter + scene numbers
2. Resolve chapter
3. Resolve scene
4. Optional title match (only within chapter)
5. Never cross-chapter guess

### 5.3 Storage
- YAML stores raw ref
- DB stores `scene_id` + canonical key
- Unresolved beats allowed (warnings only)

### 5.4 CLI
- `/novel plot beat resolve`

---

## 6. Semantic Compression & Memory

### 6.1 Derived Context Artifacts (`.novel/context/`)

#### Scene Capsules
- 60–120 words
- POV, goal, conflict, outcome

#### Chapter Abstracts
- 150–250 words
- New facts, changes, open questions

#### Project Bible Cards
- Character facts
- World rules
- Timeline highlights

### 6.2 Extraction Order
1. Structured metadata
2. Deterministic parsing
3. AI summarization (optional, audited)

---

## 7. Context Assembly & Ranking

### 7.1 Priority Tiers
1. Scene neighborhood
2. POV character
3. Location
4. Active plot threads
5. Hard world rules
6. Timeline events

### 7.2 Ranking
- Cosine similarity (embeddings)
- Tie-breakers:
  1. recency
  2. thread priority
  3. hard > flexible rules

### 7.3 Deterministic Truncation
- Drop lowest tier first
- Stable sorting
- Explicit truncation report

---

## 8. Context Budget Allocator

Each request type defines:
- max input tokens
- reserved output tokens
- max items per tier

Context packs are serialized with full provenance and truncation metadata.

---

## 9. Revision Rationale (Editorial Memory)

### 9.1 Purpose
Preserve *why* changes were made so AI/editor tools do not undo intent.

### 9.2 Rationale Schema
```yaml
revision:
  entity_key:
  intent:
    category:
    goal:
    constraints:
  change_summary:
  references:
```

### 9.3 Enforcement
- AI tools must read relevant rationales
- Constraints are hard unless explicitly overridden

---

## 10. CLI System

### 10.1 Command Surface

- `/novel init`
- `/novel chapter *`
- `/novel scene *`
- `/novel character *`
- `/novel location *`
- `/novel plot *`
- `/novel world-rule *`
- `/novel timeline *`
- `/novel generate *`
- `/novel check *`
- `/novel export *`
- `/novel sync`

Commands are deterministic, composable, and side-effect explicit.

### 10.2 CLI Schema Export (Machine-Readable)

The CLI must expose a machine-readable schema describing all commands and flags.

**Contract**:
- A command like `/novel help --json` (or equivalent tool endpoint) returns:
  - `version`
  - command paths (e.g., `["chapter","create"]`)
  - args/flags with types and requiredness
  - examples
  - side-effects annotations
  - retry safety
  - deterministic idempotency keys

**Schema fields (minimum)**:
```json
{
  "version": "1.0",
  "commands": [
    {
      "path": ["chapter","create"],
      "description": "Create a chapter markdown file with YAML frontmatter",
      "args": [
        {"name": "number", "type": "int", "required": true},
        {"name": "title", "type": "string", "required": true}
      ],
      "examples": ["/novel chapter create --number 1 --title \"Opening\""],
      "side_effects": ["writes:chapters/*", "db:optional-on-sync"],
      "safe_to_retry": true,
      "idempotency_key": "chapter::<number>"
    }
  ]
}
```

### 10.3 CLI as Tools (Agent Execution Layer)

All `/novel ...` CLI commands must be invokable by a Claude subagent as tools.

#### 10.3.1 Tooling Model

Preferred model: **one generic execution tool plus schema**.

Required tool endpoints:
- `novel.help()` → returns the CLI schema (or shells out to `/novel help --json`)
- `novel.cli(command: string, args: object | argv: string)` → executes a validated CLI command

The tool layer must return:
- `exit_code`
- `stdout`
- `stderr`
- optional `artifacts` (paths created/modified) when detectable

#### 10.3.2 Side-Effect Guardrails

The tool layer must enforce:
- Only commands within the `/novel` namespace are allowed
- Flags must validate against the schema (reject unknown flags)
- Destructive commands (delete/overwrite) require explicit allowlist or `allow_destructive=true`
- Every command execution is logged with:
  - timestamp
  - cwd/project root
  - argv/args
  - stdout/stderr hashes
  - declared side-effects categories

### 10.4 Required Claude Subagent: `novel_cli_operator`

A dedicated Claude subagent must exist whose job is to operate the CLI safely and deterministically.

#### 10.4.1 Responsibilities
- Translate parent-agent intent into the minimum necessary `/novel` tool calls
- Prefer read-only commands first (list/show/stats/check) before write commands
- Be deterministic: stable ordering, stable identifiers, no randomization
- Return structured results:
  - `commands_run`
  - `outputs` (exit code, stdout, stderr)
  - `parsed` (structured interpretation when possible)
  - `next_actions` (optional recommended follow-ups)

#### 10.4.2 Non-Responsibilities
- Does not invent story content
- Does not make editorial judgments
- Does not directly modify files except via explicit `/novel` tool calls

#### 10.4.3 Subagent Prompt (Normative)

```text
You are novel_cli_operator. Your only job is to operate the Claude Novel Writer CLI as tools.

Rules:
1) You may ONLY accomplish tasks by calling the novel CLI tools (/novel ...). Do not propose edits that are not backed by tool calls.
2) Prefer read-only commands first (list/show/stats/check) before write commands.
3) Every write command must be explicitly justified by the parent agent’s instruction.
4) Be deterministic: stable ordering, stable identifiers, no randomization.
5) Report back a structured result:
   - commands_run: [ ... ]
   - outputs: [{command, exit_code, stdout, stderr}]
   - parsed: any structured interpretation
   - next_actions: recommended follow-up commands (optional)
6) If a command fails, attempt ONE safe alternative if available in the schema; otherwise report the error.
7) Never invent file paths; always rely on CLI output and schema.

You have access to:
- novel.help (schema)
- novel.cli (execute a command)
```

---

## 11. Export System

- Clean manuscript assembly
- Metadata stripping
- Scene marker removal
- Markdown output suitable for Pandoc → DOCX / EPUB / PDF

---

## 12. Claude CLI Operator Subagent (Tooling Agent)

### 12.1 Purpose
Introduce a dedicated Claude subagent responsible for **operating the Novel CLI as tools**. This agent translates intent into deterministic CLI executions and returns structured results.

This agent separates **editorial reasoning** from **operational execution**, enabling safe automation and multi-agent orchestration.

### 12.2 Agent Name
`novel_cli_operator`

### 12.3 Responsibilities
- Execute `/novel ...` CLI commands as tools
- Determine minimal command sequences to satisfy instructions
- Prefer read-only commands before write commands
- Enforce determinism, idempotency, and explicit side effects
- Return structured execution reports

### 12.4 Non-Responsibilities
- Does not invent story content
- Does not make editorial decisions
- Does not modify files except via explicit CLI commands

### 12.5 Tool Surface
The CLI is exposed to the agent as tools via a generic executor:

```ts
novel.cli({ argv: string }): {
  exit_code: number;
  stdout: string;
  stderr: string;
  artifacts?: Record<string, any>;
}
```

Additionally, a schema discovery tool is provided:

```ts
novel.help(): NovelCLISchema
```

### 12.6 CLI Schema Contract
The schema enumerates all commands with machine-readable metadata:

```json
{
  "version": "1.0",
  "commands": [
    {
      "path": ["chapter", "create"],
      "description": "Create a chapter",
      "args": [
        {"name": "number", "type": "int", "required": true},
        {"name": "title", "type": "string", "required": true}
      ],
      "side_effects": ["writes:chapters/*"],
      "safe_to_retry": true,
      "idempotency_key": "chapter::<number>",
      "examples": [
        "/novel chapter create --number 1 --title 'Opening'"
      ]
    }
  ]
}
```

This schema is generated directly from the CLI registry and is authoritative.

### 12.7 Operator Agent Rules (Hard)
The `novel_cli_operator` agent must:
1. Use only `/novel` CLI tools
2. Never invent file paths or identifiers
3. Respect `safe_to_retry` and `idempotency_key`
4. Require explicit authorization for destructive commands
5. Produce a structured execution report:

```yaml
commands_run:
  - "/novel chapter list"
outputs:
  - command: "/novel chapter list"
    exit_code: 0
    stdout: "..."
    stderr: ""
parsed:
  chapters: ["01-opening.md"]
next_actions:
  - "/novel chapter create ..."
```

### 12.8 Orchestration Pattern
- **Primary Agent**: determines intent, goals, and editorial reasoning
- **CLI Operator Agent**: executes commands and reports results

This enables safe multi-agent workflows (planner → executor).

---

## 13. Negative Spec (Explicit Non-Goals)


## 13. Versioning

- Spec versioned independently of code
- Breaking spec changes require version bump

---

## 14. Status

**This specification is complete.**

All remaining work is implementation, testing, and iteration — not design discovery.

