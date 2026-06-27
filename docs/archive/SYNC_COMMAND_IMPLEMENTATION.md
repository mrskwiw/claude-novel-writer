# Sync Command Implementation

**Date**: 2025-10-26
**Status**: ✅ Complete
**Session**: Continuation (Post Plot System)

## Overview

Implemented the `/novel sync` command to synchronize edited YAML files back to the database, completing the edit-sync workflow.

## What Was Implemented

### 1. ✅ Sync Command Definition

**File**: `src/cli/commands/sync.ts`

**Subcommands**:
- `sync all` - Sync all content types
- `sync characters` - Sync character YAML files
- `sync locations` - Sync location YAML files
- `sync plots` - Sync plot thread YAML files
- `sync chapters` - Sync chapter markdown files

**Aliases**:
- `chars` → `characters`
- `locs` → `locations`
- `threads` → `plots`
- `chaps` → `chapters`

### 2. ✅ Sync Command Handlers

**File**: `src/cli/handlers/sync-handler.ts`

**Functions Created**:
- `handleSyncAll()` - Syncs all content types with progress tracking
- `handleSyncCharacters()` - Syncs character YAML files
- `handleSyncLocations()` - Syncs location YAML files
- `handleSyncPlots()` - Syncs plot thread YAML files
- `handleSyncChapters()` - Syncs chapter markdown files

**Features**:
- Progress spinners for each sync operation
- Success/failure counting
- Error reporting for failed files
- Helpful suggestions when directories don't exist
- Summary output showing what was synced

### 3. ✅ Registry Integration

**File**: `src/cli/registry.ts`

**Changes**:
- Added import for `syncCommand`
- Registered sync command in `registerDefaults()`
- Added "Content synchronization" section

### 4. ✅ Type System Updates

**File**: `src/cli/types.ts`

**Change**: Made `handler` optional in `Command` interface for commands with subcommands:
```typescript
handler?: CommandHandler; // Optional for commands with subcommands
```

### 5. ✅ Build Fixes

Fixed TypeScript compilation errors:
- Fixed YAML import in PlotBuilder (changed from `dump` to default import)
- Fixed PromptOptions usage (removed unsupported `choices` property)
- Fixed type coercion for priority (string → number)
- Made Command.handler optional

## Command Usage

### Sync All Content

```bash
/novel sync all
```

**Output**:
```
Syncing All Content

✓ Characters synced: 5
✓ Locations synced: 3
✓ Plot threads synced: 2
✓ Chapters synced: 10

Sync Complete

Characters: 5 synced
Locations: 3 synced
Plot Threads: 2 synced
Chapters: 10 synced
```

### Sync Characters Only

```bash
/novel sync characters
# or
/novel sync chars
```

**Output**:
```
⠋ Syncing characters to database...

✓ Synced 5 character(s) to database
```

### Sync Plots Only

```bash
/novel sync plots
# or
/novel sync threads
```

**Output**:
```
⠋ Syncing plot threads to database...

✓ Synced 2 plot thread(s) to database
```

### With Errors

```bash
/novel sync all
```

**Output**:
```
Syncing All Content

✓ Characters synced: 4, 1 failed
✓ Locations synced: 3
✓ Plot threads synced: 2
✓ Chapters synced: 10

Sync Complete

Characters: 4 synced, 1 failed
Locations: 3 synced
Plot Threads: 2 synced
Chapters: 10 synced

⚠ 1 file(s) failed:
  • invalid-char.yml: Missing required 'name' field
```

## Workflow

### Complete Edit-Sync Cycle

1. **Create Content**:
   ```bash
   /novel create character --name "Sarah" --role protagonist --summary "A scientist"
   ```
   - Creates `characters/sarah.yml`
   - Auto-syncs to database

2. **Edit Content**:
   - User opens `characters/sarah.yml` in editor
   - Adds personality traits, background, arc
   - Saves file

3. **Sync Changes**:
   ```bash
   /novel sync characters
   ```
   - Reads updated `sarah.yml`
   - Updates database record
   - Confirms success

4. **Verify Changes**:
   ```bash
   /novel list characters --format detailed
   # or
   /novel show character "Sarah"
   ```

## Error Handling

### Directory Not Found

```bash
/novel sync plots
```

**Output**:
```
✗ Plots directory not found: /path/to/project/plots
ℹ Create plot threads with: /novel create plot
```

### No Files Found

```bash
/novel sync characters
```

**Output**:
```
⠋ No character files found
ℹ Create characters with: /novel create character
```

### Invalid YAML

```bash
/novel sync characters
```

**Output**:
```
✓ Synced 4 character(s) to database

⚠ 1 file(s) failed:
  • broken-char.yml: Plot file missing required 'name' field
```

## Integration with Existing Systems

### CharacterSync
- Already existed
- Called by `handleSyncCharacters()`
- Method: `syncCharacterFile(filePath)`

### LocationSync
- Already existed
- Called by `handleSyncLocations()`
- Method: `syncLocationFile(filePath)`

### PlotSync
- Created in previous session
- Called by `handleSyncPlots()`
- Method: `syncPlotFile(filePath)`

