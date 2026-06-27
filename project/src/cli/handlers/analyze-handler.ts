/**
 * Analyze Command Handlers (GAP-11 / SPEC-08, SPEC-05)
 *
 * Dispatches to PacingAnalyzer and ProseAnalyzer and formats output for the CLI.
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import { NovelWriterExtension } from '../../index.js';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
import type {
  ChapterTensionData,
  POVBalance,
  ChapterLengthData,
  PacingReport,
  ProseAnalysisResult,
  ProseCheck,
} from '../../types/novel.js';
import { ReadAloudPreparer } from '../../analysis/read-aloud.js';
import { DevelopmentalAnalyzer } from '../../analysis/developmental-analyzer.js';
import { CopyEditor } from '../../analysis/copy-editor.js';
import { StyleTargetAnalyzer, type StyleTargetReport } from '../../analysis/style-target-analyzer.js';
import { VoiceAnalyzer, type VoiceReport } from '../../analysis/voice-analyzer.js';
import { loadStyleTargets } from '../../analysis/style-targets.js';
import YAML from 'yaml';

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function handleAnalyzeCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0] ?? 'pacing';

  switch (subcommand) {
    case 'tension-arc':
      await handleTensionArc(projectPath, output);
      break;
    case 'pov-balance':
      await handlePOVBalance(projectPath, output);
      break;
    case 'chapter-lengths':
      await handleChapterLengths(projectPath, output);
      break;
    case 'pacing':
      await handlePacing(projectPath, output);
      break;
    case 'conflict':
      await handleConflict(projectPath, output);
      break;
    case 'prose':
      await handleProse(args, projectPath, output);
      break;
    case 'sentences':
      await handleSentences(args, projectPath, output);
      break;
    case 'dialogue':
      await handleDialogue(args, projectPath, output);
      break;
    case 'read-aloud':
      await handleReadAloud(args, projectPath, output);
      break;
    case 'rhythm':
      await handleRhythm(args, projectPath, output);
      break;
    case 'scenes':
      await handleScenes(args, projectPath, output);
      break;
    case 'subplots':
      await handleSubplots(projectPath, output);
      break;
    case 'plot-holes':
      await handlePlotHoles(projectPath, output);
      break;
    case 'copy':
      await handleCopyEdit(args, projectPath, output);
      break;
    case 'dialogue-reader':
      await handleDialogueReader(args, projectPath, output);
      break;
    case 'sensory':
      await handleSensory(args, projectPath, output);
      break;
    case 'show-tell':
      await handleShowTell(args, projectPath, output);
      break;
    case 'style':
      await handleStyleTargets(args, projectPath, output);
      break;
    case 'voice':
      await handleVoice(args, projectPath, output);
      break;
    default:
      output.error(`Unknown analyze subcommand: ${subcommand}`);
      output.info(
        'Available: tension-arc, pov-balance, chapter-lengths, pacing, conflict, prose, sentences, dialogue, read-aloud, rhythm, scenes, subplots, plot-holes, copy, dialogue-reader, sensory, show-tell, style, voice'
      );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireProject(projectPath: string, output: OutputFormatter): boolean {
  const dbPath = join(projectPath, '.novel', 'data.db');
  if (!existsSync(dbPath)) {
    output.error('Project not initialized. Run `/novel init` first.');
    return false;
  }
  return true;
}

async function getAnalyzer(projectPath: string) {
  const extension = new NovelWriterExtension(projectPath);
  const mcpClient = (extension as any).mcpClient;
  const rows = await mcpClient.readQuery('SELECT id FROM projects ORDER BY id LIMIT 1', []);
  if (rows.length > 0) extension.setProjectId(rows[0].id as number);
  return extension.getPacingAnalyzer();
}

// ─── Sub-command handlers ─────────────────────────────────────────────────────

async function handleTensionArc(
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  if (!requireProject(projectPath, output)) return;
  try {
    const analyzer = await getAnalyzer(projectPath);
    const data = await analyzer.analyzeTensionArc();

    if (data.length === 0) {
      output.info('No chapters found.');
      return;
    }

    output.heading('Tension Arc');
    output.newline();

    const MAX_BLOCKS = 10;
    for (const ch of data) {
      const clamped = Math.min(MAX_BLOCKS, Math.max(0, ch.avgTension));
      const filled = Math.round(clamped);
      const empty = MAX_BLOCKS - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      const label = `Ch${ch.chapterNumber}`.padEnd(5);
      output.info(`${label} ${bar} ${ch.avgTension.toFixed(1)}  (${ch.sceneCount} scenes)`);
    }
  } catch (err) {
    output.error(`Failed to analyze tension arc: ${(err as Error).message}`);
  }
}

async function handlePOVBalance(
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  if (!requireProject(projectPath, output)) return;
  try {
    const analyzer = await getAnalyzer(projectPath);
    const data = await analyzer.analyzePOVBalance();

    if (data.length === 0) {
      output.info('No POV scenes found.');
      return;
    }

    output.heading('POV Balance');
    output.newline();

    const rows = data.map((p: POVBalance) => ({
      Character: p.characterName,
      Scenes: p.sceneCount,
      'Percentage (%)': p.percentage.toFixed(1),
    }));
    output.table(rows);
  } catch (err) {
    output.error(`Failed to analyze POV balance: ${(err as Error).message}`);
  }
}

async function handleChapterLengths(
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  if (!requireProject(projectPath, output)) return;
  try {
    const analyzer = await getAnalyzer(projectPath);
    const data = await analyzer.analyzeChapterLengths();

    if (data.length === 0) {
      output.info('No chapters found.');
      return;
    }

    output.heading('Chapter Lengths');
    output.newline();

    const rows = data.map((l: ChapterLengthData) => ({
      '#': l.chapterNumber,
      Title: l.chapterTitle || '(untitled)',
      Words: l.wordCount,
      Flag: l.deviation === 'normal' ? '' : l.deviation.toUpperCase(),
    }));
    output.table(rows);
  } catch (err) {
    output.error(`Failed to analyze chapter lengths: ${(err as Error).message}`);
  }
}

async function handlePacing(
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  if (!requireProject(projectPath, output)) return;
  try {
    const analyzer = await getAnalyzer(projectPath);
    const report: PacingReport = await analyzer.generateReport();

    output.heading('Pacing Report');
    output.newline();

    // Tension arc chart
    output.info('── Tension Arc ─────────────────────────');
    output.code(report.asciiTensionChart);
    output.newline();

    // POV balance
    output.info('── POV Balance ─────────────────────────');
    if (report.povBalance.length === 0) {
      output.dim('  No POV data.');
    } else {
      const rows = report.povBalance.map((p: POVBalance) => ({
        Character: p.characterName,
        Scenes: p.sceneCount,
        '%': p.percentage.toFixed(1),
      }));
      output.table(rows);
    }
    output.newline();

    // Chapter lengths
    output.info('── Chapter Lengths ─────────────────────');
    if (report.chapterLengths.length === 0) {
      output.dim('  No chapters.');
    } else {
      const rows = report.chapterLengths.map((l: ChapterLengthData) => ({
        '#': l.chapterNumber,
        Title: l.chapterTitle || '(untitled)',
        Words: l.wordCount,
        Flag: l.deviation === 'normal' ? '' : l.deviation.toUpperCase(),
      }));
      output.table(rows);
    }
    output.newline();

    // Flags
    output.info('── Pacing Flags ────────────────────────');
    if (report.flags.length === 0) {
      output.success('No pacing issues detected.');
    } else {
      for (const flag of report.flags) {
        const chapters =
          flag.affectedChapters && flag.affectedChapters.length > 0
            ? ` [ch: ${flag.affectedChapters.join(', ')}]`
            : '';
        output.warning(`[${flag.type}]${chapters} ${flag.description}`);
      }
    }
  } catch (err) {
    output.error(`Failed to generate pacing report: ${(err as Error).message}`);
  }
}

async function handleConflict(
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  if (!requireProject(projectPath, output)) return;
  try {
    const analyzer = await getAnalyzer(projectPath);
    const data = await analyzer.analyzeTensionArc();
    const lowConflict = data.filter((ch: ChapterTensionData) => ch.avgTension <= 3);

    output.heading('Low-Conflict Chapters (avg tension ≤ 3)');
    output.newline();

    if (lowConflict.length === 0) {
      output.success('No low-conflict chapters found.');
      return;
    }

    const rows = lowConflict.map((ch: ChapterTensionData) => ({
      '#': ch.chapterNumber,
      Title: ch.chapterTitle || '(untitled)',
      'Avg Tension': ch.avgTension.toFixed(1),
      Scenes: ch.sceneCount,
    }));
    output.table(rows);
  } catch (err) {
    output.error(`Failed to analyze conflict: ${(err as Error).message}`);
  }
}

// ─── Prose sub-command helpers ────────────────────────────────────────────────

/**
 * Resolve a chapter file path from `--chapter N` flag or file arg.
 * Returns undefined when neither is provided.
 */
