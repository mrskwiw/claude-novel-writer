# Claude Novel Writer - User Guide

**Comprehensive guide to AI-assisted novel writing**

---

## Table of Contents

1. [Introduction](#introduction)
2. [Philosophy & Approach](#philosophy--approach)
3. [Installation & Setup](#installation--setup)
4. [Project Management](#project-management)
5. [Character Development](#character-development)
6. [World Building](#world-building)
7. [Plot & Story Structure](#plot--story-structure)
8. [Writing Your Manuscript](#writing-your-manuscript)
9. [AI-Assisted Writing](#ai-assisted-writing)
10. [Consistency Checking](#consistency-checking)
11. [Timeline Management](#timeline-management)
12. [Session Tracking & Progress](#session-tracking--progress)
13. [Export & Publishing](#export--publishing)
14. [Advanced Features](#advanced-features)
15. [Troubleshooting](#troubleshooting)
16. [Best Practices](#best-practices)

---

## Introduction

### What is Claude Novel Writer?

Claude Novel Writer is an AI-assisted writing system designed to support novelists through every phase of the writing process—from initial idea to finished manuscript. It combines:

- **File-based workflow** - Your work stays in human-readable YAML and Markdown files
- **Database tracking** - Fast queries for consistency checking and context assembly
- **AI assistance** - Claude-powered suggestions that respect your voice
- **Writing craft** - Built on principles from master novelists

### What This Tool IS

✅ **A writing companion** that helps you:
- Track characters, locations, and plot threads
- Check consistency automatically
- Generate ideas when you're stuck
- Assemble context for AI assistance
- Monitor progress and maintain streaks
- Export professional manuscripts

### What This Tool IS NOT

❌ **Not a replacement** for:
- Your creativity and storytelling
- Understanding your characters and world
- Making narrative decisions
- Your unique author voice
- The actual work of writing

**Core Principle**: *Suggest, don't dictate. The craft belongs to you.*

---

## Philosophy & Approach

### Writing Philosophy

Claude Novel Writer is built on research into what makes great fiction. The system incorporates wisdom from master novelists:

#### 1. Support Discovery Writing
> "Writing is like driving at night. You can only see as far as your headlights, but you can make the whole trip that way." - E.L. Doctorow

The tool supports "pantsers" (discovery writers) as much as plotters. It suggests rather than demands structure.

#### 2. Respect Author Voice
> "In certain ways writing is a form of prayer." - Flannery O'Connor

AI suggestions maintain YOUR voice and tone. Edit everything. Make it yours.

#### 3. Character Depth Over Perfection
> "The best characters are those who are the most credible." - John Steinbeck

Focus on creating complex, flawed, believable characters over perfect heroes.

#### 4. Show AND Tell
> "Sometimes 'show, don't tell' is terrible advice." - Ursula K. Le Guin

Balance is key. The tool doesn't enforce arbitrary rules.

#### 5. Finish Over Perfect
> "You must finish your novel, no matter what." - Anne Rice

The system celebrates progress, tracks streaks, and encourages completion.

See [NOVEL_CRAFT_PRINCIPLES.md](./NOVEL_CRAFT_PRINCIPLES.md) for all 15 principles.

---

## Installation & Setup

### System Requirements

- **Node.js**: Version 18.0.0 or higher
- **Python**: Version 3.8+ (for MCP SQLite server)
- **Storage**: ~50MB for extension + your project files
- **API Key**: Anthropic API key for AI features (optional but recommended)

### Installation Steps

#### 1. Install Extension

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/claude-novel-writer.git
cd claude-novel-writer/claudenovel_plugin

# Install dependencies
npm install

# Build
npm run build
```

#### 2. Configure API Key

Create `.env` file in project root:

```bash
# Copy template
cp ../.env.example ../.env

# Edit and add your key
ANTHROPIC_API_KEY=your-api-key-here
```

Get your API key from: https://console.anthropic.com/

#### 3. Verify Installation

```bash
# Check build
npm run build

# Check API configuration
node -e "require('dotenv').config(); console.log(process.env.ANTHROPIC_API_KEY ? '✅ API configured' : '❌ API not configured')"

# Run tests (optional)
npm test
```

---

## Project Management

### Creating a New Project

```bash
/novel init --title "My Novel Title" \
            --author "Your Name" \
            --genre "Science Fiction" \
            --target-words 80000
```

**What this creates:**

```
your-project/
├── .novel/
│   ├── data.db              # SQLite database
│   └── sessions/            # Writing session logs
├── characters/              # Character profiles (YAML)
├── world/                   # World-building (YAML/MD)
│   ├── locations/
│   ├── rules/
│   └── timeline.yml
├── chapters/                # Manuscript chapters (Markdown)
├── research/                # Research materials
├── export/                  # Generated exports
└── .env                     # Environment config
```

### Project Metadata

The `.novel/data.db` database tracks:
- Project metadata (title, author, genre)
- All characters, locations, world rules
- Chapters and scenes
- Plot threads and beats
- Timeline events
- Consistency issues
- Writing sessions

**Your files are the source of truth**. The database is for fast queries.

### Project Health

Check project status:

```bash
/novel progress
```

Output:
```
📊 Project Health: My Novel Title

Progress:
  Current Phase: Drafting
  Total Words: 28,543 / 80,000 (36%)
  Chapters: 12 / ~30 planned

Story Elements:
  Characters: 8 (5 major, 3 minor)
  Locations: 6
  Plot Threads: 3 active, 2 resolved

Quality:
  ✅ No critical issues
  ⚠️  4 warnings (see /novel check list)

Writing Activity:
  Sessions this week: 5
  Current streak: 12 days 🔥
  Avg words/session: 547
```

---

## Character Development

### Creating Characters

#### Method 1: Interactive Creation

```bash
/novel create character
```

Prompts:
- Name
- Role (protagonist/antagonist/major/minor)
- Physical description
- Personality traits
- Background
- Voice patterns

#### Method 2: AI-Assisted

```bash
/novel generate character \
  --description "brilliant but isolated astrophysicist who discovers alien signal" \
  --save
```

This generates a complete character YAML file. Review and edit before syncing.

#### Method 3: Manual YAML

Create `characters/sarah-chen.yml`:

```yaml
name: Sarah Chen
fullName: Dr. Sarah Chen
role: protagonist
summary: Brilliant but emotionally isolated astrophysicist

physical:
  age: 34
  gender: female
  eyeColor: dark brown
  height: 5'7"
  hair: black, usually in ponytail
  distinguishingFeatures: Wire-rimmed glasses, tired eyes
  mannerisms:
    - Taps pen when thinking
    - Avoids eye contact when nervous

personality:
  core: Analytical, driven, guarded
  traits:
    - Intensely curious
    - Socially awkward
    - Perfectionist
    - Self-critical
  flaw: Fear of vulnerability; walls off emotions
  strength: Problem-solver under pressure
  fear: Being wrong; letting others down
  desire: To make a discovery that matters

background:
  upbringing: Only child of immigrant parents; high expectations
  education: PhD Astrophysics, MIT
  occupation: Research scientist at SETI
  pivotalEvent: Father's death during her PhD; didn't visit him in time
  currentSituation: Living alone, estranged from mother, married to work

voice:
  patterns:
    - Uses scientific metaphors ("like a binary star system")
    - Speaks precisely, avoids contractions when nervous
    - Self-deprecating humor as defense
  quirks:
    - Says "fascinating" frequently
    - Corrects trivial mistakes
  vocabulary: Technical, formal; softens around trusted people

relationships:
  - character: Tom Rivera
    type: colleague
    description: Former mentor, now rival; unresolved tension
  - character: Maya Singh
    type: friend
    description: Only close friend; tries to break through Sarah's walls

arc:
  startingState: Isolated, emotionally numb, defined by work
  endingState: Connected to others, accepts vulnerability as strength
  midpointCrisis: Forced to choose between career safety and moral risk
  transformation: Learns that humanity matters more than being right
```

Sync to database:
```bash
/novel sync characters
```

### Managing Characters

**List all characters:**
```bash
/novel character list
```

**Show character details:**
```bash
/novel character show --name "Sarah Chen"
```

**Update character:**
Edit the YAML file, then:
```bash
/novel sync characters
```

**Delete character:**
```bash
/novel character delete --name "Minor Character"
```

### Character Consistency

The system tracks:
- **Physical attributes** - Eye color, height, age
- **Personality traits** - Core traits, flaws, strengths
- **Voice patterns** - How they speak
- **Relationships** - Who knows whom

Check consistency:
```bash
/novel check characters
```

Example issues detected:
```
❌ Error: Character "Sarah Chen"
   Eye color is "brown" in Chapter 1 but "blue" in Chapter 15

⚠️  Warning: Character "Sarah Chen"
   Personality trait "outgoing" in Ch 10 contradicts core trait "socially awkward"
```

---

## World Building

### Locations

#### Creating Locations

**AI-assisted:**
```bash
/novel generate location \
  --description "abandoned SETI observatory in remote mountains" \
  --save
```

**Manual YAML** (`world/locations/seti-observatory.yml`):
```yaml
name: SETI Observatory Alpha
type: building
location: Mount Hamilton, California
description: |
  A remote radio telescope facility, now mostly automated.
  The main control room overlooks the telescope array.

details:
  sight: |
    Circular room with wall of monitors displaying radio telescope data.
    Large windows overlook six massive dish antennas.
    Dim lighting, mostly from screen glow.

  sound: |
    Constant low hum of computer fans.
    Occasional static burst from speakers.
    Wind howling outside during storms.

  smell: |
    Stale coffee, electronics, old building mustiness

  texture: |
    Cold metal surfaces, worn linoleum floors,
    sticky keyboard keys from years of late-night caffeine

  atmosphere: |
    Isolated, liminal. Feels like being at the edge of the world,
    listening to the universe.

significance:
  - First appearance: Chapter 1
  - Key events:
      - Sarah discovers the signal (Ch 1)
      - Midnight confrontation with Tom (Ch 8)
      - Final message transmission (Ch 24)

notes: |
  Sarah feels most comfortable here. It's her sanctuary.
  The isolation mirrors her internal state.
```

**Sync:**
```bash
/novel sync locations
```

### World Rules

World rules ensure consistency for magic systems, technology, social norms, etc.

#### Adding World Rules

```bash
/novel world-rule add \
  --name "Radio Telescope Protocols" \
  --category technology \
  --description "All significant signals require verification by 2+ independent observatories"
```

YAML format (`world/rules/radio-protocols.yml`):
```yaml
ruleName: Radio Telescope Protocols
category: technology
description: |
  SETI protocol requires any potential signal of interest
  be verified by at least two independent observatories
  before public announcement.

implications:
  - Sarah can't announce discovery immediately
  - Creates urgency around verification
  - Government can suppress discoveries

established: Chapter 1 (exposition via Sarah's internal monologue)
enforced: true
exceptions:
  - Emergency situations (undefined criteria - creates tension)
```

#### World Rule Categories

Common categories:
- `technology` - How tech works
- `magic` - Magic system rules
- `social` - Social norms, laws
- `physics` - Physical laws (if different from reality)
- `biology` - Alien biology, creature rules
- `economics` - Currency, trade
- `politics` - Government, power structures

#### Managing World Rules

```bash
# List all rules
/novel world-rule list

# Show by category
/novel world-rule list --category technology

# Update rule
/novel world-rule update --name "Rule Name" --description "New description"

# Check consistency
/novel check world-rules
```

The system detects violations:
```
⚠️  Warning: World Rule Violation
   Rule: "Radio Telescope Protocols"
   In Chapter 15, Sarah announces discovery without verification
   But rule states: "requires verification by 2+ observatories"
```

---

## Plot & Story Structure

### Plot Threads

Plot threads help track storylines through your novel.

#### Creating Plot Threads

```bash
/novel plot add \
  --name "The Signal Mystery" \
  --type main \
  --priority high \
  --status active
```

YAML format (`world/plot/signal-mystery.yml`):
```yaml
threadName: The Signal Mystery
type: main
description: |
  Sarah detects an impossible signal pattern that could be
  first evidence of extraterrestrial intelligence.

priority: high
status: active

introducedIn: Chapter 1
resolvedIn: Chapter 24 (planned)

beats:
  - beatName: Discovery
    chapter: 1
    description: Sarah notices anomalous signal pattern
    completed: true

  - beatName: Verification Attempt
    chapter: 3
    description: Seeks verification from other observatories
    completed: true

  - beatName: Government Interference
    chapter: 8
    description: Agency pressures her to suppress findings
    completed: false

  - beatName: Public Revelation
    chapter: 20
    description: Sarah decides to go public despite risks
    completed: false

relatedCharacters:
  - Sarah Chen (protagonist)
  - Tom Rivera (antagonist in this thread)
  - Maya Singh (supporting)

notes: |
  Core question: Is it alien intelligence or natural phenomenon?
  Real answer: Alien, but Sarah's journey is about courage, not discovery.
```

#### Plot Thread Types

- `main` - Primary storyline
- `subplot` - Secondary storyline
- `character` - Character arc
- `romance` - Romantic subplot
- `mystery` - Mystery to solve
- `theme` - Thematic thread

#### Managing Plot Threads

```bash
# List active threads
/novel plot list --status active

# Show thread details
/novel plot show --name "The Signal Mystery"

# Update status
/novel plot update --name "The Signal Mystery" --status resolved

# Add plot beat
/novel plot beat add \
  --thread "The Signal Mystery" \
  --beat "Climax" \
  --chapter 24 \
  --description "Final transmission"

# Check for unresolved threads
/novel check plot-threads
```

### AI Plot Suggestions

```bash
/novel generate plot \
  --description "The Signal Mystery" \
  --status active
```

Output (3 suggestions):
```
Option 1:
Sarah discovers the signal is actually from Earth's future,
sent back as a warning. This revelation forces her to question
the nature of time and causality.

Option 2:
The signal is a test from an advanced civilization. By choosing
to go public despite pressure, Sarah proves humanity's readiness
for contact.

Option 3:
The "alien" signal is a government psyop designed to distract
from environmental collapse. Sarah must expose the conspiracy
while protecting her career.
```

---

## Writing Your Manuscript

### Chapter Management

#### Creating Chapters

```bash
/novel chapter create \
  --number 1 \
  --title "First Contact" \
  --status drafted \
  --pov "Sarah Chen"
```

Creates `chapters/01-first-contact.md`:
```markdown
---
title: First Contact
number: 1
status: drafted
povCharacter: Sarah Chen
summary: Sarah discovers an anomalous signal
wordCount: 0
notes: Opening chapter - establish character and mystery
---

# Chapter 1: First Contact

[Write your chapter here...]
```

#### Chapter Statuses

- `planned` - Outlined but not written
- `drafted` - First draft complete
- `revised` - First revision done
- `polished` - Line-edited and polished
- `final` - Ready for publication

#### Managing Chapters

```bash
# List chapters
/novel chapter list

# Show chapter
/novel chapter show --number 1

# Update metadata
/novel chapter update --number 1 --status revised

# Sync to database
/novel sync chapters
```

### Scene Management

Scenes are marked within chapters using special markers.

#### Adding Scenes

```markdown
---
title: First Contact
---

# Chapter 1: First Contact

<!-- SCENE: Discovery -->
<!-- POV: Sarah Chen -->
<!-- PURPOSE: Introduce protagonist, establish mystery -->
<!-- TONE: tense, curious -->

Sarah's eyes burned as she stared at the screen. 3 AM. Again.

The signal pattern was impossible. Natural cosmic noise didn't
create perfect mathematical sequences...

<!-- END SCENE -->

<!-- SCENE: Morning After -->
<!-- POV: Sarah Chen -->
<!-- PURPOSE: Show Sarah's isolation, introduce Tom -->
<!-- TONE: exhausted, conflicted -->

Sunlight streamed through the observatory windows. Sarah hadn't moved.

Her phone buzzed. Tom.

"You're still there, aren't you?" Not a question.

<!-- END SCENE -->
```

#### Scene Commands

```bash
# List scenes in chapter
/novel scene list --chapter 1

# Show scene details
/novel scene show --id 1

# Add scene
/novel scene add --chapter 1 \
  --heading "Discovery" \
  --pov "Sarah Chen" \
  --purpose "Introduce mystery"
```

### Writing Workflow

#### Daily Writing Session

```bash
# 1. Start session
/novel session start

# 2. Review yesterday's work
/novel chapter show --number 5

# 3. Get AI continuation suggestions
/novel generate continue --scene 12 --pov "Sarah"

# 4. Write
# [Write in your editor: chapters/05-chapter.md]

# 5. Check word count periodically
/novel chapter show --number 5

# 6. End session
/novel session end --words 734

# 7. Quick consistency check
/novel check consistency
```

---

## AI-Assisted Writing

### AI Generation Philosophy

The AI suggests, you decide. **Always edit AI output.**

Principles:
- Use AI to **unstick** yourself, not replace writing
- **Maintain your voice** - edit everything to sound like you
- **Generate alternatives** - pick the direction that excites you
- **Discovery writing** - Let AI surprise you with options

### Character Generation

```bash
/novel generate character \
  --description "mysterious government agent tracking alien signals" \
  --save \
  --output characters/agent-brooks.yml
```

**Review the output, then edit:**
- Does this character fit your story?
- Is the voice distinct from other characters?
- Are the flaws believable and interesting?
- Does the arc align with your plot?

### Location Generation

```bash
/novel generate location \
  --description "underground government facility where signals are analyzed"
```

**Use the output for:**
- Initial sensory details
- Atmosphere ideas
- Unique details to make it memorable

### Scene Continuation

When you're stuck mid-scene:

```bash
/novel generate continue \
  --scene 15 \
  --pov "Sarah" \
  --style descriptive
```

Returns 3 options:
```
Option 1:
The silence stretched between them like a chasm. Sarah's hand
trembled as she reached for the data printout. If Tom saw the
numbers, saw what she'd found, there'd be no going back.

Option 2:
"You don't understand what you're asking," Sarah said, her voice
barely audible over the hum of machinery. The weight of the
decision pressed down on her chest.

Option 3:
Outside, storm clouds gathered. Sarah watched the telescope array
through the window, massive dishes turning in eerie synchronization.
Somewhere out there, the signal continued its patient broadcast.
```

**Pick the direction that excites you most**, then rewrite in your voice.

### Dialogue Enhancement

```bash
/novel generate dialogue \
  --character "Sarah Chen" \
  --description "I think we should tell everyone about the signal"
```

Enhances to match Sarah's established voice:
```
"The data is compelling. Statistically significant. We have an
obligation to—" She paused, pushing her glasses up. "I think we
should tell everyone. Despite the protocols."
```

### Description Expansion

```bash
/novel generate describe \
  --description "the control room at night" \
  --pov "Sarah"
```

Adds sensory details filtered through Sarah's perspective:
```
The control room at night was Sarah's natural habitat. Monitor glow
painted everything in shades of blue and green—wavelengths of data
made visible. She found comfort in the steady rhythm: the fan hum
(F-sharp, she'd noticed once), the occasional static burst when
the array recalibrated, the faint ozone smell of electronics pushed
past their thermal limits.

Outside the windows, the six dishes stood sentinel. Sarah knew their
specifications by heart: 25-meter diameter, 0.3-degree beam width,
sensitivity to frequencies between 1 and 10 GHz. Numbers felt safe.
Numbers made sense.
```

Edit to match your prose style, cut what doesn't work.

### Plot Development Suggestions

```bash
/novel generate plot \
  --description "The Signal Mystery" \
  --status active
```

Use suggestions for:
- Brainstorming when stuck
- Alternative directions
- Twists you hadn't considered

**Don't follow blindly**—pick what resonates with YOUR story vision.

---

## Consistency Checking

### Automatic Consistency Tracking

The system tracks and cross-references:
- **Character attributes** - Physical descriptions, ages, relationships
- **World rules** - Technology, magic, social norms
- **Timeline** - Event sequence, character ages, chronology
- **Plot threads** - Introduction, resolution, continuity

### Running Consistency Checks

**Check everything:**
```bash
/novel check consistency
```

**Check specific areas:**
```bash
/novel check characters    # Character consistency
/novel check timeline      # Timeline conflicts
/novel check world-rules   # World rule violations
/novel check plot-threads  # Unresolved threads
```

### Issue Severity Levels

- **Error** (❌) - Clear contradiction that must be fixed
- **Warning** (⚠️) - Potential issue worth reviewing
- **Info** (ℹ️) - Suggestion or note

### Example Issues

```bash
/novel check list
```

Output:
```
Consistency Issues:

❌ Error: Character Attribute Conflict
   Character: Sarah Chen
   Attribute: eyeColor
   In Chapter 1: "dark brown"
   In Chapter 15: "blue"
   → Fix one or the other

⚠️  Warning: Timeline Conflict
   Event "Sarah discovers signal" (timestamp: 1000)
   Event "Sarah quits SETI" (timestamp: 500)
   But Chapter 3 references the signal AFTER she quit
   → Check chronology

⚠️  Warning: World Rule Violation
   Rule: "Radio Telescope Protocols"
   In Chapter 12, Sarah announces discovery immediately
   But rule states: "requires verification by 2+ observatories"
   → Either follow the rule or explain the exception

ℹ️  Info: Unresolved Plot Thread
   "The Signal Mystery" introduced in Chapter 1
   Still marked as active after 18 chapters
   → Resolve or update status
```

### Managing Issues

**Mark as acknowledged:**
```bash
/novel check acknowledge --id 5 \
  --note "Will fix in revision pass"
```

**Mark as resolved:**
```bash
/novel check resolve --id 5 \
  --note "Fixed in Chapter 15 revision"
```

**Mark as false positive:**
```bash
/novel check ignore --id 5 \
  --note "Intentional - Sarah gets colored contacts"
```

---

## Timeline Management

### Timeline Events

Track when things happen in your story.

#### Creating Events

```bash
/novel timeline add \
  --name "Sarah discovers signal" \
  --type plot \
  --story-date "October 15, 2045" \
  --timestamp 1000 \
  --importance 10 \
  --description "First detection of anomalous signal pattern"
```

**Event Types:**
- `plot` - Main story events
- `backstory` - Events before story begins
- `world_history` - World-building timeline

**Timestamp vs Story Date:**
- `storyDate` - Human-readable ("Day 3 of journey", "Summer 1995")
- `storyTimestamp` - Precise ordering (100, 200, 300...)

Use timestamps to order events precisely, dates for readability.

#### Timeline YAML

`world/timeline.yml`:
```yaml
events:
  - name: Sarah's father dies
    type: backstory
    storyDate: Three years before story
    importance: 8
    isBackstory: true
    description: Sarah doesn't visit in time; shapes her isolation

  - name: Sarah discovers signal
    type: plot
    storyDate: October 15, 2045
    storyTimestamp: 1000
    importance: 10
    description: First detection of anomalous pattern
    happensBefore:
      - Sarah seeks verification
      - Government pressures Sarah

  - name: Sarah seeks verification
    type: plot
    storyDate: October 18, 2045
    storyTimestamp: 1300
    importance: 7
    description: Contacts other observatories for confirmation

  - name: Government pressures Sarah
    type: plot
    storyDate: October 25, 2045
    storyTimestamp: 2000
    importance: 9
    description: Agency demands she suppress findings
```

#### Event Dependencies

Link events to show relationships:

```bash
/novel timeline link \
  --before "Sarah discovers signal" \
  --after "Sarah seeks verification" \
  --type sequence
```

**Dependency Types:**
- `sequence` - A happens before B (chronological)
- `causation` - A directly causes B
- `reference` - B references/recalls A

### Conflict Detection

```bash
/novel timeline check
```

Detects:
```
❌ Timeline Conflict:
   Event "A" (timestamp: 2000) happens before Event "B" (timestamp: 1500)
   But dependency says A → B (B should be after A)
   → Fix timestamps or remove dependency
```

### Visualizing Timeline

```bash
/novel timeline export --output timeline.yml
```

Creates exportable YAML with all events in order.

---

## Session Tracking & Progress

### Writing Sessions

#### Starting a Session

```bash
/novel session start
```

Tracks:
- Start time
- Chapter/scene focus
- Environmental factors

#### During Session

**Set goals:**
```bash
/novel session goal --words 500
```

**Check progress:**
```bash
/novel progress
```

#### Ending Session

```bash
/novel session end --words 734
```

Calculates:
- Duration
- Words written
- Words per minute
- Goal achievement

### Progress Dashboard

```bash
/novel progress
```

Shows:
```
📊 Writing Progress

Today:
  Session: 45 minutes
  Words: 734 / 500 goal ✅

This Week:
  Sessions: 5
  Total words: 3,241
  Average: 648 words/session

Overall Project:
  Total words: 28,543 / 80,000 (36%)
  Chapters: 12 / ~30 planned

Streak: 🔥 12 days
  Longest: 18 days

Story Health:
  ✅ No critical issues
  ⚠️  4 warnings
```

### Streak Maintenance

**Philosophy**: "Stubborn gladness" (Elizabeth Gilbert)

Show up daily, even if just 100 words.

The tool tracks:
- Current streak
- Longest streak
- Total writing days

**Streak broken?** Start again today. Progress > perfection.

---

## Export & Publishing

### Manuscript Assembly

Export your full manuscript:

```bash
/novel export manuscript \
  --output manuscript.md \
  --chapters 1-24 \
  --title "My Novel Title" \
  --author "Your Name"
```

Creates clean Markdown:
```markdown
# My Novel Title
by Your Name

---

# Chapter 1: First Contact

[Chapter content...]

---

# Chapter 2: Verification

[Chapter content...]
```

### Export Options

**Include/exclude chapters:**
```bash
# Specific chapters
/novel export manuscript --chapters 1,3,5-10

# Exclude chapters
/novel export manuscript --exclude 4,7
```

**Add metadata:**
```bash
/novel export manuscript \
  --title "The Signal" \
  --author "Jane Doe" \
  --genre "Science Fiction" \
  --copyright "2025"
```

**Format options:**
```bash
# Clean (remove scene markers)
/novel export manuscript --clean

# Include notes
/novel export manuscript --include-notes

# Chapter breaks
/novel export manuscript --page-breaks
```

### Statistics

```bash
/novel export stats
```

Shows:
```
📈 Manuscript Statistics

Word Count:
  Total: 78,423 words
  By chapter: [list]
  Average: 3,267 words/chapter

Scene Count:
  Total: 67 scenes
  Average: 2.8 scenes/chapter

POV Distribution:
  Sarah Chen: 45 scenes (67%)
  Tom Rivera: 15 scenes (22%)
  Maya Singh: 7 scenes (10%)

Chapter Status:
  Final: 8 chapters
  Polished: 10 chapters
  Revised: 5 chapters
  Drafted: 1 chapter
```

### Format Conversion

For DOCX, EPUB, PDF, use mcp-pandoc:

```bash
# Export to Markdown first
/novel export manuscript --output manuscript.md

# Then ask Claude Code:
"Convert manuscript.md to DOCX using pandoc"
```

Claude Code (with mcp-pandoc) will handle conversion.

---

## Advanced Features

### Custom Templates

Create custom chapter templates:

`templates/chapter-template.md`:
```markdown
---
title: {{title}}
number: {{number}}
status: drafted
povCharacter: {{pov}}
---

# Chapter {{number}}: {{title}}

<!-- SCENE: Opening -->
<!-- POV: {{pov}} -->
<!-- PURPOSE: -->
<!-- TONE: -->

[Write here...]

<!-- END SCENE -->
```

Use:
```bash
/novel chapter create --number 5 --template templates/chapter-template.md
```

### Query Database Directly

For advanced users, query the SQLite database:

```bash
# Using MCP SQLite server
sqlite3 .novel/data.db

# Example: Find all scenes with a character
SELECT s.scene_id, s.heading, c.title
FROM scenes s
JOIN chapters c ON s.chapter_id = c.id
WHERE s.pov_character = 'Sarah Chen'
ORDER BY c.chapter_number, s.scene_order;
```

### Scripting & Automation

Create scripts for common workflows:

`scripts/daily-writing.sh`:
```bash
#!/bin/bash

# Daily writing routine
/novel session start
/novel chapter show --number $(cat .current-chapter)
/novel generate continue --scene $(cat .current-scene)

# Open editor
code chapters/$(printf "%02d" $(cat .current-chapter))-*.md

# After writing
read -p "Words written: " words
/novel session end --words $words
/novel check consistency
```

### Backup & Version Control

**Git integration** (recommended):

```bash
# Initialize git
git init

# .gitignore
echo ".novel/data.db" >> .gitignore
echo ".env" >> .gitignore
echo "node_modules/" >> .gitignore

# Commit regularly
git add characters/ world/ chapters/
git commit -m "Chapter 5 draft complete"
```

**Why exclude database?**
- Files are source of truth
- Database is regenerated via sync
- Easier merge conflicts with text files

**Backup workflow:**
```bash
# Export everything
/novel export manuscript --output backups/manuscript-$(date +%Y%m%d).md
/novel timeline export --output backups/timeline-$(date +%Y%m%d).yml

# Git commit
git add .
git commit -m "Backup: $(date)"
git push
```

---

## Troubleshooting

### Common Issues

#### "API key not configured"

```bash
# Check .env file
cat .env

# Verify key is set
node -e "require('dotenv').config(); console.log(process.env.ANTHROPIC_API_KEY)"

# Test with simple generation
/novel generate character --description "test"
```

**Fix:**
- Ensure `.env` file exists in project root
- Check `ANTHROPIC_API_KEY=your-key` is present
- Restart your terminal/editor

#### "MCP server not responding"

```bash
# Check Python installation
python --version  # Need 3.8+

# Install MCP SQLite server
pip install mcp-server-sqlite

# Check package.json MCP config
cat claudenovel_plugin/package.json | grep -A 10 mcpServers
```

#### "Database sync failed"

```bash
# Check database exists
ls -la .novel/data.db

# Reinitialize if needed
/novel init --force

# Resync all files
/novel sync characters
/novel sync locations
/novel sync chapters
```

#### "Consistency check showing false positives"

```bash
# Mark as false positive
/novel check ignore --id 12 \
  --note "Character gets colored contacts in Chapter 8"

# Or acknowledge for later
/novel check acknowledge --id 12 \
  --note "Will fix in revision"
```

### Performance Issues

#### Large projects (100+ chapters)

- **Chunk exports**: Export in batches
  ```bash
  /novel export manuscript --chapters 1-25 --output part1.md
  /novel export manuscript --chapters 26-50 --output part2.md
  ```

- **Selective sync**: Sync only changed files
  ```bash
  /novel sync characters --file characters/sarah.yml
  ```

#### AI generation slow

- **Reduce temperature** for faster responses
  ```bash
  /novel generate continue --temperature 0.5
  ```

- **Check API status**: https://status.anthropic.com/

### Getting Help

1. **Check documentation**:
   - This guide (comprehensive)
   - [CLI_REFERENCE.md](./CLI_REFERENCE.md) (all commands)
   - [QUICKSTART.md](./QUICKSTART.md) (basics)

2. **Run built-in help**:
   ```bash
   /novel help
   /novel help generate
   ```

3. **Report issues**:
   - GitHub: https://github.com/YOUR_USERNAME/claude-novel-writer/issues
   - Include: Error message, command used, environment (OS, Node version)

---

## Best Practices

### Writing Workflow

#### Daily Routine

1. **Start session** - Track your time
2. **Review yesterday** - Read last paragraph written
3. **Set micro-goal** - 300-500 words minimum
4. **Write first** - Before editing yesterday's work
5. **Use AI when stuck** - Not as default
6. **End session** - Log progress, quick consistency check
7. **Celebrate** - Every word counts

#### Weekly Routine

1. **Sunday planning** - Review next 3 chapters
2. **Wednesday check** - Run full consistency check
3. **Friday review** - Read week's writing aloud
4. **Archive** - Git commit, backup exports

#### Monthly Routine

1. **Progress review** - Assess overall pace
2. **Character consistency** - Deep character check
3. **Plot threads** - Ensure threads are advancing
4. **Timeline audit** - Export and review chronology

### AI Usage Guidelines

**DO:**
- ✅ Use AI to **unstick** yourself
- ✅ Generate **alternatives** for discovery writing
- ✅ Expand **sensory details** you missed
- ✅ **Brainstorm** when planning
- ✅ **Edit everything** AI produces

**DON'T:**
- ❌ Copy AI output verbatim
- ❌ Use AI instead of thinking through plot
- ❌ Let AI replace your voice
- ❌ Generate entire chapters
- ❌ Trust AI for consistency (use checker instead)

### File Organization

**Keep clean structure:**
```
characters/
  ├── protagonists/
  │   ├── sarah-chen.yml
  │   └── maya-singh.yml
  ├── antagonists/
  │   └── agent-brooks.yml
  └── minor/
      └── lab-assistant.yml

world/
  ├── locations/
  │   ├── seti-observatory.yml
  │   └── government-facility.yml
  ├── rules/
  │   ├── radio-protocols.yml
  │   └── classification-levels.yml
  └── timeline.yml

chapters/
  ├── act1/
  │   ├── 01-first-contact.md
  │   ├── 02-verification.md
  │   └── ...
  ├── act2/
  │   └── ...
  └── act3/
      └── ...
```

### Git Commit Messages

```bash
# Good commit messages
git commit -m "Chapter 5 first draft complete"
git commit -m "Add character: Agent Brooks"
git commit -m "Revise chapters 1-3 for pacing"
git commit -m "Fix timeline conflict in Ch 8"

# Tag milestones
git tag first-draft-complete
git tag revision-1-complete
```

### Consistency Maintenance

**Prevent issues instead of fixing:**

1. **Character bible** - Reference before writing character scenes
2. **World rules** - Add rules BEFORE violating them
3. **Timeline** - Update as you write, not later
4. **Daily checks** - Quick check each session

### Revision Strategy

**Three-pass revision:**

1. **Developmental** (big picture)
   - Plot coherence
   - Character arcs
   - Pacing
   - Run: `/novel check consistency`

2. **Line editing** (prose)
   - Sentence variety
   - Word choice
   - Show vs tell balance
   - Read aloud

3. **Copy editing** (technical)
   - Grammar, spelling
   - Consistency (names, places)
   - Formatting
   - Final check: `/novel check consistency`

---

## Conclusion

### Remember the Philosophy

> "Suggest, don't dictate. The craft belongs to you."

This tool helps you:
- **Track** what you create
- **Check** for consistency
- **Suggest** when you're stuck
- **Celebrate** your progress

But YOU:
- Create the characters
- Tell the story
- Make the decisions
- Write the words

### The Writing Journey

**You are not alone**. Every novelist faces:
- Blank page fear
- Middle-of-book sag
- Consistency headaches
- Doubt and impostor syndrome

This tool helps with the **mechanical** challenges so you can focus on the **creative** work.

### Keep Writing

> "You must finish your novel, no matter what." - Anne Rice

The tool tracks streaks for a reason. **Showing up matters more than perfection.**

Bad writing leads to good writing. First drafts are supposed to be rough.

**Your job right now**: Get the story down.

Revision comes later.

---

### Next Steps

You're ready to write your novel.

- Start with [QUICKSTART.md](./QUICKSTART.md) if you haven't
- Reference [CLI_REFERENCE.md](./CLI_REFERENCE.md) for commands
- Read [NOVEL_CRAFT_PRINCIPLES.md](./NOVEL_CRAFT_PRINCIPLES.md) for inspiration
- Review [WRITING_PROCESS.md](./WRITING_PROCESS.md) for the full journey

**Most importantly**: Open your editor and write.

---

**Happy writing! 📖✍️**

*The story only you can tell is waiting.*