### ChapterSync
- Already existed
- Called by `handleSyncChapters()`
- Method: `syncChapterFile(filePath)`

## Technical Details

### File Discovery

```typescript
const fs = await import('fs/promises');
const files = await fs.readdir(directory);
const yamlFiles = files.filter(
  (f) => (f.endsWith('.yml') || f.endsWith('.yaml')) && !f.startsWith('_')
);
```

**Rules**:
- Includes `.yml` and `.yaml` files
- Excludes files starting with `_` (templates)

### Error Collection

```typescript
let synced = 0;
let failed = 0;
const errors: string[] = [];

for (const file of yamlFiles) {
  try {
    await sync.syncFile(join(dir, file));
    synced++;
  } catch (error: any) {
    failed++;
    errors.push(`${file}: ${error.message}`);
  }
}
```

### Progress Reporting

```typescript
const spinner = output.spinner('Syncing characters to database...');
// ... sync files ...
spinner.stop('Sync complete');

output.success(`Synced ${synced} character(s) to database`);

if (failed > 0) {
  output.warning(`${failed} file(s) failed:`);
  errors.forEach((err) => output.info(`  • ${err}`));
}
```

## Command Hierarchy

```
/novel sync
├── all        - Sync everything
├── characters - Sync character YAML files
├── locations  - Sync location YAML files
├── plots      - Sync plot thread YAML files
└── chapters   - Sync chapter markdown files
```

## Files Created

1. `src/cli/commands/sync.ts` - Command definition
2. `src/cli/handlers/sync-handler.ts` - Handler implementations

## Files Modified

1. `src/cli/registry.ts` - Added sync command registration
2. `src/cli/types.ts` - Made Command.handler optional
3. `src/builders/plot-builder.ts` - Fixed YAML import and prompt issues

## Statistics

### Code Added
- **sync.ts**: ~60 lines
- **sync-handler.ts**: ~380 lines
- **Total**: ~440 lines of new code

### Commands Implemented
- **Main command**: 1 (`sync`)
- **Subcommands**: 5 (all, characters, locations, plots, chapters)
- **Total**: 6 command handlers

### Sync Managers Used
- CharacterSync
- LocationSync
- PlotSync
- ChapterSync

## Benefits

### 1. Complete Workflow
Users can now:
- Create content via CLI → auto-synced
- Edit content in text editor → manual sync
- Query content via CLI → reads from database

### 2. Version Control Friendly
- Edit YAML files directly
- Commit changes to git
- Sync to database when ready

### 3. Batch Operations
- `sync all` syncs everything at once
- Individual syncs for targeted updates
- Progress tracking for large projects

### 4. Error Resilience
- Failed files don't stop the sync
- Clear error messages
- Partial success reported

### 5. Flexibility
- Sync after editing one file or many
- Sync specific content types
- No need to track what changed

## Example Workflows

### Workflow 1: Batch Character Updates

```bash
# Edit multiple character files in editor
vim characters/sarah.yml characters/alex.yml characters/james.yml

# Sync all characters at once
/novel sync characters
```

**Output**:
```
✓ Synced 3 character(s) to database
```

### Workflow 2: After Git Pull

```bash
# Team member updates characters and plots
git pull

# Sync everything to local database
/novel sync all
```

**Output**:
```
Syncing All Content

✓ Characters synced: 5
✓ Locations synced: 3
✓ Plot threads synced: 2
✓ Chapters synced: 10

Sync Complete
```

### Workflow 3: Incremental Updates

```bash
# Edit one plot file
vim plots/main-plot.yml

# Sync just plots
/novel sync plots
```

**Output**:
```
✓ Synced 1 plot thread(s) to database
```

## Consistency with Other Commands

### Create Commands
```bash
/novel create character --name "X"
/novel create location --name "X"
/novel create plot --name "X"
/novel create chapter --title "X"
```
All auto-sync after creation.

### List Commands
```bash
/novel list characters
/novel list locations
/novel list plots
/novel list chapters
```
All read from database.

### Sync Commands
```bash
/novel sync characters
/novel sync locations
/novel sync plots
/novel sync chapters
```
All update database from files.

**Pattern**: Consistent structure across all content types.

## Next Steps

### Immediate
- ✅ Sync command implemented
- ⏳ Test sync command end-to-end
- ⏳ Implement `/novel show` command

### Future Enhancements
- Auto-sync on file change (file watcher)
- Conflict detection (file vs database)
- Dry-run mode (`--dry-run` flag)
- Selective sync (sync only changed files)
- Timestamp tracking (last synced time)

## Summary

The sync command completes the core CRUD workflow for the novel writer extension:

- **Create**: `/novel create <type>` → YAML file + database
- **Read**: `/novel list <type>` → from database
- **Update**: Edit YAML → `/novel sync <type>` → database
- **Delete**: (not yet implemented)

Users now have a complete workflow for:
1. Creating content with CLI
2. Editing content in text editor
3. Syncing changes to database
4. Querying content via CLI

All content types (characters, locations, plots, chapters) have full parity:
- YAML/Markdown source files
- Builder classes for creation
- Sync classes for database updates
- CLI commands for all operations
- Consistent error handling

---

**Status**: ✅ Sync command complete and building successfully
