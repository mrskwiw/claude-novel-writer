# Claude Novel Writer

AI-assisted novel writing extension for Claude Code. Built on research into what makes great fiction according to master novelists (Hemingway, Morrison, King, Vonnegut, Le Guin, etc.).

## Philosophy

This is **not** a "write my novel for me" tool. Following master novelist wisdom:
- ✍️ Support discovery writing ("follow the headlights") as much as planning
- 🎨 Suggest, don't dictate - preserve author voice
- 📝 Accept that "bad writing leads to good writing" (Capote)
- 🔊 Make it easy to read work aloud (sound matters - Jim Harrison)
- ✅ Encourage completion over perfection (Anne Rice: "You must finish")
- ⚖️ Balance showing and telling (both necessary - Le Guin)

## Features

### Core Systems
- 📚 **Story Management**: Track chapters, scenes, characters, and plot threads
- 👥 **Character System**: Profiles, voice patterns, arcs, and consistency tracking
- 🌍 **World Building**: Organize settings, rules, lore with consistency checking
- ✍️ **Writing Assistant**: Context-aware AI suggestions respecting author voice
- 🔍 **Continuity Tracker**: Auto-detect contradictions (character details, timeline, world rules)
- 📈 **Progress & Motivation**: Session tracking, streaks, milestone celebrations
- 📤 **Export System**: Multi-format export (Markdown, DOCX, EPUB, PDF)

### 11-Phase Writing Support
1. **Ideation** - Quick capture, idea exploration, premise development
2. **Planning** - Character development, world-building, plot architecture
3. **Drafting** - Distraction-free writing, momentum preservation
4. **First Revision** - Developmental editing, pacing analysis
5-7. **Editing** - Line editing, dialogue enhancement, prose refinement
8. **Beta Feedback** - Organize and track reader responses
9. **Final Polish** - Last consistency checks
10. **Production** - Formatting, export, metadata
11. **Distribution** - Query tracking (trad) or platform management (self-pub)

## Architecture

### Hybrid Data Approach
```
Human-editable files (Git-friendly)
         ↓
  SQLite database (fast queries)
         ↓
   MCP Server (AI access)
```

**Source of truth**: YAML/Markdown files
**Query engine**: SQLite database
**AI interface**: MCP SQLite Server

### File Structure
```
my-novel/
├── .novel/
│   ├── data.db              # SQLite database (auto-generated)
│   └── sessions/            # Writing session logs
├── characters/
│   ├── sarah.yml
│   └── tom.yml
├── world/
│   ├── locations.yml
│   └── magic-system.yml
├── timeline/
│   ├── act1.yaml            # Timeline events for Act 1
│   ├── act2.yaml            # Timeline events for Act 2
│   └── backstory.yaml       # Backstory events
├── chapters/
│   ├── 01-opening.md
│   ├── 02-inciting.md
│   └── ...
├── outline.md
└── novel.json               # Project config
```

## Installation

### Prerequisites
- Node.js 18+
- Python 3.8+ (for MCP SQLite server)
- Claude Code

### Install Extension

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/claude-novel-writer
cd claude-novel-writer

# Install dependencies
npm install

# Build
npm run build
```

### Configure MCP Server

The extension automatically configures the MCP SQLite server in `package.json`:

```json
{
  "claudeCode": {
    "extension": {
      "mcpServers": {
        "novel-db": {
          "command": "uvx",
          "args": [
            "mcp-server-sqlite",
            "--db-path",
            "${workspaceFolder}/.novel/data.db"
          ],
          "autoStart": true
        }
      }
    }
  }
}
```

## Usage

### Initialize a New Novel Project

```bash
# In your novel directory
claude-code novel init
```

Or programmatically:

```typescript
import { NovelWriterExtension } from 'claude-novel-writer';

const ext = new NovelWriterExtension('/path/to/my-novel');
await ext.initialize({
  title: 'My Great Novel',
  author: 'Your Name',
  genre: 'Science Fiction',
  targetWordCount: 80000,
  projectPath: '/path/to/my-novel',
});
```

### Create a Character

Create `characters/sarah.yml`:

```yaml
name: Sarah Chen
fullName: Dr. Sarah Chen
role: protagonist
summary: A brilliant but isolated astrophysicist who discovers an anomaly

physical:
  age: "34"
  eyeColor: blue
  height: "5'7\""
  hair: dark brown, usually in a ponytail

personality:
  core: driven, analytical, guarded
  flaw: struggles to trust others
  strength: exceptional problem-solver

background:
  occupation: Research scientist at SETI
  education: PhD in Astrophysics, MIT
  family: estranged from parents

voice:
  patterns:
    - Uses scientific metaphors
    - Speaks precisely, avoids contractions when nervous
  quirks:
    - Taps pen when thinking
    - Says "fascinating" frequently
  vocabulary: Technical, formal

