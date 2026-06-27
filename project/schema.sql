-- Novel Writing Extension Database Schema
-- SQLite schema supporting 11-phase writing process

-- =============================================================================
-- CORE MANUSCRIPT STRUCTURE
-- =============================================================================

-- Project metadata and settings
CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    genre TEXT,
    target_word_count INTEGER,
    current_phase TEXT CHECK(current_phase IN (
        'ideation', 'planning', 'drafting', 'first_revision',
        'developmental_edit', 'line_edit', 'polish',
        'beta_feedback', 'final_polish', 'production', 'distribution'
    )),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settings_json TEXT -- Flexible JSON for project preferences
);

-- Chapters in the manuscript
CREATE TABLE chapters (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    title TEXT,
    file_path TEXT, -- Relative path to markdown file
    word_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'planned' CHECK(status IN (
        'planned', 'drafted', 'revised', 'polished', 'final'
    )),
    pov_character_id INTEGER,
    summary TEXT, -- AI-generated or author-written summary for context
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (pov_character_id) REFERENCES characters(id),
    UNIQUE(project_id, chapter_number)
);

-- Scenes within chapters
CREATE TABLE scenes (
    id INTEGER PRIMARY KEY,
    chapter_id INTEGER NOT NULL,
    scene_number INTEGER NOT NULL,
    title TEXT,
    pov_character_id INTEGER,
    location_id INTEGER,
    time_of_day TEXT,
    word_count INTEGER DEFAULT 0,
    summary TEXT,
    purpose TEXT, -- What this scene accomplishes (plot, character development, etc.)
    emotional_tone TEXT,
    tension_level INTEGER CHECK(tension_level BETWEEN 1 AND 10),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
    FOREIGN KEY (pov_character_id) REFERENCES characters(id),
    FOREIGN KEY (location_id) REFERENCES locations(id),
    UNIQUE(chapter_id, scene_number)
);

-- Scene beats: AI-generated micro-structure within a scene
CREATE TABLE IF NOT EXISTS scene_beats (
    id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    beat_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
    UNIQUE(scene_id, beat_number)
);

CREATE INDEX IF NOT EXISTS idx_scene_beats_scene ON scene_beats(scene_id);

-- =============================================================================
-- CHARACTER SYSTEM
-- =============================================================================

-- Character profiles
CREATE TABLE characters (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT,
    role TEXT CHECK(role IN ('protagonist', 'antagonist', 'major', 'minor', 'background')),
    file_path TEXT, -- Path to YAML character file
    summary TEXT, -- Brief character essence for context loading
    voice_notes TEXT, -- How they speak, patterns, quirks
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Physical attributes (tracked for consistency)
CREATE TABLE character_attributes (
    id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    attribute_type TEXT NOT NULL, -- 'physical', 'personality', 'background', 'skill'
    attribute_name TEXT NOT NULL, -- 'eye_color', 'age', 'occupation', etc.
    attribute_value TEXT NOT NULL,
    first_mentioned_chapter_id INTEGER, -- Where this became canon
    first_mentioned_line TEXT, -- Exact quote where established
    confidence REAL DEFAULT 1.0, -- 1.0 = explicitly stated, < 1.0 = inferred
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (first_mentioned_chapter_id) REFERENCES chapters(id),
    UNIQUE(character_id, attribute_type, attribute_name)
);

-- Character appearances in scenes (for context assembly)
CREATE TABLE character_appearances (
    id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    role_in_scene TEXT, -- 'present', 'mentioned', 'pov'
    line_count INTEGER, -- Approximate lines of dialogue
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
    UNIQUE(character_id, scene_id)
);

-- Character relationships (dynamic over time)
CREATE TABLE character_relationships (
    id INTEGER PRIMARY KEY,
    character_id_a INTEGER NOT NULL,
    character_id_b INTEGER NOT NULL,
    relationship_type TEXT NOT NULL, -- 'family', 'friend', 'enemy', 'romantic', 'professional'
    description TEXT,
    status TEXT DEFAULT 'active', -- 'active', 'past', 'complicated'
    established_chapter_id INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (character_id_a) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id_b) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (established_chapter_id) REFERENCES chapters(id),
    CHECK(character_id_a < character_id_b) -- Prevent duplicates
);

