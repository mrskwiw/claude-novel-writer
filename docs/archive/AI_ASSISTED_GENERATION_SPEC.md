# AI-Assisted Character & Location Generation

**Status**: 🔮 Future Feature (TODO)
**Implementation**: Subagent using Claude Code Task tool
**Priority**: Medium

## Overview

Enable authors to create characters and locations from natural language descriptions using AI. The system should generate complete, well-formatted YAML files that match the templates and automatically sync to the database.

## User Stories

### Character Generation

**As an author, I want to:**
- Describe a character in natural language and get a complete profile
- Refine generated details through conversation
- Have the AI infer reasonable details based on archetype/genre
- Maintain control over final output

**Example Interaction:**
```
Author: Create a protagonist who is a brilliant but isolated astrophysicist
        in her mid-30s, discovering something that challenges everything she knows.

AI: I'll create a character profile. Here's what I'm generating:

Name: Dr. Sarah Chen
Role: Protagonist
Age: 34
Core trait: Brilliant but isolated

I'm inferring:
- Scientific background in astrophysics
- Personality: analytical, driven, cautious with people
- Likely flaw: difficulty trusting/connecting with others
- Arc: Learning to open up and work with others

Does this direction work for you? Any changes?

Author: Yes, but make her more defiant of authority.

AI: Updated! Adding:
- Personality flaw: Distrustful of institutional authority
- Background: Possibly left a major institution
- Voice: Direct, challenges assumptions

Generating complete YAML profile...
✓ Created: characters/sarah-chen.yml
✓ Synced to database
```

### Location Generation

**As an author, I want to:**
- Describe a location and get detailed world-building
- Have the AI suggest sensory details and atmosphere
- Build hierarchical locations (city → building → room)

**Example Interaction:**
```
Author: Create a remote radio telescope observatory in the mountains.

AI: Creating location profile:

Name: Mount Hamilton Observatory
Type: building
Parent: Mount Hamilton, California

I'm generating:
- Isolated location, minimal staff
- High altitude, clear skies
- 1960s architecture, recently upgraded equipment
- Atmosphere: Quiet, contemplative, slightly eerie at night

Adding details for:
- Control room (main workspace)
- Observation deck
- Living quarters

Does this match your vision?
```

## Technical Architecture

### Subagent Implementation

Use Claude Code's `Task` tool with specialist `content-generator` subagent:

```typescript
async createCharacterFromDescription(
  description: string
): Promise<string> {
  // Launch content generator subagent
  const result = await Task({
    description: "Generate character from description",
    prompt: `
      You are a character profile generator for fiction writing.

      Author's description: "${description}"

      Your task:
      1. Analyze the description and identify key traits
      2. Infer reasonable details based on genre conventions
      3. Generate a complete CharacterYAML object
      4. Return as valid YAML

      Use the following template structure:
      ${characterTemplateYAML}

      Guidelines:
      - Be creative but grounded
      - Infer personality from role/archetype
      - Suggest voice patterns appropriate to character
      - Leave relationship fields empty (author will add)
      - Include character arc if role is protagonist/antagonist

      Return ONLY valid YAML, no explanations.
    `,
    subagent_type: "content-generator"
  });

  // Parse generated YAML
  const characterData = YAML.parse(result);

  // Validate
  validateCharacterYAML(characterData);

  // Write file using CharacterBuilder
  const builder = this.getCharacterBuilder();
  const filePath = await builder.createFromObject(characterData);

  // Auto-sync
  const sync = this.getCharacterSync();
  await sync.syncCharacterFile(filePath);

  return filePath;
}
```

### Multi-Step Refinement

For more complex generation, use conversational refinement:

```typescript
async createCharacterWithRefinement(
  description: string,
  conversationFn: ConversationFunction
): Promise<string> {
  // Step 1: Generate initial profile
  const initial = await this.generateCharacterDraft(description);

  // Step 2: Present to author for feedback
  const feedback = await conversationFn(
    "Here's the initial character profile. What would you like to change?",
    initial
  );

  // Step 3: Refine based on feedback
  const refined = await this.refineCharacter(initial, feedback);

  // Step 4: Final confirmation and write
  const confirmed = await conversationFn(
    "Final profile. Approve?",
    refined
  );

  if (confirmed) {
    return await this.writeCharacterFile(refined);
  }
}
```

## Implementation Steps

### Phase 1: Basic Generation ✅ (TODO)
- [x] Single-pass character generation from description
- [x] Single-pass location generation from description
- [x] YAML validation
- [x] Auto-sync to database

### Phase 2: Refinement Loop (TODO)
- [ ] Multi-step conversation with author
- [ ] Iterative refinement
- [ ] Change suggestions
- [ ] Final approval step

### Phase 3: Advanced Features (TODO)
- [ ] Genre-aware generation (sci-fi vs fantasy vs contemporary)
- [ ] Relationship inference (auto-suggest character connections)
- [ ] Voice pattern analysis (generate speech patterns from examples)
- [ ] Location atmosphere enhancement (sensory details)

### Phase 4: Consistency Aware (TODO)
- [ ] Check against existing characters before creating
- [ ] Suggest relationships with existing characters
- [ ] Ensure location fits existing world rules
- [ ] Flag potential conflicts

### Phase 5: Editing Features (TODO)
- [ ] Developmental Editor
  - [ ] Chapter analysis (pacing, character development, structure)
  - [ ] Character arc analysis across chapters
  - [ ] Manuscript structure analysis
  - [ ] Store feedback in database
  - [ ] Iterative feedback refinement
- [ ] Copy Editor
  - [ ] Grammar and punctuation checking
  - [ ] Spelling and typo detection
  - [ ] Style consistency checking
  - [ ] Apply/reject corrections UI
  - [ ] Manuscript-wide consistency check
- [ ] Line Editor
  - [ ] Passage-level prose improvement
  - [ ] Dialogue naturalness analysis
  - [ ] Prose quality reporting
  - [ ] Multiple revision alternatives
  - [ ] Author voice preservation

## Prompts Library

### Character Generation Prompt Template

```
You are an expert character developer for fiction writing. Your task is to create a complete, compelling character profile based on the author's description.

Author's Description:
{description}

Genre Context: {genre}
Project Phase: {phase}

Generate a complete character profile following this structure:
{yaml_template}

Instructions:
1. Core Identity
   - Infer name if not provided (appropriate to genre/setting)
   - Determine role based on description
   - Create compelling one-paragraph summary

2. Physical Traits
   - Include age (exact or range)
   - Basic appearance (eyes, hair, height)
   - Distinctive features that matter to story

3. Personality
   - Core trait (drives character)
   - Strengths (3-5)
   - Flaws (must have at least one major flaw)
   - Fears (internal or external)
   - Desires (what they want)

4. Background
   - Occupation relevant to story
   - Education/training level
   - Family situation (if relevant)
   - Key past events that shaped them

5. Voice & Speech
   - How they speak (formal/casual, direct/evasive)
   - Verbal quirks or catchphrases
   - Vocabulary level
   - Physical mannerisms

6. Character Arc (for major characters)
   - Starting state: Who they are at story start
   - Ending state: Who they could become
   - Midpoint crisis: What will challenge them most

Guidelines:
- Be specific but not restrictive
- Leave room for author to develop
- Suggest without dictating
- Ground in psychological realism
- Consider genre conventions

Output only valid YAML. No explanations.
```

### Location Generation Prompt Template

```
You are an expert world-builder for fiction writing. Create a detailed, atmospheric location profile.

Author's Description:
{description}

Genre: {genre}
Related Locations: {existing_locations}

Generate a complete location profile:
{yaml_template}

Instructions:
1. Identity
   - Appropriate name
   - Type (city, building, room, etc.)
   - Placement in hierarchy

2. Description
   - Visual details (architecture, layout)
   - Atmosphere and mood
   - Sensory details (sounds, smells, textures)
   - Time of day considerations

3. Details
   - Size/scale
   - Population (if applicable)
   - Notable features
   - Historical context

4. Rules
   - Physical constraints
   - Social norms
   - Technology level
   - Access restrictions

5. Story Function
   - Why this location matters
   - Emotional resonance
   - Plot possibilities

Guidelines:
- Create vivid, specific details
- Consider all five senses
- Think about lighting and mood
- Include practical details (exits, size, hazards)
- Suggest symbolic meaning

Output only valid YAML. No explanations.
```

## Validation & Safety

### Generated Content Validation

```typescript
function validateGeneratedCharacter(yaml: CharacterYAML): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!yaml.name) errors.push('Missing required field: name');
  if (!yaml.role) errors.push('Missing required field: role');
  if (!yaml.summary) errors.push('Missing required field: summary');

  // Role validation
  const validRoles = ['protagonist', 'antagonist', 'major', 'minor', 'background'];
  if (!validRoles.includes(yaml.role)) {
    errors.push(`Invalid role: ${yaml.role}`);
  }

  // Personality check (at least one flaw)
  if (yaml.personality && !yaml.personality.flaws) {
    errors.push('Characters should have at least one flaw');
  }

  // Arc validation (protagonists should have arcs)
  if (yaml.role === 'protagonist' && !yaml.arc) {
    errors.push('Protagonist should have character arc defined');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

## Future Enhancements

### Batch Generation
Generate multiple related characters at once:
```
Author: Create a family of four for my mystery novel -
        two parents and two teenage kids, upper middle class.

AI: Generating family unit with interconnected profiles...
```

### Voice Training
Train on author's existing characters:
```
Author: Analyze my character Sarah's dialogue and generate
        a new character with a contrasting voice.

AI: Analyzing Sarah's patterns:
    - Technical vocabulary
    - Short, precise sentences
    - Rarely uses contractions

    Creating contrast character:
    - Casual, colloquial speech
    - Long, rambling sentences
    - Heavy use of contractions and slang
```

### Relationship Web
Auto-generate relationship suggestions:
```
AI: Based on your existing characters, I suggest:
    - Sarah and Tom: Former mentor/student, now rivals
    - Sarah and Maya: Potential ally, different methodology
    - Tom and Director Chen: Longstanding professional respect

    Add these to their profiles?
