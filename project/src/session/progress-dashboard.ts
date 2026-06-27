/**
 * Progress Dashboard
 * Displays writing progress, streaks, and motivation metrics
 */

import type { SessionManager, SessionSummary, Streak } from './session-manager.js';
import type { OutputFormatter } from '../cli/output.js';

export interface DashboardOptions {
  showStreak?: boolean;
  showVelocity?: boolean;
  showRecentSessions?: boolean;
  showMilestones?: boolean;
  compact?: boolean;
}

export class ProgressDashboard {
  constructor(private sessionManager: SessionManager) {}

  /**
   * Display full progress dashboard
   */
  async display(output: OutputFormatter, options: DashboardOptions = {}): Promise<void> {
    const {
      showStreak = true,
      showVelocity = true,
      showRecentSessions = true,
      showMilestones = false,
      compact = false,
    } = options;

    const summary = await this.sessionManager.getSummary();
    const streak = await this.sessionManager.calculateStreak();

    output.info('=== 📖 Writing Progress Dashboard ===\n');

    // Overall stats
    if (!compact) {
      output.info('📊 Overall Statistics:');
      output.dim(`  Total sessions: ${summary.totalSessions}`);
      output.dim(`  Total words: ${summary.totalWords.toLocaleString()}`);
      output.dim(`  Total time: ${this.formatDuration(summary.totalMinutes)}`);
      output.newline();
    }

    // Streak display
    if (showStreak) {
      this.displayStreak(output, streak, summary);
      output.newline();
    }

    // Velocity metrics
    if (showVelocity) {
      this.displayVelocity(output, summary);
      output.newline();
    }

    // Recent activity
    output.info('📅 Recent Activity:');
    output.dim(`  This week: ${summary.sessionsThisWeek} sessions, ${summary.wordsThisWeek.toLocaleString()} words`);
    output.dim(`  This month: ${summary.sessionsThisMonth} sessions, ${summary.wordsThisMonth.toLocaleString()} words`);
    output.newline();

    // Recent sessions
    if (showRecentSessions && !compact) {
      await this.displayRecentSessions(output);
    }

    // Milestones (if requested)
    if (showMilestones) {
      await this.displayMilestones(output, summary);
    }

    // Motivation message
    this.displayMotivation(output, summary, streak);
  }

  /**
   * Display streak information with visual flair
   */
  private displayStreak(
    output: OutputFormatter,
    streak: Streak,
    summary: SessionSummary
  ): void {
    output.info('🔥 Writing Streak:');

    if (streak.current === 0) {
      output.warning('  No current streak');
      if (summary.lastSessionDate) {
        output.dim(`  Last session: ${this.formatRelativeDate(summary.lastSessionDate)}`);
      }
      output.dim('  Start a new streak today!');
    } else {
      // Current streak
      const streakEmoji = this.getStreakEmoji(streak.current);
      output.success(`  ${streakEmoji} Current: ${streak.current} day${streak.current !== 1 ? 's' : ''}`);

      if (streak.streakStartDate) {
        output.dim(`  Started: ${this.formatDate(streak.streakStartDate)}`);
      }

      // Longest streak
      if (streak.longest > streak.current) {
        output.dim(`  Best: ${streak.longest} day${streak.longest !== 1 ? 's' : ''}`);
      } else {
        output.success('  🏆 New personal record!');
      }
    }
  }

  /**
   * Display velocity metrics
   */
  private displayVelocity(output: OutputFormatter, summary: SessionSummary): void {
    output.info('⚡ Velocity:');
    output.dim(`  Average per session: ${summary.averageWordsPerSession} words`);
    output.dim(`  Average per minute: ${summary.averageWordsPerMinute} words/min`);

    // Pace assessment
    const pace = this.assessPace(summary.averageWordsPerMinute);
    output.dim(`  Pace: ${pace}`);
  }

  /**
   * Display recent sessions
   */
  private async displayRecentSessions(output: OutputFormatter): Promise<void> {
    const sessions = await this.sessionManager.getRecentSessions(5);

    if (sessions.length === 0) {
      output.dim('  No sessions yet');
      return;
    }

    output.info('📝 Recent Sessions:');
    for (const session of sessions) {
      const date = this.formatDate(session.sessionDate);
      const words = session.wordsWritten.toLocaleString();
      const type = this.getTypeEmoji(session.sessionType);

      let line = `  ${type} ${date}: ${words} words`;

      // Add duration if available
      if (session.startTime && session.endTime) {
        const duration = this.calculateDuration(session.startTime, session.endTime);
        line += ` (${duration}min)`;
      }

      // Add mood indicator if available
      if (session.moodBefore && session.moodAfter) {
        const moodChange = session.moodAfter - session.moodBefore;
        const moodEmoji = moodChange > 0 ? '😊' : moodChange < 0 ? '😔' : '😐';
        line += ` ${moodEmoji}`;
      }

      output.dim(line);
    }
    output.newline();
  }