function resolveChapterFile(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): string | undefined {
  const chapterNum = args.flags['chapter'] as number | undefined;
  if (chapterNum === undefined) {
    output.error('Specify --chapter N to pick a chapter, or --all to analyze all chapters.');
    return undefined;
  }

  const chaptersDir = join(projectPath, 'chapters');
  let entries: string[];
  try {
    entries = readdirSync(chaptersDir).filter((f: string) => f.endsWith('.md'));
  } catch {
    output.error(`chapters/ directory not found at ${chaptersDir}`);
    return undefined;
  }

  // Match by leading numeric prefix (e.g. "01", "1", or "chapter-01")
  const padded = String(chapterNum).padStart(2, '0');
  const match = entries.find(
    (f) => f.startsWith(padded) || f.includes(`-${padded}`) || f.includes(`-${chapterNum}`)
  );

  if (!match) {
    output.error(`No chapter file found for chapter ${chapterNum} in ${chaptersDir}`);
    return undefined;
  }

  return join(chaptersDir, match);
}

/** Render a set of ProseCheck items grouped by type */
function renderChecks(checks: ProseCheck[], output: OutputFormatter): void {
  if (checks.length === 0) {
    output.success('No issues found.');
    return;
  }

  const bySeverity: Record<string, ProseCheck[]> = { error: [], warning: [], info: [] };
  for (const c of checks) {
    bySeverity[c.severity].push(c);
  }

  const print = (label: string, items: ProseCheck[]) => {
    if (items.length === 0) return;
    output.info(`── ${label} (${items.length}) ─────────────────────────`);
    for (const c of items) {
      const loc = c.column ? `L${c.line}:${c.column}` : `L${c.line}`;
      const hint = c.suggestion ? ` → ${c.suggestion}` : '';
      output.info(`  [${c.type}] ${loc}: "${c.text}"${hint}`);
    }
    output.newline();
  };

  print('Errors', bySeverity['error']);
  print('Warnings', bySeverity['warning']);
  print('Info', bySeverity['info']);
}