```

---

# AI-Assisted Editing Features

## Overview

Four specialist AI subagents that support different stages of the novel writing process. One for content generation (characters and locations) and three for editing/revision. Each subagent type focuses on a specific aspect of writing or manuscript improvement while respecting the author's voice and creative decisions.

**Important**: Each editor is implemented as a **specialist subagent** using the Claude Code Task tool. This allows each editor to maintain focused expertise in its domain without cross-contamination of responsibilities.

## Specialist Subagents Overview

| Subagent Type | Purpose | Key Focus | When to Use |
|---------------|---------|-----------|-------------|
| **market-analyst** | Commercial viability analysis | Market trends, comp titles, positioning | Before committing to project |
| **premise-consultant** | Premise/genre/theme development | High-concept premise, genre fit, theme | Early ideation phase |
| **outline-consultant** | Story structure planning | Three-act structure, plot points | Planning phase (for plotters) |
| **beats-consultant** | Story beats & integration | Genre beats, plot thread weaving | Outline review or mid-draft check |
| **content-generator** | Create characters & locations | Generate YAML from descriptions | During planning/world-building |
| **developmental-editor** | Story structure analysis | Plot, pacing, character arcs | After first draft, before polishing |
| **copy-editor** | Technical correctness | Grammar, punctuation, style | Final polishing phase |
| **line-editor** | Prose quality improvement | Word choice, rhythm, imagery | After developmental edits |

## Subagent Architecture

### Why Specialist Subagents?

Rather than using a single general-purpose subagent for all tasks, we define specialist subagents for different novel writing needs:

**Pre-Writing & Planning:**
1. **market-analyst**: Expert in commercial fiction market trends, competitive analysis, and positioning strategy
2. **premise-consultant**: Expert in high-concept premise development, genre conventions, and thematic depth
3. **outline-consultant**: Expert in story structure, plot architecture, and narrative organization
4. **beats-consultant**: Expert in genre-specific story beats, plot thread integration, and narrative momentum

**Content Generation:**
5. **content-generator**: Expert in creating character profiles, location descriptions, and world-building from natural language descriptions

**Editing & Revision:**
6. **developmental-editor**: Expert in story structure, character arcs, pacing, and narrative craft
7. **copy-editor**: Expert in grammar, punctuation, spelling, and style consistency
8. **line-editor**: Expert in prose quality, rhythm, word choice, and author voice

**Benefits:**
- Each subagent has focused expertise in its domain
- Clearer boundaries between task types
- Better prompt optimization for specific tasks
- Reduced risk of conflating different types of feedback
- Authors can invoke specific subagent types independently
- Planning consultants help before writing begins
- Content generation stays separate from editing/critique
- Each phase of the writing process has appropriate AI support

### Subagent Configuration

When implementing, the extension should register these specialist subagents with the Claude Code Task tool:

```typescript
// Configuration for specialist subagents
const NOVEL_SUBAGENTS = {
  // Pre-Writing & Planning Consultants
  'market-analyst': {
    description: 'Commercial fiction market analysis expert',
    systemPrompt: `You are a publishing industry market analyst with deep knowledge of
                   commercial fiction trends, competitive positioning, and reader preferences.
                   You analyze premise viability, identify comparable titles, assess market
                   saturation, and provide strategic positioning advice. You understand both
                   traditional publishing and self-publishing markets.`,
    capabilities: [
      'market-trend-analysis',
      'comparable-title-identification',
      'genre-market-assessment',
      'positioning-strategy',
      'commercial-viability-scoring',
      'audience-identification'
    ]
  },

  'premise-consultant': {
    description: 'Premise, genre, and theme development expert',
    systemPrompt: `You are a story development consultant specializing in high-concept
                   premise creation, genre conventions, and thematic depth. You help authors
                   refine their core story idea into a compelling premise, ensure it fits
                   genre expectations while offering originality, and develop meaningful
                   thematic layers. You understand Save the Cat, Story Grid, and other
                   story frameworks.`,
    capabilities: [
      'premise-refinement',
      'genre-fit-analysis',
      'theme-development',
      'high-concept-creation',
      'logline-crafting',
      'story-framework-application'
    ]
  },

  'outline-consultant': {
    description: 'Story structure and outlining expert',
    systemPrompt: `You are a story structure expert helping authors build robust outlines.
                   You understand three-act structure, Hero's Journey, Save the Cat beat
                   sheets, and other plotting frameworks. You help plotters create detailed
                   chapter-by-chapter outlines while respecting that pantsers may only want
                   high-level structure. You focus on cause-and-effect chains, plot points,
                   and narrative momentum.`,
    capabilities: [
      'structure-framework-application',
      'plot-point-identification',
      'chapter-outline-creation',
      'subplot-integration',
      'act-break-placement',
      'narrative-flow-optimization'
    ]
  },

  'beats-consultant': {
    description: 'Story beats and plot integration specialist',
    systemPrompt: `You are a story beats expert ensuring all necessary genre beats are hit
                   and plot threads are properly woven together. You understand genre-specific
                   expectations (romance beats, mystery reveals, thriller pacing, etc.) and
                   help authors ensure their story delivers on reader expectations while
                   maintaining originality. You identify missing beats and integration issues.`,
    capabilities: [
      'genre-beat-checking',
      'plot-thread-tracking',
      'beat-sheet-validation',
      'integration-issue-detection',
      'pacing-beat-analysis',
      'setup-payoff-tracking'
    ]
  },

  // Content Generation
  'content-generator': {
    description: 'Character and world-building content creator',
    systemPrompt: `You are an expert content generator for fiction writing. You create
                   detailed, compelling character profiles and location descriptions from
                   natural language descriptions. You infer reasonable details based on
                   genre conventions and archetypes while leaving room for author creativity.
                   You generate properly formatted YAML output.`,
    capabilities: [
      'character-generation',
      'location-generation',
      'world-building',
      'genre-aware-inference',
      'yaml-generation'
    ]
  },

  // Editing & Revision
  'developmental-editor': {
    description: 'Story structure and narrative craft expert',
    systemPrompt: `You are a professional developmental editor with 20+ years experience
                   in fiction. You analyze story-level issues: structure, character arcs,
                   pacing, plot coherence, and thematic development. You do NOT provide
                   grammar corrections or line-level prose suggestions.`,
    capabilities: [
      'story-structure-analysis',
      'character-arc-tracking',
      'pacing-analysis',
      'plot-coherence-checking',
      'thematic-development'
    ]
  },

  'copy-editor': {
    description: 'Grammar, punctuation, and style consistency expert',
    systemPrompt: `You are a professional copy editor specializing in fiction manuscripts.
                   You identify and correct grammar, punctuation, spelling, and style
                   consistency issues. You do NOT provide story feedback or rewrite for
                   prose improvement - only technical correctness.`,
    capabilities: [
      'grammar-checking',
      'punctuation-correction',
      'spelling-validation',
      'style-guide-enforcement',
      'consistency-checking'
    ]
  },

  'line-editor': {
    description: 'Prose quality and style expert',
    systemPrompt: `You are a master line editor and prose stylist with deep knowledge
                   of fiction craft. You improve sentence-level prose quality: clarity,
                   rhythm, word choice, imagery, and flow. You preserve the author's unique
                   voice while elevating their craft. You do NOT provide story structure
                   feedback or grammar corrections.`,
    capabilities: [
      'prose-improvement',
      'dialogue-analysis',
      'sentence-rhythm-analysis',
      'word-choice-optimization',
      'voice-preservation'
    ]
  }
};
```

### Task Tool Integration

When invoking a specialist subagent:

```typescript
// Example: Market analyst
const marketAnalysis = await Task({
  description: "Analyze market viability for premise",
  prompt: `${NOVEL_SUBAGENTS['market-analyst'].systemPrompt}

  Premise: A time-traveling detective solves historical mysteries
  Genre: Science fiction thriller
  Target audience: Adult readers who enjoy Michael Crichton and Blake Crouch

  Analyze commercial viability, identify comparable titles, and provide positioning advice.`,
  subagent_type: "market-analyst"
});

// Example: Premise consultant
const premiseAnalysis = await Task({
  description: "Refine premise and develop theme",
  prompt: `${NOVEL_SUBAGENTS['premise-consultant'].systemPrompt}

  Initial idea: "A woman discovers she can see ghosts after a near-death experience"
  Genre: Contemporary fantasy / Urban fantasy

  Help me refine this into a high-concept premise and suggest thematic depth.`,
  subagent_type: "premise-consultant"
});

// Example: Outline consultant
const outlineStructure = await Task({
  description: "Create three-act structure outline",
  prompt: `${NOVEL_SUBAGENTS['outline-consultant'].systemPrompt}

  Premise: [Full premise...]
  Characters: [Main characters...]
  Desired structure: Three-act with Hero's Journey beats

  Create a chapter-by-chapter outline with key plot points identified.`,
  subagent_type: "outline-consultant"
});

// Example: Beats consultant
const beatsCheck = await Task({
  description: "Verify romance beats are hit",
  prompt: `${NOVEL_SUBAGENTS['beats-consultant'].systemPrompt}

  Genre: Contemporary romance
  Current outline: [Outline...]

  Check if all essential romance beats are present and properly placed.`,
  subagent_type: "beats-consultant"
});

// Example: Content generator (character creation)
const characterYAML = await Task({
  description: "Generate character from description",
  prompt: `${NOVEL_SUBAGENTS['content-generator'].systemPrompt}

  Author's description: "A brilliant but isolated astrophysicist in her mid-30s"

  Generate a complete character profile in YAML format.`,
  subagent_type: "content-generator"
});

// Example: Developmental editor
const feedback = await Task({
  description: "Analyze chapter for story-level issues",
  prompt: `${NOVEL_SUBAGENTS['developmental-editor'].systemPrompt}

  [Chapter content and context...]

  Analyze this chapter for pacing, character development, and plot structure.`,
  subagent_type: "developmental-editor"
});

// Example: Copy editor
const corrections = await Task({
  description: "Copy edit chapter for technical correctness",
  prompt: `${NOVEL_SUBAGENTS['copy-editor'].systemPrompt}

  [Chapter content and style guide...]

  Identify all grammar, punctuation, and style issues.`,
  subagent_type: "copy-editor"
});

// Example: Line editor
const suggestions = await Task({
  description: "Line edit passage for prose quality",
  prompt: `${NOVEL_SUBAGENTS['line-editor'].systemPrompt}

  [Passage and author voice samples...]

  Improve this passage's prose while maintaining the author's voice.`,
  subagent_type: "line-editor"
});
```

---

## Market Viability Analyst

**Status**: 🔮 Future Feature (TODO)
**Implementation**: Specialist subagent (market-analyst)
**Priority**: Medium
**Phase**: Pre-Writing Phase (Ideation/Decision)

### Purpose

Analyzes the commercial viability of a story premise, identifies comparable titles, assesses market saturation, and provides strategic positioning advice. Helps authors make informed decisions about project viability before investing months of writing time.

### Subagent Specialization

The market analyst should be implemented as a **specialist subagent** with:
- Deep knowledge of current fiction market trends (traditional and self-publishing)
- Understanding of genre market dynamics and reader preferences
- Ability to identify comparable titles and analyze their success factors
- Strategic positioning expertise
- Realistic commercial assessment (not overly optimistic or pessimistic)

### User Stories

**As an author, I want to:**
- Assess if my premise has commercial potential
- Identify comparable titles to study
- Understand market saturation in my genre/niche
- Get positioning advice to differentiate my story
- Make informed decisions about project viability
- Understand target audience demographics

### Example Interaction

```
Author: Analyze market viability for this premise:
"A marine biologist discovers an ancient underwater civilization that's been
manipulating human evolution through genetic interventions."

AI (Market Analyst): Analyzing premise for commercial viability...

**Genre Classification:**
- Primary: Science Fiction Thriller
- Sub-genres: Technothriller, Biopunk, Ancient Aliens
- Crossover appeal: Michael Crichton-style hard SF readers

**Comparable Titles (Comp Analysis):**

Strong Comps:
1. "The Deep" by Rivers Solomon (2019)
   - Underwater civilization theme
   - Strong sales in SF community
   - Critical acclaim + commercial success

2. "Into the Drowning Deep" by Mira Grant (2017)
   - Marine biology + thriller elements
   - Solid midlist performance
   - Built on existing author platform

3. "The Swarm" by Frank Schätzing (2004)
   - Marine SF thriller, international bestseller
   - Proof of concept for premise type

Partial Comps:
- "The Andromeda Strain" (Crichton) - bio-thriller structure
- "Sphere" (Crichton) - underwater + mystery
- "At the Mountains of Madness" (Lovecraft) - ancient civilization discovery

**Market Assessment:**

Strengths:
✓ Evergreen appeal: Ocean mysteries + ancient aliens = perennial reader interest
✓ Multiple audience entry points: SF readers, thriller fans, Crichton fans
✓ Film/TV potential: High-concept, visual, timely (ocean exploration trending)
✓ Genre crossover: Can reach beyond pure SF audience

Challenges:
⚠ Competitive space: Marine thrillers exist but not oversaturated
⚠ Comp title age: Some comps are older (may need fresh angle)
⚠ Scientific accuracy: Readers expect plausible science (like Crichton)

**Market Saturation Analysis:**
- Science fiction thriller: Moderate saturation, healthy demand
- Underwater/ocean SF: Low saturation, underserved niche
- Ancient civilization mysteries: Moderate, steady interest
- **Overall**: GREEN - Good market opportunity

**Commercial Viability Score: 7.5/10**

Factors:
+ Timely (ocean exploration in news)
+ High-concept (easy to pitch)
+ Multiple audience segments
+ Film potential increases visibility
- Needs strong scientific grounding
- Competition from established authors

**Positioning Strategy:**

Recommended Positioning:
"Michael Crichton meets James Cameron's The Abyss"
- Emphasizes: hard SF, underwater setting, thriller pacing
- Appeals to: Crichton fans (large, loyal audience)
- Differentiator: Genetic manipulation angle (fresh twist)

Alternative Positioning:
"Arrival meets 20,000 Leagues Under the Sea"
- Emphasizes: first contact, marine setting
- Appeals to: cerebral SF readers
- Differentiator: Evolutionary intervention concept

**Target Audience:**
Primary: Adults 30-55, college-educated, science-oriented
Secondary: Thriller readers who tolerate SF elements
Tertiary: Film/TV adaptation fans (prestige SF)

**Publishing Path Recommendation:**
- Traditional: Yes, strong case for major publisher
  * High-concept appeals to acquisitions editors
  * Comparable commercial titles show market
  * Film rights potential sweetens deal

- Self-publishing: Also viable
  * Genre audiences active in digital markets
  * Can build via thriller + SF categories
  * Would benefit from strong cover (underwater scene)

**Strategic Recommendations:**

