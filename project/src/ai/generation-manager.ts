/**
 * AI Generation Manager
 * Coordinates AI-assisted content generation with proper context
 *
 * Philosophy: Suggest, don't dictate. Support the author's voice.
 */

import type { MCPClient } from '../core/database.js';
import { SceneContextAssembler, type ContextOptions } from '../context/scene-context.js';
import type { SceneContext, SynopsisContext, SynopsisLength, OverviewLength } from '../types/novel.js';
import { ClaudeClient, PassthroughClaudeClient, type IClaudeClient } from './claude-client.js';

export interface CharacterProfileRow {
  name: string;
  role?: string;
  summary?: string;
  [key: string]: unknown;
}

export interface WorldRuleRow {
  rule_name: string;
  description?: string;
  [key: string]: unknown;
}

export interface GenerationContext {
  projectId: number;
  genre?: string;
  tone?: string;
  currentChapter?: number;
  currentScene?: number;
  recentText?: string;
  characterProfiles?: CharacterProfileRow[];
  locationDetails?: Record<string, unknown>[];
  worldRules?: WorldRuleRow[];
  plotThreads?: Record<string, unknown>[];
}

export interface GenerationOptions {
  temperature?: number;  // 0.0-1.0, higher = more creative
  maxLength?: number;    // Max words/tokens
  style?: 'descriptive' | 'action' | 'dialogue' | 'introspective';
  pov?: string;          // Character name
  includeContext?: boolean;
  count?: number;        // Number of alternatives to generate (default 1, max 3)
}

export interface GenerationResult {
  content: string;
  alternatives: string[];  // Other variations (empty array when count=1)
  reasoning?: string;       // Why this suggestion
  warnings?: string[];      // Potential consistency issues
}

/**
 * Manages AI-assisted generation
 */
export class GenerationManager {
  private claude: IClaudeClient;
  private contextAssembler: SceneContextAssembler;

  constructor(
    private mcpClient: MCPClient,
    private projectId: number
  ) {
    this.claude = ClaudeClient.isConfigured()
      ? new ClaudeClient()
      : new PassthroughClaudeClient();
    this.contextAssembler = new SceneContextAssembler(mcpClient, projectId);
  }

  /**
   * Summarize a chapter in up to 5 sentences for story-context memory.
   *
   * Routes through `IClaudeClient`, so it works two ways automatically:
   *  - With ANTHROPIC_API_KEY → the API returns the summary text.
   *  - Without a key → PassthroughClaudeClient returns the assembled PROMPT and
   *    `passthrough: true`; the Claude Code session that ran the command does the
   *    summarizing. Either way the caller persists the result to the chapter's
   *    `summary:` frontmatter.
   *
   * @param chapterText - chapter prose (frontmatter/markup already stripped)
   * @param title       - optional chapter title, for prompt context
   */
  async generateChapterSummary(
    chapterText: string,
    title?: string
  ): Promise<{ content: string; passthrough: boolean }> {
    const heading = title ? `Chapter: "${title}"` : 'Chapter';
    const prompt = [
      'Summarize the following chapter in NO MORE THAN 5 sentences, for use as',
      'story-context memory. Capture the key events and what changes by the',
      "chapter's end — not just the opening atmosphere. Write plain prose.",
      'Output ONLY the summary: no preamble, labels, headings, or quotation marks.',
      '',
      heading,
      '---',
      chapterText.trim(),
    ].join('\n');

    const response = await this.claude.generateStructured(prompt, {
      temperature: 0.3,
      maxTokens: 400,
    });
    return { content: response.content, passthrough: Boolean(response.passthrough) };
  }

