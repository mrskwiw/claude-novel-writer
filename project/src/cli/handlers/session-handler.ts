/**
 * Session Command Handlers
 * Handles writing session tracking and progress display
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import { NovelWriterExtension } from '../../index.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';

export async function handleSessionCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0] ?? 'progress';

  // Map 'novel progress' to progress display
  if (args.command === 'progress') {
    await handleProgress(args, projectPath, output);
    return;
  }

  switch (subcommand) {
    case 'start':
      await handleSessionStart(args, projectPath, output);
      break;
    case 'end':
      await handleSessionEnd(args, projectPath, output);
      break;
    case 'stats':
      await handleSessionStats(args, projectPath, output);
      break;
    default:
      await handleProgress(args, projectPath, output);
  }
}

/**
 * Handle session start command
 */
async function handleSessionStart(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    // Check if project initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    const sessionManager = await extension.getSessionManager();

    // Get session type (default: drafting)
    const sessionType = (args.flags.type as string) || 'drafting';
    if (!['drafting', 'revising', 'planning', 'editing'].includes(sessionType)) {
      output.error(
        'Invalid session type. Use: drafting, revising, planning, or editing'
      );
      return;
    }

    // Get mood (optional)
    const moodBefore = args.flags.mood as number | undefined;
    if (moodBefore && (moodBefore < 1 || moodBefore > 5)) {
      output.error('Mood must be between 1 and 5');
      return;
    }

    // Get notes (optional)
    const notes = args.flags.notes as string | undefined;

    // Pre-writing ritual checklist (Morrison / Hemingway principle)
    const showRitual = args.flags.ritual === true;
    if (showRitual) {
      output.info('═══════════════════════════════════════');
      output.info('  Pre-Writing Ritual Checklist');
      output.info('═══════════════════════════════════════');
      output.info('  □  Silence notifications');
      output.info('  □  Open your manuscript');
      output.info('  □  Review last session\'s stop-note');
      output.info('  □  Read the last paragraph you wrote');
      output.info('  □  Set your intention for this session');
      output.info('  □  Begin');
      output.info('═══════════════════════════════════════');
      output.info('Press Enter to start your session...');
      output.newline();
    }

    // Pomodoro-style timer display
    const timerMinutes = args.flags.timer as number | undefined;
    if (timerMinutes !== undefined && timerMinutes > 0) {
      output.info(`⏱  Focus timer: ${timerMinutes} minutes — return to your manuscript`);
      output.newline();
    }

    // Start session
    const sessionId = await sessionManager.startSession({
      sessionType: sessionType as 'drafting' | 'revising' | 'planning' | 'editing',
      moodBefore,
      notes,
    });

    // Persist ritual and timer metadata
    if (showRitual) {
      await sessionManager.markRitualCompleted(sessionId);
    }
    if (timerMinutes !== undefined && timerMinutes > 0) {
      await sessionManager.setTimerMinutes(sessionId, timerMinutes);
    }

    output.success(`Writing session started! (ID: ${sessionId})`);
    output.info(`Session type: ${sessionType}`);
    if (moodBefore) {
      output.dim(`Mood before: ${getMoodEmoji(moodBefore)} (${moodBefore}/5)`);
    }
    if (notes) {
      output.dim(`Notes: ${notes}`);
    }
    output.newline();

    // Display last stop note (Hemingway technique)
    const lastStopNote = await sessionManager.getLastStopNote();
    if (lastStopNote) {
      output.info('═══════════════════════════════════════');
      output.info(`  Last session note: "${lastStopNote}"`);
      output.info('═══════════════════════════════════════');
      output.newline();
    }

    // Display the last paragraph written from the most recent chapter
    const lastParagraph = await getLastParagraphFromChapters(projectPath);
    if (lastParagraph) {
      output.info('═══ Last paragraph written ════════════════════════');
      const truncated = lastParagraph.length > 200
        ? lastParagraph.slice(0, 197) + '...'
        : lastParagraph;
      output.dim(`${truncated}`);
      output.info('═══════════════════════════════════════');
      output.newline();
    }

    output.info('Happy writing! Use `/novel session end` when finished.');
  } catch (error) {
    output.error(`Failed to start session: ${(error as Error).message}`);
  }
}