1. **Research Phase:**
   - Read all comps (especially strong performers)
   - Study marine biology (authenticity crucial)
   - Analyze reader reviews of comps (what worked/didn't)

2. **Writing Phase:**
   - Balance hard science with accessibility
   - Emphasize thriller pacing (Crichton model)
   - Create compelling scientist protagonist (not cliché)

3. **Marketing Hooks:**
   - "What if humanity wasn't alone in directing evolution?"
   - Marine biology + genetic manipulation + ancient mystery
   - Ocean as final frontier (timely angle)

4. **Query/Pitch Strategy:**
   - Lead with comps: "ARRIVAL meets THE DEEP"
   - Emphasize thriller structure, not pure SF
   - Highlight film potential
   - Note: timeliness (ocean exploration trending)

**Red Flags to Avoid:**
- Info-dumping science (readers will bounce)
- Slow first act (thriller readers expect quick hook)
- Unrealistic marine biology (expert readers will roast)
- Aliens as villains cliché (make them morally complex)

**Bottom Line:**
This premise has solid commercial potential. The underwater civilization angle
is fresh enough to stand out, the genetic manipulation adds stakes, and the
comp titles show proven reader interest. With strong execution (Crichton-level
research + thriller pacing), this could perform well in both traditional and
self-publishing markets. Film/TV potential is genuine.

Recommendation: **PROCEED** - This is a commercially viable project worth the time investment.
```

### Technical Implementation

```typescript
export class MarketAnalyst {
  constructor(
    private mcpClient: MCPSQLiteClient,
    private projectId: number
  ) {}

  /**
   * Analyze market viability for a premise
   */
  async analyzePremise(
    premise: string,
    genre: string,
    targetAudience?: string
  ): Promise<MarketAnalysis> {
    const result = await Task({
      description: "Analyze market viability",
      prompt: this.buildMarketAnalysisPrompt(premise, genre, targetAudience),
      subagent_type: "market-analyst"
    });

    const analysis = this.parseMarketAnalysis(result);

    // Store in database
    await this.storeMarketAnalysis(this.projectId, analysis);

    return analysis;
  }

  /**
   * Identify comparable titles
   */
  async findComparableTitles(
    premise: string,
    genre: string,
    count: number = 10
  ): Promise<ComparableTitle[]> {
    const result = await Task({
      description: "Find comparable titles",
      prompt: this.buildCompTitlesPrompt(premise, genre, count),
      subagent_type: "market-analyst"
    });

    return this.parseComparableTitles(result);
  }

  /**
   * Assess market saturation
   */
  async assessSaturation(
    genre: string,
    subGenres: string[]
  ): Promise<SaturationReport> {
    const result = await Task({
      description: "Assess market saturation",
      prompt: this.buildSaturationPrompt(genre, subGenres),
      subagent_type: "market-analyst"
    });

    return this.parseSaturationReport(result);
  }

  /**
   * Generate positioning strategy
   */
  async generatePositioning(
    premise: string,
    comps: ComparableTitle[],
    uniqueAngles: string[]
  ): Promise<PositioningStrategy> {
    const result = await Task({
      description: "Generate positioning strategy",
      prompt: this.buildPositioningPrompt(premise, comps, uniqueAngles),
      subagent_type: "market-analyst"
    });

    return this.parsePositioningStrategy(result);
  }

  private buildMarketAnalysisPrompt(
    premise: string,
    genre: string,
    targetAudience?: string
  ): string {
    return `
You are a publishing industry market analyst. Analyze this premise for commercial viability.

**Premise:**
${premise}

**Genre:** ${genre}
${targetAudience ? `**Target Audience:** ${targetAudience}` : ''}

**Provide:**
1. **Genre Classification**: Primary, sub-genres, crossover appeal
2. **Comparable Titles**: 5-10 strong comps with brief analysis
3. **Market Assessment**: Strengths, challenges, opportunities
4. **Saturation Analysis**: Is this genre/niche oversaturated?
5. **Commercial Viability Score**: 1-10 with explanation
6. **Positioning Strategy**: How to position this in the market
7. **Target Audience**: Demographics and psychographics
8. **Publishing Path**: Traditional, self-pub, or hybrid recommendation
9. **Strategic Recommendations**: Specific, actionable advice
10. **Red Flags**: What could kill commercial potential

**Tone:**
- Honest but not discouraging
- Data-driven where possible
- Realistic about challenges
- Constructive in suggestions

**Output Format:**
Use structured markdown with clear sections and bullet points.
    `;
  }
}

export interface MarketAnalysis {
  projectId: number;
  timestamp: string;
  premise: string;
  genre: string;
  genreClassification: {
    primary: string;
    subGenres: string[];
    crossoverAppeal: string[];
  };
  comparableTitles: ComparableTitle[];
  marketAssessment: {
    strengths: string[];
    challenges: string[];
    opportunities: string[];
  };
  saturationLevel: 'low' | 'moderate' | 'high' | 'oversaturated';
  viabilityScore: number; // 1-10
  viabilityExplanation: string;
  positioning: PositioningStrategy;
  targetAudience: {
    demographics: string;
    psychographics: string;
    audienceSize: 'niche' | 'moderate' | 'broad';
  };
  publishingPath: {
    traditional: { viable: boolean; reasoning: string };
    selfPublishing: { viable: boolean; reasoning: string };
    recommendation: 'traditional' | 'self-publishing' | 'hybrid';
  };
  recommendations: string[];
  redFlags: string[];
}

export interface ComparableTitle {
  title: string;
  author: string;
  year: number;
  relevance: 'strong' | 'moderate' | 'weak';
  similarities: string[];
  successFactors: string[];
  marketPerformance: string;
}

export interface PositioningStrategy {
  primaryPitch: string; // e.g., "Arrival meets The Deep"
  alternativePitches: string[];
  differentiators: string[];
  marketingHooks: string[];
  targetCategories: string[];
}

export interface SaturationReport {
  genre: string;
  level: 'low' | 'moderate' | 'high' | 'oversaturated';
  recentTitles: number; // published in last 2 years
  trendDirection: 'rising' | 'stable' | 'declining';
  opportunities: string[];
  risks: string[];
}
```

---

## Premise, Genre & Theme Consultant

**Status**: 🔮 Future Feature (TODO)
**Implementation**: Specialist subagent (premise-consultant)
**Priority**: High
**Phase**: Pre-Writing Phase (Ideation)

### Purpose

Helps authors refine their core story idea into a compelling, high-concept premise. Ensures genre fit while maintaining originality. Develops thematic depth and creates effective loglines for pitching.

### Subagent Specialization

The premise consultant should be implemented as a **specialist subagent** with:
- Expertise in high-concept premise development
- Deep understanding of genre conventions across multiple genres
- Theme development and symbolic resonance
- Story framework knowledge (Save the Cat, Story Grid, etc.)
- Logline and pitch crafting skills

### User Stories

**As an author, I want to:**
- Transform a vague idea into a compelling premise
- Ensure my premise fits genre expectations
- Develop meaningful thematic layers
- Create a strong logline for querying
- Understand what makes my premise unique
- Balance originality with market expectations

### Example Interaction

```
Author: Help me develop this premise:
"A hacker discovers a government conspiracy and has to expose it."

AI (Premise Consultant): Let's develop this into a stronger, more specific premise.

**Current State Analysis:**

What's Working:
✓ Clear protagonist role (hacker)
✓ External conflict (vs. government)
✓ Stakes implied (conspiracy)

What Needs Development:
⚠ Generic setup (many hacker/conspiracy stories)
⚠ No personal stakes or character specificity
⚠ Missing "what makes THIS story unique?"
⚠ Theme unclear
⚠ Genre could be sharper

**Key Questions to Refine:**

1. **Personal Stakes:** Why THIS hacker? What makes them uniquely suited/unsuited?
   Example: "A teenage hacker with face blindness..."
   Example: "A former NSA analyst turned whistleblower..."
   Example: "A hacker who's also the conspiracy architect's daughter..."

2. **Specific Conspiracy:** What's being hidden? Make it concrete.
   Generic: "government secrets"
   Specific: "algorithmic manipulation of elections"
   Specific: "false flag terrorist attacks"
   Specific: "evidence that consciousness can be digitized"

3. **Unique Angle:** What fresh twist elevates this?
   Tech angle: AR/VR hacking, quantum computing, AI manipulation
   Personal angle: Hacker is blind, elderly, in prison, dying
   Moral angle: Exposing truth will harm innocents

**Refined Premise Options:**

**Option A (High-Tech Thriller):**
"When a blind teenage hacker accidentally intercepts encrypted government
communications, she discovers a conspiracy to weaponize AI-generated
deepfakes for political control—but exposing the truth means revealing
her illegal hacking operation and losing her chance at a government
scholarship, her only way out of poverty."

Strengths:
+ Specific protagonist (blind teenager adds challenge)
+ Timely tech angle (deepfakes, AI)
+ Real moral dilemma (expose truth vs. personal future)
+ Clear genre: YA technothriller
+ Theme emerging: truth vs. self-interest

**Option B (Paranoid Thriller):**
"A reformed black-hat hacker working as a cybersecurity consultant
discovers evidence that his new employer—a tech giant—is using its
devices to create a surveillance state. But the deeper he digs, the more
he realizes he helped build the system five years ago, and exposing it
means admitting his own crimes."

Strengths:
+ Personal culpability adds depth
+ Moral complexity (he's not innocent)
+ Timely (surveillance capitalism fears)
+ Adult audience, darker tone
+ Theme: complicity, redemption

**Option C (Near-Future SF):**
"In 2035, a memory-hacker who steals corporate secrets from brain
implants discovers that a government contractor is erasing inconvenient
memories from entire populations. Racing to preserve evidence before her
own memories are wiped, she must decide whether some truths are too
dangerous to remember."

Strengths:
+ Unique SF angle (memory hacking)
+ Philosophical questions (memory = identity)
+ Genre: Science fiction thriller
+ High-concept hook
+ Theme: memory, truth, identity

**Genre Fit Analysis:**

Current premise works for:
- ✓ Technothriller
- ✓ Political thriller
- ✓ Cyberpunk
- ? Literary thriller (needs more character depth)

Recommended Genre: **Technothriller with SF elements**
- Strong market demand
- Allows both action and ideas
- Natural home for tech conspiracy plots

**Theme Development:**

Surface Theme: Individual vs. powerful system
Deeper Themes to Explore:
- Truth vs. security ("Some secrets protect us")
- Complicity ("We're all part of the system we hate")
- Identity in digital age ("Who are we without privacy?")
- David vs. Goliath (classic, always resonant)

Recommended Thematic Question:
"Is ignorance ever bliss, or is uncomfortable truth always necessary?"

**High-Concept Logline (based on Option A):**

"A blind teenage hacker stumbles onto a government conspiracy to
weaponize AI-generated deepfakes—and exposing the truth means
sacrificing her only chance to escape poverty."

**Alternative Logline (based on Option B):**

"When a reformed hacker discovers his employer's surveillance state, he
realizes he helped build it—and exposing the truth means confessing
his own crimes."

**Save the Cat Genre:**
- Institutional Thriller (individual vs. institution)
- Could also work as: Fool Triumphant (underdog wins)

**Recommendations:**

1. **Specificity is Everything:**
   - Change: "a hacker" → "a blind teenage hacker"
   - Change: "a conspiracy" → "weaponized AI deepfakes"
   - Change: "expose it" → "but exposing means losing scholarship"

2. **Add Personal Stakes:**
   - What does protagonist lose if they DON'T act?
   - What do they lose if they DO act?
   - Best premises: damned if you do, damned if you don't

3. **Make it Timely:**
   - AI/deepfakes (current fear)
   - Surveillance capitalism (perennial worry)
   - OR: Make it timeless (human nature themes)

4. **Genre Expectations:**
   - Technothriller: needs technical accuracy + fast pacing
   - Include: ticking clock, escalating stakes, reversals
   - Avoid: info dumps, slow first act, tech as magic

Which direction resonates with you? I can help develop whichever premise further.
```

### Technical Implementation

```typescript
export class PremiseConsultant {
  constructor(
    private mcpClient: MCPSQLiteClient,
    private projectId: number
  ) {}

  /**
   * Refine a premise with consultant guidance
   */
  async refinePremise(
    initialIdea: string,
    genre?: string,
    targetAudience?: string
  ): Promise<PremiseRefinement> {
    const result = await Task({
      description: "Refine story premise",
      prompt: this.buildPremiseRefinementPrompt(initialIdea, genre, targetAudience),
      subagent_type: "premise-consultant"
    });

    const refinement = this.parsePremiseRefinement(result);

    await this.storePremiseRefinement(this.projectId, refinement);

    return refinement;
  }

  /**
   * Analyze genre fit
   */
  async analyzeGenreFit(
    premise: string,
    proposedGenre: string
  ): Promise<GenreFitAnalysis> {
    const result = await Task({
      description: "Analyze premise genre fit",
      prompt: this.buildGenreFitPrompt(premise, proposedGenre),
      subagent_type: "premise-consultant"
    });

    return this.parseGenreFitAnalysis(result);
  }

  /**
   * Develop thematic depth
   */
  async developTheme(
    premise: string,
    initialThemeIdeas?: string[]
  ): Promise<ThemeDevelopment> {
    const result = await Task({
      description: "Develop story themes",
      prompt: this.buildThemeDevelopmentPrompt(premise, initialThemeIdeas),
      subagent_type: "premise-consultant"
    });

    return this.parseThemeDevelopment(result);
  }

  /**
   * Create loglines for pitching
   */
  async createLoglines(
    premise: string,
    genre: string,
    count: number = 5
  ): Promise<string[]> {
    const result = await Task({
      description: "Create premise loglines",
      prompt: this.buildLoglinePrompt(premise, genre, count),
      subagent_type: "premise-consultant"
    });

    return this.parseLoglines(result);
  }

  private buildPremiseRefinementPrompt(
    initialIdea: string,
    genre?: string,
    targetAudience?: string
  ): string {
    return `
You are a story development consultant specializing in premise refinement.

**Initial Idea:**
${initialIdea}

${genre ? `**Proposed Genre:** ${genre}` : ''}
${targetAudience ? `**Target Audience:** ${targetAudience}` : ''}

**Your Task:**
1. Analyze what's working and what needs development
2. Ask key questions to sharpen specificity
3. Provide 3 refined premise options with different angles
4. Analyze genre fit for each option
5. Suggest thematic depth
6. Create high-concept loglines
7. Map to story framework (Save the Cat, Hero's Journey, etc.)

**Guidelines:**
- Specificity beats generality (unique protagonist, specific conflict)
- Personal stakes + external stakes = compelling
- "High-concept" means: easy to pitch, clear hook
- Theme should emerge from premise (not forced)
- Consider what makes THIS premise fresh/unique

**Output Format:**
Structured markdown with clear sections, multiple options, actionable advice.
    `;
  }
}

export interface PremiseRefinement {
  projectId: number;
  timestamp: string;
  originalIdea: string;
  analysis: {
    strengths: string[];
    weaknesses: string[];
    questions: string[];
  };
  refinedOptions: Array<{
    premise: string;
    strengths: string[];
    genre: string;
    targetAudience: string;
    uniqueAngle: string;
  }>;
  loglines: string[];
  thematicSuggestions: string[];
  storyFrameworkMapping: {
    framework: 'Save the Cat' | 'Hero\'s Journey' | 'Story Grid' | 'Three-Act';
    classification: string;
  };
  recommendations: string[];
}

export interface GenreFitAnalysis {
  premise: string;
  proposedGenre: string;
  fitScore: number; // 1-10
  conventionsMatched: string[];
  conventionsMissing: string[];
  hybridPossibilities: string[];
  recommendation: string;
}

export interface ThemeDevelopment {
  surfaceTheme: string;
  deeperThemes: string[];
  thematicQuestion: string;
  symbolicElements: string[];
  avoidClichés: string[];
}
```

---

## Outline Consultant

**Status**: 🔮 Future Feature (TODO)
**Implementation**: Specialist subagent (outline-consultant)
**Priority**: High
**Phase**: Planning Phase

### Purpose

Helps authors build robust story outlines using established frameworks (three-act structure, Hero's Journey, Save the Cat, etc.). Respects that plotters need detail while pantsers might only want high-level structure.

### Subagent Specialization

The outline consultant should be implemented as a **specialist subagent** with:
- Mastery of multiple story structure frameworks
- Understanding of cause-and-effect plotting
- Subplot integration expertise
- Flexibility for plotter vs. pantser needs
- Act break and plot point placement skills

### User Stories

**As an author, I want to:**
- Create a structured outline using proven frameworks
- Identify key plot points and turning points
- Integrate subplots naturally
- Understand where my act breaks should fall
- Get chapter-by-chapter structure (if I'm a plotter)
- Get just high-level beats (if I'm a pantser)
- Ensure cause-and-effect chains are logical

### Example Interaction

```
Author: Help me outline a mystery novel using three-act structure.

Premise: "A retired detective investigates her sister's suspicious death
and uncovers a pharmaceutical conspiracy."

AI (Outline Consultant): I'll create a three-act mystery structure with key
plot points identified. Let me know if you want chapter-level detail or
just the major beats.

**STRUCTURE FRAMEWORK: Three-Act Mystery**

---
## ACT ONE: Setup & Inciting Incident (25% of novel)

**Opening Image (Chapter 1):**
- Introduce protagonist in her "before" state
- Show retirement, perhaps boredom or loss of purpose
- Establish ordinary world
Suggested length: 1 chapter (~2500-3000 words)

**Inciting Incident (End of Chapter 1 or early Chapter 2):**
- Sister dies under suspicious circumstances
- Official ruling: suicide or accident
- Protagonist's detective instinct says otherwise
Key element: Plant first clue that something's wrong

**Debate/Reluctance (Chapters 2-3):**
- Should she investigate? She's retired, not her jurisdiction
- Family pressure (accept the official story vs. dig deeper)
- Personal cost: reopening old wounds
Resolution: Commits to investigating

**Break into Act Two (~25% mark, end of Chapter 3-4):**
- Major commitment: Protagonist officially starts investigation
- Crossing point of no return
- New world: Enters investigation mode, assembles resources
Suggested chapter break: "I'm going to find out what really happened"

### Major Plot Points in Act One:
1. **Inciting Incident:** Sister's death
2. **First Clue:** Something doesn't add up (what?)
3. **Debate:** To investigate or not
4. **Commitment:** Crosses into Act Two

### Mysteries to Establish:
- What was sister working on before death?
- Who benefits from her death?
- Why would officials cover it up?

---

## ACT TWO-A: Investigation & Rising Complications (25%)

**Fun and Games / Investigation Phase (Chapters 5-8):**
This is your "detective doing detective stuff" section

Chapter 5: Interview sister's coworkers
- Learn about pharmaceutical company project
- Red herring: suspicious colleague (not the real villain)
- First resistance: people reluctant to talk

Chapter 6: Follow evidence trail
- Discover sister's hidden files
- Clue points to clinical trial irregularities
- Plant seed of larger conspiracy

Chapter 7: Raise the stakes
- First threat: someone warns protagonist to stop
- Personal cost: family thinks she's obsessed
- Mystery deepens: more questions than answers

Chapter 8: Build toward midpoint
- Breakthrough: Major clue reveals scope
- Realize this is bigger than one death
- Set up midpoint revelation

**Midpoint (50% mark, end of Chapter 8 or 9):**
This is the game-changing revelation that shifts everything

Midpoint Revelation (Choose one):
- Option A: Discover sister was killed for what she knew
- Option B: Learn protagonist herself is in danger
- Option C: Realize the conspiracy involves powerful people

Effect of Midpoint:
- BEFORE: Protagonist investigates external mystery
- AFTER: Mystery becomes personal threat
- Stakes raised: Now it's not just about sister, it's survival

**Mystery Midpoint Requirements:**
✓ Major revelation that recontextualizes earlier clues
✓ Protagonist moves from reactive to proactive
✓ Ticking clock introduced (e.g., trial data will be destroyed)
✓ First major setback or betrayal

---

## ACT TWO-B: Complications & Reversal (25%)

**Bad Guys Close In (Chapters 10-12):**

Chapter 10: Escalating opposition
- Threats become real (attempt on protagonist's life?)
- Allies questioned: Who can be trusted?
- Mystery elements: Identify the conspiracy players

Chapter 11: Personal losses
- Relationship strain (family, friends, love interest)
- Professional cost (if applicable)
- Emotional low point building

Chapter 12: Internal conflict
- Protagonist questions herself
- "Am I making this up?" doubt
- Almost gives up

**All Is Lost (75% mark, end of Chapter 13):**
The lowest point before final act

All Is Lost Moment:
- Seems impossible to win
- Key evidence destroyed or discredited
- Protagonist's credibility ruined
- Perhaps: Ally betrayal or death
- Emotional nadir: "I failed my sister"

**Dark Night of the Soul (Chapter 14):**
- Protagonist at breaking point
- Internal crisis: Why does this matter?
- Theme manifests: What is she really fighting for?
- Realization: Finds new angle or renewed resolve

**Break into Act Three (~75-80%, end of Chapter 14):**
- New plan emerges from despair
- Protagonist finds hidden strength or resource
- Decisive action: Going on the offensive
- "I know what I have to do"

---

## ACT THREE: Resolution & Climax (25%)

**Gathering the Team / Final Plan (Chapter 15):**
- Assemble final pieces
- Call in favors, gather allies
- Plan the confrontation
- Prepare for final showdown

**Climax (Chapters 16-17):**
- Confrontation with antagonist(s)
- All mysteries revealed
- Physical or verbal showdown
- Justice served (or bitter truth revealed)

Mystery Climax Requirements:
✓ Protagonist's cleverness wins, not just luck
✓ All clues planted earlier pay off
✓ Antagonist's downfall comes from their own actions
✓ Satisfying revelation: readers feel smart for picking up clues

**Climax Structure Suggestions:**
- Antagonist thinks they've won
- Protagonist reveals they've outmaneuvered them
- Evidence/trap sprung
- Antagonist's reaction and defeat

**Resolution (Chapter 18):**
- Immediate aftermath
- Justice/closure for sister
- Protagonist's new equilibrium
- Hint at how life moves forward

**Final Image:**
- Mirror opening image
- Show protagonist's transformation
- Thematic closure
- Emotional satisfaction

---

## KEY PLOT POINTS SUMMARY:

**Act One:**
1. Inciting Incident: Sister's death (5-10% mark)
2. Break into Two: Commits to investigation (25% mark)

**Act Two:**
3. Midpoint: Game-changing revelation (50% mark)
4. All Is Lost: Lowest point (75% mark)
5. Break into Three: New plan emerges (80% mark)

**Act Three:**
6. Climax: Final confrontation (90-95% mark)
7. Resolution: New equilibrium (100% mark)

---

## SUBPLOT INTEGRATION:

**Suggested Subplots:**

1. **Relationship Subplot (Romance or Family):**
   - Act One: Introduce relationship tension
   - Midpoint: Relationship tested by investigation
   - All Is Lost: Relationship breaking point
   - Resolution: Relationship resolved (healed or ended)

2. **Internal Character Arc (Protagonist):**
   - Setup: Retired, purposeless
   - Midpoint: Rediscovers her detective identity
   - Resolution: Integrates old self with new wisdom

3. **Secondary Mystery (Optional):**
   - Minor mystery that intersects with main plot
   - Resolved at midpoint or Act Three
   - Should illuminate theme or character

---

## CHAPTER-BY-CHAPTER BREAKDOWN:

Would you like me to create:
a) Detailed chapter outlines (scene-by-scene, 500 words each)
b) Chapter summaries (2-3 sentences per chapter)
c) Just stick with the act-level structure above

