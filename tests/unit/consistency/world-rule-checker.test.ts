/**
 * Unit tests for ConsistencyChecker.checkWorldRuleViolations() (GAP-07)
 *
 * Covers:
 *  - NO_VIOLATIONS response → returns [] and stores nothing
 *  - Violation detected → parsed and stored in consistency_issues
 *  - No hard rules → returns [] without calling Claude
 *  - Chapter with empty content → skipped (no Claude call)
 *  - writeQuery called to store violations
 *  - Multiple rules batched in single prompt
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsistencyChecker } from '../../../project/src/consistency/checker.js';
import type { MCPClient } from '../../../project/src/core/database.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a mock MCPClient whose readQuery responses can be sequenced. */
function makeMockClient(): MCPClient {
  return {
    readQuery: vi.fn(),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 1 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

const HARD_RULE = {
  id: 1,
  rule_name: 'No Silent Magic',
  description: 'Magic requires verbal incantations at all times.',
  rule_category: 'magic',
};

const HARD_RULE_2 = {
  id: 2,
  rule_name: 'Iron Burns Fae',
  description: 'Iron is lethal to fae creatures on contact.',
  rule_category: 'physics',
};

const CHAPTER_WITH_TEXT = {
  chapter_id: 10,
  chapter_title: 'The Dark Forest',
  chapter_number: 3,
  chapter_text: 'Lyra waved her hand silently and the door opened without a word.',
};

const CHAPTER_EMPTY = {
  chapter_id: 11,
  chapter_title: 'Interlude',
  chapter_number: 4,
  chapter_text: '',
};

const INSERTED_ISSUE_ROW = {
  id: 99,
  project_id: 1,
  issue_type: 'world_rule',
  severity: 'error',
  description: 'World rule violation in Chapter 3',
  chapter_id: 10,
  scene_id: null,
  character_id: null,
  location_id: null,
  detected_at: new Date().toISOString(),
  status: 'open',
  resolution_notes: null,
};

// ─── Mock ClaudeClient module ─────────────────────────────────────────────────

// We mock the entire claude-client module so the constructor never throws even
// without ANTHROPIC_API_KEY, and we can control generate() output.
const mockGenerate = vi.fn();

vi.mock('../../../project/src/ai/claude-client.js', () => {
  return {
    ClaudeClient: class {
      generate = mockGenerate;
      static isConfigured() {
        return true; // always "configured" in tests
      }
    },
  };
});

// ─── tests ────────────────────────────────────────────────────────────────────

describe('ConsistencyChecker.checkWorldRuleViolations()', () => {
  let client: MCPClient;
  let checker: ConsistencyChecker;

  beforeEach(() => {
    client = makeMockClient();
    checker = new ConsistencyChecker(client, 1);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. No hard rules → early exit ─────────────────────────────────────────

  it('returns empty array without calling Claude when no hard rules exist', async () => {
    // readQuery for rules returns []
    (client.readQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]);   // world_rules query

    const result = await checker.checkWorldRuleViolations('proj-1');

    expect(result).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(client.writeQuery).not.toHaveBeenCalled();
  });

  // ── 2. NO_VIOLATIONS response → no storage ────────────────────────────────

  it('returns empty array and stores nothing when Claude says NO_VIOLATIONS', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([HARD_RULE])          // world_rules
      .mockResolvedValueOnce([CHAPTER_WITH_TEXT]); // chapters

    mockGenerate.mockResolvedValueOnce({ content: 'NO_VIOLATIONS' });

    const result = await checker.checkWorldRuleViolations('proj-1');

    expect(result).toEqual([]);
    expect(client.writeQuery).not.toHaveBeenCalled();
  });

  // ── 3. Violation detected → parsed and stored ─────────────────────────────

  it('parses a violation and inserts it into consistency_issues', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([HARD_RULE])           // world_rules
      .mockResolvedValueOnce([CHAPTER_WITH_TEXT])   // chapters
      .mockResolvedValueOnce([])                    // dedup check (no existing)
      .mockResolvedValueOnce([INSERTED_ISSUE_ROW]); // select after insert

    mockGenerate.mockResolvedValueOnce({
      content:
        '1. Rule 1 violated\n' +
        '- "Lyra waved her hand silently"\n' +
        '- explanation: Magic was cast without verbal incantation.',
    });

    const result = await checker.checkWorldRuleViolations('proj-1');

    expect(result).toHaveLength(1);
    expect(result[0].issueType).toBe('world_rule');
    expect(result[0].severity).toBe('error');
    expect(result[0].status).toBe('open');

    // writeQuery must have been called to persist the issue
    expect(client.writeQuery).toHaveBeenCalledOnce();
    const [sql] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    // The SQL literal contains 'world_rule' — verify it's the right insert
    expect(sql).toMatch(/INSERT OR IGNORE INTO consistency_issues/i);
    expect(sql).toMatch(/world_rule/);
  });

  // ── 4. Empty chapter content → skipped ───────────────────────────────────

  it('skips chapters with no text and never calls Claude for them', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([HARD_RULE])      // world_rules
      .mockResolvedValueOnce([CHAPTER_EMPTY]); // chapters — all empty

    const result = await checker.checkWorldRuleViolations('proj-1');

    expect(result).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  // ── 5. Multiple rules batched in single prompt ────────────────────────────

  it('includes all rules from a batch in the single Claude prompt', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([HARD_RULE, HARD_RULE_2])  // world_rules (2 rules)
      .mockResolvedValueOnce([CHAPTER_WITH_TEXT]);       // chapters

    mockGenerate.mockResolvedValueOnce({ content: 'NO_VIOLATIONS' });

    await checker.checkWorldRuleViolations('proj-1');

    expect(mockGenerate).toHaveBeenCalledOnce();
    const [promptArg] = mockGenerate.mock.calls[0] as [string, ...unknown[]];
    // Both rule names must appear in the single prompt
    expect(promptArg).toContain(HARD_RULE.rule_name);
    expect(promptArg).toContain(HARD_RULE_2.rule_name);
  });

  // ── 6. Deduplication — existing open issue is not re-inserted ─────────────

  it('does not insert duplicate issues when one already exists', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([HARD_RULE])           // world_rules
      .mockResolvedValueOnce([CHAPTER_WITH_TEXT])   // chapters
      .mockResolvedValueOnce([{ id: 50 }]);         // dedup check returns existing row

    mockGenerate.mockResolvedValueOnce({
      content: '1. Rule 1 violated\n- "silent casting"\n- explanation: No incantation used.',
    });

    const result = await checker.checkWorldRuleViolations('proj-1');

    // Null is returned for duplicate → not added to result
    expect(result).toEqual([]);
    // writeQuery should NOT have been called
    expect(client.writeQuery).not.toHaveBeenCalled();
  });
});