/**
 * Handle session end command
 */
async function handleSessionEnd(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    // Check if project initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    const sessionManager = await extension.getSessionManager();

    // Get mood after (optional)
    const moodAfter = args.flags.mood as number | undefined;
    if (moodAfter && (moodAfter < 1 || moodAfter > 5)) {
      output.error('Mood must be between 1 and 5');
      return;
    }

    // Get notes (optional)
    const notes = args.flags.notes as string | undefined;

    // Get stop note (Hemingway technique) — written to stop_note column
    const stopNote = args.flags.note as string | undefined;

    // Check if chapters directory exists
    const chaptersPath = join(projectPath, 'chapters');
    const hasChapters = existsSync(chaptersPath);

    // End session
    const metrics = await sessionManager.endSession({
      moodAfter,
      notes,
      chaptersPath: hasChapters ? chaptersPath : undefined,
    });

    // If a stop note was supplied, persist it via endSessionById
    if (stopNote !== undefined) {
      await sessionManager.endSessionById(metrics.sessionId, stopNote);
    }

    output.success('Session ended!');

    // Confirm stop note was saved
    if (stopNote !== undefined) {
      output.dim(`Stop note saved: "${stopNote}"`);
    }
    output.newline();

    // Display session metrics
    output.info('📊 Session Summary:');
    output.dim(`  Duration: ${formatDuration(metrics.duration)}`);
    output.dim(`  Words written: ${metrics.wordsWritten.toLocaleString()}`);
    output.dim(
      `  Velocity: ${metrics.wordsPerMinute.toFixed(1)} words/min`
    );

    if (metrics.chapterCount > 0) {
      output.dim(`  Chapters touched: ${metrics.chapterCount}`);
    }

    if (metrics.moodChange !== undefined) {
      const change = metrics.moodChange > 0 ? '+' : '';
      const emoji = metrics.moodChange > 0 ? '😊' : metrics.moodChange < 0 ? '😔' : '😐';
      output.dim(`  Mood change: ${change}${metrics.moodChange} ${emoji}`);
    }

    output.newline();

    // Show streak update
    const streak = await sessionManager.calculateStreak();
    if (streak.current > 0) {
      const streakEmoji = getStreakEmoji(streak.current);
      output.success(`${streakEmoji} Current streak: ${streak.current} day${streak.current !== 1 ? 's' : ''}!`);
    }
  } catch (error) {
    output.error(`Failed to end session: ${(error as Error).message}`);
  }
}

/**
 * Handle session stats command
 */
async function handleSessionStats(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    // Check if project initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    const sessionManager = await extension.getSessionManager();

    // Get days filter (optional)
    const days = args.flags.days as number | undefined;

    // Get summary
    const summary = await sessionManager.getSummary(days);

    output.info('=== 📈 Session Statistics ===\n');

    // Overall stats
    output.info('📊 Overall:');
    output.dim(`  Total sessions: ${summary.totalSessions}`);
    output.dim(`  Total words: ${summary.totalWords.toLocaleString()}`);
    output.dim(`  Total time: ${formatDuration(summary.totalMinutes)}`);
    output.newline();

    // Averages
    if (summary.totalSessions > 0) {
      output.info('📉 Averages:');
      output.dim(`  Words per session: ${summary.averageWordsPerSession}`);
      output.dim(`  Words per minute: ${summary.averageWordsPerMinute}`);
      output.newline();
    }

    // Streaks
    output.info('🔥 Streaks:');
    if (summary.currentStreak > 0) {
      const emoji = getStreakEmoji(summary.currentStreak);
      output.success(`  ${emoji} Current: ${summary.currentStreak} day${summary.currentStreak !== 1 ? 's' : ''}`);
    } else {
      output.warning('  No current streak');
    }
    output.dim(`  Longest: ${summary.longestStreak} day${summary.longestStreak !== 1 ? 's' : ''}`);
    output.newline();

    // Recent activity
    output.info('📅 Recent Activity:');
    output.dim(`  This week: ${summary.sessionsThisWeek} sessions, ${summary.wordsThisWeek.toLocaleString()} words`);
    output.dim(`  This month: ${summary.sessionsThisMonth} sessions, ${summary.wordsThisMonth.toLocaleString()} words`);

    if (summary.lastSessionDate) {
      output.dim(`  Last session: ${formatDate(summary.lastSessionDate)}`);
    }
  } catch (error) {
    output.error(`Failed to get session stats: ${(error as Error).message}`);
  }
}