Also:
- Should I add more mystery-specific beats (red herrings, clue plants)?
- Do you want subplot details woven into each chapter?
- Should I suggest specific scene types (interrogation, chase, research, etc.)?

This structure hits all the classic three-act beats while respecting
mystery genre conventions. The key is ensuring every plot point raises
questions that pull readers forward.
```

### Technical Implementation

```typescript
export class OutlineConsultant {
  constructor(
    private mcpClient: MCPSQLiteClient,
    private projectId: number
  ) {}

  /**
   * Create structured outline
   */
  async createOutline(
    premise: string,
    framework: 'three-act' | 'heros-journey' | 'save-the-cat' | 'story-grid',
    genre: string,
    detailLevel: 'beats-only' | 'chapter-summary' | 'scene-by-scene'
  ): Promise<StoryOutline> {
    const result = await Task({
      description: "Create story outline",
      prompt: this.buildOutlinePrompt(premise, framework, genre, detailLevel),
      subagent_type: "outline-consultant"
    });

    const outline = this.parseOutline(result);

    await this.storeOutline(this.projectId, outline);

    return outline;
  }

  /**
   * Identify plot points
   */
  async identifyPlotPoints(
    outline: string,
    framework: string
  ): Promise<PlotPoint[]> {
    const result = await Task({
      description: "Identify key plot points",
      prompt: this.buildPlotPointsPrompt(outline, framework),
      subagent_type: "outline-consultant"
    });

    return this.parsePlotPoints(result);
  }

  /**
   * Integrate subplots
   */
  async integrateSubplots(
    mainPlot: string,
    subplotIdeas: string[]
  ): Promise<SubplotIntegration> {
    const result = await Task({
      description: "Integrate subplots with main plot",
      prompt: this.buildSubplotIntegrationPrompt(mainPlot, subplotIdeas),
      subagent_type: "outline-consultant"
    });

    return this.parseSubplotIntegration(result);
  }

  /**
   * Refine act structure
   */
  async refineActStructure(
    currentOutline: string,
    issues: string[]
  ): Promise<ActStructureRefinement> {
    const result = await Task({
      description: "Refine act structure",
      prompt: this.buildActRefinementPrompt(currentOutline, issues),
      subagent_type: "outline-consultant"
    });

    return this.parseActRefinement(result);
  }

  private buildOutlinePrompt(
    premise: string,
    framework: string,
    genre: string,
    detailLevel: string
  ): string {
    return `
You are a story structure expert creating an outline.

**Premise:**
${premise}

**Framework:** ${framework}
**Genre:** ${genre}
**Detail Level:** ${detailLevel}

**Your Task:**
1. Apply the ${framework} framework to this premise
2. Identify all key plot points and turning points
3. Create ${detailLevel === 'beats-only' ? 'high-level beats' : detailLevel === 'chapter-summary' ? 'chapter summaries' : 'detailed scene breakdowns'}
4. Ensure cause-and-effect logic
5. Integrate genre-specific expectations
6. Suggest subplot opportunities
7. Place act breaks appropriately

**Genre-Specific Elements for ${genre}:**
[Include relevant genre beats and expectations]

**Guidelines:**
- Clear cause-and-effect chains
- Each scene/chapter must advance plot or character
- Build tension progressively
- Plant and pay off setups
- Respect framework percentages (e.g., Act One = 25%)

**Output Format:**
Structured markdown with:
- Act-level summaries
- Key plot points marked
- Chapter/beat breakdowns as requested
- Subplot integration notes
- Pacing guidance
    `;
  }
}

export interface StoryOutline {
  projectId: number;
  framework: string;
  genre: string;
  detailLevel: string;
  acts: Array<{
    actNumber: number;
    actName: string;
    percentageRange: string; // e.g., "0-25%"
    summary: string;
    keyPlotPoints: PlotPoint[];
    chapters: Chapter[];
  }>;
  subplots: Subplot[];
  overallStructure: string;
  recommendations: string[];
}

export interface PlotPoint {
  name: string; // e.g., "Inciting Incident", "Midpoint", "All Is Lost"
  location: string; // "End of Act One", "Chapter 5", "50% mark"
  description: string;
  requirements: string[];
  exampleFromPremise: string;
}

export interface Chapter {
  chapterNumber: number;
  title?: string;
  wordCountTarget: number;
  summary: string;
  sceneBreakdown?: Scene[];
  plotThreads: string[];
  purposeFunction: string;
}

export interface Scene {
  sceneNumber: number;
  location: string;
  characters: string[];
  purpose: string;
  conflict: string;
  outcome: string;
}

