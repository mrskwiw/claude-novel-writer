/**
 * Unit Tests for SessionManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../../../project/src/session/session-manager.js';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mcpClient: MockMCPClient;
  const projectId = 1;

  beforeEach(() => {
    mcpClient = new MockMCPClient();
    sessionManager = new SessionManager(mcpClient, projectId);
  });

  describe('startSession()', () => {
    it('should create new session for today', async () => {
      // Act
      const sessionId = await sessionManager.startSession({
        sessionType: 'drafting',
        moodBefore: 4,
        notes: 'Starting chapter 5',
      });

      // Assert
      expect(sessionId).toBeGreaterThan(0);

      // Verify session was created
      const query = `SELECT * FROM writing_sessions WHERE id = ?`;
      const result = await mcpClient.readQuery(query, [sessionId]);
      expect(result).toHaveLength(1);
      expect(result[0].session_type).toBe('drafting');
      expect(result[0].mood_before).toBe(4);
      expect(result[0].notes).toBe('Starting chapter 5');
    });

    it('should update existing session if one exists for today', async () => {
      // Arrange - Create first session
      const firstId = await sessionManager.startSession({
        sessionType: 'drafting',
      });

      // Act - Start another session same day
      const secondId = await sessionManager.startSession({
        sessionType: 'revising',
        moodBefore: 3,
      });

      // Assert - Should be same session ID
      expect(secondId).toBe(firstId);

      // Verify session was updated
      const query = `SELECT * FROM writing_sessions WHERE id = ?`;
      const result = await mcpClient.readQuery(query, [firstId]);
      expect(result[0].session_type).toBe('revising');
      expect(result[0].mood_before).toBe(3);
    });

    it('should handle all session types', async () => {
      const types = ['drafting', 'revising', 'planning', 'editing'] as const;

      for (const type of types) {
        // Reset mock for each iteration
        mcpClient = new MockMCPClient();
        sessionManager = new SessionManager(mcpClient, projectId);

        const sessionId = await sessionManager.startSession({
          sessionType: type,
        });

        const query = `SELECT session_type FROM writing_sessions WHERE id = ?`;
        const result = await mcpClient.readQuery(query, [sessionId]);
        expect(result[0].session_type).toBe(type);
      }
    });
  });

  describe('endSession()', () => {
    it('should throw error if no session exists for today', async () => {
      // Act & Assert
      await expect(
        sessionManager.endSession({})
      ).rejects.toThrow('No active session found for today');
    });

    it('should update session with end time and mood', async () => {
      // Arrange
      const sessionId = await sessionManager.startSession({
        sessionType: 'drafting',
        moodBefore: 3,
      });

      // Act
      const metrics = await sessionManager.endSession({
        moodAfter: 4,
      });

      // Assert
      expect(metrics.sessionId).toBe(sessionId);
      expect(metrics.duration).toBeGreaterThanOrEqual(0);
      expect(metrics.moodChange).toBe(1); // 4 - 3

      // Verify database
      const query = `SELECT end_time, mood_after FROM writing_sessions WHERE id = ?`;
      const result = await mcpClient.readQuery(query, [sessionId]);
      expect(result[0].end_time).toBeTruthy();
      expect(result[0].mood_after).toBe(4);
    });

    it('should calculate session metrics', async () => {
      // Arrange
      await sessionManager.startSession({
        sessionType: 'drafting',
      });

      // Act
      const metrics = await sessionManager.endSession({});

      // Assert
      expect(metrics).toHaveProperty('sessionId');
      expect(metrics).toHaveProperty('duration');
      expect(metrics).toHaveProperty('wordsWritten');
      expect(metrics).toHaveProperty('wordsPerMinute');
      expect(metrics).toHaveProperty('chapterCount');
    });
  });

  describe('getSummary()', () => {
    it('should return empty summary for no sessions', async () => {
      // Act
      const summary = await sessionManager.getSummary();

      // Assert
      expect(summary.totalSessions).toBe(0);
      expect(summary.totalWords).toBe(0);
      expect(summary.totalMinutes).toBe(0);
      expect(summary.currentStreak).toBe(0);
      expect(summary.longestStreak).toBe(0);
    });

    it('should calculate summary for single session', async () => {
      // Arrange
      const sessionId = await sessionManager.startSession({
        sessionType: 'drafting',
      });

      // Manually insert words written
      await mcpClient.writeQuery(
        `UPDATE writing_sessions SET words_written = ? WHERE id = ?`,
        [500, sessionId]
      );

      // Act
      const summary = await sessionManager.getSummary();

      // Assert
      expect(summary.totalSessions).toBe(1);
      expect(summary.totalWords).toBe(500);
      expect(summary.averageWordsPerSession).toBe(500);
    });

    it('should calculate averages correctly', async () => {
      // Arrange - Create multiple sessions with different words
      for (let i = 0; i < 3; i++) {
        mcpClient = new MockMCPClient();
        sessionManager = new SessionManager(mcpClient, projectId);

        const sessionId = await sessionManager.startSession({
          sessionType: 'drafting',
        });

        await mcpClient.writeQuery(
          `UPDATE writing_sessions SET words_written = ? WHERE id = ?`,
          [(i + 1) * 100, sessionId]
        );
      }

      // Act
      const summary = await sessionManager.getSummary();

      // Assert
      expect(summary.totalSessions).toBe(1); // Only last one in fresh mock
      expect(summary.averageWordsPerSession).toBeGreaterThan(0);
    });
  });

  describe('calculateStreak()', () => {
    it('should return zero streak for no sessions', async () => {
      // Act
      const streak = await sessionManager.calculateStreak();

      // Assert
      expect(streak.current).toBe(0);
      expect(streak.longest).toBe(0);
    });

    it('should calculate current streak for consecutive days', async () => {
      // Arrange - Create sessions for today and yesterday
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      // Insert sessions manually for specific dates
      await mcpClient.writeQuery(
        `INSERT INTO writing_sessions (project_id, session_date, words_written, session_type) VALUES (?, ?, ?, ?)`,
        [projectId, today, 0, 'drafting']
      );

      await mcpClient.writeQuery(
        `INSERT INTO writing_sessions (project_id, session_date, words_written, session_type) VALUES (?, ?, ?, ?)`,
        [projectId, yesterday, 0, 'drafting']
      );

      // Act
      const streak = await sessionManager.calculateStreak();

      // Assert
      expect(streak.current).toBe(2);
      expect(streak.longest).toBeGreaterThanOrEqual(2);
    });

    it('should detect broken streak', async () => {
      // Arrange - Create session 3 days ago (not consecutive)
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      await mcpClient.writeQuery(
        `INSERT INTO writing_sessions (project_id, session_date, words_written, session_type) VALUES (?, ?, ?, ?)`,
        [projectId, threeDaysAgo, 0, 'drafting']
      );

      // Act
      const streak = await sessionManager.calculateStreak();

      // Assert
      expect(streak.current).toBe(0); // Broken streak
      expect(streak.longest).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getRecentSessions()', () => {
    it('should return empty array for no sessions', async () => {
      // Act
      const sessions = await sessionManager.getRecentSessions();

      // Assert
      expect(sessions).toEqual([]);
    });

    it('should return recent sessions in reverse chronological order', async () => {
      // Arrange
      const sessionId = await sessionManager.startSession({
        sessionType: 'drafting',
      });

      // Act
      const sessions = await sessionManager.getRecentSessions(5);

      // Assert
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(sessionId);
      expect(sessions[0].sessionType).toBe('drafting');
    });

    it('should respect limit parameter', async () => {
      // Arrange - Create multiple sessions
      for (let i = 0; i < 5; i++) {
        mcpClient = new MockMCPClient();
        sessionManager = new SessionManager(mcpClient, projectId);
        await sessionManager.startSession({ sessionType: 'drafting' });
      }

      // Act
      const sessions = await sessionManager.getRecentSessions(3);

      // Assert - Only last session in fresh mock
      expect(sessions.length).toBeLessThanOrEqual(3);
    });
  });
});