  /**
   * Summarize the book the author INTENDS to write, from their planning data:
   * the outline (plot threads + their beats), the character roster, and any hard
   * world rules. Unlike `generateSynopsis` — which reads drafted chapter
   * summaries — this works pre-draft and describes the *planned* book.
   *
   * Routes through `IClaudeClient`: with ANTHROPIC_API_KEY the API returns the
   * prose; without a key the PassthroughClaudeClient returns the assembled
   * PROMPT and the Claude Code session writes the summary. Returns a `warnings`
   * entry (and empty content) when there is no outline or cast to summarize.
   *
   * @param projectId - Project identifier (string form accepted by callers)
   * @param length    - 'brief' (~150w), 'standard' (~350w), or 'full' (~700w)
   */
  async generateOverview(
    projectId: string,
    length: OverviewLength = 'standard'
  ): Promise<GenerationResult> {
    const id = Number(projectId) || this.projectId;

    // Project header.
    const projectRows = await this.mcpClient.readQuery<{
      title?: string;
      genre?: string;
      target_word_count?: number;
      current_phase?: string;
    }>(
      'SELECT title, genre, target_word_count, current_phase FROM projects WHERE id = ?',
      [id]
    );
    const project = projectRows[0] ?? {};

    // Full cast, ordered by narrative importance then name.
    const characters = await this.mcpClient.readQuery<{
      name: string;
      role?: string;
      summary?: string;
      voice_notes?: string;
    }>(
      `SELECT name, role, summary, voice_notes FROM characters WHERE project_id = ?
       ORDER BY CASE role
         WHEN 'protagonist' THEN 0 WHEN 'antagonist' THEN 1
         WHEN 'major' THEN 2 WHEN 'minor' THEN 3 ELSE 4 END, name`,
      [id]
    );

    // The outline: plot threads (highest priority first) with their beats.
    const threadRows = await this.mcpClient.readQuery<{
      id: number;
      thread_name: string;
      thread_type?: string;
      description?: string;
      status?: string;
      priority?: number;
    }>(
      `SELECT id, thread_name, thread_type, description, status, priority
       FROM plot_threads WHERE project_id = ?
       ORDER BY COALESCE(priority, 0) DESC, id`,
      [id]
    );

    const threads: Array<{
      thread_name: string;
      thread_type?: string;
      description?: string;
      status?: string;
      beats: { beat_type?: string; description?: string }[];
    }> = [];
    for (const t of threadRows) {
      const beats = await this.mcpClient.readQuery<{
        beat_type?: string;
        description?: string;
      }>(
        `SELECT beat_type, description FROM plot_beats
         WHERE plot_thread_id = ? ORDER BY beat_order`,
        [t.id]
      );
      threads.push({
        thread_name: t.thread_name,
        thread_type: t.thread_type,
        description: t.description,
        status: t.status,
        beats,
      });
    }

    // Hard world rules (up to 8).
    const worldRules = await this.mcpClient.readQuery<{
      rule_name: string;
      description?: string;
    }>(
      'SELECT rule_name, description FROM world_rules WHERE project_id = ? AND is_hard_rule = 1 LIMIT 8',
      [id]
    );

    // Nothing planned yet → tell the caller how to bootstrap.
    if (characters.length === 0 && threads.length === 0) {
      return {
        content: '',
        alternatives: [],
        warnings: [
          'No characters or plot threads found. Populate characters/ and plots/ ' +
            '(then run `novel sync`) before generating an overview. To bootstrap ' +
            'from a prose outline, try `novel extract --file outline.md`.',
        ],
        reasoning: 'Overview needs at least one character or plot thread.',
      };
    }

    // ── Assemble readable planning blocks for the prompt. ──
    const castBlock = characters.length
      ? characters
          .map((c) => {
            const role = c.role ? ` [${c.role}]` : '';
            const essence = c.summary ? ` — ${c.summary}` : '';
            const voice = c.voice_notes ? ` (voice: ${c.voice_notes})` : '';
            return `  • ${c.name}${role}${essence}${voice}`;
          })
          .join('\n')
      : '  (No characters defined yet)';

    const outlineBlock = threads.length
      ? threads
          .map((t) => {
            const meta = [t.thread_type, t.status].filter(Boolean).join(', ');
            const head = `  ▸ ${t.thread_name}${meta ? ` (${meta})` : ''}`;
            const desc = t.description ? `\n      ${t.description}` : '';
            const beats = t.beats.length
              ? '\n' +
                t.beats
                  .map(
                    (b) =>
                      `      - ${b.beat_type ? `[${b.beat_type}] ` : ''}${b.description ?? ''}`.trimEnd()
                  )
                  .join('\n')
              : '';
            return `${head}${desc}${beats}`;
          })
          .join('\n')
      : '  (No plot threads defined yet)';

    const rulesBlock = worldRules.length
      ? worldRules
          .map((r) => `  • ${r.rule_name}${r.description ? `: ${r.description}` : ''}`)
          .join('\n')
      : '';

    const lengthGuide: Record<OverviewLength, string> = {
      brief:
        '~150 words — a single tight paragraph: premise, protagonist, central conflict, and stakes.',
      standard:
        '~350 words — premise, the main characters and what drives them, the through-line of the plot, and where it is heading.',
      full:
        "~700 words — a planning treatment: premise, the full cast and their roles, each major thread and how they interweave, the world's hard rules, and the intended arc.",
    };

    const target = project.target_word_count
      ? `${project.target_word_count.toLocaleString()} words`
      : 'length TBD';

    const prompt = [
      'You are helping a novelist articulate the book they INTEND to write, from their planning notes.',
      "This is a planning summary for the author's own use — NOT a marketing blurb or submission synopsis.",
      'Describe the intended book in clear prose. Where the notes are sparse, summarize only what is given;',
      'do NOT invent plot the author has not planned. Output ONLY the summary prose: no headings or preamble.',
      '',
      `TITLE: ${project.title ?? 'Untitled'}`,
      `GENRE: ${project.genre ?? 'Fiction'}`,
      `TARGET: ${target}${project.current_phase ? ` · phase: ${project.current_phase}` : ''}`,
      '',
      'CAST:',
      castBlock,
      '',
      'OUTLINE (plot threads and beats):',
      outlineBlock,
      ...(rulesBlock ? ['', 'HARD WORLD RULES:', rulesBlock] : []),
      '',
      `TASK: Write a summary of the intended book — ${lengthGuide[length]}`,
    ].join('\n');

    const response = await this.claude.generateStructured(prompt, {
      temperature: 0.5,
      maxTokens: length === 'full' ? 1300 : length === 'standard' ? 700 : 350,
    });

    return {
      content: response.content,
      alternatives: [],
      reasoning:
        `Overview assembled from ${characters.length} character(s) and ${threads.length} plot thread(s)` +
        (response.passthrough ? ' — written below by this session (no API key set).' : '.'),
    };
  }

  /**
   * Generate character profile from description.
   * When options.count > 1, instructs Claude to return that many distinct profile options,
   * numbered, and parses them into alternatives[].
   *
   * Based on NOVEL_CRAFT_PRINCIPLES: believable characters with flaws.
   */
  async generateCharacter(
    description: string,
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    const count = Math.min(Math.max(options.count ?? 1, 1), 3);
    const context = await this.assembleProjectContext();

    let prompt = this.buildCharacterPrompt(description, context, options);
    if (count > 1) {
      prompt += `\n\nProvide ${count} DISTINCT character profile options, each numbered (1., 2., etc.).`;
    }

    const response = await this.claude.generateStructured(prompt, {
      temperature: options.temperature ?? 0.5,
      maxTokens: 2048,
    });

    const alternatives: string[] = [];
    if (count > 1) {
      // Split numbered blocks: "1. ...", "2. ...", etc.
      const blocks = response.content.split(/\n(?=\d+\.)/).map(s => s.trim()).filter(Boolean);
      // First block is content; rest are alternatives
      const [, ...rest] = blocks;
      alternatives.push(...rest);
    }

    return {
      content: response.content,
      alternatives,
      reasoning: 'Generated based on character development principles from master novelists',
    };
  }

