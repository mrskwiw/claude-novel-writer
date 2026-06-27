# Database Schema Design

This document explains the SQLite database schema designed to support the 11-phase novel writing process.

## Design Philosophy

1. **Hybrid Approach**: Database provides fast querying/indexing while keeping human-editable files as source of truth
2. **Consistency First**: Schema designed to catch contradictions automatically
3. **Context Assembly**: Optimized for loading relevant story context into AI prompts
4. **Scale Ready**: Handles 100k+ word manuscripts efficiently
5. **Phase Agnostic**: Supports both plotters (planners) and pantsers (discovery writers)

## Schema Organization

### Core Manuscript Structure (8 tables)
- `projects` - Top-level metadata
- `chapters` - Manuscript hierarchy
- `scenes` - Narrative units within chapters
- `plot_threads` - Storylines to track
- `plot_beats` - Thread developments

**Key Design Decision**: Three-level hierarchy (Chapter → Scene → Beat) balances granularity with complexity. Scenes are the primary unit for context assembly.

### Character System (5 tables)
- `characters` - Core profiles
- `character_attributes` - Trackable traits (physical, personality, etc.)
- `character_appearances` - Which scenes each character appears in
- `character_relationships` - Dynamic connections between characters
- `character_arcs` - Developmental tracking

**Consistency Magic**: `character_attributes` table records FIRST mention of each trait. Example:
```sql
-- Chapter 3: "Sarah's blue eyes sparkled"
INSERT INTO character_attributes (character_id, attribute_name, attribute_value,
    first_mentioned_chapter_id, first_mentioned_line, confidence)
VALUES (5, 'eye_color', 'blue', 3, "Sarah's blue eyes sparkled", 1.0);

-- Later, AI scans Chapter 15: "Sarah's brown eyes narrowed"
-- System flags contradiction because eye_color already set to 'blue'
```

### World Building (2 tables)
- `locations` - Places in the story (hierarchical: room → building → city)
- `world_rules` - Magic systems, tech, physics, social norms

**Consistency Feature**: `is_hard_rule` flag distinguishes between "must never violate" rules and flexible guidelines.

### Timeline & Events (2 tables)
- `timeline_events` - Story chronology
- `event_dependencies` - "Event A must happen before Event B"

**Conflict Detection**: Query checks if referenced events occur out of order:
```sql
-- Find timeline violations
SELECT * FROM timeline_events e1
JOIN event_dependencies ed ON e1.id = ed.event_before_id
JOIN timeline_events e2 ON ed.event_after_id = e2.id
WHERE e1.story_timestamp > e2.story_timestamp;
```

### Consistency Tracking (1 table)
- `consistency_issues` - Auto-detected contradictions

**Multi-category**: Tracks character, timeline, world rule, and general continuity issues with severity levels.

### Writing Sessions & Progress (2 tables)
- `writing_sessions` - Daily writing tracked for streaks
- `milestones` - Celebrations (word counts, completions)

