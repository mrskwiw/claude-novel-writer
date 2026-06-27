# Quick Start — claude-novel-writer

## 1. Install the plugin

```bash
claude plugin install claude-novel-writer
```

Restart Claude Code after installing.

---

## 2. Start a new novel

Create an empty folder for your novel and open it in Claude Code:

```bash
mkdir my-novel && cd my-novel
claude .
```

Then just say what you want. The plugin recognizes natural language:

> *"I want to write a novel"*

or

> *"Set this up as my novel project — it's a fantasy called The Hollow Meridian"*

Claude will ask for your title, author name, and genre (or pick them up from what you said), then run the initializer. You'll have a working project structure and a `CLAUDE.md` in under a minute.

If you prefer explicit control:

```
/novel init --title "The Hollow Meridian" --author "Your Name" --genre fantasy
```

---

## 3. What you get

```
my-novel/
├── CLAUDE.md           ← tells Claude about this project on every session
├── .novel/data.db      ← SQLite database (do not edit directly)
├── characters/         ← YAML character profiles
├── chapters/           ← Markdown chapter files
├── locations/          ← YAML location files
├── plots/              ← YAML plot thread files
├── research/           ← Research notes
├── revisions/          ← Draft snapshots
└── export/             ← Assembled manuscripts
```

The `CLAUDE.md` is the key piece: every time you open this folder in Claude Code, Claude reads it and knows this is a novel project. You don't need to re-explain the context.

---

## 4. Add your first character

```
/novel create character --name "Ada Voss" --role protagonist --summary "A disgraced archivist who discovers her predecessor hid something in the stacks"
```

Or just say: *"Add a protagonist named Ada Voss — she's a disgraced archivist"*

---

## 5. Write your first chapter

```
/novel create chapter --number 1 --title "The Last Catalogue"
```

This creates `chapters/chapter-01-the-last-catalogue.md` with YAML frontmatter. Open it and start writing.

---

## 6. Get feedback as you draft

You don't need to know which command to run — just ask:

> *"Check my manuscript for inconsistencies"*
> *"How's the pacing in chapter 3?"*
> *"Am I showing or telling too much?"*
> *"What plot threads are still unresolved?"*

Claude will run the right analysis and explain the results.

For direct control:

```
/novel check
/novel analyze prose
/novel analyze pacing
```

---

## 7. Mark things to verify later

While drafting, tag facts you haven't confirmed:

```markdown
The carriage fare was [VERIFY: typical cost of a hansom cab, London 1880s].
```

When you're ready to research:

```
/novel research verify
```

Claude lists every marker across all your chapters with line numbers.

---

## 8. Save a snapshot before major revisions

Before restructuring or rewriting anything significant:

```
/novel revision snapshot --label "before-act-2-rewrite"
```

You can diff against it later:

```
/novel revision diff --label "before-act-2-rewrite"
```

---

## 9. Export your manuscript

```
/novel export markdown          # single .md file
/novel export docx              # Word document (requires pandoc)
/novel export epub              # EPUB (requires pandoc)
```

Output lands in `export/`.

---

## 10. Generate when you're stuck

AI generation requires `ANTHROPIC_API_KEY` to be set in your environment.

```
/novel generate scene --scene-id 1      # 3 alternative continuations
/novel generate next-sentence           # one true next sentence (Hemingway mode)
/novel generate synopsis                # full synopsis
/novel generate pitch                   # one-paragraph pitch
/novel generate query                   # query letter draft
```

Or just say: *"I'm stuck on this scene, help me figure out what happens next"*

---

## All commands

```
/novel help
```

---

## Everyday workflow

The plugin is designed so you mostly don't need to think about commands. Open your novel folder, write, and ask Claude questions in plain language. The right tools run automatically.

When you want to be explicit:

| What you want | Command |
|---|---|
| See all characters | `/novel list characters` |
| Check for problems | `/novel check` |
| Analyze prose | `/novel analyze prose` |
| Find incomplete sections | `/novel draft scan` |
| Sync edited YAML files | `/novel sync` |
| Export the manuscript | `/novel export markdown` |
