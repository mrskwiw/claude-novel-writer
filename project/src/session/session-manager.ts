/**
 * Writing Session Manager
 * Tracks writing sessions, streaks, velocity, and motivation metrics
 */

import type { MCPClient } from '../core/database.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

export interface WritingSession {
  id: number;
  projectId: number;
  sessionDate: string; // YYYY-MM-DD
  startTime?: string; // ISO datetime
  endTime?: string; // ISO datetime
  wordsWritten: number;
  chaptersTouched?: number[]; // Chapter IDs
  sessionType: 'drafting' | 'revising' | 'planning' | 'editing';
  notes?: string; // Hemingway stop point
  moodBefore?: number; // 1-5
  moodAfter?: number; // 1-5
  createdAt: string;
}

export interface SessionSummary {
  totalSessions: number;
  totalWords: number;
  totalMinutes: number;
  averageWordsPerSession: number;
  averageWordsPerMinute: number;
  currentStreak: number; // Days
  longestStreak: number; // Days
  lastSessionDate?: string;
  sessionsThisWeek: number;
  sessionsThisMonth: number;
  wordsThisWeek: number;
  wordsThisMonth: number;
}

export interface SessionMetrics {
  sessionId: number;
  duration: number; // Minutes
  wordsWritten: number;
  wordsPerMinute: number;
  chapterCount: number;
  moodChange?: number; // After - Before
}

export interface Streak {
  current: number; // Current streak days
  longest: number; // Longest streak ever
  lastSessionDate?: string;
  streakStartDate?: string;
}

// ─── DB row types ─────────────────────────────────────────────────────────────

interface SessionRow {
  id: number;
  project_id: number;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  words_written: number;
  chapters_touched: string | null;
  session_type: string;
  notes: string | null;
  mood_before: number | null;
  mood_after: number | null;
  created_at: string;
}

interface AggRow {
  total_sessions: number;
  total_words: number;
  total_minutes: number;
  sessions: number;
  words: number;
  session_date: string;
}

interface IdRow { id: number; }
interface DateRow { session_date: string; }

// ─────────────────────────────────────────────────────────────────────────────

export class SessionManager {
  constructor(
    private mcpClient: MCPClient,
    private projectId: number
  ) {}

  /**
   * Start a new writing session
   */
  async startSession(options: {
    sessionType: WritingSession['sessionType'];
    moodBefore?: number;
    notes?: string;
  }): Promise<number> {
    const today = this.getTodayDate();
    const now = new Date().toISOString();

    // Check if session already exists for today
    const existingQuery = `
      SELECT id FROM writing_sessions
      WHERE project_id = ? AND session_date = ?
    `;
    const existing = await this.mcpClient.readQuery<IdRow>(existingQuery, [
      this.projectId,
      today,
    ]);

    if (existing.length > 0) {
      // Update existing session
      const updateQuery = `
        UPDATE writing_sessions
        SET start_time = ?,
            session_type = ?,
            mood_before = ?,
            notes = ?
        WHERE id = ?
      `;

      await this.mcpClient.writeQuery(updateQuery, [
        now,
        options.sessionType,
        options.moodBefore || null,
        options.notes || null,
        existing[0].id,
      ]);

      return existing[0].id;
    }

    // Create new session
    const insertQuery = `
      INSERT INTO writing_sessions (
        project_id, session_date, start_time, session_type,
        mood_before, notes, words_written
      ) VALUES (?, ?, ?, ?, ?, ?, 0)
    `;

    await this.mcpClient.writeQuery(insertQuery, [
      this.projectId,
      today,
      now,
      options.sessionType,
      options.moodBefore || null,
      options.notes || null,
    ]);

    // Get inserted ID
    const idQuery = 'SELECT last_insert_rowid() as id';
    const result = await this.mcpClient.readQuery<IdRow>(idQuery, []);
    return result[0].id;
  }

