# Project Structure

This document explains the organization of the Claude Novel Writer repository.

## Repository Organization

The repository is organized into three main areas:

### 1. Development Documentation (Root)

Files related to developing and understanding the plugin itself:

```
claudenovel/
├── AI_ASSISTED_GENERATION_SPEC.md    # Complete spec for AI-assisted features and subagents
├── BUILDER_FEATURE_SUMMARY.md        # Summary of interactive builder features
├── BUILDERS_README.md                # Documentation for character/location builders
├── CLAUDE.md                         # Instructions for Claude Code when working on this project
├── MCP_SQLITE_OPTIONS.md            # Analysis of MCP SQLite server options
├── NOVEL_CRAFT_PRINCIPLES.md        # 15 core principles from master novelists
├── PROJECT_STRUCTURE.md             # This file
├── PROJECT_SUMMARY.md               # Historical summary of development
├── README.md                         # Main project documentation (also copied to plugin)
├── QUICKSTART.md                     # Quick start guide (also copied to plugin)
├── SCHEMA_DESIGN.md                 # Database schema design documentation
├── STRUCTURAL_STYLE_GUIDE.md        # Template for prose structure guide
├── COMPOSITIONAL_STYLE_GUIDE.md     # Template for narrative composition guide
└── WRITING_PROCESS_BREAKDOWN.md     # 11-phase novel writing process analysis
```

**Purpose**: These files help developers understand the philosophy, architecture, and implementation of the plugin. They remain in the repository root for reference but are not distributed with the plugin.

### 2. Distributable Plugin (claudenovel_plugin/)

The actual plugin that gets published and installed:

```
claudenovel_plugin/
├── src/                              # TypeScript source code
│   ├── builders/                     # Character and location builders
│   ├── commands/                     # Command implementations
│   ├── consistency/                  # Consistency checking
│   ├── context/                      # Context assembly for AI prompts
│   ├── core/                         # Database and core functionality
│   ├── sync/                         # File-to-database synchronization
│   ├── types/                        # TypeScript type definitions
│   ├── utils/                        # Utility functions
│   └── index.ts                      # Main entry point
├── examples/                         # Example code and usage
│   ├── character-template.yml
│   ├── location-template.yml
│   ├── interactive-builder-example.ts
│   └── usage-example.ts
├── novel/                            # Template for new novel projects (see below)
├── schema.sql                        # SQLite database schema
├── package.json                      # NPM package configuration
├── tsconfig.json                     # TypeScript configuration
├── README.md                         # User-facing documentation
└── QUICKSTART.md                     # Quick start for users
```

**Purpose**: This is what gets installed when users add the plugin. It contains all the code, examples, and templates needed to use the novel writing assistant.

**Publishing**: When ready to publish:
```bash
cd claudenovel_plugin
npm publish
```

### 3. Novel Project Template (claudenovel_plugin/novel/)

The uninitialized structure that gets copied to each new novel project:

```
novel/
├── .novel/                           # Extension metadata
│   └── .gitkeep                      # (data.db created on init)
├── characters/                       # Character profiles (YAML)
│   └── character-template.yml
├── locations/                        # Locations and world elements (YAML)
│   └── location-template.yml
├── chapters/                         # Chapter files (Markdown)
│   └── .gitkeep
├── research/                         # Research materials
│   └── .gitkeep
├── revisions/                        # Previous drafts
│   └── .gitkeep
├── export/                           # Generated manuscripts
│   └── .gitkeep
├── STRUCTURAL_STYLE_GUIDE.md        # Author's prose structure preferences
├── COMPOSITIONAL_STYLE_GUIDE.md     # Author's narrative voice guide
└── README.md                         # Template documentation
```

**Purpose**: When an author runs `novel init` to start a new project, this entire structure gets copied to their project directory. The style guides are filled out by the author to help AI assistants match their voice.

