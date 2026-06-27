# Plugin Packaging Plan
**Version:** v1.0
**Status:** Planning
**Target:** `claude-novel-writer` v0.1.0 on npm public registry

---

## Goal

Publish `claude-novel-writer` as a distributable npm package that:
1. Installs with `npm install -g claude-novel-writer`
2. Is auto-discovered by Claude Code via the `claudeCode` field in `package.json`
3. Registers the `/novel` slash command and two MCP servers in Claude Code
4. Passes `prepublishOnly` gate (build → lint → test) before every release

---

## Pre-conditions

- Node ≥ 18 installed on build machine
- npm account with publish rights to `claude-novel-writer`
- GitHub account with rights to create `github.com/mrskwiw/claude-novel-writer`
- `ANTHROPIC_API_KEY` available for e2e/integration tests that call Claude

---

## Phase 1 — Pre-flight Audit

**Goal:** Know exactly what the package contains before changing anything.

| Task | Command | Accept / Fail |
|------|---------|---------------|
| Dry-pack to see exact file list | `npm pack --dry-run` | All listed `files` entries resolve to actual paths |
| Check package size | `npm pack --dry-run 2>&1 \| grep "npm notice total"` | < 5 MB unpacked |
| Confirm `LICENSE` exists | `ls LICENSE` | Present |
| Confirm `QUICKSTART.md` exists | `ls QUICKSTART.md` | Present |
| Confirm `examples/` exists | `ls examples/` | Present or remove from `files` |
| Confirm `mcp-server/novel-tools/` | `ls mcp-server/novel-tools/` | Exists with entry point |
| Confirm `mcp-server/launch.js` | `ls mcp-server/launch.js` | Present |
| Check npm name availability | `npm info claude-novel-writer` | 404 (not taken) |
| Clean build from scratch | `rm -rf dist && npm run build` | Zero tsc errors |

**Deliverable:** Written audit notes — what exists, what is missing, package size.

---

## Phase 2 — Package Cleanup

**Goal:** Ensure the published artifact is minimal, correct, and self-contained.

### 2.1 Trim `files` field

Remove `src/` — consumers only need compiled output; source is on GitHub.

```json
"files": [
  "dist",
  "schema.sql",
  "mcp-server",
  "examples",
  "README.md",
  "QUICKSTART.md",
  "LICENSE",
  "CHANGELOG.md"
]
```

Remove `novel/` unless it is a template project needed at runtime.

### 2.2 Add `prepare` script

Ensures `dist/` is always rebuilt from source on install-from-GitHub and on `npm publish`.

```json
"prepare": "npm run build"
```

The existing `prepublishOnly` already runs build → lint → test before every `npm publish`. `prepare` adds the `npm install` from source case.

### 2.3 Create missing files

- **`LICENSE`** — MIT license text dated current year, author `mrskwiw`
- **`QUICKSTART.md`** — if absent, create a 1-page fast-start guide (init → sync → generate)
- **`examples/`** — minimal sample project demonstrating `novel-writer init` output structure; real content optional

### 2.4 Verify MCP server build chain

`claudeCode.extension.mcpServers.novel-tools` points to:
```
${workspaceFolder}/mcp-server/novel-tools/dist/index.js
```

Check whether `mcp-server/novel-tools/` has its own TypeScript and build step. If yes:
- Add to root `build` script: `npm run build && cd mcp-server/novel-tools && npm run build`
- Or use an npm workspace if the directory has its own `package.json`

If it's plain JS: no action needed, confirm entry point exists.

### 2.5 Version alignment

`package.json` version and `claudeCode.extension.version` must match on every release. Add a `preversion` script to enforce this:

```json
"preversion": "node -e \"const p=require('./package.json'); if(p.version !== p.claudeCode.extension.version) { console.error('version mismatch'); process.exit(1); }\""
```

### 2.6 Validate with dry-pack

After cleanup, re-run `npm pack --dry-run` and confirm:
- `src/` is absent
- All listed files are present
- Size is reasonable

---

## Phase 3 — GitHub Repository

**Goal:** Source of truth for all future development; required for CI.