  /**
   * End current writing session
   */
  async endSession(options: {
    moodAfter?: number;
    notes?: string;
    chaptersPath?: string; // Path to chapters directory
  }): Promise<SessionMetrics> {
    const today = this.getTodayDate();
    const now = new Date().toISOString();

    // Get today's session
    const sessionQuery = `
      SELECT id, start_time, words_written, chapters_touched
      FROM writing_sessions
      WHERE project_id = ? AND session_date = ?
    `;
    const sessions = await this.mcpClient.readQuery<SessionRow>(sessionQuery, [
      this.projectId,
      today,
    ]);

    if (sessions.length === 0) {
      throw new Error('No active session found for today');
    }

    const session = sessions[0];

    // Calculate words written if chapters path provided
    let wordsWritten = session.words_written || 0;
    let chaptersTouched: number[] = [];

    if (options.chaptersPath && existsSync(options.chaptersPath) && session.start_time) {
      const result = await this.calculateWordsWritten(
        options.chaptersPath,
        session.start_time
      );
      wordsWritten = result.wordsWritten;
      chaptersTouched = result.chapterIds;
    }

    // Update session
    const updateQuery = `
      UPDATE writing_sessions
      SET end_time = ?,
          words_written = ?,
          chapters_touched = ?,
          mood_after = ?,
          notes = ?
      WHERE id = ?
    `;

    await this.mcpClient.writeQuery(updateQuery, [
      now,
      wordsWritten,
      JSON.stringify(chaptersTouched),
      options.moodAfter || null,
      options.notes || session.notes || null,
      session.id,
    ]);

    // Calculate metrics
    const duration = session.start_time
      ? this.calculateDuration(session.start_time, now)
      : 0;

    return {
      sessionId: session.id,
      duration,
      wordsWritten,
      wordsPerMinute: duration > 0 ? wordsWritten / duration : 0,
      chapterCount: chaptersTouched.length,
      moodChange: options.moodAfter && session.mood_before
        ? options.moodAfter - session.mood_before
        : undefined,
    };
  }

  /**
   * Get session summary statistics
   */
  async getSummary(days?: number): Promise<SessionSummary> {
    const since = days
      ? this.getDateDaysAgo(days)
      : '1970-01-01'; // All time

    // Get sessions
    const sessionsQuery = `
      SELECT
        COUNT(*) as total_sessions,
        COALESCE(SUM(words_written), 0) as total_words,
        session_date
      FROM writing_sessions
      WHERE project_id = ? AND session_date >= ?
    `;
    const sessions = await this.mcpClient.readQuery<AggRow>(sessionsQuery, [
      this.projectId,
      since,
    ]);

    const totalSessions = sessions[0]?.total_sessions || 0;
    const totalWords = sessions[0]?.total_words || 0;

    // Calculate total minutes
    const durationQuery = `
      SELECT
        COALESCE(SUM(
          CAST((julianday(end_time) - julianday(start_time)) * 24 * 60 AS INTEGER)
        ), 0) as total_minutes
      FROM writing_sessions
      WHERE project_id = ?
        AND session_date >= ?
        AND start_time IS NOT NULL
        AND end_time IS NOT NULL
    `;
    const duration = await this.mcpClient.readQuery<AggRow>(durationQuery, [
      this.projectId,
      since,
    ]);
    const totalMinutes = duration[0]?.total_minutes || 0;

    // Get streak info
    const streak = await this.calculateStreak();

    // Sessions this week
    const thisWeek = this.getDateDaysAgo(7);
    const weekQuery = `
      SELECT
        COUNT(*) as sessions,
        COALESCE(SUM(words_written), 0) as words
      FROM writing_sessions
      WHERE project_id = ? AND session_date >= ?
    `;
    const weekData = await this.mcpClient.readQuery<AggRow>(weekQuery, [
      this.projectId,
      thisWeek,
    ]);

    // Sessions this month
    const thisMonth = this.getDateDaysAgo(30);
    const monthData = await this.mcpClient.readQuery<AggRow>(weekQuery, [
      this.projectId,
      thisMonth,
    ]);

    // Get last session date
    const lastQuery = `
      SELECT session_date
      FROM writing_sessions
      WHERE project_id = ?
      ORDER BY session_date DESC
      LIMIT 1
    `;
    const lastSession = await this.mcpClient.readQuery<DateRow>(lastQuery, [
      this.projectId,
    ]);

    return {
      totalSessions,
      totalWords,
      totalMinutes,
      averageWordsPerSession:
        totalSessions > 0 ? Math.round(totalWords / totalSessions) : 0,
      averageWordsPerMinute:
        totalMinutes > 0 ? parseFloat((totalWords / totalMinutes).toFixed(2)) : 0,
      currentStreak: streak.current,
      longestStreak: streak.longest,
      lastSessionDate: lastSession[0]?.session_date,
      sessionsThisWeek: weekData[0]?.sessions || 0,
      sessionsThisMonth: monthData[0]?.sessions || 0,
      wordsThisWeek: weekData[0]?.words || 0,
      wordsThisMonth: monthData[0]?.words || 0,
    };
  }

