/**
 * Handler for /novel init command
 *
 * Designed to run safely in automated / non-interactive environments (e.g.
 * Claude Code's Bash tool, CI). The handler NEVER blocks on stdin unless it
 * detects a real interactive TTY. When run non-interactively with missing
 * metadata it auto-derives sensible defaults and reports them rather than
 * hanging on a prompt. Pass --json for a machine-readable result.
 */

import type { ParsedArgs, CommandContext } from '../types.js';
import { NovelWriterExtension } from '../../index.js';
import { existsSync, readdirSync } from 'fs';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join, basename } from 'path';
import { createInterface } from 'readline';
import { execFileSync } from 'child_process';
import { scaffoldStyleFiles } from './init-scaffold.js';

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const CONTENT_DIRS = [
  'characters',
  'locations',
  'chapters',
  'world-rules',
  'plots',
  'timeline',
  'research',
  'revisions',
  'export',
];

const DB_RELATIVE_PATH = join('.novel', 'data.db');

/** Source of an auto-derived metadata field, for reporting back to the caller. */
type DerivedSources = Partial<Record<'title' | 'author', string>>;

/** Structured result emitted in --json mode. */
interface InitResult {
  status: 'ok' | 'exists' | 'error';
  projectId?: number;
  path?: string;
  metadata?: {
    title: string;
    author: string;
    genre?: string;
    targetWordCount: number;
    currentPhase: string;
  };
  derived?: DerivedSources;
  editingMode?: string;
  created?: { directories: string[]; claudeMd: boolean; styleFiles: string[] };
  hasExistingContent?: boolean;
  nextSteps?: string[];
  message: string;
  error?: string;
}

/** Normalise a raw --editing-mode value to a known mode, or undefined. */
function normaliseEditingMode(value: string | undefined): 'ai' | 'deterministic' | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'ai') return 'ai';
  if (v === 'deterministic') return 'deterministic';
  return undefined;
}

/** Write a single JSON line to stdout, bypassing any console.log interception. */
function emitJson(result: InitResult): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