  /**
   * Display milestones and celebrations
   */
  private async displayMilestones(
    output: OutputFormatter,
    summary: SessionSummary
  ): Promise<void> {
    output.info('🎉 Milestones:');

    const milestones = this.calculateMilestones(summary);

    if (milestones.length === 0) {
      output.dim('  Keep writing to unlock milestones!');
    } else {
      for (const milestone of milestones) {
        output.success(`  ✓ ${milestone}`);
      }
    }

    output.newline();
  }

  /**
   * Display motivation message
   */
  private displayMotivation(
    output: OutputFormatter,
    summary: SessionSummary,
    streak: Streak
  ): void {
    const message = this.getMotivationMessage(summary, streak);
    output.info(`💡 ${message}`);
  }

  /**
   * Get streak emoji based on streak length
   */
  private getStreakEmoji(streak: number): string {
    if (streak >= 30) return '🔥🔥🔥'; // Fire!
    if (streak >= 14) return '🔥🔥'; // Two weeks!
    if (streak >= 7) return '🔥'; // One week
    if (streak >= 3) return '⚡'; // Building momentum
    return '✨'; // Just started
  }

  /**
   * Get type emoji
   */
  private getTypeEmoji(type: string): string {
    switch (type) {
      case 'drafting':
        return '✍️';
      case 'revising':
        return '📝';
      case 'planning':
        return '🗺️';
      case 'editing':
        return '✂️';
      default:
        return '📖';
    }
  }

  /**
   * Assess writing pace
   */
  private assessPace(wordsPerMinute: number): string {
    if (wordsPerMinute >= 50) return 'Very fast 🚀';
    if (wordsPerMinute >= 30) return 'Fast ⚡';
    if (wordsPerMinute >= 20) return 'Steady 🐢';
    if (wordsPerMinute >= 10) return 'Thoughtful 🤔';
    return 'Deliberate ✍️';
  }

  /**
   * Calculate achieved milestones
   */
  private calculateMilestones(summary: SessionSummary): string[] {
    const milestones: string[] = [];

    // Word count milestones
    if (summary.totalWords >= 100000) milestones.push('100K words written!');
    else if (summary.totalWords >= 50000) milestones.push('50K words written!');
    else if (summary.totalWords >= 10000) milestones.push('10K words written!');
    else if (summary.totalWords >= 1000) milestones.push('1K words written!');

    // Session milestones
    if (summary.totalSessions >= 100) milestones.push('100 writing sessions!');
    else if (summary.totalSessions >= 50) milestones.push('50 writing sessions!');
    else if (summary.totalSessions >= 10) milestones.push('10 writing sessions!');

    // Streak milestones
    if (summary.longestStreak >= 30) milestones.push('30-day streak!');
    else if (summary.longestStreak >= 7) milestones.push('Week-long streak!');

    return milestones;
  }

  /**
   * Get motivational message
   */
  private getMotivationMessage(summary: SessionSummary, streak: Streak): string {
    // Streak-based messages
    if (streak.current === 0 && summary.lastSessionDate) {
      return "Your streak broke, but every day is a chance to start again. Write today!";
    }

    if (streak.current >= 30) {
      return 'Incredible dedication! You\'re building a lasting habit.';
    }

    if (streak.current >= 14) {
      return 'Two weeks strong! Keep the momentum going.';
    }

    if (streak.current >= 7) {
      return 'A full week! You\'re proving your commitment.';
    }

    if (streak.current >= 3) {
      return 'Great start! Three days in a row builds momentum.';
    }

    // First session
    if (summary.totalSessions === 0) {
      return 'Welcome! Every great novel starts with a single session.';
    }

    // General encouragement
    if (summary.totalWords < 1000) {
      return 'You\'re off to a great start. Keep going!';
    }

    if (summary.totalWords < 10000) {
      return 'Building your story word by word. You\'ve got this!';
    }

    if (summary.totalWords < 50000) {
      return 'Your novel is taking shape. Keep the words flowing!';
    }

    return 'You\'re creating something amazing. Keep writing!';
  }

  /**
   * Format duration in human-readable form
   */
  private formatDuration(minutes: number): string {
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
  private formatDate(dateString: string): string {
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

    // Format as "Jan 15"
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /**
   * Format relative date (e.g., "3 days ago")
   */
  private formatRelativeDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00');
    const today = new Date();
    const diffDays = Math.floor(
      (today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    }

    const months = Math.floor(diffDays / 30);
    return `${months} month${months !== 1 ? 's' : ''} ago`;
  }

  /**
   * Calculate duration between two ISO datetime strings
   */
  private calculateDuration(startTime: string, endTime: string): number {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime();
    return Math.round(diffMs / 1000 / 60);
  }
}