  /**
   * Calculate current and longest streaks
   */
  async calculateStreak(): Promise<Streak> {
    // Get all session dates ordered
    const query = `
      SELECT DISTINCT session_date
      FROM writing_sessions
      WHERE project_id = ?
      ORDER BY session_date DESC
    `;
    const sessions = await this.mcpClient.readQuery<DateRow>(query, [this.projectId]);

    if (sessions.length === 0) {
      return { current: 0, longest: 0 };
    }

    const today = this.getTodayDate();
    const yesterday = this.getDateDaysAgo(1);

    let currentStreak = 0;
    let longestStreak = 0;
    let currentCount = 0;
    let lastDate: string | null = null;
    let streakStartDate: string | undefined;

    for (const session of sessions) {
      const sessionDate = session.session_date;

      if (lastDate === null) {
        // First session - check if today or yesterday
        if (sessionDate === today || sessionDate === yesterday) {
          currentCount = 1;
          currentStreak = 1;
          streakStartDate = sessionDate;
          lastDate = sessionDate;
        } else {
          // Streak broken - no recent activity
          currentStreak = 0;
          currentCount = 1;
          lastDate = sessionDate;
        }
      } else {
        // Check if consecutive day
        const expectedDate = this.addDays(lastDate, -1);
        if (sessionDate === expectedDate) {
          currentCount++;
          if (currentStreak > 0) {
            currentStreak++;
            streakStartDate = sessionDate;
          }
        } else {
          // Streak broken
          longestStreak = Math.max(longestStreak, currentCount);
          currentCount = 1;
          currentStreak = 0;
        }
        lastDate = sessionDate;
      }
    }

    longestStreak = Math.max(longestStreak, currentCount, currentStreak);

    return {
      current: currentStreak,
      longest: longestStreak,
      lastSessionDate: sessions[0]?.session_date,
      streakStartDate,
    };
  }