relationships:
  - character: Tom Rivera
    type: colleague
    description: Former mentor, now rival

arc:
  startingState: Isolated and mistrustful
  endingState: Learns to work with team, reconnects with humanity
  midpointCrisis: Forced to choose between career and doing right thing
```

File is automatically synced to database!

### Create Timeline Events

Create `timeline/plot.yaml`:

```yaml
events:
  - name: Hero discovers artifact
    type: plot
    description: The protagonist finds the ancient artifact in the ruins
    storyDate: Day 3 of the journey
    storyTimestamp: 1000
    importance: 9
    happensBefore:
      - Hero gains power

  - name: Hero gains power
    type: plot
    description: The artifact unlocks the protagonist's abilities
    storyDate: Day 5 of the journey
    storyTimestamp: 2000
    importance: 10
    happensBefore: []

  - name: Hero's childhood trauma
    type: backstory
    description: The event that shaped the protagonist
    storyDate: 10 years before story
    isBackstory: true
    importance: 8
    happensBefore:
      - Hero fears authority
```

File is automatically synced! The `happensBefore` field creates dependencies automatically.

### Write a Chapter

Create `chapters/01-opening.md`:

```markdown
---
title: First Contact
status: drafted
---

# Chapter 1: First Contact

Sarah's eyes burned as she stared at the screen. 3 AM. Again.

The signal pattern was impossible. It couldn't be natural interference...
```

### Load Context for Scene

```typescript
const assembler = ext.getContextAssembler();
const context = await assembler.assembleContext(sceneId);

// Format for AI prompt
const markdown = assembler.formatContextAsMarkdown(context);
console.log(markdown);
```

Output:
```markdown
# Scene Context

## Current Chapter
**Chapter 1**: First Contact
Word count: 2,431
Status: drafted

## This Scene
**Scene 1**: Discovery
Purpose: Introduce protagonist, establish mystery
Tone: tense, curious

## Characters in This Scene
### Sarah Chen (protagonist)
A brilliant but isolated astrophysicist who discovers an anomaly
**Voice**: Uses scientific metaphors, speaks precisely

### Tom Rivera (major)
Sarah's former mentor and current rival
**Voice**: Casual, uses humor to deflect

## Location: SETI Observatory Control Room
Within: Mount Hamilton, California
A circular room filled with monitors displaying radio telescope data...

## World Rules
**Radio Astronomy Protocols** (technology)
All significant signals must be verified by at least two independent observatories...

## Active Plot Threads
**The Signal Mystery** (main)
Sarah detects an impossible pattern that suggests intelligence...
```

### Check Consistency

```typescript
const checker = ext.getConsistencyChecker();
const result = await checker.checkAll();

console.log(`Found ${result.errors} errors, ${result.warnings} warnings`);

for (const issue of result.issues) {
  console.log(`[${issue.severity}] ${issue.description}`);
}
```

Output:
```
[error] Character attribute conflict for Sarah Chen: "eyeColor" is "blue" in Chapter 1 but "green" in Chapter 15
[warning] Timeline conflict: "Discovery of Signal" happens after "Lab Meeting", but characters reference meeting before discovery
[info] High-priority plot thread "The Signal Mystery" introduced in Ch 1 is still unresolved
```

### Get Project Health

```typescript
const health = await ext.getProjectHealth();
console.log(health);
```

Output:
```json
{
  "project_id": 1,
  "title": "My Great Novel",
  "current_phase": "drafting",
  "total_chapters": 12,
  "total_words": 28543,
  "active_plot_threads": 3,
  "critical_issues": 1,
  "warnings": 4,
  "sessions_this_week": 5
}
```

## Database Schema

See [SCHEMA_DESIGN.md](./SCHEMA_DESIGN.md) for complete documentation.

### Key Tables
- `projects` - Novel metadata
- `chapters` → `scenes` - Manuscript structure
- `characters` + `character_attributes` - Character tracking
- `locations` + `world_rules` - World building
- `plot_threads` → `plot_beats` - Story structure
- `consistency_issues` - Auto-detected problems
- `writing_sessions` - Progress tracking

### Powerful Views
- `project_health` - Dashboard metrics
- `active_plot_threads` - Unresolved storylines
- `writing_streak` - Motivation stats
- `character_consistency_summary` - Per-character issues

## CLI Commands

### Project Management
- `novel init` - Initialize a new novel project
- `novel sync` - Sync all YAML/Markdown files to database

### Content Creation
- `novel create character [name]` - Create new character YAML file
- `novel create location [name]` - Create new location YAML file
- `novel create plot-thread [name]` - Create new plot thread YAML file
- `novel create chapter [number]` - Create new chapter Markdown file

### Timeline Management
- `novel timeline add --name "Event" --timestamp 100` - Add timeline event
- `novel timeline list` - List all timeline events
- `novel timeline show --name "Event"` - Show event details
- `novel timeline update --name "Event" --timestamp 200` - Update event
- `novel timeline link --before "Event A" --after "Event B"` - Create dependency
- `novel timeline check` - Check for timeline conflicts
- `novel timeline sync` - Sync timeline YAML files to database
- `novel timeline export` - Export timeline to YAML

### Consistency Checking
- `novel check` - Run all consistency checks
- `novel check --type timeline` - Check timeline consistency only
- `novel check --type characters` - Check character consistency only
- `novel check list` - List all consistency issues

### Writing Sessions
- `novel session start` - Start a new writing session
- `novel session end` - End current writing session
- `novel progress` - View writing progress and statistics

## API Reference

### NovelWriterExtension

Main extension class.

```typescript
const ext = new NovelWriterExtension(projectPath);

