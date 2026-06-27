# Claude Novel Writer — Developer Repository

> **This is the developer repository** — full source, test suite, and design docs.
> If you just want to *use* the tool, install the released package from npm
> (see [Using the released version](#using-the-released-version)). You do **not**
> need this repository to use it.

AI-assisted novel writing for [Claude Code](https://claude.com/claude-code). Manage
characters, locations, chapters, scenes, plot threads, world rules, and a story
timeline in a local SQLite database; run **deterministic** prose, pacing, and
consistency analysis; and optionally use Claude for drafting and suggestions.

Philosophy: **suggest, don't dictate.** This is not a "write my novel for me" tool —
it supports the writer, preserves their voice, and favours finishing over perfection.

---

## Using the released version

Most people want this. A basic, ready-to-use version is published to npm and works
out of the box — no source checkout, no build step:

```bash
npm install -g claude-novel-writer
```

or install it as a Claude Code plugin:

```bash
claude plugin install claude-novel-writer
```

Restart Claude Code, then run `/novel help` (or `novel-writer help` in a terminal).
Full usage documentation lives in **[project/README.md](project/README.md)** and
**[project/QUICKSTART.md](project/QUICKSTART.md)**.

---

## This repository (developer version)

This repo contains more than the npm package ships: the complete TypeScript source,
the full test suite, and design/spec docs. **It does not include `node_modules/` or
the compiled `dist/` output**, so you must install dependencies and build before it
will run:

```bash
git clone https://github.com/mrskwiw/claude-novel-writer.git
cd claude-novel-writer/project

npm install      # REQUIRED — node_modules is not committed (native deps, size)
npm run build    # compile TypeScript → dist/
npm test         # run the vitest suite
```

Run the CLI from your local build:

```bash
node dist/bin.js help
```

`package-lock.json` is committed, so `npm ci` reproduces the exact dependency tree.

### Repository layout

| Path | Contents |
|---|---|
| `project/` | The publishable npm package (`claude-novel-writer`). `npm publish` runs here. |
| `tests/` | Full test suite (the vitest config in `project/` includes `../tests/**`). |
| `docs/` | Specs, plans, SOPs, and exploration notes. |
| `archive/` | Summaries of completed/obsolete docs. |
| `BUGS.md`, `TODO.md` | Issue and task tracking. |

> **Note:** the repo and the npm package are intentionally different sets of files —
> the package ships only a subset of `project/` (see its `package.json` `files`).
> See **[CLAUDE.md](CLAUDE.md)** for the project-specific repository-structure rules.

---

## Links

- **User guide:** [project/README.md](project/README.md)
- **Quickstart:** [project/QUICKSTART.md](project/QUICKSTART.md)
- **Changelog:** [project/CHANGELOG.md](project/CHANGELOG.md)
- **npm:** https://www.npmjs.com/package/claude-novel-writer