/** Render a summary line for a ProseAnalysisResult */
function renderSummary(result: ProseAnalysisResult, output: OutputFormatter): void {
  output.info(
    `  Words: ${result.wordCount}  |  Economy: ${result.economyScore.toFixed(1)}/100  |  Dialogue: ${result.dialoguePercent.toFixed(1)}%  |  Issues: ${result.checks.length}`
  );
}

async function handleProse(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    const analyzer = extension.getProseAnalyzer();

    const analyzeAll = args.flags['all'] as boolean | undefined;

    if (analyzeAll) {
      const results = await analyzer.analyzeAll();
      if (results.length === 0) {
        output.info('No chapter files found.');
        return;
      }
      output.heading('Prose Analysis — All Chapters');
      output.newline();
      for (const result of results) {
        output.info(`── ${result.chapterFile} ─────────────────────────`);
        renderSummary(result, output);
        output.newline();
        renderChecks(result.checks, output);
      }
    } else {
      const filePath = resolveChapterFile(args, projectPath, output);
      if (!filePath) return;
      const result = await analyzer.analyzeChapter(filePath);
      output.heading(`Prose Analysis — ${result.chapterFile}`);
      output.newline();
      renderSummary(result, output);
      output.newline();
      renderChecks(result.checks, output);
    }
  } catch (err) {
    output.error(`Prose analysis failed: ${(err as Error).message}`);
  }
}

async function handleSentences(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    const analyzer = extension.getProseAnalyzer();

    const filePath = resolveChapterFile(args, projectPath, output);
    if (!filePath) return;

    const result = await analyzer.analyzeChapter(filePath);
    const sentenceChecks = result.checks.filter((c) => c.type === 'sentence_monotony');

    output.heading(`Sentence Rhythm — ${result.chapterFile}`);
    output.newline();
    renderChecks(sentenceChecks, output);
  } catch (err) {
    output.error(`Sentence analysis failed: ${(err as Error).message}`);
  }
}