-- Character arcs (developmental tracking)
CREATE TABLE character_arcs (
    id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    arc_name TEXT NOT NULL,
    arc_type TEXT, -- 'change', 'growth', 'fall', 'flat'
    starting_state TEXT,
    ending_state TEXT,
    midpoint_crisis TEXT,
    start_chapter_id INTEGER,
    end_chapter_id INTEGER,
    notes TEXT,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (start_chapter_id) REFERENCES chapters(id),
    FOREIGN KEY (end_chapter_id) REFERENCES chapters(id)
);

-- =============================================================================
-- WORLD BUILDING
-- =============================================================================

-- Locations in the story world
CREATE TABLE locations (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    location_type TEXT, -- 'city', 'building', 'room', 'country', 'planet', etc.
    parent_location_id INTEGER, -- For nesting (room -> building -> city)
    description TEXT,
    first_mentioned_chapter_id INTEGER,
    file_path TEXT, -- Path to detailed notes file
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_location_id) REFERENCES locations(id),
    FOREIGN KEY (first_mentioned_chapter_id) REFERENCES chapters(id)
);

-- World rules (magic systems, tech, physics, social norms)
CREATE TABLE world_rules (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    rule_category TEXT NOT NULL, -- 'magic', 'technology', 'physics', 'social', 'political'
    rule_name TEXT NOT NULL,
    description TEXT NOT NULL,
    limitations TEXT, -- Important for consistency
    established_chapter_id INTEGER,
    established_quote TEXT,
    is_hard_rule BOOLEAN DEFAULT 1, -- 1 = must never violate, 0 = flexible
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (established_chapter_id) REFERENCES chapters(id)
);

-- =============================================================================
-- TIMELINE & EVENTS
-- =============================================================================

-- Story timeline events
CREATE TABLE timeline_events (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    event_name TEXT NOT NULL,
    event_type TEXT, -- 'plot', 'backstory', 'world_history'
    description TEXT,
    story_date TEXT, -- In-universe date (flexible format)
    story_timestamp INTEGER, -- Unix-style timestamp for ordering if dates are precise
    scene_id INTEGER, -- Which scene depicts this event (if any)
    is_backstory BOOLEAN DEFAULT 0,
    importance INTEGER CHECK(importance BETWEEN 1 AND 10),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (scene_id) REFERENCES scenes(id)
);

-- Event dependencies (Event A must happen before Event B)
CREATE TABLE event_dependencies (
    id INTEGER PRIMARY KEY,
    event_before_id INTEGER NOT NULL,
    event_after_id INTEGER NOT NULL,
    dependency_type TEXT DEFAULT 'sequence', -- 'sequence', 'causation', 'reference'
    notes TEXT,
    FOREIGN KEY (event_before_id) REFERENCES timeline_events(id) ON DELETE CASCADE,
    FOREIGN KEY (event_after_id) REFERENCES timeline_events(id) ON DELETE CASCADE,
    UNIQUE(event_before_id, event_after_id)
);

-- =============================================================================
-- PLOT MANAGEMENT
-- =============================================================================

-- Plot threads (storylines to track)
CREATE TABLE plot_threads (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    thread_name TEXT NOT NULL,
    thread_type TEXT, -- 'main', 'subplot', 'character', 'theme'
    description TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('planned', 'active', 'resolved', 'abandoned')),
    introduced_scene_id INTEGER,
    resolved_scene_id INTEGER,
    priority INTEGER CHECK(priority BETWEEN 1 AND 10),
    notes TEXT,
    file_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (introduced_scene_id) REFERENCES scenes(id),
    FOREIGN KEY (resolved_scene_id) REFERENCES scenes(id)
);

-- Plot thread developments (beats)
CREATE TABLE plot_beats (
    id INTEGER PRIMARY KEY,
    plot_thread_id INTEGER NOT NULL,
    scene_id INTEGER, -- Nullable - may not have scene yet
    scene_reference TEXT, -- Scene name from YAML (e.g., "Ch1.Scene1")
    beat_order INTEGER NOT NULL,
    description TEXT,
    beat_type TEXT, -- 'setup', 'development', 'complication', 'crisis', 'resolution'
    resolved_at DATETIME, -- Set when scene_id is resolved from scene_reference
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plot_thread_id) REFERENCES plot_threads(id) ON DELETE CASCADE,
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
    UNIQUE(plot_thread_id, beat_order)
);

-- =============================================================================
-- CONSISTENCY TRACKING
-- =============================================================================