/**
 * Handle progress dashboard display
 */
async function handleProgress(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    // Check if project initialized
    const dbPath = join(projectPath, '.novel', 'data.db');
    if (!existsSync(dbPath)) {
      output.error('Project not initialized. Run `/novel init` first.');
      return;
    }

    const extension = new NovelWriterExtension(projectPath);
    const dashboard = await extension.getProgressDashboard();
    const sessionManager = await extension.getSessionManager();

    // Get display options from flags
    const options = {
      showStreak: args.flags.streak !== false,
      showVelocity: args.flags.velocity !== false,
      showRecentSessions: args.flags.recent !== false,
      showMilestones: args.flags.milestones === true,
      compact: args.flags.compact === true,
    };

    await dashboard.display(output, options);

    // Motivational streak message
    const streak = await sessionManager.calculateStreak();
    if (streak.current > 0) {
      output.newline();
      output.success(`💪 ${streak.current}-day streak! "You must finish. The world needs your story." — Anne Rice`);
    }
  } catch (error) {
    output.error(`Failed to show progress: ${(error as Error).message}`);
  }
}

/**
 * Get streak emoji based on streak length
 */
function getStreakEmoji(streak: number): string {
  if (streak >= 30) return '🔥🔥🔥';
  if (streak >= 14) return '🔥🔥';
  if (streak >= 7) return '🔥';
  if (streak >= 3) return '⚡';
  return '✨';
}

/**
 * Get mood emoji
 */
function getMoodEmoji(mood: number): string {
  if (mood >= 5) return '😄';
  if (mood >= 4) return '😊';
  if (mood >= 3) return '😐';
  if (mood >= 2) return '😟';
  return '😔';
}

/**
 * Format duration in human-readable form
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${mins} min`;
}

/**
 * Format date as readable string
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateOnly = (d: Date) => d.toISOString().split('T')[0];

  if (dateOnly(date) === dateOnly(today)) {
    return 'Today';
  }

  if (dateOnly(date) === dateOnly(yesterday)) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Read the last non-empty paragraph from the most recently modified chapter
 * Markdown file in `<projectPath>/chapters/`.
 *
 * Returns null if no chapters directory or files are found.
 */
async function getLastParagraphFromChapters(projectPath: string): Promise<string | null> {
  const { readdir, stat } = await import('fs/promises');
  const { join } = await import('path');

  const chaptersDir = join(projectPath, 'chapters');
  if (!existsSync(chaptersDir)) return null;

  let files: string[];
  try {
    const entries = await readdir(chaptersDir);
    files = entries.filter((f) => /\.(md|markdown)$/i.test(f));
  } catch {
    return null;
  }

  if (files.length === 0) return null;

  // Find the most recently modified chapter file
  let latestFile = '';
  let latestMtime = 0;

  for (const file of files) {
    const filePath = join(chaptersDir, file);
    try {
      const stats = await stat(filePath);
      if (stats.mtimeMs > latestMtime) {
        latestMtime = stats.mtimeMs;
        latestFile = filePath;
      }
    } catch {
      // Skip unreadable files
    }
  }

  if (!latestFile) return null;

  let content: string;
  try {
    content = await readFile(latestFile, 'utf-8');
  } catch {
    return null;
  }

  // Strip YAML frontmatter
  const stripped = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  if (!stripped) return null;

  // Split on double newlines to get paragraphs
  const paragraphs = stripped
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return null;

  return paragraphs[paragraphs.length - 1];
}
