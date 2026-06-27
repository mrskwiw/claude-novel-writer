/**
 * Integration Tests: Session Tracking Workflow
 * Tests complete session tracking workflow
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../../../project/src/session/session-manager.js';
import { ProgressDashboard } from '../../../project/src/session/progress-dashboard.js';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { getTestProjectPath } from '../../setup.js';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';

describe('Session Workflow (Integration)', () => {
  let sessionManager: SessionManager;
  let mcpClient: MockMCPClient;
  let projectPath: string;
  const projectId = 1;

  beforeEach(() => {
    projectPath = getTestProjectPath();
    mcpClient = new MockMCPClient();
    sessionManager = new SessionManager(mcpClient, projectId);
  });

  it('should complete basic session workflow', async () => {
    // Step 1: Start session

    const sessionId = await sessionManager.startSession({
      sessionType: 'drafting',
      moodBefore: 3,
      notes: 'Working on chapter 1',
    });

    expect(sessionId).toBeGreaterThan(0);

    // Step 2: Simulate writing (create chapter file)
    const chaptersDir = join(projectPath, 'chapters');
    if (!existsSync(chaptersDir)) {
      mkdirSync(chaptersDir, { recursive: true });
    }

    const chapterContent = `---
title: Test Chapter
---

# Test Chapter

This is test content with several words to count.
The session manager should detect this as modified.
More words here for testing purposes.`;

    await writeFile(join(chaptersDir, '01-test.md'), chapterContent);

    // Step 3: End session
    const metrics = await sessionManager.endSession({
      moodAfter: 4,
      chaptersPath: chaptersDir,
    });

    // Verify metrics
    expect(metrics.sessionId).toBe(sessionId);
    expect(metrics.duration).toBeGreaterThanOrEqual(0);
    expect(metrics.wordsWritten).toBeGreaterThan(0);
    expect(metrics.moodChange).toBe(1); // 4 - 3

    // Step 4: Get summary
    const summary = await sessionManager.getSummary();
    expect(summary.totalSessions).toBe(1);
    expect(summary.totalWords).toBeGreaterThan(0);

    // Step 5: Check streak
    const streak = await sessionManager.calculateStreak();
    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(1);
  });

  it('should track streak across multiple sessions', async () => {

    // Session 1 - Today
    const session1 = await sessionManager.startSession({
      sessionType: 'drafting',
    });

    await sessionManager.endSession({});

    // Session 2 - Yesterday (simulate by manual insert)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Use internal mcpClient (if we had access)
    // For now, just verify current streak
    const streak = await sessionManager.calculateStreak();
    expect(streak.current).toBeGreaterThanOrEqual(1);
    expect(streak.longest).toBeGreaterThanOrEqual(1);
  });

  it('should display progress dashboard', async () => {

    // Create session with some data
    await sessionManager.startSession({
      sessionType: 'drafting',
      moodBefore: 3,
    });

    await sessionManager.endSession({
      moodAfter: 4,
    });

    // Get dashboard
    const dashboard = new ProgressDashboard(sessionManager);

    // Mock output formatter
    const outputLines: string[] = [];
    const mockOutput = {
      info: (msg: string) => outputLines.push(msg),
      success: (msg: string) => outputLines.push(msg),
      warning: (msg: string) => outputLines.push(msg),
      error: (msg: string) => outputLines.push(msg),
      dim: (msg: string) => outputLines.push(msg),
      newline: () => outputLines.push(''),
    };

    // Display dashboard
    await dashboard.display(mockOutput as any, {
      showStreak: true,
      showVelocity: true,
      showRecentSessions: false,
      compact: true,
    });

    // Verify output contains expected sections
    const output = outputLines.join('\n');
    expect(output).toContain('Progress Dashboard');
  });

  it('should track different session types', async () => {
    const types = ['drafting', 'revising', 'planning', 'editing'] as const;

    for (const type of types) {
      // Create new mock/sessionManager for each type
      mcpClient = new MockMCPClient();
      sessionManager = new SessionManager(mcpClient, projectId);

      const sessionId = await sessionManager.startSession({
        sessionType: type,
      });

      await sessionManager.endSession({});

      // Verify it was tracked
      const sessions = await sessionManager.getRecentSessions(1);
      expect(sessions[0].sessionType).toBe(type);
    }
  });

  it('should calculate velocity metrics', async () => {

    // Start session
    await sessionManager.startSession({
      sessionType: 'drafting',
    });

    // Create chapter with known word count
    const chaptersDir = join(projectPath, 'chapters');
    if (!existsSync(chaptersDir)) {
      mkdirSync(chaptersDir, { recursive: true });
    }

    // Exactly 100 words
    const words = Array(100).fill('word').join(' ');
    await writeFile(
      join(chaptersDir, '01-test.md'),
      `---\ntitle: Test\n---\n\n${words}`
    );

    // End session
    const metrics = await sessionManager.endSession({
      chaptersPath: chaptersDir,
    });

    // Verify word count
    expect(metrics.wordsWritten).toBe(100);

    // Verify velocity calculation
    if (metrics.duration > 0) {
      expect(metrics.wordsPerMinute).toBe(metrics.wordsWritten / metrics.duration);
    }
  });

  it('should handle mood tracking', async () => {

    // Session with mood improvement
    await sessionManager.startSession({
      sessionType: 'drafting',
      moodBefore: 2,
    });

    const metrics = await sessionManager.endSession({
      moodAfter: 4,
    });

    // Verify mood change
    expect(metrics.moodChange).toBe(2); // 4 - 2

    // Get recent sessions
    const sessions = await sessionManager.getRecentSessions(1);
    expect(sessions[0].moodBefore).toBe(2);
    expect(sessions[0].moodAfter).toBe(4);
  });

  it('should track session notes', async () => {

    const startNotes = 'Starting work on climax scene';
    const endNotes = 'Stopped mid-scene, hero about to make decision';

    await sessionManager.startSession({
      sessionType: 'drafting',
      notes: startNotes,
    });

    await sessionManager.endSession({
      notes: endNotes,
    });

    // Verify notes were saved
    const sessions = await sessionManager.getRecentSessions(1);
    expect(sessions[0].notes).toBe(endNotes);
  });

  it('should handle multiple chapters in one session', async () => {

    await sessionManager.startSession({
      sessionType: 'drafting',
    });

    // Create multiple chapter files
    const chaptersDir = join(projectPath, 'chapters');
    if (!existsSync(chaptersDir)) {
      mkdirSync(chaptersDir, { recursive: true });
    }

    const content = '---\ntitle: Chapter\n---\n\n' + Array(50).fill('word').join(' ');
    await writeFile(join(chaptersDir, '01-chapter-one.md'), content);
    await writeFile(join(chaptersDir, '02-chapter-two.md'), content);
    await writeFile(join(chaptersDir, '03-chapter-three.md'), content);

    const metrics = await sessionManager.endSession({
      chaptersPath: chaptersDir,
    });

    // Should detect all 3 chapters
    expect(metrics.chapterCount).toBe(3);
    // Should count words from all chapters
    expect(metrics.wordsWritten).toBe(150); // 50 * 3
  });
});