**Usage**: Each novel project is separate and independent:
```
my-novels/
├── space-opera/                      # Novel project 1
│   ├── .novel/
│   ├── characters/
│   ├── chapters/
│   └── ...
├── mystery-thriller/                 # Novel project 2
│   ├── .novel/
│   ├── characters/
│   └── ...
```

## Development Workflow

### Working on the Plugin

1. Make changes in `claudenovel_plugin/src/`
2. Build: `cd claudenovel_plugin && npm run build`
3. Test with example projects
4. Update documentation in `claudenovel_plugin/README.md`
5. Commit changes to repository

### Adding New Features

1. **Design**: Update specs in root documentation (AI_ASSISTED_GENERATION_SPEC.md, etc.)
2. **Implement**: Add code to `claudenovel_plugin/src/`
3. **Schema**: Update `claudenovel_plugin/schema.sql` if needed
4. **Examples**: Add examples to `claudenovel_plugin/examples/`
5. **Document**: Update user-facing README and QUICKSTART
6. **Test**: Test with real novel project

### Updating Templates

If you need to change the novel project template structure:

1. Update `claudenovel_plugin/novel/` directory
2. Update `claudenovel_plugin/novel/README.md`
3. Update initialization code in `src/core/` to use new structure
4. Document changes in release notes

## File Type Categories

### Development Only (Root)
- Specs and design documents
- Research and principles
- Architecture documentation
- Development notes

### Distributed (claudenovel_plugin/)
- Source code
- Compiled JavaScript (dist/)
- Configuration files
- User documentation
- Examples
- Novel template

### Per-Novel (copied from novel/)
- Project directories structure
- Style guides
- Templates
- README

## Key Design Decisions

### Why Separate Development Docs?

**Rationale**:
- Keeps published package size small
- Development context available in repository
- Users don't need internal design docs
- Clear separation of concerns

### Why Include Template in Plugin?

**Rationale**:
- Plugin can initialize new projects automatically
- Ensures consistent project structure
- Users get best practices out of the box
- Style guides included from start

### Why Human-Editable Files + Database?

**Rationale**:
- Files are git-friendly and author-editable
- Database enables fast queries for AI context
- Bidirectional sync keeps both in sync
- Authors can work in YAML or through extension

## Building and Testing

### Build the Plugin

```bash
cd claudenovel_plugin
npm install
npm run build
```

Compiled JavaScript goes to `claudenovel_plugin/dist/`

### Test with Example Project

```bash
# Create test novel project
mkdir test-novel
cd test-novel

# Copy template
cp -r ../claudenovel_plugin/novel/* .

# Initialize (when plugin installed)
# novel init
```

### Run Examples

```bash
cd claudenovel_plugin
npm run build
node examples/interactive-builder-example.js
```

## Publishing Checklist

Before publishing to NPM:

- [ ] Build succeeds: `npm run build`
- [ ] Version bumped in package.json
- [ ] README.md updated with new features
- [ ] QUICKSTART.md reflects current usage
- [ ] Examples work with latest code
- [ ] Schema changes documented
- [ ] Template structure verified
- [ ] Style guides have good examples

Then publish:
```bash
cd claudenovel_plugin
npm publish
```

## Version Control

### What to Commit

**Always commit**:
- Development documentation (root)
- Source code (claudenovel_plugin/src/)
- Schema and config files
- Examples
- Template structure
- README and guides

**Never commit**:
- `node_modules/`
- `dist/` (generated)
- `*.db` files (user data)
- Test novel projects
- Build artifacts

### .gitignore

Ensure `.gitignore` includes:
```
node_modules/
dist/
*.db
*.db-journal
test-novel/
.DS_Store
```

---

## Summary

This structure separates three concerns:

1. **Development** (root): How the plugin is designed and built
2. **Distribution** (claudenovel_plugin/): What users install
3. **Templates** (novel/): What gets copied to author projects

This keeps the published package clean while maintaining comprehensive development documentation in the repository.
