/**
 * Unit tests for Hemingway stop-note feature (SPEC-06):
 *   - getLastStopNote() returns null when no sessions exist
 *   - getLastStopNote() returns the most recent stop_note
 *   - endSessionById(id, note) stores stop_note via writeQuery
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../../../project/src/session/session-manager.js';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';

describe('SessionManager — stop-note (Hemingway technique)', () => {
  let sessionManager: SessionManager;
  let mcpClient: MockMCPClient;
  const projectId = 1;

  beforeEach(() => {
    mcpClient = new MockMCPClient();
    sessionManager = new SessionManager(mcpClient, projectId);
  });

  // ─── getLastStopNote ────────────────────────────────────────────

  describe('getLastStopNote()', () => {
    it('returns null when no sessions exist for the project', async () => {
      const note = await sessionManager.getLastStopNote();
      expect(note).toBeNull();
    });

    it('returns null when sessions exist but none have a stop_note', async () => {
      mcpClient.seed('writing_sessions', [
        {
          id: 1,
          project_id: projectId,
          session_date: '2026-05-28',
          start_time: '2026-05-28T10:00:00.000Z',
          stop_note: null,
        },
      ]);

      const note = await sessionManager.getLastStopNote();
      expect(note).toBeNull();
    });

    it('returns the stop_note from the most recent session', async () => {
      mcpClient.seed('writing_sessions', [
        {
          id: 1,
          project_id: projectId,
          session_date: '2026-05-27',
          start_time: '2026-05-27T09:00:00.000Z',
          stop_note: 'older note',
        },
        {
          id: 2,
          project_id: projectId,
          session_date: '2026-05-28',
          start_time: '2026-05-28T10:00:00.000Z',
          stop_note: 'tomorrow Mira opens the door',
        },
      ]);

      const note = await sessionManager.getLastStopNote();
      // Most recent by start_time DESC
      expect(note).toBe('tomorrow Mira opens the door');
    });

    it('returns the stop_note even when only one session exists', async () => {
      mcpClient.seed('writing_sessions', [
        {
          id: 1,
          project_id: projectId,
          session_date: '2026-05-28',
          start_time: '2026-05-28T10:00:00.000Z',
          stop_note: 'what happens next: the letter arrives',
        },
      ]);

      const note = await sessionManager.getLastStopNote();
      expect(note).toBe('what happens next: the letter arrives');
    });
  });

  // ─── endSessionById ──────────────────────────────────────────────

  describe('endSessionById()', () => {
    it('stores the stop_note via writeQuery', async () => {
      // Spy on writeQuery to capture calls
      const writeSpy = vi.spyOn(mcpClient, 'writeQuery');

      // Seed a session to update
      mcpClient.seed('writing_sessions', [
        {
          id: 5,
          project_id: projectId,
          session_date: '2026-05-28',
          start_time: '2026-05-28T10:00:00.000Z',
          stop_note: null,
          end_time: null,
        },
      ]);

      const stopNote = 'tomorrow Mira opens the door';
      await sessionManager.endSessionById(5, stopNote);

      // writeQuery should have been called with the stop_note and session id
      expect(writeSpy).toHaveBeenCalled();
      const calls = writeSpy.mock.calls;
      const updateCall = calls.find(
        ([_query, params]) =>
          Array.isArray(params) && params.includes(stopNote) && params.includes(5)
      );
      expect(updateCall).toBeDefined();
    });

    it('works without a stop_note (sets stop_note to null)', async () => {
      const writeSpy = vi.spyOn(mcpClient, 'writeQuery');

      mcpClient.seed('writing_sessions', [
        {
          id: 3,
          project_id: projectId,
          session_date: '2026-05-28',
          start_time: '2026-05-28T10:00:00.000Z',
          stop_note: null,
          end_time: null,
        },
      ]);

      // No stop_note passed — should still succeed
      await sessionManager.endSessionById(3);

      expect(writeSpy).toHaveBeenCalled();
      const calls = writeSpy.mock.calls;
      const updateCall = calls.find(
        ([_query, params]) =>
          Array.isArray(params) && params.includes(null) && params.includes(3)
      );
      expect(updateCall).toBeDefined();
    });

    it('persists stop_note so getLastStopNote can retrieve it', async () => {
      mcpClient.seed('writing_sessions', [
        {
          id: 7,
          project_id: projectId,
          session_date: '2026-05-28',
          start_time: '2026-05-28T11:00:00.000Z',
          stop_note: null,
          end_time: null,
        },
      ]);

      const note = 'the detective finds the second clue';
      await sessionManager.endSessionById(7, note);

      // The mock update should have set stop_note on the record
      const rows = mcpClient.getTableData('writing_sessions');
      const updated = rows.find((r) => r.id === 7);
      expect(updated?.stop_note).toBe(note);
    });
  });
});
