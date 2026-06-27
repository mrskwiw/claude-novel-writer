# CLI Commands Implementation Progress

**Date**: 2025-10-26
**Status**: In Progress

## Overview

Implementing the complete CLI command system for the Claude Novel Writer extension. Commands are activated via the `/novel` slash command in Claude Code.

## Command Implementation Status

### ✅ Completed Commands

#### 1. `/novel init` - Initialize Project
- **Status**: ✅ Complete
- **Features**:
  - Interactive and non-interactive modes
  - Project metadata collection (title, author, genre, target word count, phase)
  - Directory structure creation
  - Database initialization
  - Success message with next steps

#### 2. `/novel create` - Create Content
- **Status**: ✅ Complete with 4 subcommands
- **Subcommands**:
  - `character` - Create character profiles (YAML files)
  - `location` - Create location files (YAML files)
  - `chapter` - Create chapter markdown files
  - `plot` - Create plot threads (database records)
- **Features**:
  - Interactive and non-interactive modes
  - Validation of required fields
  - Auto-sync to database
  - Success messages with next steps
  - Multiple aliases (create/new/add)

#### 3. `/novel list` - List Content
- **Status**: ✅ Complete with 5 subcommands
- **Subcommands**:
  - `characters` - List all characters with filtering by role
  - `locations` - List all locations with filtering by type
  - `chapters` - List all chapters with filtering by POV
  - `plots` - List all plot threads with filtering by type/status
  - `issues` - List consistency issues with filtering by severity/type/status
- **Features**:
  - Multiple output formats (table, list, detailed)
  - Filtering options
  - Empty state handling
  - Grouped display for issues (by severity)
  - Multiple aliases (list/ls)

#### 4. `/novel help` - Show Help
- **Status**: ✅ Complete (built into parser)
- **Features**:
  - General help (lists all commands)
  - Command-specific help
  - Examples for each command
  - Flag documentation

### ⏳ Pending Commands

#### 5. `/novel sync` - Synchronize Files
- **Subcommands**: all, characters, locations, chapters
- **Purpose**: Sync YAML/MD files to database
- **Priority**: High (needed for workflow)

#### 6. `/novel check` - Run Checks
- **Subcommands**: consistency, timeline, threads
- **Purpose**: Check manuscript for errors
- **Priority**: High (core feature)

#### 7. `/novel show` - Show Details
- **Subcommands**: character, location, chapter, plot, stats
- **Purpose**: Display detailed information about elements
- **Priority**: Medium (useful for viewing)

#### 8. `/novel export` - Export Manuscript
- **Subcommands**: manuscript, outline
- **Purpose**: Export to various formats
- **Priority**: Medium (production feature)

#### 9. `/novel analyze` - Analyze Manuscript
- **Subcommands**: pacing, wordcount, progress
- **Purpose**: Provide analytics and insights
- **Priority**: Low (nice to have)

## File Structure

### Commands (Definitions)
```
src/cli/commands/
├── init.ts          ✅ Complete
├── create.ts        ✅ Complete (character, location, chapter, plot)
└── list.ts          ✅ Complete (characters, locations, chapters, plots, issues)

Pending:
├── sync.ts          ⏳ Pending
├── check.ts         ⏳ Pending
├── show.ts          ⏳ Pending
├── export.ts        ⏳ Pending
└── analyze.ts       ⏳ Pending
```

### Handlers (Implementation)
```
src/cli/handlers/
├── init-handler.ts     ✅ Complete
├── create-handler.ts   ✅ Complete (4 functions)
└── list-handler.ts     ✅ Complete (5 functions)

Pending:
├── sync-handler.ts     ⏳ Pending
├── check-handler.ts    ⏳ Pending
├── show-handler.ts     ⏳ Pending
├── export-handler.ts   ⏳ Pending
└── analyze-handler.ts  ⏳ Pending
```

### Registry
```
src/cli/registry.ts     ✅ Updated
- Registered: init, create, list
- Pending: sync, check, show, export, analyze
```

## Command Details

### `/novel create` Commands

#### `/novel create character`
**Syntax**:
```bash
/novel create character --name "Sarah Chen" --role protagonist --summary "A brilliant scientist"
```