-- Auto-detected consistency issues
CREATE TABLE consistency_issues (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    issue_type TEXT NOT NULL, -- 'character_attribute', 'timeline', 'world_rule', 'continuity'
    severity TEXT DEFAULT 'warning' CHECK(severity IN ('info', 'warning', 'error')),
    description TEXT NOT NULL,
    chapter_id INTEGER,
    scene_id INTEGER,
    character_id INTEGER,
    location_id INTEGER,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
    resolution_notes TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id),
    FOREIGN KEY (scene_id) REFERENCES scenes(id),
    FOREIGN KEY (character_id) REFERENCES characters(id),
    FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- =============================================================================
-- WRITING SESSIONS & PROGRESS
-- =============================================================================

-- Writing sessions (for streaks and motivation)
CREATE TABLE writing_sessions (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    session_date DATE NOT NULL,
    start_time DATETIME,
    end_time DATETIME,
    words_written INTEGER DEFAULT 0,
    chapters_touched TEXT, -- JSON array of chapter IDs worked on
    session_type TEXT, -- 'drafting', 'revising', 'planning', 'editing'
    notes TEXT, -- "Hemingway stop point" - what's next
    mood_before INTEGER CHECK(mood_before BETWEEN 1 AND 5),
    mood_after INTEGER CHECK(mood_after BETWEEN 1 AND 5),
    stop_note TEXT,
    ritual_completed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, session_date)
);