export interface Subplot {
  id: string;
  description: string;
  integrateionPoints: Array<{
    act: number;
    chapter?: number;
    description: string;
  }>;
  resolution: string;
}

export interface SubplotIntegration {
  mainPlot: string;
  subplots: Subplot[];
  integrationStrategy: string;
  balanceAnalysis: string;
}
```

---

## Story Beats & Integration Consultant

**Status**: 🔮 Future Feature (TODO)
**Implementation**: Specialist subagent (beats-consultant)
**Priority**: Medium
**Phase**: Planning Phase / Mid-Draft Review

### Purpose

Ensures all necessary genre-specific story beats are hit and plot threads are properly woven together. Validates that the story delivers on genre expectations while maintaining originality.

### Subagent Specialization

The beats consultant should be implemented as a **specialist subagent** with:
- Deep knowledge of genre-specific beat expectations
- Plot thread tracking and integration expertise
- Setup/payoff validation skills
- Pacing beat analysis
- Genre convention expertise across multiple genres

### User Stories

**As an author, I want to:**
- Verify all essential genre beats are present
- Track multiple plot threads through the manuscript
- Ensure setup/payoff pairs are complete
- Check that pacing beats hit at the right moments
- Identify missing beats before readers notice
- Understand genre-specific reader expectations

### Example Interaction

```
Author: Check if my romance outline hits all the essential romance beats.

AI (Beats Consultant): Analyzing your outline against romance genre beat
requirements...

**ROMANCE BEAT SHEET VALIDATION**

---

## Essential Romance Beats (Required)

**✓ 1. Meet-Cute / First Meeting** (Found: Chapter 1, Page 8)
- Status: **PRESENT**
- Your Version: Protagonists collide at coffee shop, spill drinks
- Strength: Cute, memorable, shows personality clash
- Note: Good establishing of initial chemistry through banter

**✓ 2. Initial Attraction** (Found: Chapter 2)
- Status: **PRESENT**
- Your Version: Both notice physical attraction despite personality clash
- Strength: Show, don't tell - through body language and internal thought
- Note: Nice job balancing with external conflict

**✗ 3. Barrier to Relationship** (Found: Weak in Chapter 3)
- Status: **NEEDS STRENGTHENING**
- Your Version: "They're too different"
- Issue: Too generic, not compelling enough
- **Recommendation**: Make barrier more specific and insurmountable-feeling
  - Example: They work for rival companies in high-stakes negotiation
  - Example: One is leaving for overseas job in 3 months
  - Example: Family feud (Romeo & Juliet style)
- **Fix**: Chapter 3 needs clearer, more concrete obstacle

**✓ 4. Build Romantic Tension** (Chapters 4-8)
- Status: **PRESENT** (Good progression)
- Your Version: Series of forced-proximity situations, slow burn
- Strength: Multiple beats building tension incrementally
- Note: Chapter 6 coffee scene is particularly strong

**⚠ 5. First Kiss** (Found: Chapter 9, but timing may be off)
- Status: **PRESENT but NEEDS TIMING CHECK**
- Your Version: Spontaneous kiss after emotional conversation
- Issue: At 36% through novel - might be slightly early
- Romance genre standard: Usually 40-50% for contemporary
- **Recommendation**:
  - Option A: Push to Chapter 10-11 (45-50% mark)
  - Option B: Keep placement but make it interrupted/incomplete
  - Reason: Give more time for emotional tension to build

**✓ 6. Relationship Deepening** (Chapters 10-13)
- Status: **PRESENT**
- Your Version: Montage of dates, sharing vulnerabilities
- Strength: Good emotional intimacy building
- Note: Chapter 11 vulnerability scene is very strong

**✗ 7. External Conflict** (Missing or Weak)
- Status: **MISSING CRITICAL BEAT**
- Your Version: Minor work stress mentioned
- Issue: Not strong enough to feel like real obstacle
- **CRITICAL**: Romance needs external plot driving story forward
- **Recommendation**: Add subplot that:
  - Threatens relationship (job transfer, family obligation, rival)
  - Has high stakes (not easily resolved)
  - Forces protagonists to make hard choices
  - Integrates with character arcs
- **Suggested Addition**: Introduce in Chapter 7-8, escalate through Act Two

**✓ 8. Big Misunderstanding / Black Moment** (Chapter 16, ~64%)
- Status: **PRESENT**
- Your Version: Protagonist misinterprets overheard conversation
- Timing: Good (60-70% is standard)
- Strength: Organic to characters, not contrived
- Note: Make sure this couldn't be resolved with simple conversation

**⚠ 9. Dark Night of the Soul** (Chapter 17)
- Status: **PRESENT but COULD BE DEEPER**
- Your Version: Protagonist sad for one chapter
- Issue: Emotional impact feels light
- **Recommendation**:
  - Show real cost of losing relationship
  - Internal character realization (what they learned)
  - Make reader feel the loss
  - One chapter might not be enough - consider expanding

**✓ 10. Grand Gesture / Grovel** (Chapter 18)
- Status: **PRESENT**
- Your Version: Protagonist makes public declaration
- Strength: Fits character arc (overcoming fear of vulnerability)
- Note: Ensure this feels earned, not manipulative

**✓ 11. Happily Ever After (HEA)** (Chapter 20)
- Status: **PRESENT**
- Your Version: Clear commitment, future together shown
- Strength: Satisfying, shows growth
- **Critical**: Romance genre REQUIRES HEA or HFN (Happy For Now)
  - Your ending: HEA ✓
  - Shows: Commitment, future plans, emotional resolution ✓

---

## Genre-Specific Beat Requirements

**Contemporary Romance Checklist:**

Required Beats:
- ✓ Meet-cute
- ✓ Initial attraction
- ⚠ Compelling external conflict (WEAK - needs work)
- ✓ Forced proximity or repeated encounters
- ✓ First kiss (timing check needed)
- ✓ Intimacy progression (emotional)
- ⚠ Intimacy progression (physical) - Check heat level consistency
- ✓ Black moment / big misunderstanding
- ✓ Grand gesture
- ✓ HEA/HFN

Optional but Common Beats:
- ⚠ Rival for affection (absent - might add tension)
- ✓ Supportive best friend (present)
- ✓ Meet the family (present, Chapter 14)
- ✗ Workplace conflict (mentioned but not developed)

---

## Plot Thread Integration Analysis

**Tracking Multiple Threads:**

### Thread 1: Romance (Main Plot)
- Introduced: Chapter 1
- Development: Chapters 1-19
- Resolution: Chapter 20
- **Status**: ✓ Complete arc
- **Integration**: Well-paced, clear progression

### Thread 2: Protagonist's Career Arc
- Introduced: Chapter 2
- Development: Sporadic mentions (Chapters 5, 9, 12, 15)
- Resolution: Rushed in Chapter 19
- **Status**: ⚠ WEAK INTEGRATION
- **Issue**: Feels like an afterthought
- **Recommendation**:
  - Interweave more consistently throughout
  - Make career choice relate to romantic growth
  - Resolution should parallel romantic resolution

### Thread 3: Family Subplot (Protagonist)
- Introduced: Chapter 4
- Development: Chapters 4, 7, 11, 16
- Resolution: Chapter 19
- **Status**: ⚠ INCOMPLETE
- **Issue**: Mother's disapproval mentioned but never resolved
- **Recommendation**:
  - Add scene where protagonist addresses family concern
  - Or: Show family accepting relationship
  - Current: Feels like abandoned thread

### Thread 4: Love Interest's Past Trauma
- Introduced: Chapter 6
- Development: Chapters 6, 10, 13
- Resolution: Chapter 18
- **Status**: ✓ Good arc
- **Integration**: ✓ Ties into black moment effectively

---

## Setup / Payoff Validation

**Checking for Orphaned Setups:**

**✓ Setup (Ch 3): Protagonist's fear of commitment**
→ Payoff (Ch 19): Overcomes fear, makes commitment
**Status**: COMPLETE

**⚠ Setup (Ch 5): Rival company merger mentioned**
→ Payoff: MISSING
**Status**: NEEDS PAYOFF
**Recommendation**: Either payoff in Act Three or remove setup

**✓ Setup (Ch 8): Love interest's family ring**
→ Payoff (Ch 20): Ring used in proposal
**Status**: COMPLETE (nice touch!)

**✗ Setup (Ch 11): Protagonist's job offer in New York**
→ Payoff: Mentioned briefly in Ch 19, not fully resolved
**Status**: INCOMPLETE
**Recommendation**: This is major! Needs clear resolution:
  - Does she take it?
  - Does she turn it down?
  - Compromise option?
  - Can't leave this vague

---

## Pacing Beat Analysis

**Expected vs. Actual Pacing:**

| Beat | Expected % | Your % | Status |
|------|-----------|--------|--------|
| Meet-cute | 0-5% | 4% | ✓ Perfect |
| First kiss | 40-50% | 36% | ⚠ Slightly early |
| Relationship established | 50-60% | 52% | ✓ Good |
| Black moment | 60-75% | 64% | ✓ Good |
| Resolution | 80-90% | 80% | ✓ Perfect |
| HEA | 95-100% | 95% | ✓ Perfect |

**Overall Pacing**: Strong! Minor adjustment on first kiss timing.

---

## Missing Genre Expectations

**What Romance Readers Expect (Contemporary):**

Present in Your Outline:
✓ Chemistry and banter
✓ Emotional vulnerability
✓ Character growth through relationship
✓ Satisfying HEA
✓ Kissing scenes
✓ Meet the family

**Missing or Weak:**
⚠ Strong external plot (too light currently)
⚠ Compelling antagonist force (rival, family, job, etc.)
⚠ High enough stakes (needs more "what if they can't be together?")
? Heat level unclear (close door? Steamy? Clarify expectations)

---

## Critical Recommendations

**MUST FIX (High Priority):**

1. **Strengthen External Conflict** (Chapters 7-16)
   - Current: Too light
   - Needed: Real obstacle that could genuinely prevent HEA
   - Example: Job transfer, family feud, professional ethics conflict
   - Impact: Will raise stakes, increase tension, make resolution more satisfying

2. **Complete Family Subplot** (Add scene in Chapter 19)
   - Current: Mother's disapproval mentioned, never resolved
   - Needed: Scene showing family acceptance or protagonist standing ground
   - Why: Readers need closure on all emotional threads

3. **Resolve Job Offer Thread** (Chapter 19 or 20)
   - Current: Mentioned but vague
   - Needed: Clear decision with explanation
   - Why: Major life choice can't be hand-waved

**SHOULD FIX (Medium Priority):**

4. **Deepen Dark Night of the Soul** (Chapter 17)
   - Current: One chapter, feels light
   - Needed: More emotional weight, real sense of loss
   - Why: Black moment needs to feel genuinely devastating

5. **Check First Kiss Timing** (Move from Ch 9 to Ch 10-11?)
   - Current: 36% through
   - Standard: 40-50%
   - Why: Gives more time for emotional tension

6. **Integrate Career Arc Better** (Throughout)
   - Current: Sporadic mentions
   - Needed: Consistent subplot that parallels romantic growth
   - Why: Gives protagonist dimension beyond romance

---

## Beat Sheet Score: 7.5/10

**Strengths:**
+ All essential romance beats present
+ Good pacing overall
+ Strong emotional moments
+ Satisfying HEA

**Needs Work:**
- External conflict too weak
- Some plot threads incomplete
- Black moment could be deeper

**Bottom Line:**
You have a solid romance structure! The main issue is the external conflict needs
to be stronger—readers need to genuinely worry the couple won't make it. Fix the
three MUST FIX items and you'll have a genre-satisfying romance that hits all the
necessary beats while telling your unique story.

Would you like specific suggestions for strengthening the external conflict?
```

### Technical Implementation

```typescript
export class BeatsConsultant {
  constructor(
    private mcpClient: MCPSQLiteClient,
    private projectId: number
  ) {}

  /**
   * Validate genre beats
   */
  async validateGenreBeats(
    outline: string,
    genre: string,
    subGenres?: string[]
  ): Promise<BeatValidation> {
    const result = await Task({
      description: "Validate genre-specific beats",
      prompt: this.buildBeatValidationPrompt(outline, genre, subGenres),
      subagent_type: "beats-consultant"
    });

    const validation = this.parseBeatValidation(result);

    await this.storeBeatValidation(this.projectId, validation);

    return validation;
  }

  /**
   * Track plot threads
   */
  async trackPlotThreads(
    manuscript: string,
    knownThreads?: string[]
  ): Promise<PlotThreadAnalysis> {
    const result = await Task({
      description: "Track and analyze plot threads",
      prompt: this.buildPlotThreadPrompt(manuscript, knownThreads),
      subagent_type: "beats-consultant"
    });

    return this.parsePlotThreadAnalysis(result);
  }

  /**
   * Validate setup/payoff pairs
   */
  async validateSetupPayoff(
    outline: string
  ): Promise<SetupPayoffAnalysis> {
    const result = await Task({
      description: "Validate setup and payoff pairs",
      prompt: this.buildSetupPayoffPrompt(outline),
      subagent_type: "beats-consultant"
    });

    return this.parseSetupPayoffAnalysis(result);
  }