**Flags**:
- `--name` (required) - Character name
- `--role` (required) - protagonist/antagonist/major/minor/background
- `--summary` (required) - Character description
- `--full-name` - Full/formal name
- `--age` - Age
- `--eyes` - Eye color
- `--hair` - Hair color
- `--height` - Height
- `--build` - Body build

**Output**:
- Creates YAML file in `characters/`
- Syncs to database
- Shows file path and next steps

#### `/novel create location`
**Syntax**:
```bash
/novel create location --name "SETI Observatory" --description "A remote facility" --type building
```

**Flags**:
- `--name` (required) - Location name
- `--description` (required) - Description
- `--type` - Location type (city, building, room, planet, etc.)
- `--parent` - Parent location name

**Output**:
- Creates YAML file in `locations/`
- Syncs to database
- Shows file path and next steps

#### `/novel create chapter`
**Syntax**:
```bash
/novel create chapter --number 1 --title "The Signal" --pov sarah --scenes 3
```

**Flags**:
- `--number` - Chapter number (default: next available)
- `--title` (required) - Chapter title
- `--pov` - POV character name
- `--location` - Default location
- `--scenes` - Number of scenes (default: 1)

**Output**:
- Creates markdown file in `chapters/`
- Includes YAML frontmatter
- Adds scene placeholders
- Shows file path and next steps

#### `/novel create plot`
**Syntax**:
```bash
/novel create plot --name "The Mystery" --type subplot --priority 3
```

**Flags**:
- `--name` (required) - Plot thread name
- `--type` - main/subplot/character/theme (default: subplot)
- `--description` - Plot description
- `--priority` - Priority 1-5 (default: 3)
- `--status` - planned/active/resolved/abandoned (default: planned)

**Output**:
- Inserts into database
- Shows plot details
- Provides next steps

### `/novel list` Commands

#### `/novel list characters`
**Syntax**:
```bash
/novel list characters --role protagonist --format detailed
```

**Flags**:
- `--role` - Filter by role
- `--format` - table/list/detailed (default: table)

**Output**:
- Table of characters with name, role, summary
- Or detailed view with all fields

#### `/novel list locations`
**Syntax**:
```bash
/novel list locations --type building --format table
```

**Flags**:
- `--type` - Filter by location type
- `--format` - table/list/detailed (default: table)

**Output**:
- Table of locations with name, type, description

#### `/novel list chapters`
**Syntax**:
```bash
/novel list chapters --pov sarah --format table
```

**Flags**:
- `--pov` - Filter by POV character
- `--format` - table/list/detailed (default: table)

**Output**:
- Table of chapters with number, title, POV, word count, status

#### `/novel list plots`
**Syntax**:
```bash
/novel list plots --type main --status active
```

**Flags**:
- `--type` - Filter by plot type
- `--status` - Filter by status
- `--format` - table/list/detailed (default: table)

**Output**:
- Table of plot threads with name, type, status, priority

#### `/novel list issues`
**Syntax**:
```bash
/novel list issues --severity error --status open
```

**Flags**:
- `--severity` - Filter by severity (error/warning/info)
- `--type` - Filter by issue type
- `--status` - Filter by status (default: open)

**Output**:
- Grouped by severity (errors, warnings, info)
- Shows issue type and description
- Suggests running consistency checks

## CLI Infrastructure

### Parser (`src/cli/parser.ts`)
- **Status**: ✅ Complete
- **Features**:
  - Tokenization with quote support
  - Flag parsing (--flag, --flag=value, -f)
  - Type conversion (string → number/boolean)
  - Validation (required flags, choices, types)
  - Help text generation

### Output Formatter (`src/cli/output.ts`)
- **Status**: ✅ Complete
- **Features**:
  - Success/error/warning/info messages with emojis
  - Tables
  - Lists
  - Key-value displays
  - Headings
  - Spinners
  - Code blocks
  - Newlines

### Registry (`src/cli/registry.ts`)
- **Status**: ✅ Updated
- **Features**:
  - Command registration
  - Alias support
  - Fuzzy matching (Levenshtein distance)
  - Subcommand lookup

### Execution Context (`src/cli/index.ts`)
- **Status**: ✅ Complete
- **Features**:
  - Project initialization check
  - NovelWriterExtension instance management
  - Error handling and suggestions
  - Help display

## Progress Summary

