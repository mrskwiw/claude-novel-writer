# Quick Start Guide

Get your novel project up and running in 5 minutes.

## Installation

### 1. Install the Extension

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/claude-novel-writer
cd claude-novel-writer

# Install dependencies
npm install

# Build the extension
npm run build
```

### 2. Verify MCP Server

The extension uses the official Anthropic SQLite MCP server. Verify Python is installed:

```bash
python --version  # Should be 3.8+
```

The MCP server will be automatically installed via `uvx` when first needed.

## Create Your First Novel Project

### 1. Create Project Directory

```bash
mkdir my-novel
cd my-novel
```

### 2. Initialize Project Structure

Create the basic directory structure:

```bash
mkdir -p characters world chapters .novel/sessions
```

### 3. Create Project Config

Create `novel.json`:

```json
{
  "title": "My Great Novel",
  "author": "Your Name",
  "genre": "Science Fiction",
  "targetWordCount": 80000,
  "currentPhase": "planning"
}
```

### 4. Initialize Database

```typescript
import { NovelWriterExtension } from 'claude-novel-writer';

const ext = new NovelWriterExtension('./my-novel');
await ext.initialize({
  title: 'My Great Novel',
  author: 'Your Name',
  genre: 'Science Fiction',
  targetWordCount: 80000,
  projectPath: './my-novel',
});
```

## Add Your First Character

### Copy Template

```bash
cp ../claude-novel-writer/examples/character-template.yml characters/protagonist.yml
```

### Edit Character

Edit `characters/protagonist.yml`:

```yaml
name: Alex Morgan
fullName: Alexandra Morgan
role: protagonist
summary: |
  A software engineer who discovers a hidden message in legacy code
  that leads to an ancient conspiracy.

physical:
  age: "28"
  eyeColor: "hazel"
  height: "5'9\""
  hairColor: "auburn"

personality:
  core: curious, analytical, determined
  strengths: problem-solving, pattern recognition
  flaws: obsessive, distrustful of authority

background:
  occupation: Senior Software Engineer at TechCorp
  education: BS Computer Science, Stanford

voice:
  patterns:
    - Uses tech metaphors for everything
    - Speaks in short, precise sentences
  quirks:
    - Drums fingers when thinking
    - Says "interesting" when puzzled
  vocabulary: Technical but accessible, avoids jargon with non-tech people

arc:
  startingState: |
    Comfortable in her routine, avoiding risks, keeping head down
  endingState: |
    Embraces uncertainty, willing to fight for truth
  midpointCrisis: |
    Must choose between career safety and exposing the conspiracy
```

### Sync to Database

```typescript
const charSync = ext.getCharacterSync();
await charSync.syncCharacterFile('characters/protagonist.yml');
```

Character is now tracked in the database!

## Write Your First Chapter

Create `chapters/01-opening.md`:

```markdown
---
title: The Bug
status: drafted
summary: Alex discovers an anomaly in legacy code
---

# Chapter 1: The Bug

The cursor blinked at Alex like an accusation.

3 AM. Again.

The legacy codebase sprawled across her monitor—ten thousand lines
of ancient C++, each one a potential landmine. Somewhere in this
digital archaeology, a bug lurked. A critical one.

"Interesting," she muttered, drumming her fingers on the desk.

The pattern didn't make sense. The code should crash, but it didn't.
It *couldn't* work, but it did. Almost as if...

As if someone had hidden something in plain sight.
```

### Sync Chapter

```typescript
const chapSync = ext.getChapterSync();
await chapSync.syncChapterFile('chapters/01-opening.md');
```

## Load Context for Next Scene

When you're ready to write the next scene:

```typescript
const assembler = ext.getContextAssembler();

// Get context for scene (assuming scene ID 1)
const context = await assembler.assembleContext(1, {
  recentChapterCount: 1,
  detailedCharacters: true,
  includeWorldRules: true,
});

// Format for AI prompt
const contextMarkdown = assembler.formatContextAsMarkdown(context);

console.log(contextMarkdown);
```

This loads:
- Current chapter/scene details
- Alex's character profile and voice notes
- Any locations mentioned
- Active plot threads
- Recent chapter summary

## Check Consistency

After writing a few chapters:

```typescript
const checker = ext.getConsistencyChecker();
const result = await checker.checkAll();

console.log(`Found ${result.errors} errors, ${result.warnings} warnings`);

// Review issues
for (const issue of result.issues) {
  console.log(`[${issue.severity}] ${issue.description}`);
}
```

## Track Your Progress

```typescript
// View project health
const health = await ext.getProjectHealth();
console.log(`Total words: ${health.total_words}`);
console.log(`Chapters: ${health.total_chapters}`);
console.log(`Active plot threads: ${health.active_plot_threads}`);
console.log(`Issues: ${health.critical_issues} errors, ${health.warnings} warnings`);

// Check writing streak
const streak = await ext.getWritingStreak();
console.log(`Current streak: ${streak.current_streak_days} days`);
console.log(`Total words this month: ${streak.total_words}`);
```

## What's Next?

### Essential Reading
1. [NOVEL_CRAFT_PRINCIPLES.md](./NOVEL_CRAFT_PRINCIPLES.md) - Learn the 15 principles
2. [WRITING_PROCESS_BREAKDOWN.md](./WRITING_PROCESS_BREAKDOWN.md) - Understand the 11 phases
3. [SCHEMA_DESIGN.md](./SCHEMA_DESIGN.md) - Deep dive into the database

### Add More Elements
- **Characters**: Copy `examples/character-template.yml` for each character
- **Locations**: Use `examples/location-template.yml` for world-building
- **Chapters**: Write in Markdown with YAML frontmatter

### Explore Features
- **Plot Threads**: Track storylines through the database
- **Timeline**: Keep events consistent
- **Sessions**: Log daily writing with streak tracking
- **Export**: Generate formatted manuscripts (coming soon)

## Common Workflows

### Morning Writing Session

```typescript
// Start your day
const health = await ext.getProjectHealth();
console.log(`Yesterday: ${health.sessions_this_week} sessions this week`);

// Get context for today's scene
const context = await assembler.assembleContext(currentSceneId);

// Write your scene...

// End session (log it manually for now)
// Future: auto-tracking
```

### Weekly Review

```typescript
// Check consistency
const result = await checker.checkAll();

// Review unresolved threads
const threads = await ext.getActivePlotThreads();
console.log(`${threads.length} active plot threads`);

// Celebrate progress
const streak = await ext.getWritingStreak();
console.log(`${streak.current_streak_days} day streak! 🎉`);
```

## Tips

### From Master Novelists

1. **Stop When You Know What's Next** (Hemingway)
   - Use chapter notes field to capture your stopping point
   - Makes starting tomorrow easier

2. **One True Sentence** (Hemingway)
   - When stuck, write one true sentence
   - Build from there

3. **Accept Bad Writing** (Capote)
   - "Bad writing leads to good writing"
   - Get words down, fix them later

4. **Read Aloud** (Harrison)
   - Sound matters
   - Use the export feature to hear your prose

5. **Finish the Draft** (Rice)
   - "You must finish"
   - Consistency checker helps, but don't let it block progress

## Getting Help

- **Documentation**: See full [README.md](./README.md)
- **Issues**: Report bugs on GitHub
- **Community**: [Coming soon]

---

Now go write your novel! ✍️