**Motivation Support**: Tracks "Hemingway stop point" (notes about what's next) to reduce friction for next session.

### Revision & Feedback (2 tables)
- `revision_tasks` - Developmental editing TODO list
- `beta_feedback` - Reader responses organized by location

### AI Assistance (2 tables)
- `ai_suggestions` - Track what AI suggested and whether accepted
- `context_snapshots` - Pre-assembled context cache for scenes

**Learning System**: By tracking accepted vs. rejected suggestions, AI can learn author preferences over time.

### Research (1 table)
- `research_items` - Organized research notes linked to chapters

## Critical Performance Indexes

### Context Assembly (most frequent operation)
```sql
-- When writing Scene 47, load:
-- 1. Scene details
SELECT * FROM scenes WHERE id = 47;

-- 2. Characters present
SELECT c.* FROM characters c
JOIN character_appearances ca ON c.id = ca.character_id
WHERE ca.scene_id = 47;

-- 3. Location details + world rules
SELECT l.*, wr.* FROM locations l
JOIN scenes s ON s.location_id = l.id
LEFT JOIN world_rules wr ON wr.project_id = s.project_id
WHERE s.id = 47;

-- 4. Active plot threads in this scene
SELECT pt.* FROM plot_threads pt
JOIN plot_beats pb ON pb.plot_thread_id = pt.id
WHERE pb.scene_id = 47 AND pt.status = 'active';

-- 5. Recent chapter summaries
SELECT c.chapter_number, c.summary FROM chapters c
JOIN scenes s ON s.chapter_id = c.id
WHERE s.id = 47
UNION
SELECT c.chapter_number, c.summary FROM chapters c
WHERE c.chapter_number >= (SELECT c2.chapter_number - 3 FROM chapters c2
    JOIN scenes s2 ON s2.chapter_id = c2.id WHERE s2.id = 47);
```

All these queries use indexes:
- `idx_character_appearances_scene`
- `idx_scenes_location`
- `idx_plot_beats_scene`
- `idx_chapters_project`

### Consistency Checking
```sql
-- Find character attribute contradictions
SELECT ca1.character_id, ca1.attribute_name,
       ca1.attribute_value as first_value,
       ca1.first_mentioned_chapter_id as first_chapter,
       ca2.attribute_value as conflicting_value,
       ca2.first_mentioned_chapter_id as conflicting_chapter
FROM character_attributes ca1
JOIN character_attributes ca2 ON
    ca1.character_id = ca2.character_id AND
    ca1.attribute_name = ca2.attribute_name AND
    ca1.attribute_value != ca2.attribute_value
WHERE ca1.id < ca2.id;
```

## Views for Quick Insights

### `project_health`
Dashboard showing:
- Total words written
- Active plot threads
- Open consistency issues by severity
- Recent session activity

### `active_plot_threads`
All unresolved storylines with beat counts and introduction points.

### `writing_streak`
Current streak, total words, and average session productivity.

### `character_consistency_summary`
Per-character stats: attributes tracked, appearances, open issues.

## Sync Strategy: Files ↔ Database

```
Author edits:        Extension syncs:           Database enables:
characters/sarah.yml → character_attributes    → Fast consistency checks
outline.md          → plot_threads/plot_beats  → Context assembly
chapters/01.md      → scenes + word counts     → Timeline validation
```

**Regeneration Safety**: Database can be rebuilt from files anytime. Files are source of truth.

## Supporting 11 Writing Phases

| Phase | Primary Tables Used |
|-------|---------------------|
| **1. Ideation** | `projects`, `research_items` |
| **2. Planning** | `characters`, `locations`, `plot_threads`, `timeline_events` |
| **3. Drafting** | `chapters`, `scenes`, `writing_sessions` |
| **4-5. Revision** | `revision_tasks`, `consistency_issues`, `plot_threads` |
| **6. Line Editing** | `scenes` (prose analysis), `beta_feedback` |
| **7. Polish** | `character_attributes` (consistency final check) |
| **8. Beta Feedback** | `beta_feedback`, `revision_tasks` |
| **9. Final Polish** | All consistency tables |
| **10. Production** | `chapters` (status tracking), `milestones` |
| **11. Distribution** | `projects` (metadata), `milestones` (celebrations) |

## Extensibility

### Adding New Features
- **Theme tracking**: Add `themes` table similar to `plot_threads`
- **Voice analysis**: Add `prose_metrics` table with readability scores per scene
- **Symbol tracking**: Add `symbols` table tracking recurring imagery
- **Sensitivity reading**: Add `sensitivity_notes` table for representation feedback

### Custom Queries
Schema includes JSON fields (`settings_json`, `chapters_touched`) for flexible metadata without schema changes.

## Migration Strategy

1. **v1.0**: Core tables (manuscript, characters, timeline)
2. **v1.1**: Add AI assistance tables
3. **v1.2**: Add beta feedback system
4. **v2.0**: Add prose analysis (future)

SQLite's `ALTER TABLE` supports non-breaking schema evolution.

## Example Usage Scenarios

### "Find all scenes where Sarah and Tom interact"
```sql
SELECT s.id, c.chapter_number, s.title
FROM scenes s
JOIN chapters c ON s.chapter_id = c.id
WHERE EXISTS (
    SELECT 1 FROM character_appearances ca1
    WHERE ca1.scene_id = s.id AND ca1.character_id = (SELECT id FROM characters WHERE name = 'Sarah')
) AND EXISTS (
    SELECT 1 FROM character_appearances ca2
    WHERE ca2.scene_id = s.id AND ca2.character_id = (SELECT id FROM characters WHERE name = 'Tom')
);
```

### "What are all the magic rules I've established?"
```sql
SELECT rule_name, description, limitations,
       c.chapter_number as established_in_chapter,
       established_quote
FROM world_rules wr
LEFT JOIN chapters c ON wr.established_chapter_id = c.id
WHERE rule_category = 'magic'
ORDER BY c.chapter_number;
```

### "Show my writing pattern for the last 30 days"
```sql
SELECT
    session_date,
    words_written,
    session_type,
    ROUND(julianday(end_time) - julianday(start_time), 2) as hours
FROM writing_sessions
WHERE session_date >= date('now', '-30 days')
ORDER BY session_date DESC;
```

### "Which plot threads are unresolved?"
```sql
SELECT thread_name, description,
       (SELECT COUNT(*) FROM plot_beats WHERE plot_thread_id = pt.id) as beats
FROM plot_threads pt
WHERE status = 'active' AND resolved_scene_id IS NULL
ORDER BY priority DESC;
```

## Performance Characteristics

**Expected Scale**:
- 500 scenes (typical 100k word novel)
- 50 characters (20 major + 30 minor)
- 100 locations
- 1000 character appearances
- 5000 character attributes entries
- 500 timeline events
- 365 writing sessions

**Database Size**: ~5-10 MB for full novel project

**Query Performance**: All critical queries <10ms on typical hardware

**Context Assembly**: Full scene context loaded in <50ms

## Next Steps

1. Create ORM/access layer (TypeScript or Python)
2. Implement file → database sync logic
3. Build consistency checker runners
4. Design context assembly algorithm
5. Create migration tooling
