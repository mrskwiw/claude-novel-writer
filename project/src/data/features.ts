/**
 * Canonical feature registry for claude-novel-writer.
 *
 * One entry per shipped (or planned) capability, grouped by subsystem. Keep this
 * in sync with TODO.md / BUGS.md when a feature's status changes.
 */

export type FeatureType =
  | 'project'
  | 'character'
  | 'chapter'
  | 'scene'
  | 'location'
  | 'plot'
  | 'world-rule'
  | 'timeline'
  | 'session'
  | 'analysis'
  | 'consistency'
  | 'generation'
  | 'export'
  | 'research'
  | 'beta'
  | 'series'
  | 'intelligence'
  | 'craft'
  | 'mcp';

export type FeatureStatus = 'not-started' | 'in-progress' | 'complete';

export interface Feature {
  id: string;
  name: string;
  description: string;
  subsystem: string;
  type: FeatureType;
  dependsOn: string[];
  status: FeatureStatus;
  version?: string;
}

export const features: Feature[] = [
  // ── Project & content ──────────────────────────────────────────────────────
  { id: 'init', name: 'Project init', description: 'Initialize a novel project (non-interactive / --json) with templates + CLAUDE.md', subsystem: 'cli', type: 'project', dependsOn: [], status: 'complete', version: '0.1.1' },
  { id: 'create', name: 'Content creation', description: 'Create characters, chapters, scenes, locations, plots, world-rules, timeline events', subsystem: 'builders', type: 'project', dependsOn: ['init'], status: 'complete', version: '0.1.0' },
  { id: 'sync', name: 'YAML/Markdown sync', description: 'Sync entity files to the SQLite database', subsystem: 'sync', type: 'project', dependsOn: ['create'], status: 'complete', version: '0.1.0' },
  { id: 'list', name: 'Content listing', description: 'List characters/chapters/scenes/locations/plot/world-rules/timeline', subsystem: 'cli', type: 'project', dependsOn: ['sync'], status: 'complete', version: '0.1.0' },
  { id: 'export', name: 'Manuscript export', description: 'Assemble + export to Markdown/DOCX/EPUB/PDF (pandoc)', subsystem: 'builders', type: 'export', dependsOn: ['sync'], status: 'complete', version: '0.1.0' },

  // ── Writing process ────────────────────────────────────────────────────────
  { id: 'session', name: 'Writing sessions', description: 'Timed sessions, mood, stop-notes, streaks, progress dashboard', subsystem: 'session', type: 'session', dependsOn: ['init'], status: 'complete', version: '0.1.0' },
  { id: 'revision', name: 'Revision snapshots', description: 'Named point-in-time snapshots + diff', subsystem: 'revision', type: 'project', dependsOn: ['sync'], status: 'complete', version: '0.1.0' },
  { id: 'revise', name: 'Mechanical prose fixes', description: 'Diff-gated revise --apply (doubled words, intensifiers, adverb tags, whitespace, curly quotes)', subsystem: 'analysis', type: 'craft', dependsOn: [], status: 'complete', version: '0.2.0' },
  { id: 'draft', name: 'Draft support', description: 'TK/TODO marker scan + read-aloud prep', subsystem: 'analysis', type: 'craft', dependsOn: [], status: 'complete', version: '0.1.0' },
  { id: 'research', name: 'Research repository', description: 'Research notes + [VERIFY:] marker scanning', subsystem: 'services', type: 'research', dependsOn: ['init'], status: 'complete', version: '0.1.0' },
  { id: 'beta', name: 'Beta readers', description: 'Reader management + feedback aggregation', subsystem: 'services', type: 'beta', dependsOn: ['init'], status: 'complete', version: '0.1.0' },
  { id: 'series', name: 'Series management', description: 'Multi-book series with shared bible + cross-book threads', subsystem: 'services', type: 'series', dependsOn: ['init'], status: 'complete', version: '0.1.0' },

  // ── Analysis (deterministic) ───────────────────────────────────────────────
  { id: 'analyze-prose', name: 'Prose analysis', description: 'Economy, show/tell, sensory balance, character voice', subsystem: 'analysis', type: 'analysis', dependsOn: ['sync'], status: 'complete', version: '0.1.0' },
  { id: 'analyze-pacing', name: 'Pacing analysis', description: 'Tension arc, POV balance, chapter lengths', subsystem: 'analysis', type: 'analysis', dependsOn: ['sync'], status: 'complete', version: '0.1.0' },
  { id: 'analyze-copy', name: 'Copy editing', description: 'POV slips, tense shifts, name variants', subsystem: 'analysis', type: 'analysis', dependsOn: ['sync'], status: 'complete', version: '0.1.0' },
  { id: 'analyze-developmental', name: 'Developmental analysis', description: 'Scene purpose audit, subplot balance, plot holes', subsystem: 'analysis', type: 'analysis', dependsOn: ['sync'], status: 'complete', version: '0.1.0' },
  { id: 'analyze-style', name: 'Style targets', description: 'Grade prose against style-targets.yml', subsystem: 'analysis', type: 'analysis', dependsOn: [], status: 'complete', version: '0.1.1' },
  { id: 'analyze-voice', name: 'Voice analysis', description: 'Manuscript-wide voice similarity + drift', subsystem: 'analysis', type: 'analysis', dependsOn: ['sync'], status: 'complete', version: '0.2.0' },
  { id: 'report', name: 'Manuscript health report', description: 'One-screen dashboard (tension, threads, promises, TKs)', subsystem: 'analysis', type: 'analysis', dependsOn: ['sync'], status: 'complete', version: '0.2.0' },
  { id: 'readaloud', name: 'Read-aloud TTS', description: 'Speak chapters/scenes via OS TTS', subsystem: 'analysis', type: 'analysis', dependsOn: [], status: 'complete', version: '0.2.0' },
  { id: 'extract', name: 'Discovery-writer extraction', description: 'Propose new entities from prose / an outline file', subsystem: 'analysis', type: 'analysis', dependsOn: [], status: 'complete', version: '0.2.0' },
  { id: 'structure', name: 'Structure templates', description: 'Three-act / Save the Cat / Hero\'s Journey beats vs word-count positions', subsystem: 'analysis', type: 'craft', dependsOn: ['sync'], status: 'complete', version: '0.2.0' },
  { id: 'theme', name: 'Theme tracking', description: 'Register themes + motif-density trace across chapters', subsystem: 'analysis', type: 'craft', dependsOn: [], status: 'complete', version: '0.2.0' },

  // ── Consistency ────────────────────────────────────────────────────────────
  { id: 'check', name: 'Consistency checker', description: 'Character/timeline/world-rule/plot-thread contradiction detection + issue tracking', subsystem: 'consistency', type: 'consistency', dependsOn: ['sync'], status: 'complete', version: '0.1.0' },

  // ── Intelligence layer ─────────────────────────────────────────────────────
  { id: 'knowledge', name: 'Knowledge service', description: 'Narrative knowledge objects with tags/relevance', subsystem: 'services', type: 'intelligence', dependsOn: ['init'], status: 'complete', version: '0.1.0' },
  { id: 'canon', name: 'Canon service', description: 'Canon items + conflict detection', subsystem: 'services', type: 'intelligence', dependsOn: ['init'], status: 'complete', version: '0.1.0' },
  { id: 'promise', name: 'Narrative promises', description: 'Promise/payoff tracking with fulfillment status', subsystem: 'services', type: 'intelligence', dependsOn: ['init'], status: 'complete', version: '0.1.0' },
  { id: 'context', name: 'Context policy engine', description: 'Deterministic context fingerprinting + assembly', subsystem: 'context', type: 'intelligence', dependsOn: ['sync'], status: 'complete', version: '0.1.0' },
  { id: 'graph', name: 'Narrative graph', description: 'Scene-level narrative graph with edge traversal', subsystem: 'services', type: 'intelligence', dependsOn: ['sync'], status: 'complete', version: '0.1.0' },
  { id: 'foreshadow', name: 'Foreshadowing tracker', description: 'Track planted foreshadowing + payoff (registered v0.2.0)', subsystem: 'services', type: 'intelligence', dependsOn: ['init'], status: 'complete', version: '0.2.0' },

  // ── AI generation ──────────────────────────────────────────────────────────
  { id: 'generate', name: 'AI generation', description: 'Scenes, characters, dialogue, synopsis/pitch/query/comps, overview, chapter summary (API or Claude Code passthrough)', subsystem: 'ai', type: 'generation', dependsOn: ['sync'], status: 'complete', version: '0.2.0' },

  // ── MCP ────────────────────────────────────────────────────────────────────
  { id: 'mcp-passthrough', name: 'MCP passthrough server', description: 'Single `novel` tool routing any CLI command; stays in sync with the registry', subsystem: 'mcp-server', type: 'mcp', dependsOn: [], status: 'complete', version: '0.2.0' },
];