async function handleDialogue(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    const analyzer = extension.getProseAnalyzer();

    const filePath = resolveChapterFile(args, projectPath, output);
    if (!filePath) return;

    const result = await analyzer.analyzeDialogue(filePath);

    output.heading(`Dialogue Analysis — ${result.chapterFile}`);
    output.newline();
    output.info(`  Dialogue: ${result.dialoguePercent.toFixed(1)}% of text`);
    output.newline();
    renderChecks(result.checks, output);
  } catch (err) {
    output.error(`Dialogue analysis failed: ${(err as Error).message}`);
  }
}

// ─── Read-aloud sub-command handlers (CRAFT-05) ───────────────────────────────

/**
 * Handle `analyze read-aloud --chapter N`
 *
 * Strips markup from the chapter, displays the clean text, and lists any
 * rhythm or rhyme flags.
 */
async function handleReadAloud(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const filePath = resolveChapterFile(args, projectPath, output);
    if (!filePath) return;

    // Derive relative path from projectPath so ReadAloudPreparer can join correctly
    const relPath = filePath.startsWith(projectPath)
      ? filePath.slice(projectPath.length).replace(/^[/\\]/, '')
      : filePath;

    const preparer = new ReadAloudPreparer(projectPath);
    const result = await preparer.prepareChapter(relPath);

    output.heading('Read-Aloud Preparation');
    output.newline();
    output.info(
      `  Words: ${result.wordCount}  |  Estimated reading time: ${result.estimatedMinutes} min`
    );
    output.newline();

    output.info('── Clean Text ────────────────────────────');
    output.dim(result.cleanText);
    output.newline();

    output.info('── Rhythm Flags ──────────────────────────');
    if (result.rhythmFlags.length === 0) {
      output.success('No rhythm issues detected.');
    } else {
      for (const flag of result.rhythmFlags) {
        output.warning(`  L${flag.paragraphStart}: ${flag.note}`);
      }
    }
    output.newline();

    output.info('── Rhyme Flags ───────────────────────────');
    if (result.rhymeFlags.length === 0) {
      output.success('No unintentional rhymes detected.');
    } else {
      for (const flag of result.rhymeFlags) {
        output.warning(
          `  L${flag.lineA} / L${flag.lineB}: "${flag.words[0]}" / "${flag.words[1]}"`
        );
      }
    }
  } catch (err) {
    output.error(`Read-aloud preparation failed: ${(err as Error).message}`);
  }
}

/**
 * Handle `analyze rhythm --chapter N`
 *
 * Displays only the rhythm flags (monotony detection) for the chapter.
 */
async function handleRhythm(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const filePath = resolveChapterFile(args, projectPath, output);
    if (!filePath) return;

    const relPath = filePath.startsWith(projectPath)
      ? filePath.slice(projectPath.length).replace(/^[/\\]/, '')
      : filePath;

    const preparer = new ReadAloudPreparer(projectPath);
    const result = await preparer.prepareChapter(relPath);

    output.heading('Rhythm Analysis');
    output.newline();

    if (result.rhythmFlags.length === 0) {
      output.success('No sentence-length monotony detected.');
    } else {
      for (const flag of result.rhythmFlags) {
        output.warning(`  L${flag.paragraphStart}: ${flag.note}`);
      }
    }
  } catch (err) {
    output.error(`Rhythm analysis failed: ${(err as Error).message}`);
  }
}

// ─── Developmental revision sub-command handlers (PROC-04) ───────────────────

/**
 * Load the project ID for the given project path by querying the database.
 */
async function loadProjectIdFromPath(
  extension: NovelWriterExtension,
  _projectPath: string
): Promise<void> {
  const mcpClient = (extension as any).mcpClient;
  const result = await mcpClient.readQuery(
    'SELECT id FROM projects ORDER BY id LIMIT 1',
    []
  );
  if (result.length === 0) {
    throw new Error('Project not found in database. Run `novel-writer init` first.');
  }
  extension.setProjectId(result[0].id);
}