  /**
   * Analyze pacing beats
   */
  async analyzePacingBeats(
    outline: string,
    totalWordCount: number
  ): Promise<PacingAnalysis> {
    const result = await Task({
      description: "Analyze pacing beat placement",
      prompt: this.buildPacingAnalysisPrompt(outline, totalWordCount),
      subagent_type: "beats-consultant"
    });

    return this.parsePacingAnalysis(result);
  }

  private buildBeatValidationPrompt(
    outline: string,
    genre: string,
    subGenres?: string[]
  ): string {
    return `
You are a story beats expert validating genre beat requirements.

**Outline:**
${outline}

**Genre:** ${genre}
${subGenres ? `**Sub-genres:** ${subGenres.join(', ')}` : ''}

**Your Task:**
1. List ALL essential beats for this genre
2. Check which beats are present in the outline
3. Identify missing or weak beats
4. Validate beat timing (percentages through story)
5. Assess setup/payoff pairs
6. Track plot thread integration
7. Provide specific recommendations for missing beats

**Genre Beat Requirements for ${genre}:**
[List specific beats required for the genre]

**Output Format:**
For each required beat:
- ✓ PRESENT / ⚠ WEAK / ✗ MISSING
- Location in outline (if present)
- Assessment of execution
- Recommendations for improvement

Include:
- Plot thread tracking
- Setup/payoff validation
- Pacing beat analysis
- Critical vs. optional beats
- Genre reader expectations

Be specific about where to add/fix beats.
    `;
  }
}

export interface BeatValidation {
  projectId: number;
  genre: string;
  subGenres: string[];
  requiredBeats: Array<{
    beatName: string;
    status: 'present' | 'weak' | 'missing';
    location?: string;
    assessment: string;
    recommendations: string[];
  }>;
  optionalBeats: Array<{
    beatName: string;
    present: boolean;
    worthAdding?: string;
  }>;
  plotThreads: PlotThread[];
  setupPayoffPairs: SetupPayoffPair[];
  pacingAnalysis: PacingBeat[];
  overallScore: number;
  criticalIssues: string[];
  recommendations: string[];
}

export interface PlotThread {
  id: string;
  description: string;
  introduced: string; // "Chapter 1"
  development: string[]; // ["Chapter 3", "Chapter 7"]
  resolution?: string; // "Chapter 15"
  status: 'complete' | 'incomplete' | 'abandoned';
  integrationQuality: 'strong' | 'moderate' | 'weak';
  recommendations: string[];
}

export interface SetupPayoffPair {
  setup: {
    description: string;
    location: string;
  };
  payoff?: {
    description: string;
    location: string;
  };
  status: 'complete' | 'missing-payoff' | 'weak-payoff';
  impact: 'critical' | 'important' | 'minor';
  recommendation?: string;
}

export interface PacingBeat {
  beatName: string;
  expectedLocation: string; // "40-50% through story"
  actualLocation?: string; // "36% through story"
  status: 'on-pace' | 'early' | 'late' | 'missing';
  impact: string;
}

export interface PlotThreadAnalysis {
  threads: PlotThread[];
  integration Summary: string;
  orphanedThreads: string[];
  recommendations: string[];
}

export interface SetupPayoffAnalysis {
  pairs: SetupPayoffPair[];
  orphanedSetups: string[];
  unexpectedPayoffs: string[];
  recommendations: string[];
}

export interface PacingAnalysis {
  beats: PacingBeat[];
  overallPacing: 'too-fast' | 'well-paced' | 'too-slow';
  actLengths: Array<{
    act: number;
    expectedPercentage: string;
    actualPercentage: string;
    status: string;
  }>;
  recommendations: string[];
}
```

---

## Developmental Editor

**Status**: 🔮 Future Feature (TODO)
**Implementation**: Specialist subagent (developmental-editor)
**Priority**: High
**Phase**: Revision Phase (Story Development)

### Purpose

Provides big-picture feedback on story structure, character arcs, pacing, plot coherence, and thematic development. Acts as a professional developmental editor analyzing the manuscript holistically.

### Subagent Specialization

The developmental editor should be implemented as a **specialist subagent** with:
- Deep knowledge of story structure and narrative craft
- Understanding of character development and arcs
- Expertise in pacing and tension management
- Genre-specific conventions awareness
- Focus on "story-level" issues (not prose or grammar)

### User Stories

**As an author, I want to:**
- Get feedback on plot structure and pacing
- Identify weak character arcs or motivations
- Discover plot holes and logical inconsistencies
- Understand thematic resonance (or lack thereof)
- Get suggestions for structural improvements
- Maintain full creative control over changes

### Example Interaction

```
Author: Analyze Chapter 5 for pacing and character development issues.

AI (Developmental Editor): Analyzing Chapter 5...

**Pacing Analysis:**
- Opening: Strong hook with observatory discovery (300 words)
- Middle: Pacing slows significantly during technical exposition (1200 words)
  ⚠️ Risk: Reader fatigue. Consider breaking up with action/dialogue
- Climax: Confrontation with Director Chen feels rushed (400 words)
  ⚠️ Recommendation: This emotional beat needs more space

**Character Development:**
✓ Sarah's isolation trait reinforced through her reluctance to share findings
⚠️ Director Chen's motivation unclear - why is he blocking her research?
  Suggest: Add a line revealing his past experience with similar situations
✓ Sarah's arc progressing: Moving from pure isolation toward trusting Tom

**Structural Issues:**
1. Sarah discovers the anomaly (p. 87) but her emotional reaction is understated
   - This is a world-changing discovery. Her internal response needs depth

2. The timeline feels compressed - she makes the discovery at 2 AM,
   confronts Chen at 8 AM. Where's the time to process?

3. Tom's loyalty shift happens off-page between Ch 4 and Ch 5
   - Consider a brief scene showing this transition

**Strengths:**
- The scientific details ground the story without overwhelming
- Sarah's voice remains consistent
- The tension escalates appropriately