  /**
   * Get recent sessions
   */
  async getRecentSessions(limit: number = 10): Promise<WritingSession[]> {
    const query = `
      SELECT
        id, project_id, session_date, start_time, end_time,
        words_written, chapters_touched, session_type,
        notes, mood_before, mood_after, created_at
      FROM writing_sessions
      WHERE project_id = ?
      ORDER BY session_date DESC, created_at DESC
      LIMIT ?
    `;

    const rows = await this.mcpClient.readQuery<SessionRow>(query, [this.projectId, limit]);

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      sessionDate: row.session_date,
      startTime: row.start_time ?? undefined,
      endTime: row.end_time ?? undefined,
      wordsWritten: row.words_written || 0,
      chaptersTouched: row.chapters_touched
        ? (JSON.parse(row.chapters_touched) as number[])
        : undefined,
      sessionType: row.session_type as WritingSession['sessionType'],
      notes: row.notes ?? undefined,
      moodBefore: row.mood_before ?? undefined,
      moodAfter: row.mood_after ?? undefined,
      createdAt: row.created_at,
    }));
  }

  /**
   * Calculate words written by checking chapter files modified since session start
   */
  private async calculateWordsWritten(
    chaptersPath: string,
    startTime: string
  ): Promise<{ wordsWritten: number; chapterIds: number[] }> {
    // This is a simplified version
    // In production, would track actual file changes and parse chapter numbers
    const { readdir, stat } = await import('fs/promises');
    const { join } = await import('path');

    const files = await readdir(chaptersPath);
    const startDate = new Date(startTime);

    let totalWords = 0;
    const chapterIds: number[] = [];

    for (const file of files) {
      if (!file.endsWith('.md') && !file.endsWith('.markdown')) continue;
      if (file.startsWith('_')) continue; // Skip templates

      const filePath = join(chaptersPath, file);
      const stats = await stat(filePath);

      // Check if modified since session start (or at session start)
      if (stats.mtime >= startDate) {
        const content = await readFile(filePath, 'utf-8');
        const words = this.countWords(content);
        totalWords += words;

        // Extract chapter number
        const match = file.match(/^(\d+)/);
        if (match) {
          chapterIds.push(parseInt(match[1]));
        }
      }
    }

    return { wordsWritten: totalWords, chapterIds };
  }

  /**
   * Mark a session as having completed the pre-writing ritual checklist.
   *
   * Sets `ritual_completed = 1` on the session record identified by `sessionId`.
   *
   * @param sessionId - ID of the writing_sessions row to update.
   */
  async markRitualCompleted(sessionId: number): Promise<void> {
    const updateQuery = `
      UPDATE writing_sessions
      SET ritual_completed = 1
      WHERE id = ?
    `;
    await this.mcpClient.writeQuery(updateQuery, [sessionId]);
  }

  /**
   * Store the Pomodoro-style focus timer duration on a session.
   *
   * @param sessionId    - ID of the writing_sessions row to update.
   * @param timerMinutes - Timer duration in minutes.
   */
  async setTimerMinutes(sessionId: number, timerMinutes: number): Promise<void> {
    const updateQuery = `
      UPDATE writing_sessions
      SET timer_minutes = ?
      WHERE id = ?
    `;
    await this.mcpClient.writeQuery(updateQuery, [timerMinutes, sessionId]);
  }

  /**
   * End a session by ID, optionally recording a stop note.
   *
   * This is the SPEC-06 variant that takes a session ID directly rather than
   * always looking up today's session.
   *
   * @param sessionId - ID of the writing_sessions row to close.
   * @param stopNote  - Optional "where I left off" note saved in stop_note.
   */
  async endSessionById(sessionId: number, stopNote?: string): Promise<void> {
    const now = new Date().toISOString();
    const updateQuery = `
      UPDATE writing_sessions
      SET stop_note = ?,
          end_time = ?
      WHERE id = ?
    `;
    await this.mcpClient.writeQuery(updateQuery, [
      stopNote ?? null,
      now,
      sessionId,
    ]);
  }

  /**
   * Return the most recent stop_note for this project, or null if none exists.
   */
  async getLastStopNote(): Promise<string | null> {
    const query = `
      SELECT stop_note
      FROM writing_sessions
      WHERE project_id = ?
      ORDER BY start_time DESC
      LIMIT 1
    `;
    const rows = await this.mcpClient.readQuery(query, [this.projectId]);
    if (rows.length === 0) return null;
    return (rows[0].stop_note as string | null) ?? null;
  }

  /**
   * Return the last `wordCount` words from the most recently modified chapter
   * file in `<projectPath>/chapters/`.
   *
   * @param projectPath - Root path of the novel project.
   * @param wordCount   - Number of words to return (default 200).
   */
  async getLastChapterText(
    projectPath: string,
    wordCount: number = 200
  ): Promise<string> {
    const { readdir, readFile, stat: statFile } = await import('fs/promises');
    const { join } = await import('path');

    const chaptersDir = join(projectPath, 'chapters');

    let files: string[];
    try {
      const entries = await readdir(chaptersDir);
      files = entries.filter(
        (f) => f.endsWith('.md') || f.endsWith('.markdown')
      );
    } catch {
      return '';
    }

    if (files.length === 0) return '';

    // Find most recently modified file
    let latestFile = '';
    let latestMtime = 0;

    for (const file of files) {
      const filePath = join(chaptersDir, file);
      try {
        const stats = await statFile(filePath);
        if (stats.mtimeMs > latestMtime) {
          latestMtime = stats.mtimeMs;
          latestFile = filePath;
        }
      } catch {
        // Skip unreadable files
      }
    }

    if (!latestFile) return '';

    const content = await readFile(latestFile, 'utf-8');

    // Strip YAML frontmatter
    const stripped = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

    // Split into words and return last N
    const words = stripped.trim().split(/\s+/).filter((w) => w.length > 0);
    return words.slice(-wordCount).join(' ');
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    // Remove frontmatter
    let content = text.replace(/^---\n[\s\S]*?\n---\n/, '');

    // Remove markdown syntax
    content = content
      .replace(/^#{1,6}\s+/gm, '') // Headers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
      .replace(/\*([^*]+)\*/g, '$1') // Italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      .replace(/`([^`]+)`/g, '$1'); // Code

    const words = content.trim().split(/\s+/);
    return words.filter((w) => w.length > 0).length;
  }

  /**
   * Calculate duration in minutes
   */
  private calculateDuration(startTime: string, endTime: string): number {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime();
    return Math.round(diffMs / 1000 / 60);
  }

  /**
   * Get today's date in YYYY-MM-DD format
   */
  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get date N days ago in YYYY-MM-DD format
   */
  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  /**
   * Add days to date string
   */
  private addDays(dateString: string, days: number): string {
    const date = new Date(dateString);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }
}