  /**
   * Generate location/world-building details
   */
  async generateLocation(
    description: string,
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    const context = await this.assembleProjectContext();

    const prompt = this.buildLocationPrompt(description, context, options);

    const response = await this.claude.generateStructured(prompt, {
      temperature: options.temperature ?? 0.5,
      maxTokens: 1536,
    });

    return {
      content: response.content,
      alternatives: [],
      reasoning: 'Created consistent with existing world rules',
    };
  }

  /**
   * Suggest scene continuation.
   * Defaults to 3 alternatives. Respects options.count (max 3).
   * Based on principle: "Follow the headlights" - discovery writing.
   */
  async suggestSceneContinuation(
    currentText: string,
    sceneId: number,
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    const count = Math.min(Math.max(options.count ?? 3, 1), 3);
    const context = await this.assembleSceneContext(sceneId);

    const prompt = await this.buildContinuationPrompt(currentText, context, options);

    const clauOptions = { temperature: options.temperature ?? 0.9, maxTokens: 512 };
    const responses = await Promise.all(
      Array.from({ length: count }, () => this.claude.generateCreative(prompt, clauOptions))
    );

    return {
      content: responses[0].content,
      alternatives: responses.slice(1).map(r => r.content),
      reasoning: 'Suggestions maintain POV, tone, and character voice',
      warnings: [],
    };
  }

  /**
   * Enhance dialogue for character voice.
   * When options.count > 1, requests that many dialogue variations.
   * Based on principle: Give each character a voice.
   */
  async enhanceDialogue(
    dialogue: string,
    characterName: string,
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    const count = Math.min(Math.max(options.count ?? 1, 1), 3);
    // Load character profile for voice patterns
    const character = await this.getCharacterProfile(characterName);

    const prompt = await this.buildDialoguePrompt(dialogue, character, { ...options, count });

    const clauOptions = { temperature: options.temperature ?? 0.7, maxTokens: 512 };
    const responses = await Promise.all(
      Array.from({ length: count }, () => this.claude.generateCreative(prompt, clauOptions))
    );

    return {
      content: responses[0].content,
      alternatives: responses.slice(1).map(r => r.content),
      reasoning: `Enhanced to match ${characterName}'s established voice patterns`,
    };
  }

  /**
   * Expand description with sensory details.
   * When options.count > 1, requests distinct sensory approaches
   * (e.g. visual-first, sound-first, emotional-first).
   */
  async expandDescription(
    text: string,
    pov?: string,
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    const count = Math.min(Math.max(options.count ?? 1, 1), 3);
    const effectivePov = pov ?? options.pov;
    const prompt = await this.buildDescriptionPrompt(text, effectivePov, { ...options, count });

    const clauOptions = { temperature: options.temperature ?? 0.8, maxTokens: 768 };
    const responses = await Promise.all(
      Array.from({ length: count }, () => this.claude.generateCreative(prompt, clauOptions))
    );

    return {
      content: responses[0].content,
      alternatives: responses.slice(1).map(r => r.content),
      reasoning: 'Added sensory details filtered through POV character perspective',
    };
  }

  /**
   * Suggest plot development.
   * Defaults to 3 alternatives. Respects options.count (max 3).
   */
  async suggestPlotDevelopment(
    threadName: string,
    currentStatus: string,
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    const count = Math.min(Math.max(options.count ?? 3, 1), 3);
    const plotThread = await this.getPlotThread(threadName);
    const context = await this.assembleProjectContext();

    const prompt = this.buildPlotPrompt(plotThread, context, options);

    const clauOptions = { temperature: options.temperature ?? 0.85, maxTokens: 512 };
    const responses = await Promise.all(
      Array.from({ length: count }, () => this.claude.generateCreative(prompt, clauOptions))
    );

    return {
      content: responses[0].content,
      alternatives: responses.slice(1).map(r => r.content),
      reasoning: 'Suggestions based on story structure principles',
    };
  }

  // ============================================================
  // PROMPT BUILDERS
  // These will be used to construct prompts for Claude
  // ============================================================

  private buildCharacterPrompt(
    description: string,
    context: GenerationContext,
    options: GenerationOptions
  ): string {
    return `
You are assisting a novelist with character development.

GENRE: ${context.genre || 'General Fiction'}
EXISTING CHARACTERS: ${context.characterProfiles?.map(c => c.name).join(', ') || 'None yet'}

TASK: Create a detailed character profile based on this description:
"${description}"

PRINCIPLES TO FOLLOW:
1. Create believable characters with credible motivations AND flaws (Steinbeck)
2. Give characters backstories and identifying attributes
3. Each character needs a distinct voice
4. Avoid cardboard cutouts - make them complex
5. Flaws alongside strengths

OUTPUT FORMAT (YAML):
\`\`\`yaml
name: [Full name]
role: [protagonist/antagonist/major/minor]
summary: [One sentence essence]
physical:
  age: [Age or range]
  appearance: [2-3 distinctive traits]
  mannerisms: [Observable behaviors]
personality:
  traits: [3-5 core traits]
  flaw: [Major flaw that creates conflict]
  strength: [Balancing strength]
  fear: [Deep fear]
  desire: [What they want]
background:
  upbringing: [Brief background]
  pivotal_event: [Shaped who they are]
  current_situation: [Where they start the story]
voice:
  patterns: [How they speak]
  quirks: [Speech patterns]
  vocabulary: [Word choices]
arc:
  starting_state: [Beginning]
  ending_state: [Growth target]
  midpoint_crisis: [Challenge that forces change]
\`\`\`

Make the character complex, flawed, and interesting. Suggest, don't dictate.
`.trim();
  }