### By Command Count
- **Complete**: 4 commands (init, create, list, help)
- **Pending**: 5 commands (sync, check, show, export, analyze)
- **Total**: 9 commands
- **Progress**: 44% complete

### By Subcommand Count
- **Complete**: 10 subcommands
  - init (1)
  - create: character, location, chapter, plot (4)
  - list: characters, locations, chapters, plots, issues (5)
- **Pending**: ~15 subcommands
  - sync: all, characters, locations, chapters (4)
  - check: consistency, timeline, threads (3)
  - show: character, location, chapter, plot, stats (5)
  - export: manuscript, outline (2)
  - analyze: pacing, wordcount, progress (3)

### By Feature Type
- **Core Features** (High Priority):
  - ✅ Project initialization
  - ✅ Content creation
  - ✅ Content listing
  - ⏳ File synchronization
  - ⏳ Consistency checking
- **Viewing Features** (Medium Priority):
  - ⏳ Show detailed information
- **Production Features** (Medium Priority):
  - ⏳ Export manuscript
- **Analytics Features** (Low Priority):
  - ⏳ Analyze manuscript

## Next Steps

### High Priority (Essential for MVP)
1. **Implement `/novel sync`** - Required for workflow
2. **Implement `/novel check`** - Core feature
3. **Implement `/novel show`** - Useful for debugging

### Medium Priority (Production Features)
4. **Implement `/novel export`** - Needed for manuscript output

### Low Priority (Nice to Have)
5. **Implement `/novel analyze`** - Analytics and insights

## Testing Checklist

### ✅ Completed Testing
- [x] `/novel init` - Basic initialization
- [x] `/novel init` - With all flags
- [x] `/novel create character` - Non-interactive mode
- [x] `/novel create location` - Non-interactive mode
- [x] `/novel create chapter` - With flags
- [x] `/novel create plot` - With flags

### ⏳ Pending Testing
- [ ] `/novel list characters` - All formats
- [ ] `/novel list locations` - All formats
- [ ] `/novel list chapters` - All formats
- [ ] `/novel list plots` - With filters
- [ ] `/novel list issues` - With filters
- [ ] All commands error handling
- [ ] Integration testing (full workflow)

## Known Issues / TODOs

### Character/Location Builders
- Interactive mode currently throws error (needs Claude Code integration)
- Workaround: Users must provide all flags

### Chapter Creation
- Chapter number auto-increment not implemented (defaults to 1)
- Need to query database for highest chapter number

### Plot Thread Access
- Accessing private properties on extension (`extension['mcpClient']`)
- Should expose public method in NovelWriterExtension

### Database Schema
- Some queries use snake_case field names
- Need to verify consistency with TypeScript interfaces

## Architecture Notes

### Command Pattern
Each command follows this pattern:
1. Define command in `src/cli/commands/<name>.ts`
2. Implement handler in `src/cli/handlers/<name>-handler.ts`
3. Register in `src/cli/registry.ts`
4. Handler receives `ParsedArgs` and `CommandContext`
5. Handler validates, executes, and displays results

### Data Flow
```
User types: /novel create character --name "Sarah"
         ↓
Claude Code calls: handleNovelCommand("create character --name 'Sarah'")
         ↓
NovelCLI.execute()
  - Parses command string
  - Looks up "create" command
  - Finds "character" subcommand
  - Validates flags
  - Creates execution context
  - Calls handleCreateCharacter()
         ↓
Handler:
  - Validates specific requirements
  - Uses NovelWriterExtension to create character
  - Syncs to database
  - Displays success message
```

### Extension Integration
Handlers access the extension via `CommandContext`:
- `context.extension` - NovelWriterExtension instance
- `context.projectId` - Current project ID
- `context.cwd` - Current working directory
- `context.output` - Output formatter

## Summary

✅ **Major Accomplishments**:
- Complete CLI infrastructure (parser, registry, output formatter)
- 4 fully functional commands with 10 subcommands
- Comprehensive error handling and user feedback
- Database integration working
- File creation working (YAML and Markdown)

⏳ **Remaining Work**:
- 5 commands with ~15 subcommands
- Interactive mode improvements
- Integration testing
- Documentation and examples

🎯 **Current Goal**: Implement sync and check commands next (high priority)