/**
 * Handle `analyze scenes --purpose`
 *
 * Lists all scenes in the project with a flag for those lacking a `purpose`
 * field.
 */
async function handleScenes(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  if (!requireProject(projectPath, output)) return;
  try {
    const extension = new NovelWriterExtension(projectPath);
    await loadProjectIdFromPath(extension, projectPath);

    const mcpClient = (extension as any).mcpClient;
    const projectId = String((extension as any).projectId);

    const analyzer = new DevelopmentalAnalyzer(mcpClient);
    const audits = await analyzer.auditScenePurposes(projectId);

    if (audits.length === 0) {
      output.info('No scenes found.');
      return;
    }

    const auditFlag = args.flags['purpose'] as boolean | undefined;

    output.heading('Scene Purpose Audit');
    output.newline();

    const filtered = auditFlag ? audits.filter((a) => !a.hasPurpose) : audits;

    if (filtered.length === 0) {
      output.success('All scenes have a declared purpose.');
      return;
    }

    const rows = filtered.map((a) => ({
      'Chapter': a.chapterTitle || `(ch ${a.chapterId})`,
      'Scene': a.sceneTitle || `(scene ${a.sceneId})`,
      'Purpose': a.purpose ?? '—',
      'OK?': a.hasPurpose ? '✓' : '✗ MISSING',
    }));

    output.table(rows);

    const missing = audits.filter((a) => !a.hasPurpose).length;
    if (missing > 0) {
      output.newline();
      output.warning(`${missing} of ${audits.length} scene(s) are missing a purpose declaration.`);
    }
  } catch (err) {
    output.error(`Scene purpose audit failed: ${(err as Error).message}`);
  }
}

/**
 * Handle `analyze subplots`
 *
 * Counts beats per plot thread and flags threads with fewer than 3 beats.
 */
async function handleSubplots(
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  if (!requireProject(projectPath, output)) return;
  try {
    const extension = new NovelWriterExtension(projectPath);
    await loadProjectIdFromPath(extension, projectPath);

    const mcpClient = (extension as any).mcpClient;
    const projectId = String((extension as any).projectId);

    const analyzer = new DevelopmentalAnalyzer(mcpClient);
    const balance = await analyzer.analyzeSubplotBalance(projectId);

    output.heading('Subplot Balance');
    output.newline();

    if (balance.length === 0) {
      output.info('No plot threads found.');
      return;
    }

    const rows = balance.map((b) => ({
      'Thread': b.title || `(thread ${b.plotThreadId})`,
      'Beats': b.sceneCount,
      'Flag': b.flag ? '⚠ UNDERDEVELOPED' : '',
    }));

    output.table(rows);

    const flagged = balance.filter((b) => b.flag).length;
    if (flagged > 0) {
      output.newline();
      output.warning(`${flagged} thread(s) have fewer than 3 beats and may be underdeveloped.`);
    } else {
      output.newline();
      output.success('All plot threads have 3 or more beats.');
    }
  } catch (err) {
    output.error(`Subplot balance analysis failed: ${(err as Error).message}`);
  }
}

/**
 * Handle `analyze plot-holes`
 *
 * Finds open plot threads with no beats in the last 3 chapters.
 */
async function handlePlotHoles(
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  if (!requireProject(projectPath, output)) return;
  try {
    const extension = new NovelWriterExtension(projectPath);
    await loadProjectIdFromPath(extension, projectPath);

    const mcpClient = (extension as any).mcpClient;
    const projectId = String((extension as any).projectId);

    const analyzer = new DevelopmentalAnalyzer(mcpClient);
    const holes = await analyzer.findPlotHoles(projectId);

    output.heading('Potential Plot Holes');
    output.newline();

    if (holes.length === 0) {
      output.success('No plot holes detected. All open threads have recent activity.');
      return;
    }

    const rows = holes.map((h) => ({
      'Thread': h.title || `(thread ${h.threadId})`,
      'Last chapter': h.lastChapter != null ? String(h.lastChapter) : '(none)',
      'Open since': h.openSince ?? '—',
    }));

    output.table(rows);
    output.newline();
    output.warning(
      `${holes.length} open thread(s) have no beats in the last 3 chapters.`
    );
  } catch (err) {
    output.error(`Plot-hole detection failed: ${(err as Error).message}`);
  }
}