  private buildLocationPrompt(
    description: string,
    context: GenerationContext,
    options: GenerationOptions
  ): string {
    const worldRules = context.worldRules?.map(r => `- ${r.rule_name}: ${r.description}`).join('\n') || 'None';

    return `
You are assisting a novelist with world-building.

GENRE: ${context.genre || 'General Fiction'}
ESTABLISHED WORLD RULES:
${worldRules}

TASK: Create a detailed location description:
"${description}"

PRINCIPLES:
1. Use all five senses
2. Filter through character POV (what would THEY notice?)
3. Maintain consistency with established world rules
4. Create atmosphere and mood
5. Include unique, memorable details

OUTPUT FORMAT (YAML):
\`\`\`yaml
name: [Location name]
type: [Type: city, building, wilderness, etc.]
description: [2-3 sentences]
details:
  sight: [Visual details]
  sound: [Auditory details]
  smell: [Scents]
  texture: [Tactile elements]
  atmosphere: [Overall mood]
rules:
  - [Any location-specific rules]
first_appearance: [Suggested chapter/scene]
notes: [Additional details]
\`\`\`

Make it vivid and specific. Focus on details that matter to the story.
`.trim();
  }

  private async buildContinuationPrompt(
    currentText: string,
    context: SceneContext,
    options: GenerationOptions
  ): Promise<string> {
    const povCharacter = context.scene?.povCharacterId
      ? context.characters.find(c => c.id === context.scene.povCharacterId)
      : null;
    const povChar = options.pov || povCharacter?.name || context.characters[0]?.name || 'Unknown';

    const characterSummaries = context.characters
      .map(c => `- ${c.name} (${c.role}): ${c.summary || ''}`)
      .join('\n') || 'None';

    const activeThreads = context.plotThreads
      .filter(t => t.status === 'active')
      .map(t => `- ${t.threadName}: ${t.description || ''}`)
      .join('\n') || 'None';

    const worldRulesSummary = context.worldRules
      .map(r => `- ${r.ruleName}: ${r.description}`)
      .join('\n') || 'None';

    const recentSummary = context.recentChapterSummaries
      .slice(-2)
      .map(s => `Chapter ${s.chapterNumber}: ${s.summary}`)
      .join('\n') || 'None';

    const povBlock = await this.buildPovBlock(options);

    return `
${povBlock ? `${povBlock}\n\n` : ''}You are assisting a novelist with scene continuation.

CURRENT SCENE TEXT (last 200 words):
"${currentText}"

POV CHARACTER: ${povChar}
CHAPTER: ${context.chapter?.title || context.chapter?.chapterNumber || 'Unknown'}
LOCATION: ${context.location?.name || 'Unknown'}

CHARACTERS IN SCENE:
${characterSummaries}

ACTIVE PLOT THREADS:
${activeThreads}

WORLD RULES:
${worldRulesSummary}

RECENT STORY (for continuity):
${recentSummary}

TASK: Suggest 2-3 possible next paragraphs

PRINCIPLES:
1. "Follow the headlights" - suggest directions, don't dictate (Andre Dubus)
2. Maintain consistent POV and voice
3. Preserve rhythm and pacing
4. Sound and rhythm matter (Jim Harrison)
5. Surprise the author - the writing you can't see coming is often best

Provide 2-3 brief continuation options (50-100 words each) that:
- Maintain the established voice
- Advance the scene naturally
- Offer different directions/possibilities
- Feel organic to what came before

Remember: Suggest, don't dictate. The author knows their story best.
`.trim();
  }

  private async buildDialoguePrompt(
    dialogue: string,
    character: Record<string, unknown> | null,
    options: GenerationOptions
  ): Promise<string> {
    const voiceObj = character?.voice as Record<string, unknown> | undefined;
    const voicePatterns = Array.isArray(voiceObj?.patterns) ? (voiceObj.patterns as string[]).join(', ') : 'Not established';
    const personalityObj = character?.personality as Record<string, unknown> | undefined;
    const personality = Array.isArray(personalityObj?.traits) ? (personalityObj.traits as string[]).join(', ') : 'Not established';
    const count = Math.min(Math.max(options.count ?? 1, 1), 3);

    const povBlock = await this.buildPovBlock(options);
    const countInstruction = count > 1
      ? `Provide ${count} variations that strengthen character voice while preserving meaning.`
      : 'Provide a variation that strengthens character voice while preserving meaning.';

    return `
${povBlock ? `${povBlock}\n\n` : ''}You are assisting a novelist with dialogue enhancement.

CHARACTER: ${character?.name || 'Unknown'}
PERSONALITY: ${personality}
VOICE PATTERNS: ${voicePatterns}

CURRENT DIALOGUE:
"${dialogue}"

TASK: Enhance this dialogue to better match character voice

PRINCIPLES:
1. Each character needs a distinct voice
2. Read dialogue aloud - does it sound natural? (Jesse Ball)
3. Match established voice patterns
4. Avoid "on the nose" dialogue
5. Let personality show through word choice

${countInstruction}
`.trim();
  }