**Recommendation:**
Consider splitting Chapter 5 into two chapters:
- Ch 5: Discovery + Sarah's night of processing (her alone with implications)
- Ch 6: Confrontation with Chen (after she's had time to think)

Would you like detailed suggestions for any of these points?
```

### Technical Implementation

```typescript
export class DevelopmentalEditor {
  constructor(
    private mcpClient: MCPSQLiteClient,
    private projectId: number
  ) {}

  /**
   * Analyze a chapter or scene for developmental issues
   */
  async analyzeChapter(
    chapterId: number,
    focusAreas?: ('pacing' | 'character' | 'plot' | 'theme' | 'structure')[]
  ): Promise<DevelopmentalFeedback> {
    // Load chapter content and context
    const chapter = await this.loadChapterWithContext(chapterId);

    // Launch specialist developmental editor subagent
    const result = await Task({
      description: "Developmental editing analysis",
      prompt: this.buildDevelopmentalPrompt(chapter, focusAreas),
      subagent_type: "developmental-editor"
    });

    // Parse and structure feedback
    const feedback = this.parseDevelopmentalFeedback(result);

    // Store feedback in database
    await this.storeFeedback(chapterId, feedback);

    return feedback;
  }

  /**
   * Analyze character arc across multiple chapters
   */
  async analyzeCharacterArc(
    characterId: number,
    fromChapter: number,
    toChapter: number
  ): Promise<CharacterArcAnalysis> {
    // Load character appearances and dialogue across range
    const appearances = await this.loadCharacterAppearances(
      characterId,
      fromChapter,
      toChapter
    );

    const result = await Task({
      description: "Character arc analysis",
      prompt: this.buildCharacterArcPrompt(appearances),
      subagent_type: "developmental-editor"
    });

    return this.parseCharacterArcAnalysis(result);
  }

  /**
   * Analyze overall manuscript structure
   */
  async analyzeManuscriptStructure(): Promise<StructureAnalysis> {
    // Load all chapters with summaries
    const manuscript = await this.loadManuscriptSummaries();

    const result = await Task({
      description: "Manuscript structure analysis",
      prompt: this.buildStructurePrompt(manuscript),
      subagent_type: "developmental-editor"
    });

    return this.parseStructureAnalysis(result);
  }

  private buildDevelopmentalPrompt(
    chapter: ChapterWithContext,
    focusAreas?: string[]
  ): string {
    return `
You are an expert developmental editor for fiction. Analyze this chapter for story-level issues.

**Chapter Content:**
${chapter.content}

**Story Context:**
- Genre: ${chapter.genre}
- Point in story: Chapter ${chapter.chapterNumber} of ~${chapter.totalChapters}
- Main characters: ${chapter.characters.map(c => c.name).join(', ')}
- Active plot threads: ${chapter.plotThreads.join(', ')}

**Focus Areas:** ${focusAreas?.join(', ') || 'All aspects'}

**Analyze:**
1. **Pacing**: Does the chapter flow well? Where does it drag or rush?
2. **Character Development**: Are character actions/reactions believable? Do they advance character arcs?
3. **Plot Structure**: Does the chapter advance the plot? Any logic holes?
4. **Scene Function**: What is this chapter's purpose? Does it achieve it?
5. **Emotional Resonance**: Do the emotional beats land effectively?
6. **Dialogue**: Does dialogue reveal character and advance plot?

**Guidelines:**
- Be honest but constructive
- Identify specific line/paragraph references when possible
- Explain WHY something isn't working
- Suggest solutions, don't just criticize
- Acknowledge strengths alongside weaknesses
- Remember: The author's vision matters most

**Output Format:**
Return structured feedback in markdown with sections for:
- Pacing Analysis
- Character Development
- Structural Issues (numbered list with page references)
- Strengths (what's working well)
- Recommendations (specific, actionable suggestions)
    `;
  }

  private buildCharacterArcPrompt(
    appearances: CharacterAppearance[]
  ): string {
    return `
You are analyzing a character's arc across multiple chapters.

**Character Appearances:**
${appearances.map(a => `
Chapter ${a.chapterNumber}: ${a.summary}
Key Dialogue: "${a.keyDialogue.join('", "')}"
Actions: ${a.actions.join(', ')}
`).join('\n')}

**Analyze:**
1. **Arc Progression**: Is the character changing/growing believably?
2. **Motivation Consistency**: Do their actions align with established motivations?
3. **Turning Points**: Identify key moments of change
4. **Missing Beats**: What's needed to complete the arc?
5. **Pacing**: Is the arc developing too fast/slow?

**Output:**
- Current arc trajectory
- Identified issues
- Missing beats
- Recommendations
    `;
  }
}

export interface DevelopmentalFeedback {
  chapterId: number;
  timestamp: string;
  pacing: {
    overallScore: number; // 1-10
    issues: PacingIssue[];
    strengths: string[];
  };
  characterDevelopment: {
    characters: CharacterFeedback[];
    overallAssessment: string;
  };
  plotStructure: {
    coherence: number; // 1-10
    issues: PlotIssue[];
    suggestions: string[];
  };
  recommendations: Recommendation[];
}

export interface PacingIssue {
  location: string; // "Pages 87-92" or "Opening scene"
  severity: 'minor' | 'moderate' | 'major';
  description: string;
  suggestion: string;
}

export interface CharacterFeedback {
  characterId: number;
  name: string;
  arcProgression: string;
  believability: number; // 1-10
  issues: string[];
  strengths: string[];
}
```

### Developmental Editor Prompt Template

```
You are a professional developmental editor with 20+ years experience in {genre} fiction.
You're analyzing a {manuscript_type} (novel/novella/short story) in the {phase} phase.

**Your Role:**
- Provide honest, constructive feedback on story-level issues
- Focus on structure, character arcs, pacing, and theme
- Respect the author's voice and creative vision
- Suggest, don't dictate solutions
- Balance criticism with recognition of strengths

**Analysis Framework:**

1. **Story Structure**
   - Three-act structure (or appropriate for genre)
   - Plot points and turning points
   - Cause and effect chains
   - Setup and payoff
   - Rising action and climax effectiveness

2. **Character Arcs**
   - Protagonist goal, motivation, conflict
   - Character growth/change trajectory
   - Supporting character functions
   - Character consistency vs. growth
   - Relationship dynamics

3. **Pacing**
   - Scene-to-sequel rhythm
   - Information distribution
   - Tension escalation
   - Momentum maintenance
   - Chapter breaks and cliffhangers

4. **Thematic Elements**
   - Central theme clarity
   - Theme development through plot/character
   - Symbolic resonance
   - Message subtlety vs. heavy-handedness

5. **World-Building** (if applicable)
   - World rules consistency
   - Information integration (avoid info-dumps)
   - Cultural/social logic
   - Technology/magic systems

**Output Requirements:**
- Specific references (chapter, page, or line)
- Explanation of WHY something isn't working
- Concrete suggestions for improvement
- Recognition of what IS working
- Prioritized list of most important issues

**Tone:**
- Professional but encouraging
- Critical but constructive
- Direct but respectful
- Focus on craft, not taste
```

---

## Copy Editor

**Status**: 🔮 Future Feature (TODO)
**Implementation**: Specialist subagent (copy-editor)
**Priority**: Medium
**Phase**: Revision Phase (Polishing)

### Purpose

Corrects grammar, punctuation, spelling, and style consistency. Catches typos, awkward phrasings, and formatting issues. Does NOT change author voice or creative choices.

### Subagent Specialization

The copy editor should be implemented as a **specialist subagent** with:
- Expert knowledge of English grammar and punctuation rules
- Style guide enforcement capabilities
- Pattern recognition for common errors
- Understanding of fiction-specific formatting
- Strict boundary: technical correctness only (no creative changes)

### User Stories

**As an author, I want to:**
- Catch grammar and punctuation errors
- Maintain consistent style throughout manuscript
- Fix typos and spelling errors
- Ensure proper formatting
- Get suggestions without losing my voice

### Example Interaction

```
Author: Copy edit Chapter 12.

AI (Copy Editor): Copy editing Chapter 12... Found 23 issues.

**Grammar & Punctuation (12 issues):**

1. Line 45: "Sarah and me went to the observatory"
   → Suggested: "Sarah and I went to the observatory"
   (Subject pronoun needed)

2. Line 67: "The data was clear, however she ignored it."
   → Suggested: "The data was clear; however, she ignored it."
   (Semicolon needed before conjunctive adverb)

3. Line 89: "It's wings were damaged"
   → Suggested: "Its wings were damaged"
   (Possessive, not contraction)

**Spelling (3 issues):**

4. Line 102: "recieve"
   → Suggested: "receive"

5. Line 134: "seperate"
   → Suggested: "separate"

**Style Consistency (5 issues):**

6. Line 156: Time format inconsistent
   Current: "8:00 AM" (vs. "0800" used in Chapters 1-11)
   → Suggested: "0800" (maintain established style)

7. Line 178: "Dr Chen" (missing period after Dr)
   → Suggested: "Dr. Chen" (consistent with Ch 1-11)

**Word Choice (3 issues):**

8. Line 201: "She literally exploded with anger"
   → Flag: Misuse of "literally" unless she actually exploded
   Suggested: "She exploded with anger" OR "She nearly exploded with anger"

9. Line 223: "very unique"
   → Suggested: "unique" (unique is absolute, cannot be modified)

**Formatting:**
- Chapter heading format matches style guide: ✓
- Scene breaks properly marked: ✓
- Dialogue formatting consistent: ✓

Apply all corrections? (y/n/selective)
```

### Technical Implementation

```typescript
export class CopyEditor {
  constructor(
    private mcpClient: MCPSQLiteClient,
    private projectId: number
  ) {}

  /**
   * Copy edit a chapter for grammar, spelling, style
   */
  async copyEditChapter(
    chapterId: number,
    options: CopyEditOptions = {}
  ): Promise<CopyEditReport> {
    // Load chapter content
    const chapter = await this.loadChapter(chapterId);

    // Load project style guide
    const styleGuide = await this.loadStyleGuide(this.projectId);

    // Launch specialist copy editor subagent
    const result = await Task({
      description: "Copy editing chapter",
      prompt: this.buildCopyEditPrompt(chapter, styleGuide, options),
      subagent_type: "copy-editor"
    });

    // Parse corrections
    const report = this.parseCopyEditReport(result);

    // Store in database
    await this.storeCopyEditReport(chapterId, report);

    return report;
  }

  /**
   * Apply selected corrections to chapter
   */
  async applyCorrections(
    chapterId: number,
    correctionIds: number[]
  ): Promise<void> {
    const corrections = await this.loadCorrections(correctionIds);
    const chapter = await this.loadChapter(chapterId);

    // Apply corrections in reverse order (to preserve line numbers)
    const sortedCorrections = corrections.sort((a, b) => b.lineNumber - a.lineNumber);

    let updatedContent = chapter.content;
    for (const correction of sortedCorrections) {
      updatedContent = this.applyCorrection(updatedContent, correction);
    }

    // Save updated chapter
    await this.saveChapter(chapterId, updatedContent);
  }

  /**
   * Check consistency across manuscript
   */
  async checkManuscriptConsistency(): Promise<ConsistencyReport> {
    // Load all chapters
    const chapters = await this.loadAllChapters();

    const result = await Task({
      description: "Manuscript consistency check",
      prompt: this.buildConsistencyPrompt(chapters),
      subagent_type: "copy-editor"
    });

    return this.parseConsistencyReport(result);
  }

  private buildCopyEditPrompt(
    chapter: Chapter,
    styleGuide: StyleGuide,
    options: CopyEditOptions
  ): string {
    return `
You are an expert copy editor. Identify and correct grammar, spelling, punctuation,
and style issues WITHOUT changing the author's voice or creative choices.

**Chapter Content:**
${chapter.content}

**Style Guide:**
- Dialogue tags: ${styleGuide.dialogueTagStyle} (e.g., "he said" vs "said he")
- Time format: ${styleGuide.timeFormat} (e.g., "8:00 AM" vs "0800")
- Numbers: ${styleGuide.numberStyle} (spelled out vs numerals)
- Oxford comma: ${styleGuide.oxfordComma ? 'Yes' : 'No'}
- Em dash style: ${styleGuide.emDashStyle} (spaced vs unspaced)

**Check For:**
1. Grammar errors (subject-verb agreement, pronoun case, etc.)
2. Punctuation (commas, semicolons, colons, apostrophes)
3. Spelling and typos
4. Style consistency with above guide
5. Common errors: its/it's, their/there/they're, affect/effect
6. Overused words or phrases
7. Clichés (flag but don't auto-correct)

**DO NOT:**
- Change intentional style choices (e.g., sentence fragments for effect)
- Correct dialect or character-specific speech patterns
- Change vocabulary to "improve" it (respect author voice)
- Fix what isn't broken

**Output Format:**
For each issue, provide:
- Line number
- Category (grammar/spelling/punctuation/style)
- Current text
- Suggested correction
- Explanation
- Severity (error/warning/suggestion)

Group by category for easier review.
    `;
  }
}

export interface CopyEditReport {
  chapterId: number;
  timestamp: string;
  totalIssues: number;
  corrections: CopyEditCorrection[];
  summary: {
    grammar: number;
    spelling: number;
    punctuation: number;
    style: number;
    other: number;
  };
}

export interface CopyEditCorrection {
  id: number;
  lineNumber: number;
  category: 'grammar' | 'spelling' | 'punctuation' | 'style' | 'other';
  severity: 'error' | 'warning' | 'suggestion';
  currentText: string;
  suggestedText: string;
  explanation: string;
  applied: boolean;
}

export interface StyleGuide {
  dialogueTagStyle: 'before' | 'after'; // "he said" vs "said he"
  timeFormat: '12hour' | '24hour' | 'written'; // "8:00 AM" vs "0800" vs "eight o'clock"
  numberStyle: 'words' | 'numerals' | 'mixed'; // "twenty" vs "20"
  oxfordComma: boolean;
  emDashStyle: 'spaced' | 'unspaced'; // " — " vs "—"
  quotationStyle: 'double' | 'single'; // "hello" vs 'hello'
}
```

### Copy Editor Prompt Template

```
You are a professional copy editor with expertise in fiction manuscripts.
Your role is technical correctness, NOT creative improvement.

**Core Responsibilities:**
1. Grammar and syntax
2. Spelling and typos
3. Punctuation
4. Internal consistency
5. Formatting adherence

**Important Boundaries:**
- RESPECT author voice (don't rewrite for "improvement")
- DO NOT change intentional style choices
- DO NOT correct character dialect/speech patterns
- DO NOT suggest vocabulary changes unless there's an error
- Flag potential issues, let author decide

**Grammar Focus:**
- Subject-verb agreement
- Pronoun case (I/me, who/whom)
- Modifier placement
- Parallel structure
- Tense consistency

**Punctuation Focus:**
- Comma usage (including serial comma per style guide)
- Semicolon and colon usage
- Apostrophes (possessive vs. contraction)
- Quotation marks and dialogue punctuation
- Em dashes and ellipses

**Style Consistency:**
- Time format (per style guide)
- Number formatting (per style guide)
- Name consistency (Dr. vs Dr, Mr. vs Mr)
- Capitalization consistency
- Hyphenation consistency

**Common Fiction Errors:**
- its/it's, your/you're, their/there/they're
- affect/effect, then/than
- lie/lay, sit/set
- who/whom, that/which
- less/fewer

**Output Format:**
```
## Grammar & Punctuation (count)
1. Line X: [current] → [suggested] (explanation)
2. Line Y: [current] → [suggested] (explanation)

## Spelling (count)
...

## Style Consistency (count)
...

## Flagged for Review (optional)
- Items that might be intentional but seem unusual
```
```

---

## Line Editor

**Status**: 🔮 Future Feature (TODO)
**Implementation**: Specialist subagent (line-editor)
**Priority**: Medium
**Phase**: Revision Phase (Polishing)

### Purpose

Improves prose quality at the sentence level: clarity, rhythm, word choice, imagery, and flow. Focuses on elevating the writing craft while preserving the author's voice.

### Subagent Specialization

The line editor should be implemented as a **specialist subagent** with:
- Deep understanding of prose craft and style
- Expertise in sentence rhythm and flow
- Strong vocabulary and word choice analysis
- Show vs. tell recognition
- Dialogue naturalness evaluation
- Author voice preservation as highest priority

### User Stories

**As an author, I want to:**
- Improve sentence-level prose quality
- Identify weak or clichéd descriptions
- Enhance rhythm and flow
- Strengthen imagery and sensory details
- Tighten verbose passages
- Maintain my unique voice

### Example Interaction

```
Author: Line edit the opening paragraph of Chapter 1.

AI (Line Editor): Analyzing opening paragraph for prose quality...

**Current Text:**
"Sarah walked into the control room. It was dark and she could see the
monitors glowing. She went over to her desk and sat down in her chair.
She was tired from the long drive up the mountain road to get to the
observatory."

**Analysis:**
- Sentence structure: Repetitive (simple sentence pattern repeated 4 times)
- Verb strength: Weak verbs ("walked," "was," "went," "sat")
- Show vs. Tell: Telling emotions ("was tired") rather than showing
- Sensory details: Limited (only visual)
- Rhythm: Choppy, no variation
- Word economy: Verbose ("sat down in her chair" redundant)

**Suggested Revision:**
"Sarah stepped into the control room's darkness, monitors casting blue
light across her path. She slumped at her desk, muscles aching from the
three-hour climb up the mountain switchbacks."

**Changes Made:**
1. Combined sentences for better flow
2. Stronger verbs ("stepped," "slumped" vs "walked," "sat")
3. Sensory details added (blue light, specific visual)
4. Showed fatigue ("slumped," "muscles aching") vs told ("was tired")
5. Specific detail ("three-hour climb" vs "long drive")
6. Removed redundancies ("in her chair")

**Additional Options:**

Option A (More atmospheric):
"The control room waited in darkness, save for the blue pulse of monitors.
Sarah collapsed at her desk, the three-hour mountain drive still vibrating
through her bones."

Option B (More direct):
"Sarah entered the dark control room and dropped into her desk chair,
exhausted from the mountain drive. Monitor light washed over her in blue waves."

Which revision direction feels right for your opening?
```

### Technical Implementation

```typescript
export class LineEditor {
  constructor(
    private mcpClient: MCPSQLiteClient,
    private projectId: number
  ) {}

  /**
   * Line edit a passage for prose quality
   */
  async lineEditPassage(
    chapterId: number,
    startLine: number,
    endLine: number,
    options: LineEditOptions = {}
  ): Promise<LineEditSuggestions> {
    // Load passage
    const passage = await this.loadPassage(chapterId, startLine, endLine);

    // Load author voice samples (for consistency)
    const voiceSamples = await this.loadAuthorVoiceSamples(this.projectId);

    // Launch specialist line editor subagent
    const result = await Task({
      description: "Line editing passage",
      prompt: this.buildLineEditPrompt(passage, voiceSamples, options),
      subagent_type: "line-editor"
    });

    // Parse suggestions
    const suggestions = this.parseLineEditSuggestions(result);

    return suggestions;
  }

  /**
   * Analyze dialogue for naturalness
   */
  async analyzeDialogue(
    chapterId: number,
    characterId?: number
  ): Promise<DialogueAnalysis> {
    // Load dialogue from chapter (or specific character)
    const dialogue = await this.loadDialogue(chapterId, characterId);

    const result = await Task({
      description: "Dialogue analysis",
      prompt: this.buildDialoguePrompt(dialogue),
      subagent_type: "line-editor"
    });

    return this.parseDialogueAnalysis(result);
  }

  /**
   * Check for prose issues across chapter
   */
  async checkProseQuality(chapterId: number): Promise<ProseQualityReport> {
    const chapter = await this.loadChapter(chapterId);

    const result = await Task({
      description: "Prose quality check",
      prompt: this.buildProseCheckPrompt(chapter),
      subagent_type: "line-editor"
    });

    return this.parseProseQualityReport(result);
  }

  private buildLineEditPrompt(
    passage: string,
    voiceSamples: string[],
    options: LineEditOptions
  ): string {
    return `
You are an expert line editor specializing in fiction. Improve this passage's
prose quality while maintaining the author's voice.

**Passage to Edit:**
${passage}

**Author Voice Reference:**
Here are samples of this author's writing style:
${voiceSamples.join('\n\n')}

**Focus Areas:** ${options.focusAreas?.join(', ') || 'All aspects'}

**Evaluate:**
1. **Sentence Structure**
   - Variety (simple, compound, complex)
   - Rhythm and flow
   - Length variation
   - Natural breaks and pauses

2. **Word Choice**
   - Verb strength (active vs. passive, specific vs. generic)
   - Adjective/adverb necessity
   - Clichés or overused phrases
   - Precision and clarity

3. **Show vs. Tell**
   - Emotional showing (not telling)
   - Sensory details
   - Concrete vs. abstract

4. **Imagery & Description**
   - Sensory engagement (sight, sound, smell, touch, taste)
   - Metaphor and simile effectiveness
   - Originality

5. **Economy**
   - Wordiness and redundancy
   - Every word earning its place
   - Clarity vs. verbosity

**Provide:**
1. Analysis of current prose
2. Primary suggested revision
3. 2-3 alternative revisions (different stylistic directions)
4. Explanation of changes
5. Specific technique notes

**Critical Rules:**
- MAINTAIN author's voice (use voice samples as reference)
- Suggest improvements, don't impose a "better" style
- Keep the same meaning and emotional tone
- Respect the author's genre conventions
- If it works well already, say so
    `;
  }

  private buildDialoguePrompt(dialogue: DialogueExcerpt[]): string {
    return `
You are analyzing dialogue for naturalness and character voice.

**Dialogue Excerpts:**
${dialogue.map(d => `
${d.characterName}: "${d.text}"
Context: ${d.context}
`).join('\n')}

**Evaluate:**
1. **Naturalness**: Does it sound like real speech?
2. **Character Voice**: Is it distinct and consistent?
3. **Subtext**: Is there layered meaning?
4. **Pacing**: Does it move naturally?
5. **Tags & Beats**: Are they overused or effective?

**Common Dialogue Issues to Check:**
- Overly formal/stilted speech
- Too much exposition ("As you know, Bob...")
- Lack of contractions (unless intentional)
- Too perfect/polished (real speech is messier)
- Indistinguishable voices between characters
- Excessive dialogue tags

**Provide:**
- Overall assessment
- Specific lines that need work
- Suggested revisions
- Technique notes
    `;
  }
}

export interface LineEditSuggestions {
  passage: {
    original: string;
    startLine: number;
    endLine: number;
  };
  analysis: {
    sentenceStructure: string;
    wordChoice: string;
    showVsTell: string;
    imagery: string;
    economy: string;
  };
  primaryRevision: {
    text: string;
    explanation: string;
  };
  alternativeRevisions: Array<{
    text: string;
    direction: string; // e.g., "More atmospheric", "More direct"
    explanation: string;
  }>;
  specificNotes: string[];
}

export interface DialogueAnalysis {
  overallScore: number; // 1-10
  naturalness: {
    score: number;
    issues: string[];
  };
  characterVoice: {
    score: number;
    distinctiveness: string;
    consistency: string;
  };
  suggestions: Array<{
    lineNumber: number;
    originalText: string;
    issue: string;
    suggestedRevision: string;
    explanation: string;
  }>;
}

export interface ProseQualityReport {
  chapterId: number;
  overallScore: number; // 1-10
  sentenceVariety: {
    score: number;
    analysis: string;
  };
  verbStrength: {
    score: number;
    weakVerbs: Array<{ line: number; verb: string }>;
  };
  showVsTell: {
    score: number;
    tellingInstances: Array<{ line: number; text: string; suggestion: string }>;
  };
  cliches: Array<{ line: number; cliche: string; suggestion: string }>;
  wordiness: Array<{ line: number; text: string; tighterVersion: string }>;
}

export interface LineEditOptions {
  focusAreas?: ('structure' | 'word-choice' | 'show-vs-tell' | 'imagery' | 'economy')[];
  preserveVoice?: boolean; // default true
  provideAlternatives?: boolean; // default true
}
```

### Line Editor Prompt Template

```
You are a master line editor and prose stylist with deep knowledge of fiction craft.
Your goal is to elevate prose quality while honoring the author's unique voice.

**Core Principles:**
1. Clarity first: Reader must understand
2. Economy: Every word must earn its place
3. Rhythm: Varied sentence structure and length
4. Imagery: Engage senses, create vivid pictures
5. Voice: Maintain author's distinctive style

**Line Editing Focus:**

1. **Sentence-Level Craft**
   - Structure variety (simple, compound, complex)
   - Rhythm and musicality
   - Strategic fragments and long sentences
   - Parallel structure when appropriate
   - Emphasis through placement

2. **Verb Power**
   - Favor strong, specific verbs
   - Minimize weak verbs (is, was, has, etc.)
   - Reduce passive voice (unless intentional)
   - Active construction preference
   - Example: "walked tiredly" → "trudged"

3. **Show, Don't Tell**
   - Transform telling into showing
   - Use sensory details
   - Body language over emotion labels
   - Example: "She was angry" → "She slammed the door"

4. **Word Economy**
   - Cut redundancy ("sat down" → "sat")
   - Eliminate filler words (very, really, just, that)
   - Tighten phrases ("due to the fact that" → "because")
   - Trust the reader (don't over-explain)

5. **Imagery & Description**
   - Specific over general ("oak" vs "tree")
   - Sensory engagement (all five senses)
   - Fresh metaphors (avoid clichés)
   - Strategic detail (not exhaustive)

6. **Dialogue Craft**
   - Natural speech patterns
   - Character-specific voice
   - Subtext and implication
   - Strategic dialogue tags
   - Beats over tags when possible

**Analysis Process:**
1. Read the passage multiple times
2. Identify strengths (what's working)
3. Identify weaknesses (what needs work)
4. Consider author's voice from samples
5. Provide primary revision
6. Offer 2-3 alternative approaches
7. Explain reasoning

**Output Format:**
```
## Analysis
- Sentence Structure: [assessment]
- Word Choice: [assessment]
- Show vs. Tell: [assessment]
- Imagery: [assessment]
- Economy: [assessment]

## Primary Revision
[revised text]

**Changes:**
- [explanation of changes]

## Alternative Revisions

**Option A (direction):**
[alternative text]

**Option B (direction):**
[alternative text]

## Technique Notes
- [specific craft techniques used]
```

**Remember:**
- The author's voice is sacred - enhance, don't replace
- Different is not automatically better
- Respect genre conventions
- If it works well, acknowledge and move on
```

---

## Testing Strategy

### Unit Tests
- YAML generation validity
- Template adherence
- Field validation
- Filename sanitization
- Editor feedback parsing
- Correction application logic

### Integration Tests
- End-to-end generation flow
- Database sync after generation
- File system operations
- Error handling

### Quality Tests
- Character coherence (personality matches role)
- Location atmosphere consistency
- Genre appropriateness
- Name uniqueness

## Documentation for Authors

### Quick Start
```bash
# AI-generated character
$ novel create character "a brilliant but reckless pilot"

# With genre context
$ novel create character "a wizard scholar" --genre fantasy

# Location with parent
$ novel create location "the throne room" --parent "Royal Palace"

# Interactive refinement
$ novel create character --interactive
```

### Best Practices

**For Better Results:**
1. Be specific about key traits
2. Mention genre/setting when relevant
3. Include role in story
4. Describe relationships to existing characters
5. Specify any non-negotiable details

**What to Review:**
1. Character flaws (AI should include them)
2. Voice patterns (should fit character)
3. Background consistency
4. Age appropriateness
5. Name uniqueness in your story

## Editor Usage Examples for Authors

### Developmental Editing Workflow

```bash
# Analyze a specific chapter
$ novel edit dev --chapter 5 --focus pacing,character

# Analyze character arc across chapters
$ novel edit dev --character "Sarah Chen" --chapters 1-10

# Full manuscript structure analysis
$ novel edit dev --manuscript

# Review previous feedback
$ novel edit dev --show-feedback --chapter 5
```

### Copy Editing Workflow

```bash
# Copy edit a chapter
$ novel edit copy --chapter 12

# Apply all corrections
$ novel edit copy --chapter 12 --apply-all

# Apply selective corrections
$ novel edit copy --chapter 12 --selective

# Check consistency across manuscript
$ novel edit copy --check-consistency

# View style guide
$ novel edit copy --show-style-guide

# Update style guide
$ novel edit copy --set-style oxford-comma=yes time-format=24hour
```

### Line Editing Workflow

```bash
# Line edit a specific passage
$ novel edit line --chapter 1 --lines 1-10

# Analyze dialogue in a chapter
$ novel edit line --dialogue --chapter 3

# Analyze dialogue for specific character
$ novel edit line --dialogue --character "Sarah Chen"

# Check prose quality for chapter
$ novel edit line --prose-check --chapter 5

# Compare multiple revision options
$ novel edit line --chapter 1 --lines 1-10 --alternatives
```

### Combined Revision Workflow

Example of a typical revision pass:

```bash
# Stage 1: Developmental editing (big picture)
$ novel edit dev --manuscript
# Review feedback, make structural changes

# Stage 2: Chapter-by-chapter refinement
for chapter in {1..15}; do
  $ novel edit dev --chapter $chapter --focus pacing,character
  # Make changes based on feedback
done

# Stage 3: Line editing (prose quality)
for chapter in {1..15}; do
  $ novel edit line --prose-check --chapter $chapter
  # Improve weak passages
done

# Stage 4: Copy editing (technical correctness)
$ novel edit copy --check-consistency
for chapter in {1..15}; do
  $ novel edit copy --chapter $chapter --apply-all
done

# Stage 5: Final dialogue pass
for chapter in {1..15}; do
  $ novel edit line --dialogue --chapter $chapter
  # Refine any weak dialogue
done
```

### Programmatic API Usage

```typescript
import { NovelWriterExtension } from 'claude-novel-writer';

const ext = new NovelWriterExtension('./my-novel');

// Developmental editing
const devEditor = ext.getDevelopmentalEditor();
const feedback = await devEditor.analyzeChapter(5, ['pacing', 'character']);
console.log(feedback.recommendations);

// Character arc analysis
const arcAnalysis = await devEditor.analyzeCharacterArc(
  characterId: 1,
  fromChapter: 1,
  toChapter: 10
);

// Copy editing
const copyEditor = ext.getCopyEditor();
const report = await copyEditor.copyEditChapter(12);
console.log(`Found ${report.totalIssues} issues`);

// Apply selected corrections
await copyEditor.applyCorrections(12, [1, 3, 5, 7]); // correction IDs

// Line editing
const lineEditor = ext.getLineEditor();
const suggestions = await lineEditor.lineEditPassage(
  chapterId: 1,
  startLine: 1,
  endLine: 10
);
console.log(suggestions.primaryRevision.text);
console.log(suggestions.alternativeRevisions);

// Dialogue analysis
const dialogueAnalysis = await lineEditor.analyzeDialogue(
  chapterId: 3,
  characterId: 1
);
```

## Success Metrics

### Content Generation
- **Generation Quality**: 80%+ of profiles require minimal editing
- **Sync Success**: 100% of generated files sync to database
- **Author Satisfaction**: Saves 10+ minutes per character
- **Iteration Count**: Most characters finalized in 1-2 refinement cycles

### Editing Features
- **Developmental Feedback Accuracy**: 85%+ of suggestions are actionable
- **Copy Edit Precision**: 95%+ true positives (minimal false corrections)
- **Line Edit Value**: 70%+ of suggestions improve prose quality
- **Voice Preservation**: 90%+ of authors feel their voice is maintained
- **Time Savings**:
  - Developmental editing: Save 20+ hours vs. traditional beta readers
  - Copy editing: Save 10+ hours vs. manual proofreading
  - Line editing: Save 5+ hours per chapter vs. self-editing

---

**Next Steps:**

### Content Generation (Phase 1-4)
1. Implement basic single-pass generation
2. Add validation layer
3. Create refinement loop
4. Gather author feedback
5. Iterate on prompts

### Editing Features (Phase 5)
1. **Developmental Editor** (Priority: High)
   - Implement chapter analysis
   - Implement character arc tracking
   - Implement manuscript structure analysis
   - Create feedback storage system
   - Build iterative refinement UI

2. **Copy Editor** (Priority: Medium)
   - Implement grammar/punctuation checking
   - Implement style guide system
   - Build correction tracking database
   - Create apply/reject UI
   - Implement manuscript-wide consistency checks

3. **Line Editor** (Priority: Medium)
   - Implement passage-level analysis
   - Implement dialogue analysis
   - Build author voice sampling system
   - Create alternative revision generation
   - Implement prose quality reporting

### Integration
- Add editor methods to NovelWriterExtension
- Create unified `/edit` command with subcommands
- Integrate with existing consistency checker
- Build revision history tracking
- Create editor feedback dashboard

**Related Files:**

### Content Generation
- `src/builders/ai-character-builder.ts` (to be created)
- `src/builders/ai-location-builder.ts` (to be created)
- `prompts/character-generation.md` (prompt templates)
- `prompts/location-generation.md` (prompt templates)

### Editing Features
- `src/editors/developmental-editor.ts` (to be created)
- `src/editors/copy-editor.ts` (to be created)
- `src/editors/line-editor.ts` (to be created)
- `src/editors/style-guide.ts` (to be created)
- `src/editors/subagent-config.ts` (subagent registration)
- `prompts/developmental-editing.md` (prompt templates)
- `prompts/copy-editing.md` (prompt templates)
- `prompts/line-editing.md` (prompt templates)

### Database Extensions
- Add `editor_feedback` table for storing developmental feedback
- Add `copy_edit_corrections` table for tracking corrections
- Add `line_edit_suggestions` table for prose improvements
- Add `project_style_guide` table for style preferences