// ─── CRAFT-03: Dialogue reader ────────────────────────────────────────────────

/**
 * Handle `analyze dialogue-reader --chapter N`
 *
 * Reads the chapter file and outputs ONLY the dialogue, grouped by character
 * and stripped of all surrounding prose.
 *
 * Format:
 *   [CHARACTER NAME]
 *   "dialogue line"
 *   "next line"
 */
async function handleDialogueReader(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const { readFile } = await import('fs/promises');
    const filePath = resolveChapterFile(args, projectPath, output);
    if (!filePath) return;

    const extension = new NovelWriterExtension(projectPath);
    const analyzer = extension.getProseAnalyzer();

    const raw = await readFile(filePath, 'utf-8');
    const byChar = analyzer.extractDialogueByCharacter(raw);

    if (byChar.size === 0) {
      output.info('No dialogue found in this chapter.');
      return;
    }

    output.heading('Dialogue Reader');
    output.newline();

    for (const [speaker, lines] of byChar) {
      output.info(`[${speaker.toUpperCase()}]`);
      for (const line of lines) {
        output.info(`"${line}"`);
      }
      output.newline();
    }
  } catch (err) {
    output.error(`Dialogue reader failed: ${(err as Error).message}`);
  }
}

// ─── PROC-05: Sensory balance ─────────────────────────────────────────────────

/**
 * Handle `analyze sensory --chapter N`
 *
 * Shows sensory word counts by category and warns if the scene is
 * visually-dominant (> 80% visual when total > 10).
 */
async function handleSensory(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const { readFile } = await import('fs/promises');
    const filePath = resolveChapterFile(args, projectPath, output);
    if (!filePath) return;

    const extension = new NovelWriterExtension(projectPath);
    const analyzer = extension.getProseAnalyzer();

    const raw = await readFile(filePath, 'utf-8');
    const result = analyzer.analyzeSensoryBalance(raw);

    output.heading('Sensory Balance');
    output.newline();

    const rows = [
      { Sense: 'Visual',    Count: result.visual },
      { Sense: 'Auditory',  Count: result.auditory },
      { Sense: 'Tactile',   Count: result.tactile },
      { Sense: 'Olfactory', Count: result.olfactory },
      { Sense: 'Gustatory', Count: result.gustatory },
    ];
    output.table(rows);
    output.newline();

    if (result.flag) {
      output.warning(
        'Scene relies almost exclusively on visual sense (> 80% of sensory words). ' +
        'Consider adding auditory, tactile, or other sensory detail.'
      );
    } else {
      output.success('Sensory balance looks good.');
    }
  } catch (err) {
    output.error(`Sensory analysis failed: ${(err as Error).message}`);
  }
}

// ─── PROC-05: Show vs Tell ────────────────────────────────────────────────────

/**
 * Handle `analyze show-tell --chapter N`
 *
 * Reports show/tell ratio and lists example matches.
 */
async function handleShowTell(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const { readFile } = await import('fs/promises');
    const filePath = resolveChapterFile(args, projectPath, output);
    if (!filePath) return;

    const extension = new NovelWriterExtension(projectPath);
    const analyzer = extension.getProseAnalyzer();

    const raw = await readFile(filePath, 'utf-8');
    const result = analyzer.analyzeShowVsTell(raw);

    output.heading('Show vs Tell');
    output.newline();

    output.info(`  Show score: ${result.showScore}`);
    output.info(`  Tell score: ${result.tellScore}`);
    output.info(`  Show ratio: ${(result.ratio * 100).toFixed(1)}%`);
    output.newline();

    if (result.ratio < 0.5 && (result.showScore + result.tellScore) > 0) {
      output.warning('More "telling" than "showing" detected. Consider converting state-of-being descriptions to action beats.');
    } else if (result.showScore + result.tellScore === 0) {
      output.info('No show/tell indicators detected.');
    } else {
      output.success('Good show/tell balance.');
    }

    if (result.examples.length > 0) {
      output.newline();
      output.info('── Examples ─────────────────────────────────');
      for (const ex of result.examples) {
        const label = ex.type === 'show' ? '[SHOW]' : '[TELL]';
        output.info(`  ${label} "${ex.text}"`);
      }
    }
  } catch (err) {
    output.error(`Show/tell analysis failed: ${(err as Error).message}`);
  }
}

