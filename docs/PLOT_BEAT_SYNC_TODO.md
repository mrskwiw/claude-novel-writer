# Plot Beat Sync - TODO

## Current Status

Plot thread synchronization is **functional** for thread metadata (name, type, description, status, priority, notes).

Plot beat synchronization is currently **disabled** due to a data model mismatch.

## The Problem

**YAML Format (plot thread files):**
```yaml
beats:
  - scene: "Ch1.Scene1"  # String reference to scene
    description: "Hero meets mentor"
    type: setup
```

**Database Schema (plot_beats table):**
```sql
CREATE TABLE plot_beats (
    id INTEGER PRIMARY KEY,
    plot_thread_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,  -- Foreign key requiring numeric ID
    beat_order INTEGER NOT NULL,
    description TEXT,
    beat_type TEXT,
    FOREIGN KEY (scene_id) REFERENCES scenes(id)
);
```

The YAML format uses scene names (strings), but the database requires scene IDs (foreign keys to the scenes table).

## Implementation Needed

To enable beat synchronization, we need to implement scene name → scene ID resolution:

1. **Scene Lookup System**: When syncing beats from YAML to database:
   ```typescript
   async resolveSceneName(sceneName: string): Promise<number> {
     // Query: SELECT id FROM scenes WHERE scene_title = ? AND project_id = ?
     // Handle not found case (create placeholder? error?)
   }
   ```

2. **Reverse Lookup for Reading**: When reading beats from database back to YAML:
   ```typescript
   async getSceneName(sceneId: number): Promise<string> {
     // Query: SELECT scene_title FROM scenes WHERE id = ?
   }
   ```

3. **Handle Missing Scenes**:
   - Option A: Create placeholder scenes automatically
   - Option B: Warn user and skip that beat
   - Option C: Store beats with NULL scene_id (would require schema change)

## Affected Test Files

The following 6 tests are currently failing because they expect beat sync to work:

- `should add a setup beat to plot thread`
- `should add multiple beats in sequence`
- `should handle resolution beat`
- `should show comprehensive statistics` (expects totalBeats count)
- `should sync a single plot thread file` (expects sync message)
- `should show plot thread details` (expects beats to be stored)

## Workaround

Currently, beats are stored in the YAML files and can be managed through the plot thread builder, but they aren't synced to the database. This means:

- ✅ Beats can be added/edited in YAML files
- ✅ Plot thread metadata is synced to database
- ❌ Beats don't appear in database queries
- ❌ Can't query "which scenes are part of this plot thread"
- ❌ Can't generate beat-based reports from database

## Priority

**Medium** - The core plot thread tracking functionality works without beat sync. Beats are still editable in YAML files, just not queryable through the database.

## Related Files

- `src/sync/plot-thread-sync.ts:107-119` - Disabled syncBeats() method
- `src/sync/plot-thread-sync.ts:155-169` - getBeats() method (returns empty array)
- `tests/integration/plot-workflow.test.ts` - 6 tests affected