  private async buildDescriptionPrompt(
    text: string,
    pov: string | undefined,
    options: GenerationOptions
  ): Promise<string> {
    const count = Math.min(Math.max(options.count ?? 1, 1), 3);
    const povBlock = await this.buildPovBlock(options);

    const sensoryApproaches = ['visual-first', 'sound-first', 'emotional-first'];
    const countInstruction = count > 1
      ? `Provide ${count} distinct sensory approaches (e.g. ${sensoryApproaches.slice(0, count).join(', ')}), each as a separate numbered option.`
      : 'Provide an enhanced version with sensory details.';

    return `
${povBlock ? `${povBlock}\n\n` : ''}You are assisting a novelist with descriptive prose.

POV CHARACTER: ${pov || options.pov || 'Unknown'}
CURRENT TEXT:
"${text}"

TASK: Expand with sensory details

PRINCIPLES:
1. Use all five senses
2. Filter through POV character (what would THEY notice?)
3. Show character personality in what they observe
4. Avoid purple prose - be specific, not flowery
5. Create atmosphere

${countInstruction}
Each version should include:
- Specific sensory details
- Details filtered through character perspective
- Atmosphere and mood
- Concrete, vivid imagery

Keep it grounded and purposeful.
`.trim();
  }

  private buildPlotPrompt(
    plotThread: Record<string, unknown> | null,
    context: GenerationContext,
    options: GenerationOptions
  ): string {
    return `
You are assisting a novelist with plot development.

PLOT THREAD: ${plotThread?.name || 'Unknown'}
TYPE: ${plotThread?.type || 'Unknown'}
CURRENT STATUS: ${plotThread?.status || 'Unknown'}

TASK: Suggest next plot developments

PRINCIPLES:
1. Support discovery writing - suggest options, don't dictate
2. Consider story structure (setup, development, climax, resolution)
3. Create meaningful conflict
4. Connect to character arcs
5. Maintain consistency with established plot threads

Provide 2-3 possible next developments that:
- Advance the plot thread
- Create interesting conflicts or complications
- Connect to character motivations
- Feel organic to the story

Remember: The author knows where their story wants to go.
`.trim();
  }

  // ============================================================
  // CONTEXT ASSEMBLY
  // ============================================================

  private async assembleProjectContext(): Promise<GenerationContext> {
    try {
      const project = await this.mcpClient.readQuery(
        'SELECT * FROM projects WHERE id = ? LIMIT 1',
        [this.projectId]
      );

      const characters = await this.mcpClient.readQuery(
        'SELECT * FROM characters WHERE project_id = ?',
        [this.projectId]
      );

      const worldRules = await this.mcpClient.readQuery(
        'SELECT * FROM world_rules WHERE project_id = ?',
        [this.projectId]
      );

      return {
        projectId: this.projectId,
        genre: project[0]?.genre as string | undefined,
        characterProfiles: characters as CharacterProfileRow[],
        worldRules: worldRules as WorldRuleRow[],
      };
    } catch (error) {
      return { projectId: this.projectId };
    }
  }

  private async assembleSceneContext(sceneId: number, options?: ContextOptions): Promise<SceneContext> {
    return this.contextAssembler.assembleContext(sceneId, options);
  }