-- Milestones and celebrations
CREATE TABLE milestones (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    milestone_type TEXT NOT NULL, -- 'word_count', 'chapter_complete', 'draft_complete', 'custom'
    milestone_name TEXT NOT NULL,
    target_value INTEGER,
    achieved_value INTEGER,
    achieved_date DATETIME,
    is_achieved BOOLEAN DEFAULT 0,
    celebration_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- =============================================================================
-- REVISION & FEEDBACK
-- =============================================================================

-- Revision tasks (from developmental editing phase)
CREATE TABLE revision_tasks (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    task_description TEXT NOT NULL,
    task_category TEXT, -- 'pacing', 'character', 'plot', 'prose', 'dialogue', 'worldbuilding'
    priority INTEGER CHECK(priority BETWEEN 1 AND 10),
    chapter_id INTEGER,
    scene_id INTEGER,
    status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done', 'wont_fix')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id),
    FOREIGN KEY (scene_id) REFERENCES scenes(id)
);

-- Beta reader feedback (reader_id references beta_readers table added in migration 010)
CREATE TABLE beta_feedback (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    reader_id TEXT,
    chapter_id INTEGER,
    feedback_type TEXT NOT NULL DEFAULT 'general',
    note TEXT NOT NULL DEFAULT '',
    resolved INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (chapter_id) REFERENCES chapters(id)
);

-- =============================================================================
-- AI ASSISTANCE & CONTEXT
-- =============================================================================

-- AI suggestions (track what AI has suggested for learning/consistency)
CREATE TABLE ai_suggestions (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    suggestion_type TEXT NOT NULL, -- 'dialogue', 'description', 'plot', 'character', 'pacing'
    context_scene_id INTEGER,
    suggestion_text TEXT NOT NULL,
    was_accepted BOOLEAN,
    author_modification TEXT, -- How author changed the suggestion
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (context_scene_id) REFERENCES scenes(id)
);

-- Context snapshots (pre-assembled context for specific scenes)
CREATE TABLE context_snapshots (
    id INTEGER PRIMARY KEY,
    scene_id INTEGER NOT NULL,
    snapshot_data TEXT NOT NULL, -- JSON: relevant characters, locations, plot threads, etc.
    word_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME, -- Cache expiration
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
);

-- =============================================================================
-- RESEARCH & REFERENCE
-- =============================================================================

-- Research notes and references
CREATE TABLE research_items (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    category TEXT, -- 'historical', 'technical', 'cultural', 'location', 'other'
    notes TEXT NOT NULL,
    source TEXT, -- URL or citation
    file_path TEXT, -- Path to detailed research file
    related_chapters TEXT, -- JSON array of chapter IDs where this applies
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Manuscript structure
CREATE INDEX idx_chapters_project ON chapters(project_id, chapter_number);
CREATE INDEX idx_scenes_chapter ON scenes(chapter_id, scene_number);
CREATE INDEX idx_chapters_status ON chapters(status);

-- Characters
CREATE INDEX idx_characters_project ON characters(project_id);
CREATE INDEX idx_character_appearances_scene ON character_appearances(scene_id);
CREATE INDEX idx_character_appearances_character ON character_appearances(character_id);
CREATE INDEX idx_character_attributes_character ON character_attributes(character_id);

-- Timeline
CREATE INDEX idx_timeline_events_project ON timeline_events(project_id);
CREATE INDEX idx_timeline_events_timestamp ON timeline_events(story_timestamp);
CREATE INDEX idx_timeline_events_scene ON timeline_events(scene_id);

-- Plot threads
CREATE INDEX idx_plot_threads_project ON plot_threads(project_id, status);
CREATE INDEX idx_plot_beats_scene ON plot_beats(scene_id);

-- Consistency
CREATE INDEX idx_consistency_issues_project ON consistency_issues(project_id, status);
CREATE INDEX idx_consistency_issues_type ON consistency_issues(issue_type, severity);

-- Sessions
CREATE INDEX idx_writing_sessions_project_date ON writing_sessions(project_id, session_date DESC);

-- Context assembly (critical for performance)
CREATE INDEX idx_scenes_location ON scenes(location_id);
CREATE INDEX idx_scenes_pov ON scenes(pov_character_id);
CREATE INDEX idx_world_rules_category ON world_rules(project_id, rule_category);

-- =============================================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =============================================================================

-- Update project updated_at on any change
CREATE TRIGGER update_project_timestamp
AFTER UPDATE ON chapters
BEGIN
    UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.project_id;
END;

-- Update chapter word counts when scenes change
CREATE TRIGGER update_chapter_word_count
AFTER UPDATE OF word_count ON scenes
BEGIN
    UPDATE chapters
    SET word_count = (
        SELECT COALESCE(SUM(word_count), 0)
        FROM scenes
        WHERE chapter_id = NEW.chapter_id
    ),
    updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.chapter_id;
END;

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- Active plot threads that need resolution
CREATE VIEW active_plot_threads AS
SELECT
    pt.*,
    COUNT(pb.id) as beat_count,
    (SELECT chapter_number FROM chapters c
     JOIN scenes s ON s.chapter_id = c.id
     WHERE s.id = pt.introduced_scene_id) as introduced_chapter
FROM plot_threads pt
LEFT JOIN plot_beats pb ON pb.plot_thread_id = pt.id
WHERE pt.status = 'active'
GROUP BY pt.id;

-- Character consistency summary
CREATE VIEW character_consistency_summary AS
SELECT
    c.id,
    c.name,
    COUNT(DISTINCT ca.id) as attribute_count,
    COUNT(DISTINCT cap.scene_id) as scene_appearances,
    COUNT(DISTINCT ci.id) as open_issues
FROM characters c
LEFT JOIN character_attributes ca ON ca.character_id = c.id
LEFT JOIN character_appearances cap ON cap.character_id = c.id
LEFT JOIN consistency_issues ci ON ci.character_id = c.id AND ci.status = 'open'
GROUP BY c.id;

-- Writing streak tracking
CREATE VIEW writing_streak AS
SELECT
    project_id,
    COUNT(*) as current_streak_days,
    SUM(words_written) as total_words,
    AVG(words_written) as avg_words_per_session
FROM writing_sessions
WHERE session_date >= date('now', '-30 days')
GROUP BY project_id;

-- Project health dashboard
CREATE VIEW project_health AS
SELECT
    p.id as project_id,
    p.title,
    p.current_phase,
    COUNT(DISTINCT c.id) as total_chapters,
    SUM(c.word_count) as total_words,
    COUNT(DISTINCT pt.id) FILTER (WHERE pt.status = 'active') as active_plot_threads,
    COUNT(DISTINCT ci.id) FILTER (WHERE ci.status = 'open' AND ci.severity = 'error') as critical_issues,
    COUNT(DISTINCT ci.id) FILTER (WHERE ci.status = 'open' AND ci.severity = 'warning') as warnings,
    (SELECT COUNT(*) FROM writing_sessions WHERE project_id = p.id AND session_date >= date('now', '-7 days')) as sessions_this_week
FROM projects p
LEFT JOIN chapters c ON c.project_id = p.id
LEFT JOIN plot_threads pt ON pt.project_id = p.id
LEFT JOIN consistency_issues ci ON ci.project_id = p.id
GROUP BY p.id;

-- =============================================================================
-- IDEAS & BRAINSTORMING
-- =============================================================================

-- Ideas and brainstorming capture
CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  idea_key TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  linked_entity_type TEXT,
  linked_entity_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, idea_key)
);

CREATE INDEX IF NOT EXISTS idx_ideas_project ON ideas(project_id);
CREATE INDEX IF NOT EXISTS idx_ideas_project_status ON ideas(project_id, status);