// ─── Style-target sub-command handler ────────────────────────────────────────

/**
 * Handle `analyze style --chapter N | --all`
 *
 * Measures a chapter's quantitative prose metrics and grades each against the
 * project's `style-targets.yml` (or built-in defaults).
 */
async function handleStyleTargets(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const analyzer = new StyleTargetAnalyzer(projectPath);

    let reports: StyleTargetReport[];
    if (args.flags['all']) {
      reports = await analyzer.analyzeAll();
      if (reports.length === 0) {
        output.info('No chapter files found in chapters/.');
        return;
      }
    } else {
      const filePath = resolveChapterFile(args, projectPath, output);
      if (!filePath) return;
      reports = [await analyzer.analyzeChapter(filePath)];
    }

    const sourceNote = reports[0].source === 'file'
      ? 'targets: style-targets.yml'
      : 'targets: built-in defaults (add style-targets.yml to customise)';

    for (const report of reports) {
      output.heading(`Style Targets — ${report.chapter}`);
      output.dim(`${report.wordCount} words · ${report.sentenceCount} sentences · ${sourceNote}`);
      output.newline();

      const rows = report.metrics.map((m) => ({
        Metric: m.note ? `${m.label} (${m.note})` : m.label,
        Measured: m.measured === null ? '—' : `${m.measured} ${m.unit}`,
        Target: formatTarget(m.min, m.max),
        Status: statusIcon(m.status),
      }));
      output.table(rows);
      output.newline();

      if (report.warnings === 0) {
        output.success('All measured metrics are within their target bands.');
      } else {
        output.warning(`${report.warnings} metric${report.warnings === 1 ? '' : 's'} outside target. See ⚠ rows above.`);
      }
      output.newline();
    }
  } catch (err) {
    output.error(`Style-target analysis failed: ${(err as Error).message}`);
  }
}

/** Format a target band for display, e.g. "12–25", "≤ 8", "≥ 70", or "—". */
function formatTarget(min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) return `${min}–${max}`;
  if (min !== undefined) return `≥ ${min}`;
  if (max !== undefined) return `≤ ${max}`;
  return '—';
}

/** Map a metric status to a compact display icon. */
function statusIcon(status: 'ok' | 'low' | 'high' | 'na'): string {
  switch (status) {
    case 'ok': return '✓';
    case 'low': return '⚠ low';
    case 'high': return '⚠ high';
    default: return '—';
  }
}

// ─── VOICE: manuscript-level character voice analysis ─────────────────────────

/**
 * Handle `analyze voice [--character "Name"]`
 *
 * Runs VoiceAnalyzer across the whole manuscript and reports per-character
 * voice fingerprints, too-similar voice pairs, and voices that drift across
 * chapters. With --character, narrows the per-character section to one name.
 */
async function handleVoice(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const focus = args.flags['character'] as string | undefined;
    const report: VoiceReport = await new VoiceAnalyzer(projectPath).analyzeManuscript();

    if (report.characters.length === 0) {
      output.info('No character dialogue found in chapters/. Add chapters with attributed dialogue first.');
      return;
    }

    output.heading('Character Voice Analysis');
    output.newline();

    const shown = focus
      ? report.characters.filter((c) => c.character.toLowerCase() === focus.toLowerCase())
      : report.characters;

    if (focus && shown.length === 0) {
      output.warning(`No measured voice for "${focus}". Known characters: ${report.characters.map((c) => c.character).join(', ')}`);
      return;
    }

    output.info('── Voice Fingerprints ────────────────────');
    const rows = shown.map((c) => ({
      Character: c.character,
      Lines: c.lineCount,
      Chapters: c.chapterCount,
      'Avg sentence': `${c.fingerprint.avgSentenceLength} w`,
      'Avg word': `${c.fingerprint.avgWordLength} ch`,
      'Lexical variety': c.fingerprint.typeTokenRatio.toFixed(2),
    }));
    output.table(rows);
    output.newline();

    output.info('── Voices That Sound Alike ───────────────');
    const similar = focus
      ? report.similarPairs.filter(
          (p) => p.a.toLowerCase() === focus.toLowerCase() || p.b.toLowerCase() === focus.toLowerCase()
        )
      : report.similarPairs;
    if (similar.length === 0) {
      output.success('No two characters sound too alike.');
    } else {
      for (const p of similar) {
        output.warning(`  ${p.a} ↔ ${p.b}  (distance ${p.distance}; lower = more alike)`);
      }
      output.dim('  Differentiate their sentence length, word choice, or verbal tics.');
    }
    output.newline();

    output.info('── Voices That Drift Across Chapters ─────');
    const drifting = focus
      ? report.drifting.filter((d) => d.character.toLowerCase() === focus.toLowerCase())
      : report.drifting;
    if (drifting.length === 0) {
      output.success('No character voice drifts noticeably across chapters.');
    } else {
      for (const d of drifting) {
        const chs = d.outlierChapters.length > 0 ? ` [${d.outlierChapters.join(', ')}]` : '';
        output.warning(`  ${d.character}  (max deviation ${d.maxDistance})${chs}`);
      }
      output.dim('  Re-read the flagged chapters to keep the character sounding consistent.');
    }
  } catch (err) {
    output.error(`Voice analysis failed: ${(err as Error).message}`);
  }
}