/** Turn a directory name into a human-friendly title (e.g. "echo-signal" → "Echo Signal"). */
function deriveTitleFromDir(cwd: string): string {
  const raw = basename(cwd).replace(/[-_]+/g, ' ').trim();
  if (!raw) return 'Untitled Novel';
  return raw
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Read the author name from git config, if available. */
function deriveAuthorFromGit(): string | undefined {
  try {
    const name = execFileSync('git', ['config', 'user.name'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return name || undefined;
  } catch {
    return undefined;
  }
}

export async function handleInit(args: ParsedArgs, context: CommandContext): Promise<void> {
  const { flags } = args;
  const { cwd, output } = context;

  const json = Boolean(flags['json']);
  // Prompt ONLY when attached to a real interactive terminal. In Claude Code's
  // Bash tool, CI, or JSON mode, stdin is not a TTY → never block on readline.
  const interactive = Boolean(process.stdin.isTTY) && !flags['skip-prompts'] && !json;

  // ── Already initialized? (non-destructive by default) ────────────────────
  // We never delete anything unless the user explicitly opts in — via --force,
  // or by answering "yes" to the interactive start-over prompt. Reinitialising
  // only resets the .novel/ database; chapter and character files are preserved.
  const novelDir = join(cwd, '.novel');
  if (existsSync(novelDir)) {
    let startOver = Boolean(flags['force']);

    if (!startOver && interactive) {
      const answer = await promptLine(
        'A novel project already exists here.\n' +
        'Start over? This resets the .novel/ database but KEEPS your chapter and\n' +
        'character files. [y/N]: ',
      );
      startOver = /^y(es)?$/i.test(answer.trim());
      output.newline();
    }

    if (!startOver) {
      // Default path: leave the existing project completely untouched.
      if (json) {
        emitJson({
          status: 'exists',
          path: DB_RELATIVE_PATH,
          message:
            'Project already initialized; left untouched. Pass --force to start over ' +
            '(resets the .novel/ database only; your chapter/character files are kept).',
        });
        return;
      }
      output.info('A novel project already exists here — leaving it untouched.');
      output.newline();
      output.info('To start over (resets the .novel/ database; keeps your files), use --force:');
      output.code('novel-writer init --force');
      return;
    }

    // Opted in: remove only the .novel/ database directory.
    if (!json) {
      output.warning(
        'Resetting project: removing .novel/ database (chapter and character files are preserved)...',
      );
      output.newline();
    }
    await rm(novelDir, { recursive: true, force: true });
  }

  // ── Gather metadata ───────────────────────────────────────────────────────
  // title/author are filled by prompting (interactive) or derivation
  // (non-interactive) below, so empty strings here are temporary placeholders.
  const metadata: {
    title: string;
    author: string;
    genre?: string;
    targetWordCount: number;
    currentPhase: string;
  } = {
    title: (flags.title as string) ?? '',
    author: (flags.author as string) ?? '',
    genre: flags.genre as string | undefined,
    targetWordCount: (flags.words as number) ?? 80000,
    currentPhase: (flags.phase as string) ?? 'ideation',
  };
  const derived: DerivedSources = {};

  if (interactive) {
    output.info('Enter project details (press Enter to accept defaults):');
    output.newline();

    if (!metadata.title) {
      metadata.title = await promptLine('  Project title: ');
    }
    if (!metadata.author) {
      metadata.author = await promptLine('  Author name:   ');
    }
    if (!metadata.genre) {
      const genre = await promptLine('  Genre (optional): ');
      if (genre) metadata.genre = genre;
    }
    output.newline();
  }

  // Non-interactive (or interactive with empty answers): auto-derive what's
  // still missing instead of failing or hanging.
  if (!metadata.title) {
    metadata.title = deriveTitleFromDir(cwd);
    derived.title = 'directory-name';
  }
  if (!metadata.author) {
    const gitAuthor = deriveAuthorFromGit();
    metadata.author = gitAuthor ?? 'Unknown Author';
    derived.author = gitAuthor ? 'git-config' : 'default';
  }

  if (!json && Object.keys(derived).length > 0) {
    output.info('Non-interactive: derived missing metadata');
    if (derived.title) output.dim(`Title:  ${metadata.title}  (from ${derived.title})`);
    if (derived.author) output.dim(`Author: ${metadata.author}  (from ${derived.author})`);
    output.newline();
  }

  // ── Default editing mode ──────────────────────────────────────────────────
  // Many editing features come in two flavours: deterministic (fast, local, no
  // API key) and AI (Claude-generated). Surface the choice, record the default
  // in CLAUDE.md so the assistant honours it. Non-interactive → deterministic
  // (the safe default: nothing requires an API key).
  let editingMode = normaliseEditingMode(flags['editing-mode'] as string | undefined);
  if (!editingMode && interactive) {
    output.info('Many editing features come in two flavours:');
    output.dim('• deterministic — fast, local, no API key (analyze prose/pacing/style, check, copy-edit)');
    output.dim('• ai            — Claude-generated suggestions (generate, craft) — needs ANTHROPIC_API_KEY');
    const ans = await promptLine('Default editing mode? [deterministic/ai] (deterministic): ');
    editingMode = /^a(i)?$/i.test(ans.trim()) ? 'ai' : 'deterministic';
    output.newline();
  }
  if (!editingMode) editingMode = 'deterministic';

  // Warn about a non-empty directory (informational only — never blocks).
  if (!json) {
    const files = readdirSync(cwd).filter((f) => f !== '.novel');
    if (files.length > 0) {
      output.warning(`Directory is not empty (${files.length} items found). Continuing...`);
      output.newline();
    }
  }

  // ── Initialize ────────────────────────────────────────────────────────────
  // In JSON mode, silence stray console.log from the extension/db layers so the
  // only thing on stdout is the final JSON line. Errors go to stderr regardless.
  const originalConsoleLog = console.log;
  if (json) {
    console.log = () => undefined;
  }

  const spinner = json ? null : output.spinner('Initializing project');

  try {
    const extension = new NovelWriterExtension(cwd);

    await extension.initialize({
      title: metadata.title,
      author: metadata.author,
      genre: metadata.genre,
      targetWordCount: metadata.targetWordCount,
      projectPath: cwd,
    });

    const projectId = extension.getProjectId();

    spinner?.stop('Project initialized successfully!');

    // Pre-create all content directories so sync commands work before any content is added
    await Promise.all(CONTENT_DIRS.map((dir) => mkdir(join(cwd, dir), { recursive: true })));

    // Write project CLAUDE.md so Claude Code knows about the novel project
    const claudeMdWritten = await writeProjectClaudeMd(
      cwd,
      metadata.title,
      metadata.author,
      metadata.genre,
      editingMode,
    );

    // Scaffold the style files (numeric targets + prose guide stubs) so the
    // analyzers and editor agents have something to consult. Never overwrites.
    const styleFilesWritten = await scaffoldStyleFiles(cwd);

    // Detect pre-existing content directories and suggest sync
    const hasExistingContent = detectExistingContent(cwd);

    const baseSteps = [
      'Tune your style targets: style-targets.yml (drives `novel-writer analyze style`)',
      'Customize the style guides: STRUCTURAL_STYLE_GUIDE.md and COMPOSITIONAL_STYLE_GUIDE.md',
      'Create your first character: novel-writer create character',
      'Create key locations: novel-writer create location',
      'Start writing: novel-writer create chapter',
    ];
    const nextSteps = hasExistingContent
      ? ['Import existing content: novel-writer sync all', ...baseSteps]
      : baseSteps;

    if (json) {
      console.log = originalConsoleLog;
      emitJson({
        status: 'ok',
        projectId,
        path: DB_RELATIVE_PATH,
        metadata,
        derived: Object.keys(derived).length > 0 ? derived : undefined,
        editingMode,
        created: { directories: CONTENT_DIRS, claudeMd: claudeMdWritten, styleFiles: styleFilesWritten },
        hasExistingContent,
        nextSteps,
        message: `Novel project "${metadata.title}" initialized.`,
      });
      return;
    }

    // ── Human-readable success output ──────────────────────────────────────
    output.newline();
    output.success('Novel project initialized!');
    output.newline();

    output.keyValue({
      Project: metadata.title,
      Author: metadata.author,
      Genre: metadata.genre || '(none)',
      'Target words': metadata.targetWordCount.toLocaleString(),
      Phase: metadata.currentPhase,
      'Editing mode': editingMode,
    });

    output.newline();
    output.heading('Directory structure created:');
    output.list(
      [
        '.novel/          - Extension metadata and database',
        'characters/      - Character profiles (YAML)',
        'locations/       - Location and world elements (YAML)',
        'chapters/        - Manuscript chapters (Markdown)',
        'world-rules/     - World rules and lore (YAML)',
        'plots/           - Plot threads (YAML)',
        'timeline/        - Timeline events (YAML)',
        'research/        - Research materials',
        'revisions/       - Previous draft snapshots',
        'export/          - Generated manuscripts',
      ],
      '📁',
    );

    output.newline();
    output.heading('Next steps:');
    if (hasExistingContent) {
      output.list(['Import existing content: novel-writer sync all'], '→');
      output.newline();
    }
    output.list(baseSteps, '→');

    output.newline();
    output.info("Run 'novel-writer help' to see all available commands");
  } catch (error) {
    console.log = originalConsoleLog;
    spinner?.stop();
    const message = (error as Error).message;
    if (json) {
      emitJson({ status: 'error', message: 'Initialization failed', error: message });
    } else {
      output.error(`Initialization failed: ${message}`);
    }
    throw error;
  } finally {
    console.log = originalConsoleLog;
  }
}

/** Returns true if any content directory already holds YAML/Markdown files. */
function detectExistingContent(cwd: string): boolean {
  const syncDirs = ['characters', 'locations', 'chapters', 'world-rules', 'plots', 'timeline'];
  return syncDirs.some((dir) => {
    const dirPath = join(cwd, dir);
    if (!existsSync(dirPath)) return false;
    try {
      return readdirSync(dirPath).some(
        (f) => f.endsWith('.yml') || f.endsWith('.yaml') || f.endsWith('.md'),
      );
    } catch {
      return false;
    }
  });
}

/**
 * Write a project CLAUDE.md describing the novel project.
 * @returns true if a file was written, false if one already existed (never overwritten).
 */
async function writeProjectClaudeMd(
  cwd: string,
  title: string,
  author: string,
  genre: string | undefined,
  editingMode: string,
): Promise<boolean> {
  const claudeMdPath = join(cwd, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) return false; // never overwrite user's existing CLAUDE.md

  const content = `# CLAUDE.md

This is a **claude-novel-writer** project. The \`claude-novel-writer\` plugin is installed and provides the \`novel-writer\` CLI and \`/novel\` slash command.

## Project

- **Title**: ${title}
- **Author**: ${author}${genre ? `\n- **Genre**: ${genre}` : ''}

## Editing mode preference

**Default: ${editingMode}**

Many editing features come in two flavours. When the user asks for editing help,
prefer the **${editingMode}** tools below unless they ask otherwise — the other
mode stays available.

- **deterministic** — fast, local, no API key. Prose/structure analysis and
  checks: \`novel-writer analyze prose|pacing|style|sentences\`, \`novel-writer check\`,
  \`novel-writer analyze copy\`.
- **ai** — Claude-generated drafting and suggestions: \`novel-writer generate ...\`,
  \`novel-writer craft ...\` (requires \`ANTHROPIC_API_KEY\`).

## Project structure

\`\`\`
.novel/data.db                 ← SQLite database (do not edit directly)
style-targets.yml              ← numeric prose targets (drives \`analyze style\`)
STRUCTURAL_STYLE_GUIDE.md      ← technical style rules (Copy Editor agent reads this)
COMPOSITIONAL_STYLE_GUIDE.md   ← voice/imagery/theme (Developmental/Line Editor agents)
templates/                     ← starter templates to copy into the content dirs
characters/                    ← YAML character profiles
locations/                     ← YAML location files
plots/                         ← YAML plot threads
world-rules/                   ← YAML world rules
timeline/                      ← YAML story events
chapters/                      ← Markdown chapter files (YAML frontmatter)
research/                      ← Research notes
revisions/                     ← Snapshot archives
export/                        ← Exported manuscripts
\`\`\`

## Style files & templates

- **\`style-targets.yml\`** holds this project's numeric prose targets. Tune it,
  then run \`novel-writer analyze style --chapter N\` (or \`--all\`) to grade prose
  against it. Edit this file to change what the deterministic analyzers flag.
- **\`STRUCTURAL_STYLE_GUIDE.md\`** and **\`COMPOSITIONAL_STYLE_GUIDE.md\`** hold the
  qualitative voice/punctuation/theme rules. The Copy / Line / Developmental
  Editor agents read them by name from the project root — keep them here. Fill in
  the \`<placeholders>\` to make the agents enforce your conventions.
- **\`templates/\`** is a reference library, not synced. To add an entity: copy the
  matching template into its content dir, rename it, edit it, then sync. e.g.
  \`cp templates/character.yml characters/ada-vex.yml\` → edit → \`novel-writer sync all\`.
  (Files left in \`templates/\` are never imported; only files inside the content
  dirs are synced.)

## When to use novel commands (proactive guidance)

Use the \`novel-writer\` CLI (via Bash) or the skills loaded by the plugin. Invoke proactively without waiting for the user to ask:

| Situation | Command |
|---|---|
| User asks about characters, plot, or story | \`novel-writer list characters\` / \`novel-writer list chapters\` |
| User asks to check for problems or contradictions | \`novel-writer check\` |
| User asks for prose feedback or style analysis | \`novel-writer analyze prose\` |
| User asks about pacing or tension | \`novel-writer analyze pacing\` |
| User is about to do major revisions | Suggest \`novel-writer revision snapshot --label "before-x"\` first |
| User asks for what still needs work | \`novel-writer draft scan\` (finds [TK] markers) |
| User asks to write or continue a scene | \`novel-writer generate scene --scene-id N\` |
| User asks for a synopsis or pitch | \`novel-writer generate synopsis\` / \`generate pitch\` |
| User asks about unverified facts in the manuscript | \`novel-writer research verify\` |
| User wants to export the manuscript | \`novel-writer export markdown\` |

## Key conventions

- Chapter files: \`chapters/chapter-NN-title.md\` with YAML frontmatter
- Character files: \`characters/name.yml\`
- After editing YAML files by hand, run \`novel-writer sync\` to push to the database
- All AI generation requires \`ANTHROPIC_API_KEY\` to be set
- Use \`novel-writer help\` for the full command reference
`;

  await writeFile(claudeMdPath, content, 'utf-8');
  return true;
}