  private async getCharacterProfile(name: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await this.mcpClient.readQuery(
        'SELECT * FROM characters WHERE project_id = ? AND name = ? LIMIT 1',
        [this.projectId, name]
      );
      return result[0] ?? null;
    } catch (error) {
      return null;
    }
  }

  private async getPlotThread(name: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await this.mcpClient.readQuery(
        'SELECT * FROM plot_threads WHERE project_id = ? AND thread_name = ? LIMIT 1',
        [this.projectId, name]
      );
      return result[0] ?? null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Load a character's voice, personality, and mannerisms from the database.
   * Returns null if the character is not found or an error occurs.
   *
   * @param projectId - The project to search within
   * @param name      - The character's name
   */
  private async loadCharacterVoice(
    projectId: number,
    name: string
  ): Promise<{ voice: string; personality: string; mannerisms: string } | null> {
    try {
      const result = await this.mcpClient.readQuery(
        'SELECT voice, personality, traits FROM characters WHERE project_id = ? AND name = ? LIMIT 1',
        [projectId, name]
      );
      if (!result || result.length === 0) return null;
      const row = result[0];
      return {
        voice: String(row.voice ?? ''),
        personality: String(row.personality ?? ''),
        mannerisms: String(row.traits ?? ''),
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Build the POV anchor block to prepend to a prompt when options.pov is set.
   * Returns an empty string if the character voice cannot be loaded.
   *
   * @param options - Generation options that may include a pov character name
   */
  private async buildPovBlock(options: GenerationOptions): Promise<string> {
    if (!options.pov) return '';
    const voice = await this.loadCharacterVoice(this.projectId, options.pov);
    if (!voice) return '';
    return (
      `Write strictly from ${options.pov}'s POV. ` +
      `Their voice: ${voice.voice}. ` +
      `Their personality: ${voice.personality}. ` +
      `Their mannerisms: ${voice.mannerisms}. ` +
      `Do NOT break POV or narrate another character's internal state.`
    );
  }

  /**
   * Generate one true sentence to break through writer's block.
   * Loads the last 500 words of the scene's content from the database and asks
   * Claude to write a single, precise sentence that continues the story naturally.
   *
   * @param projectId - (unused; class already scoped to projectId)
   * @param sceneId   - The scene to continue
   * @param options   - Optional generation configuration
   */
  async generateNextSentence(
    projectId: string,
    sceneId: number,
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    // Scene prose lives in the chapter Markdown files, not the database (the
    // `scenes` table has no `content` column), so use the scene's chapter
    // summary as the available context for continuation.
    const chapterRows = await this.mcpClient.readQuery(
      `SELECT ch.summary FROM scenes s
       JOIN chapters ch ON ch.id = s.chapter_id
       WHERE s.id = ? AND ch.project_id = ?`,
      [sceneId, this.projectId]
    );
    const sceneContent =
      chapterRows.length > 0 && chapterRows[0].summary ? (chapterRows[0].summary as string) : '';

    // Take last 500 words
    const words = sceneContent.trim().split(/\s+/).filter(w => w.length > 0);
    const last500 = words.slice(-500).join(' ');

    const prompt = `You are helping a novelist break through writer's block. Given the last part of this scene, write ONE true sentence that continues the story naturally. It should be a complete, specific sentence that propels the narrative forward. Not an opening of a paragraph — just one precise sentence.

Scene so far (last 500 words):
${last500 || '[No content yet — this is the opening of the scene.]'}

Write one true sentence:`;

    const response = await this.claude.generateCreative(prompt, {
      temperature: options.temperature ?? 0.85,
      maxTokens: 128,
    });

    return {
      content: response.content,
      alternatives: [],
      reasoning: 'One true sentence to break through writer\'s block',
    };
  }

  // ============================================================
  // SYNOPSIS & QUERY MATERIALS (SPEC-10)
  // ============================================================

  /**
   * Assemble all project data needed to generate synopsis, pitch,
   * query-letter, or comp-title content.
   *
   * Queries: projects, characters (protagonist + antagonist),
   * chapters (summaries), world_rules, narrative_promises.
   *
   * @param projectId - Project identifier (string form accepted by callers)
   */
  async assembleSynopsisContext(projectId: string): Promise<SynopsisContext> {
    const id = Number(projectId) || this.projectId;

    // Project info
    const projectRows = await this.mcpClient.readQuery(
      'SELECT title, genre, target_word_count FROM projects WHERE id = ?',
      [id]
    );
    const project = (projectRows[0] ?? {}) as Record<string, unknown>;

    // Protagonist — first character with role='protagonist', fall back to first character
    const protagonistRows = await this.mcpClient.readQuery(
      `SELECT name FROM characters WHERE project_id = ? AND role = 'protagonist' ORDER BY id LIMIT 1`,
      [id]
    );
    let protagonist: string = String((protagonistRows[0] as Record<string, unknown>)?.name ?? '');
    if (!protagonist) {
      const firstCharRows = await this.mcpClient.readQuery(
        'SELECT name FROM characters WHERE project_id = ? ORDER BY id LIMIT 1',
        [id]
      );
      protagonist = String((firstCharRows[0] as Record<string, unknown>)?.name ?? 'Unknown');
    }

    // Antagonist
    const antagonistRows = await this.mcpClient.readQuery(
      `SELECT name FROM characters WHERE project_id = ? AND role = 'antagonist' ORDER BY id LIMIT 1`,
      [id]
    );
    const antagonist = (antagonistRows[0] as Record<string, unknown>)?.name as string | undefined;

    // Chapter summaries
    const chapterRows = await this.mcpClient.readQuery(
      'SELECT chapter_number, title, summary FROM chapters WHERE project_id = ? ORDER BY chapter_number',
      [id]
    );
    const chapterSummaries = chapterRows.map(r => ({
      number: r.chapter_number as number,
      title: String(r.title ?? ''),
      summary: String(r.summary ?? ''),
    }));

    // World rules (hard rules only, up to 5)
    const worldRuleRows = await this.mcpClient.readQuery(
      'SELECT rule_name, description FROM world_rules WHERE project_id = ? AND is_hard_rule = 1 LIMIT 5',
      [id]
    );
    const worldRules = worldRuleRows.map(r => `${String(r.rule_name ?? '')}: ${String(r.description ?? '')}`.trim());

    // Open narrative promises (up to 5)
    const promiseRows = await this.mcpClient.readQuery(
      `SELECT title FROM narrative_promises WHERE project_id = ? AND status IN ('open','developing') LIMIT 5`,
      [id]
    );
    const openPromises = promiseRows.map(r => String(r.title ?? ''));

    const mainConflict = openPromises[0] ?? 'Unknown';

    return {
      title: (project.title ?? 'Untitled') as string,
      genre: (project.genre ?? 'Fiction') as string,
      wordCount: (project.target_word_count ?? 0) as number,
      protagonist,
      antagonist,
      mainConflict,
      chapterSummaries,
      worldRules,
      openPromises,
    };
  }

  /**
   * Generate a synopsis of the specified length.
   *
   * @param projectId - Project identifier
   * @param length    - 'short' (~150w), 'medium' (~400w), or 'long' (~800w)
   */
  async generateSynopsis(projectId: string, length: SynopsisLength): Promise<GenerationResult> {
    const ctx = await this.assembleSynopsisContext(projectId);

    const lengthGuide: Record<SynopsisLength, string> = {
      short: '150 words. Hook + core conflict + stakes. End with a question.',
      medium: '400 words. Full plot arc without resolution. Character + conflict + rising action + cliffhanger.',
      long: '800 words. Full synopsis including resolution. Agent-ready format.',
    };

    // Include up to 10 chapter summaries, truncated if very long
    const summaryBlock = ctx.chapterSummaries
      .slice(0, 10)
      .map(c => `  Chapter ${c.number} — "${c.title}": ${c.summary}`)
      .join('\n') || '  (No chapter summaries yet)';

    const prompt = `You are helping a novelist write a ${length} synopsis for submission.

TITLE: ${ctx.title}
GENRE: ${ctx.genre}
TARGET WORD COUNT: ${ctx.wordCount.toLocaleString()}
PROTAGONIST: ${ctx.protagonist}
${ctx.antagonist ? `ANTAGONIST: ${ctx.antagonist}` : ''}
MAIN CONFLICT: ${ctx.mainConflict}
OPEN NARRATIVE PROMISES: ${ctx.openPromises.join('; ') || 'None'}
WORLD RULES: ${ctx.worldRules.join('; ') || 'None'}

CHAPTER SUMMARIES:
${summaryBlock}

TASK: Write a ${lengthGuide[length]}

Follow standard synopsis conventions: present tense, third person, no rhetorical questions except the required ending question (short version only). Reveal the ending in the long version. Agent-ready prose.`;

    const response = await this.claude.generateStructured(prompt, {
      temperature: 0.6,
      maxTokens: length === 'long' ? 1500 : length === 'medium' ? 700 : 350,
    });

    return {
      content: response.content,
      alternatives: [],
      reasoning: `${length} synopsis generated from ${ctx.chapterSummaries.length} chapter summaries`,
    };
  }

  /**
   * Generate a 25-word elevator pitch using the "When…must…before" template.
   *
   * @param projectId - Project identifier
   */
  async generatePitch(projectId: string): Promise<GenerationResult> {
    const ctx = await this.assembleSynopsisContext(projectId);

    const prompt = `Write a 25-word elevator pitch for a ${ctx.genre} novel following this exact template:
"When [protagonist] [inciting incident], they must [goal] before [stakes]."

Story details:
- Title: ${ctx.title}
- Protagonist: ${ctx.protagonist}
- Main conflict: ${ctx.mainConflict}
- Genre: ${ctx.genre}

Return only the pitch sentence — no preamble, no explanation.`;

    const response = await this.claude.generateStructured(prompt, {
      temperature: 0.5,
      maxTokens: 80,
    });

    return {
      content: response.content,
      alternatives: [],
      reasoning: 'Elevator pitch following the When/must/before template',
    };
  }

  /**
   * Generate a professional query letter ready for literary agent submission.
   *
   * @param projectId  - Project identifier
   * @param compTitles - Optional list of comp titles provided by the author
   */
  async generateQueryLetter(projectId: string, compTitles?: string[]): Promise<GenerationResult> {
    const ctx = await this.assembleSynopsisContext(projectId);

    const compBlock = compTitles && compTitles.length > 0
      ? compTitles.join(', ')
      : 'suggest 2 recent comparisons (2020–2025) that an agent would recognise';

    const prompt = `Write a professional query letter for a literary agent.

NOVEL DETAILS:
- Title: ${ctx.title}
- Genre: ${ctx.genre}
- Word count: ${ctx.wordCount.toLocaleString()}
- Protagonist: ${ctx.protagonist}
${ctx.antagonist ? `- Antagonist: ${ctx.antagonist}` : ''}
- Main conflict: ${ctx.mainConflict}
- Open narrative promises: ${ctx.openPromises.join('; ') || 'None'}
- World rules / themes: ${ctx.worldRules.join('; ') || 'None'}

CHAPTER SUMMARIES (for context):
${ctx.chapterSummaries.slice(0, 8).map(c => `  Ch ${c.number}: ${c.summary}`).join('\n') || '  (none yet)'}

STRUCTURE REQUIREMENTS — include all of these:
1. Hook (1 compelling sentence)
2. Premise (2–3 sentences: protagonist, conflict, stakes)
3. Stakes (what is lost if the protagonist fails)
4. Comp titles: ${compBlock}
5. Word count and genre
6. One-sentence author bio placeholder: [YOUR BIO HERE]

Follow standard query letter format. Keep it under 350 words. Present tense.`;

    const response = await this.claude.generateStructured(prompt, {
      temperature: 0.55,
      maxTokens: 700,
    });

    return {
      content: response.content,
      alternatives: [],
      reasoning: 'Professional query letter formatted for literary agent submission',
    };
  }

  /**
   * Suggest 5 comparative titles published 2020–2025 for the novel.
   *
   * @param projectId - Project identifier
   */
  async generateComps(projectId: string): Promise<GenerationResult> {
    const ctx = await this.assembleSynopsisContext(projectId);
    const themes = ctx.worldRules.join(', ') || ctx.openPromises.join(', ') || 'unspecified themes';

    const prompt = `Suggest 5 recently published (2020–2025) comparative titles for a ${ctx.genre} novel with these themes: ${themes}.

For each comp title provide:
- Title
- Author
- Year
- 1 sentence explaining why it is a good comparison

Focus on books a literary agent would recognise. Format as a numbered list.`;

    const response = await this.claude.generateStructured(prompt, {
      temperature: 0.6,
      maxTokens: 600,
    });

    return {
      content: response.content,
      alternatives: [],
      reasoning: `Comp titles suggested for ${ctx.genre} with themes: ${themes}`,
    };
  }

  /**
   * Workshop opening lines for the novel.
   * Loads project context (title, genre, protagonist, core conflict) via
   * `assembleSynopsisContext` when available, then asks Claude to generate
   * `count` distinct opening-line options.
   *
   * Each option:
   * - hooks the reader immediately
   * - establishes voice and tone
   * - hints at the central tension
   * - stands alone as a complete sentence
   *
   * @param projectId - Project identifier
   * @param count     - Number of options to generate (default 5, max 10)
   */
  async workshopOpeningLines(
    projectId: string,
    count?: number
  ): Promise<GenerationResult> {
    const n = Math.min(Math.max(count ?? 5, 1), 10);

    // Try to load rich synopsis context; fall back to basic project info
    let title = 'Untitled';
    let genre = 'Fiction';
    let protagonist = 'Unknown';
    let conflict = 'Unknown';

    try {
      const ctx = await this.assembleSynopsisContext(projectId);
      title = ctx.title;
      genre = ctx.genre;
      protagonist = ctx.protagonist ?? 'Unknown';
      conflict = ctx.mainConflict ?? 'Unknown';
    } catch {
      // Fallback: load directly from projects table
      try {
        const id = Number(projectId) || this.projectId;
        const rows = await this.mcpClient.readQuery(
          'SELECT title, genre FROM projects WHERE id = ?',
          [id]
        );
        if (rows.length > 0) {
          const row = rows[0];
          title = String(row.title ?? 'Untitled');
          genre = String(row.genre ?? 'Fiction');
        }
        const charRows = await this.mcpClient.readQuery(
          `SELECT name FROM characters WHERE project_id = ? AND role = 'protagonist' ORDER BY id LIMIT 1`,
          [Number(projectId) || this.projectId]
        );
        if (charRows.length > 0) {
          protagonist = String(charRows[0].name ?? 'Unknown');
        }
      } catch {
        // Accept defaults
      }
    }

    const prompt = `You are workshopping opening lines for a novel. Generate ${n} distinct opening line options for this story:

Title: ${title}
Genre: ${genre}
Protagonist: ${protagonist}
Core Conflict: ${conflict}

Each opening line should:
- Hook the reader immediately
- Establish voice and tone
- Hint at the central tension
- Stand alone as a complete sentence

Number each option. Consider: starting in action, starting with character voice, starting with setting, starting with a question, starting with a contradiction.`;

    const response = await this.claude.generateCreative(prompt, {
      temperature: 0.9,
      maxTokens: 512,
    });

    return {
      content: response.content,
      alternatives: [],
      reasoning: `${n} opening line options workshopped for "${title}" (${genre})`,
    };
  }

  /**
   * Generate creative brainstorm ideas from an author prompt.
   * Returns 5 distinct, numbered ideas grounded in the project genre.
   *
   * @param prompt  - The brainstorm prompt from the author
   * @param options - Optional generation configuration
   */
  async generateBrainstorm(
    prompt: string,
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    const context = await this.assembleProjectContext();
    const fullPrompt = `
You are assisting a novelist with creative brainstorming.

GENRE: ${context.genre || 'General Fiction'}

BRAINSTORM PROMPT: "${prompt}"

Generate 5 distinct, creative ideas or directions related to this prompt.
Each idea should be a concrete, actionable story element (character trait, plot twist, location detail, etc.).
Be surprising — the ideas you can't see coming are often best (Andre Dubus).

Format as a numbered list. Keep each idea to 1-3 sentences.
`.trim();

    const response = await this.claude.generateCreative(fullPrompt, {
      temperature: options.temperature ?? 0.95,
      maxTokens: 512,
    });

    return {
      content: response.content,
      alternatives: [],
      reasoning: 'Brainstormed from genre context and author prompt',
    };
  }

  // ============================================================
  // IDEATION EXTRAS (PROC-01)
  // ============================================================

  /**
   * Generate character name options with cultural context and meaning.
   *
   * @param opts - Options controlling culture, gender, count, and name type
   */
  async generateName(opts: {
    culture?: string;
    gender?: 'male' | 'female' | 'neutral';
    count?: number;
    type?: 'first' | 'last' | 'full';
  }): Promise<GenerationResult> {
    const count = opts.count ?? 5;
    const culture = opts.culture || 'any';
    const gender = opts.gender || 'any';
    const type = opts.type ?? 'full';

    const prompt = `Generate ${count} character name options. Culture/origin: ${culture}. Gender: ${gender}. Type: ${type} names. For each name: provide the name, its cultural origin, and a brief meaning/association if known. Number each option.`;

    const response = await this.claude.generateStructured(prompt, {
      temperature: 0.8,
      maxTokens: 512,
    });

    return {
      content: response.content,
      alternatives: [],
      reasoning: `Generated ${count} ${type} name options (culture: ${culture}, gender: ${gender})`,
    };
  }

  /**
   * Workshop a partial premise through structured development questions.
   * Guides the author through conflict, protagonist, stakes, story question, and uniqueness.
   *
   * @param projectId      - Project identifier (unused in prompt but kept for API consistency)
   * @param partialPremise - The author's initial premise idea
   */
  async workshopPremise(projectId: string, partialPremise: string): Promise<GenerationResult> {
    const prompt = `You are helping a novelist develop their premise. Given this initial premise idea: '${partialPremise}' Guide the author through these premise development questions: 1. What is the central conflict? 2. Who is the protagonist and what do they want? 3. What are the stakes if they fail? 4. What is the story question (the yes/no question the book answers)? 5. What makes this premise unique? Provide 2-3 specific suggestions for each question based on the given premise.`;

    const response = await this.claude.generateStructured(prompt, {
      temperature: 0.7,
      maxTokens: 1024,
    });

    return {
      content: response.content,
      alternatives: [],
      reasoning: 'Premise developed through five structured questions',
    };
  }

  /**
   * Generate a quick character sketch to capture an early idea.
   * Lightweight — name options, core trait, flaw, hidden depth, voice note, and story role.
   *
   * @param opts - Optional role, genre, and freeform notes
   */
  async generateCharacterSketch(opts: {
    role?: string;
    genre?: string;
    notes?: string;
  } = {}): Promise<GenerationResult> {
    const role = opts.role || 'character';
    const genre = opts.genre || 'fiction';
    const notes = opts.notes || 'none';

    const prompt = `Generate a quick character sketch for a ${role} in a ${genre} story. Notes: ${notes}. Include: Name (2 options), Age range, Core trait (one defining characteristic), Surface flaw (visible behavior), Hidden depth (what they hide), Voice note (how they speak), Story role (what function do they serve in the narrative). Keep it concise — this is a sketch, not a full profile.`;

    const response = await this.claude.generateStructured(prompt, {
      temperature: 0.75,
      maxTokens: 512,
    });

    return {
      content: response.content,
      alternatives: [],
      reasoning: `Quick character sketch for a ${role} in a ${genre} story`,
    };
  }

}