// Initialize new project
await ext.initialize(options);

// Or load existing
ext.setProjectId(1);

// Get managers
const charSync = ext.getCharacterSync();
const locSync = ext.getLocationSync();
const chapSync = ext.getChapterSync();
const contextAsm = ext.getContextAssembler();
const checker = ext.getConsistencyChecker();

// Quick queries
const health = await ext.getProjectHealth();
const threads = await ext.getActivePlotThreads();
const streak = await ext.getWritingStreak();
```

### CharacterSync

```typescript
const sync = ext.getCharacterSync();

// Sync YAML file to database
await sync.syncCharacterFile('characters/sarah.yml');

// Delete character
await sync.deleteCharacter('Sarah Chen');
```

### SceneContextAssembler

```typescript
const assembler = ext.getContextAssembler();

// Assemble context
const context = await assembler.assembleContext(sceneId, {
  recentChapterCount: 3,
  detailedCharacters: true,
  includeWorldRules: true,
});

// Format for AI
const markdown = assembler.formatContextAsMarkdown(context);
const tokens = assembler.estimateTokenCount(context);
```

### ConsistencyChecker

```typescript
const checker = ext.getConsistencyChecker();

// Run all checks
const result = await checker.checkAll();

// Get open issues
const issues = await checker.getOpenIssues('error');

// Manage issues
await checker.acknowledgeIssue(issueId, 'Will fix in revision');
await checker.resolveIssue(issueId, 'Fixed in Chapter 15');
await checker.markFalsePositive(issueId, 'Intentional for plot reasons');
```

### TimelineBuilder

```typescript
const builder = ext.getTimelineBuilder();

// Create timeline event
const eventId = await builder.createEvent({
  eventName: 'Hero discovers artifact',
  eventType: 'plot',
  description: 'The protagonist finds the ancient artifact',
  storyDate: 'Day 3 of the journey',
  storyTimestamp: 1000,
  importance: 9,
  isBackstory: false,
});

// Get event
const event = await builder.getEventByName('Hero discovers artifact');

// Update event
await builder.updateEvent(eventId, {
  storyTimestamp: 1500,
  description: 'Updated description',
});

// Create dependency (Event A must happen before Event B)
await builder.createDependency({
  eventBeforeId: event1Id,
  eventAfterId: event2Id,
  dependencyType: 'causation', // or 'sequence', 'reference'
  notes: 'First event causes second event',
});

// Check for timeline conflicts
const conflicts = await builder.getConflicts();
for (const conflict of conflicts) {
  console.log(conflict.conflict);
}

// Get all events with filtering
const plotEvents = await builder.getAllEvents({
  eventType: 'plot',
  minImportance: 8,
});
```

### TimelineSync

```typescript
const sync = ext.getTimelineSync();

// Sync YAML files to database
await sync.syncAllTimelines();

// Export database to YAML
await sync.exportToYAML('timeline/timeline.yaml');
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Test
npm test

# Lint
npm run lint

# Format
npm run format
```

## Research Foundation

This extension is built on research documented in:
- [NOVEL_CRAFT_PRINCIPLES.md](./NOVEL_CRAFT_PRINCIPLES.md) - 15 principles from master novelists
- [WRITING_PROCESS_BREAKDOWN.md](./WRITING_PROCESS_BREAKDOWN.md) - 11-phase novel writing journey

## Contributing

Contributions welcome! Please read our contributing guidelines.

## License

MIT License - see LICENSE file

## Acknowledgments

Built with:
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) - Anthropic
- [mcp-server-sqlite](https://github.com/modelcontextprotocol/servers) - Official SQLite MCP server
- Research from master novelists: Hemingway, Morrison, King, Vonnegut, Le Guin, Harrison, Gilbert, Rice, Capote, and many others

---

**Remember**: This tool assists your writing journey. The craft belongs to you. ✍️