/**
 * Collect canonical character names from characters/*.yml (the `name` and
 * `fullName` fields). File-based — works without the DB/MCP server running.
 */
async function loadKnownCharacterNames(projectPath: string): Promise<string[]> {
  const dir = join(projectPath, 'characters');
  const names = new Set<string>();
  try {
    const { readdir, readFile } = await import('fs/promises');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    for (const file of files) {
      try {
        const data = YAML.parse(await readFile(join(dir, file), 'utf-8')) as
          | { name?: string; fullName?: string }
          | null;
        if (data?.name) names.add(data.name);
        if (data?.fullName) names.add(data.fullName);
      } catch {
        // Skip unreadable / malformed YAML — name checking is best-effort.
      }
    }
  } catch {
    // No characters/ dir yet — nothing to check against.
  }
  return [...names];
}

// ─── Copy-edit sub-command handler (PROC-06) ─────────────────────────────────

/**
 * Handle `analyze copy --chapter N [--pov "Name"] [--tense past|present]`
 *
 * Runs CopyEditor checks on the specified chapter file.
 */
async function handleCopyEdit(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const filePath = resolveChapterFile(args, projectPath, output);
    if (!filePath) return;

    const povCharacter = args.flags['pov'] as string | undefined;

    // Tense: explicit flag wins, else fall back to the project's style target.
    const tenseRaw = args.flags['tense'] as string | undefined;
    const targetTense = loadStyleTargets(projectPath).targets.tense ?? undefined;
    const tenseValue = tenseRaw ?? targetTense;
    const expectedTense: 'past' | 'present' | undefined =
      tenseValue === 'past' || tenseValue === 'present' ? tenseValue : undefined;

    // Known names from characters/*.yml — drives the misspelled-name check.
    const knownNames = await loadKnownCharacterNames(projectPath);

    const editor = new CopyEditor(projectPath);
    const result = await editor.analyzeChapter(filePath, {
      povCharacter,
      expectedTense,
      knownNames,
    });

    output.heading(`Copy Edit — ${result.chapterFile}`);
    if (expectedTense && !tenseRaw) output.dim(`(expected tense "${expectedTense}" from style-targets.yml)`);
    if (knownNames.length > 0) output.dim(`(checking ${knownNames.length} known names from characters/)`);
    output.newline();

    if (result.issues.length === 0) {
      output.success('No copy-editing issues detected.');
      return;
    }

    const byType: Record<string, typeof result.issues> = {};
    for (const issue of result.issues) {
      (byType[issue.type] ??= []).push(issue);
    }

    for (const [type, issues] of Object.entries(byType)) {
      output.info(`── ${type.replace(/_/g, ' ').toUpperCase()} (${issues.length}) ─────────────────────────`);
      for (const issue of issues) {
        const severity = issue.severity === 'error' ? '[ERROR]' : '[WARN]';
        output.info(`  ${severity} L${issue.line}: "${issue.text.slice(0, 80)}"`);
        output.dim(`    ${issue.note}`);
      }
      output.newline();
    }
  } catch (err) {
    output.error(`Copy-edit analysis failed: ${(err as Error).message}`);
  }
}