1. Create `github.com/mrskwiw/claude-novel-writer` (public)
2. Add `.gitignore`:
   ```
   node_modules/
   dist/
   mcp-server/novel-tools/dist/
   .env
   *.tsbuildinfo
   coverage/
   *.tgz
   ```
3. Initial commit: all source, docs, config — no `dist/`
4. Set branch protection on `main`: require CI to pass before merge

---

## Phase 4 — CI/CD Pipeline

**Goal:** Prevent broken releases; automate publish on GitHub Release creation.

### `ci.yml` — runs on every push and PR

```yaml
name: CI
on: [push, pull_request]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - run: npm run lint
      - run: npm test
```

### `publish.yml` — runs on GitHub Release created

```yaml
name: Publish
on:
  release:
    types: [created]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Required:** Add `NPM_TOKEN` secret to GitHub repo settings.

### README badge

```markdown
[![CI](https://github.com/mrskwiw/claude-novel-writer/actions/workflows/ci.yml/badge.svg)](https://github.com/mrskwiw/claude-novel-writer/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/claude-novel-writer)](https://www.npmjs.com/package/claude-novel-writer)
```

---

## Phase 5 — npm Publication

**Goal:** Package live on public registry.

```bash
# 1. Verify name is available
npm info claude-novel-writer
# Expected: 404 or "npm error 404 Not Found"

# 2. Log in
npm login

# 3. Final dry-run check
npm pack --dry-run

# 4. Publish
npm publish --access public

# 5. Verify
npm info claude-novel-writer

# 6. Smoke test in a clean directory
mkdir /tmp/novel-test && cd /tmp/novel-test
npm install -g claude-novel-writer
novel-writer --help
```

The `prepublishOnly` hook (`build → lint → test`) runs automatically and will abort if any step fails.

---

## Phase 6 — Documentation Polish

### README updates

Add to the top of the Installation section:

```markdown
## Installation

```bash
npm install -g claude-novel-writer
```

Claude Code detects the `claudeCode` extension automatically after installation.
Restart Claude Code, then `/novel help` to verify.
```

Add the CI and npm badges (from Phase 4).

### CHANGELOG

Finalize the `[0.1.0]` entry:
- Replace placeholder date with actual release date
- Confirm all features listed are accurate and shipped

### `claudeCode.extension.version` sync

After any `npm version` bump, manually update `claudeCode.extension.version` to match (or the `preversion` script catches the mismatch).

---

## Phase 7 — Release

```bash
# Bump version (also triggers preversion check and prepublishOnly)
npm version 0.1.0

# Push with tags
git push origin main --tags

# Create GitHub Release
# - Tag: v0.1.0
# - Title: v0.1.0 — Initial Release
# - Body: paste CHANGELOG [0.1.0] section
```

If `publish.yml` CI is in place, `npm publish` fires automatically from the GitHub Release creation. Otherwise run manually.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `claude-novel-writer` name taken on npm | Medium | Blocking | Check in Phase 1; have `novel-writer-claude` as backup |
| `mcp-server/novel-tools/` not buildable | Medium | High | Audit in Phase 1; fix build chain in Phase 2 |
| `dist/` committed to repo | Low | Medium | `.gitignore` excludes it; `prepare` rebuilds on install |
| e2e tests fail without `ANTHROPIC_API_KEY` in CI | High | Low | Skip e2e in CI (`npm run test:unit && npm run test:integration`) |
| Package size too large due to `src/` | Medium | Low | Phase 2.1 removes `src/` from `files` |
| Version drift between `package.json` and `claudeCode.extension.version` | Medium | Medium | `preversion` script enforces alignment |

---

## Definition of Done

- [ ] `npm pack --dry-run` shows no missing files, size < 5 MB
- [ ] `npm run build && npm run lint && npm test` all pass from clean checkout
- [ ] GitHub repo exists with CI green
- [ ] `npm info claude-novel-writer` returns version 0.1.0
- [ ] `npm install -g claude-novel-writer && novel-writer --help` works in a clean environment
- [ ] Claude Code detects the extension after fresh install (MCP servers start, `/novel` responds)
- [ ] GitHub Release v0.1.0 created with CHANGELOG notes
