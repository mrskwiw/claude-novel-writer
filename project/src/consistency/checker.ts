/**
 * Consistency Checking System
 * Scans manuscript for contradictions and continuity errors
 */

import type { MCPClient } from '../core/database.js';
import type { ConsistencyIssue } from '../types/novel.js';
import { ClaudeClient } from '../ai/claude-client.js';

export interface ConsistencyCheckResult {
  issues: Partial<ConsistencyIssue>[];
  errors: number;
  warnings: number;
  info: number;
}

// ─── DB row types ─────────────────────────────────────────────────────────────

interface ConflictRow {
  character_id: number;
  character_name: string;
  attribute_name: string;
  first_value: string;
  first_chapter: number | null;
  first_chapter_number: number | null;
  first_line: number | null;
  second_value: string;
  second_chapter: number | null;
  second_chapter_number: number | null;
  second_line: number | null;
}

interface TimelineConflictRow {
  event1_id: number;
  event1_name: string;
  ts1: number;
  scene1_id: number | null;
  chapter1: number | null;
  event2_id: number;
  event2_name: string;
  ts2: number;
  scene2_id: number | null;
  chapter2: number | null;
  dependency_type: string | null;
}

interface MissingTimestampRow {
  event_id: number;
  event_name: string;
  scene_id: number | null;
  chapter_number: number | null;
}

interface PlotThreadRow {
  id: number;
  thread_name: string;
  priority: number;
  introduced_chapter: number | null;
}

interface IssueRow {
  id: number;
  project_id: number;
  description: string;
  chapter_id: number | null;
  scene_id: number | null;
  character_id: number | null;
  location_id: number | null;
  detected_at: string;
  resolution_notes: string | null;
}

interface WorldRuleRow {
  id: number;
  rule_name: string;
  rule_category: string;
  description: string;
  is_hard_rule: number;
}

interface ChapterRow {
  id: number;
  chapter_id: number;
  chapter_title: string | null;
  chapter_number: number;
  chapter_text: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Maximum world rules per Claude prompt batch */
const WORLD_RULE_BATCH_SIZE = 5;
/** Maximum characters of chapter text sent to Claude */
const CHAPTER_TEXT_LIMIT = 3000;

export class ConsistencyChecker {
  private claudeClient: ClaudeClient | null = null;

  constructor(
    private mcpClient: MCPClient,
    private projectId: number
  ) {
    // Instantiate ClaudeClient lazily; tolerate missing API key in test environments
    if (ClaudeClient.isConfigured()) {
      this.claudeClient = new ClaudeClient();
    }
  }

  /**
   * Run all consistency checks
   */
  async checkAll(): Promise<ConsistencyCheckResult> {
    console.log('Running consistency checks...');

    const issues: Partial<ConsistencyIssue>[] = [];

    // Run all check types in parallel.
    // checkWorldRuleViolations handles its own DB inserts, so we collect its
    // results separately and skip the generic insertIssue loop for them.
    const [
      attributeIssues,
      timelineIssues,
      worldRuleIssues,
      plotThreadIssues,
    ] = await Promise.all([
      this.checkCharacterAttributes(),
      this.checkTimelineConsistency(),
      this.checkWorldRuleViolations(),
      this.checkUnresolvedPlotThreads(),
    ]);

    // Insert issues that don't self-insert
    const selfInsertedIssues: Partial<ConsistencyIssue>[] = [...worldRuleIssues];
    const needsInsert: Partial<ConsistencyIssue>[] = [
      ...attributeIssues,
      ...timelineIssues,
      ...plotThreadIssues,
    ];

    for (const issue of needsInsert) {
      await this.insertIssue(issue);
    }

    issues.push(...needsInsert, ...selfInsertedIssues);

    // Count by severity
    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const info = issues.filter((i) => i.severity === 'info').length;

    console.log(
      `Consistency check complete: ${errors} errors, ${warnings} warnings, ${info} info`
    );

    return { issues, errors, warnings, info };
  }

  /**
   * Check for character attribute contradictions
   * Example: "blue eyes" in Ch 3, "brown eyes" in Ch 15
   */
  private async checkCharacterAttributes(): Promise<
    Partial<ConsistencyIssue>[]
  > {
    const query = `
      SELECT
        c.id as character_id,
        c.name as character_name,
        ca1.attribute_name,
        ca1.attribute_value as first_value,
        ca1.first_mentioned_chapter_id as first_chapter,
        ch1.chapter_number as first_chapter_number,
        ca1.first_mentioned_line as first_line,
        ca2.attribute_value as second_value,
        ca2.first_mentioned_chapter_id as second_chapter,
        ch2.chapter_number as second_chapter_number,
        ca2.first_mentioned_line as second_line
      FROM character_attributes ca1
      JOIN character_attributes ca2 ON
        ca1.character_id = ca2.character_id
        AND ca1.attribute_name = ca2.attribute_name
        AND ca1.attribute_value != ca2.attribute_value
        AND ca1.id < ca2.id
      JOIN characters c ON c.id = ca1.character_id
      LEFT JOIN chapters ch1 ON ch1.id = ca1.first_mentioned_chapter_id
      LEFT JOIN chapters ch2 ON ch2.id = ca2.first_mentioned_chapter_id
      WHERE c.project_id = ?
    `;

    const conflicts = await this.mcpClient.readQuery<ConflictRow>(query, [this.projectId]);

    return conflicts.map((conflict) => ({
      issueType: 'character_attribute' as const,
      severity: 'error' as const,
      description: `Character attribute conflict for ${conflict.character_name}: "${conflict.attribute_name}" is "${conflict.first_value}" in Chapter ${conflict.first_chapter_number || '?'} but "${conflict.second_value}" in Chapter ${conflict.second_chapter_number || '?'}`,
      characterId: conflict.character_id,
      chapterId: conflict.second_chapter ?? undefined,
    }));
  }

  /**
   * Check for timeline contradictions
   * Example: Event A happens after Event B, but character references B before A
   */
  private async checkTimelineConsistency(): Promise<
    Partial<ConsistencyIssue>[]
  > {
    const issues: Partial<ConsistencyIssue>[] = [];

    // Check 1: Timestamp-dependency conflicts
    const conflictQuery = `
      SELECT
        e1.id as event1_id,
        e1.event_name as event1_name,
        e1.story_timestamp as ts1,
        s1.id as scene1_id,
        c1.chapter_number as chapter1,
        e2.id as event2_id,
        e2.event_name as event2_name,
        e2.story_timestamp as ts2,
        s2.id as scene2_id,
        c2.chapter_number as chapter2,
        ed.dependency_type
      FROM timeline_events e1
      JOIN event_dependencies ed ON e1.id = ed.event_before_id
      JOIN timeline_events e2 ON ed.event_after_id = e2.id
      LEFT JOIN scenes s1 ON e1.scene_id = s1.id
      LEFT JOIN chapters c1 ON s1.chapter_id = c1.id
      LEFT JOIN scenes s2 ON e2.scene_id = s2.id
      LEFT JOIN chapters c2 ON s2.chapter_id = c2.id
      WHERE e1.project_id = ?
        AND e1.story_timestamp IS NOT NULL
        AND e2.story_timestamp IS NOT NULL
        AND e1.story_timestamp > e2.story_timestamp
    `;

    const conflicts = await this.mcpClient.readQuery<TimelineConflictRow>(conflictQuery, [this.projectId]);

    issues.push(...conflicts.map((conflict) => ({
      issueType: 'timeline' as const,
      severity: 'error' as const,
      description: `Timeline conflict (${conflict.dependency_type || 'sequence'}): "${conflict.event1_name}" (timestamp ${conflict.ts1}, Ch ${conflict.chapter1 || '?'}) is marked as happening before "${conflict.event2_name}" (timestamp ${conflict.ts2}, Ch ${conflict.chapter2 || '?'}), but timestamps are reversed`,
      sceneId: conflict.scene2_id ?? undefined,
      chapterId: conflict.chapter2 ?? undefined,
    })));

    // Check 2: Events without timestamps that have dependencies
    const missingTimestampQuery = `
      SELECT
        e.id as event_id,
        e.event_name,
        s.id as scene_id,
        c.chapter_number
      FROM timeline_events e
      LEFT JOIN scenes s ON e.scene_id = s.id
      LEFT JOIN chapters c ON s.chapter_id = c.id
      WHERE e.project_id = ?
        AND e.story_timestamp IS NULL
        AND e.is_backstory = 0
        AND e.event_type = 'plot'
        AND EXISTS (
          SELECT 1 FROM event_dependencies ed
          WHERE ed.event_before_id = e.id OR ed.event_after_id = e.id
        )
    `;

    const missingTimestamps = await this.mcpClient.readQuery<MissingTimestampRow>(missingTimestampQuery, [this.projectId]);

    issues.push(...missingTimestamps.map((event) => ({
      issueType: 'timeline' as const,
      severity: 'warning' as const,
      description: `Plot event "${event.event_name}" has dependencies but no timestamp (Ch ${event.chapter_number || '?'}). Add a timestamp for proper chronology tracking.`,
      sceneId: event.scene_id ?? undefined,
      chapterId: event.chapter_number ?? undefined,
    })));

    // Check 3: Orphaned timeline events (linked to non-existent scenes)
    const orphanedEventsQuery = `
      SELECT
        e.id as event_id,
        e.event_name,
        e.scene_id
      FROM timeline_events e
      WHERE e.project_id = ?
        AND e.scene_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM scenes WHERE id = e.scene_id)
    `;

    const orphanedEvents = await this.mcpClient.readQuery<MissingTimestampRow>(orphanedEventsQuery, [this.projectId]);

    issues.push(...orphanedEvents.map((event) => ({
      issueType: 'timeline' as const,
      severity: 'warning' as const,
      description: `Timeline event "${event.event_name}" references non-existent scene (ID: ${event.scene_id}). Update or remove the scene reference.`,
    })));

    return issues;
  }

  /**
   * Check for world rule violations using AI analysis of chapter text.
   *
   * Loads all hard world rules and all chapters (using summary as content),
   * then batches the rules into Claude prompts (max {@link WORLD_RULE_BATCH_SIZE}
   * per batch) and parses the response for violations.
   *
   * Can be called privately as part of {@link checkAll}, or publicly for a
   * targeted world-rule scan.
   *
   * @param projectId Optional override; defaults to the instance's projectId.
   */
  async checkWorldRuleViolations(
    projectId?: string | number
  ): Promise<ConsistencyIssue[]> {
    const pid = projectId !== undefined ? projectId : this.projectId;

    // 1. Load all hard world rules
    const rulesQuery = `
      SELECT id, rule_name, description, rule_category
      FROM world_rules
      WHERE project_id = ?
        AND is_hard_rule = 1
    `;
    const rules = await this.mcpClient.readQuery<WorldRuleRow>(rulesQuery, [pid]);

    if (rules.length === 0) {
      return [];
    }

    // 2. Load chapters with their scenes (using summary as available text)
    const chaptersQuery = `
      SELECT
        c.id        AS chapter_id,
        c.title     AS chapter_title,
        c.chapter_number,
        c.summary   AS chapter_text
      FROM chapters c
      WHERE c.project_id = ?
      ORDER BY c.chapter_number
    `;
    const chapters = await this.mcpClient.readQuery<ChapterRow>(chaptersQuery, [pid]);

    const allIssues: ConsistencyIssue[] = [];

    for (const chapter of chapters) {
      const rawText: string = chapter.chapter_text ?? '';
      if (!rawText.trim()) {
        // No text to analyse for this chapter
        continue;
      }

      // Truncate to token-budget limit
      const chapterText = rawText.length > CHAPTER_TEXT_LIMIT
        ? rawText.slice(0, CHAPTER_TEXT_LIMIT) + '…'
        : rawText;

      // 3. Batch hard rules so each prompt stays within token limits
      for (let i = 0; i < rules.length; i += WORLD_RULE_BATCH_SIZE) {
        const batch = rules.slice(i, i + WORLD_RULE_BATCH_SIZE);

        const rulesList = batch
          .map(
            (r, idx) =>
              `${i + idx + 1}. [${r.rule_category}] ${r.rule_name}: ${r.description}`
          )
          .join('\n');

        const prompt = `You are checking a novel manuscript for world rule violations.
World rules established by the author:
${rulesList}

Chapter ${chapter.chapter_number}: "${chapter.chapter_title ?? 'Untitled'}"
Content:
${chapterText}

List any apparent violations of the world rules above. For each violation, specify:
- Rule number violated
- Quote the specific passage (max 100 chars)
- Brief explanation

If no violations found, respond with "NO_VIOLATIONS".`;

        let responseText: string;
        if (this.claudeClient) {
          const response = await this.claudeClient.generate(prompt, {
            maxTokens: 512,
            temperature: 0.2,
          });
          responseText = response.content;
        } else {
          // No API key — skip AI analysis (test/offline environments)
          continue;
        }

        if (responseText.includes('NO_VIOLATIONS')) {
          continue;
        }

        // 4. Parse the response into individual violations
        const violations = this.parseViolationResponse(
          responseText,
          batch,
          i
        );

        // 5. Store each violation and collect the resulting issues
        for (const violation of violations) {
          const description =
            `World rule violation in Chapter ${chapter.chapter_number} ` +
            `("${chapter.chapter_title ?? 'Untitled'}"): ${violation.explanation} ` +
            `— passage: "${violation.passage}"`;

          const issue = await this.insertWorldRuleIssue({
            projectId: pid,
            chapterId: chapter.chapter_id,
            description,
          });

          if (issue) {
            allIssues.push(issue);
          }
        }
      }
    }

    return allIssues;
  }

  /**
   * Parse Claude's violation response into structured objects.
   * Handles numbered lists like "1. Rule 2 violated\n- passage: "...\n- explanation: ..."
   */
  private parseViolationResponse(
    responseText: string,
    batch: WorldRuleRow[],
    batchOffset: number
  ): Array<{ ruleIndex: number; passage: string; explanation: string }> {
    const violations: Array<{ ruleIndex: number; passage: string; explanation: string }> = [];

    // Split on lines that start a new numbered item (1. / 2. / etc.)
    const items = responseText
      .split(/\n(?=\d+[\.\)])/g)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const item of items) {
      // Extract rule number reference
      const ruleNumMatch = item.match(/rule\s+(\d+)/i);
      const ruleIndex = ruleNumMatch
        ? parseInt(ruleNumMatch[1], 10) - 1 - batchOffset
        : 0;

      // Extract quoted passage (up to 100 chars)
      const passageMatch = item.match(/["""]([^"""]{1,100})["""]/);
      const passage = passageMatch
        ? passageMatch[1]
        : item.slice(0, 100).replace(/\n/g, ' ');

      // Extract explanation — everything after the passage quote, or the whole item
      const explanationMatch = item.match(
        /(?:explanation|reason|because|–|—|-)\s*(.+)/is
      );
      const explanation = explanationMatch
        ? explanationMatch[1].trim().slice(0, 200)
        : item.replace(/\n/g, ' ').slice(0, 200);

      const resolvedIndex = Math.max(
        0,
        Math.min(ruleIndex, batch.length - 1)
      );

      violations.push({
        ruleIndex: resolvedIndex,
        passage,
        explanation,
      });
    }

    return violations;
  }

  /**
   * Insert a world rule violation into consistency_issues, deduplicating by
   * description. Returns the newly inserted issue, or null if already exists.
   */
  private async insertWorldRuleIssue(params: {
    projectId: string | number;
    chapterId: number;
    description: string;
  }): Promise<ConsistencyIssue | null> {
    const { projectId, chapterId, description } = params;

    // Deduplication check
    const existingQuery = `
      SELECT id FROM consistency_issues
      WHERE project_id = ?
        AND issue_type = 'world_rule'
        AND description = ?
        AND status IN ('open', 'acknowledged')
    `;
    const existing = await this.mcpClient.readQuery<IssueRow>(existingQuery, [
      projectId,
      description,
    ]);

    if (existing.length > 0) {
      return null;
    }

    const now = new Date().toISOString();
    await this.mcpClient.writeQuery(
      `INSERT OR IGNORE INTO consistency_issues
         (project_id, issue_type, severity, description, chapter_id, detected_at, status)
       VALUES (?, 'world_rule', 'error', ?, ?, ?, 'open')`,
      [projectId, description, chapterId, now]
    );

    // Retrieve the just-inserted row
    const rows = await this.mcpClient.readQuery<IssueRow>(
      `SELECT * FROM consistency_issues
       WHERE project_id = ? AND issue_type = 'world_rule' AND description = ?
       ORDER BY detected_at DESC LIMIT 1`,
      [projectId, description]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      projectId: row.project_id,
      issueType: 'world_rule',
      severity: 'error',
      description: row.description,
      chapterId: row.chapter_id,
      sceneId: row.scene_id,
      characterId: row.character_id,
      locationId: row.location_id,
      detectedAt: new Date(row.detected_at),
      status: 'open',
      resolutionNotes: row.resolution_notes,
    } as ConsistencyIssue;
  }

  /**
   * Check for unresolved plot threads
   */
  private async checkUnresolvedPlotThreads(): Promise<
    Partial<ConsistencyIssue>[]
  > {
    const query = `
      SELECT
        pt.*,
        c.chapter_number as introduced_chapter
      FROM plot_threads pt
      LEFT JOIN scenes s ON pt.introduced_scene_id = s.id
      LEFT JOIN chapters c ON s.chapter_id = c.id
      WHERE pt.project_id = ?
        AND pt.status = 'active'
        AND pt.resolved_scene_id IS NULL
    `;

    const unresolved = await this.mcpClient.readQuery<PlotThreadRow>(query, [this.projectId]);

    // Only flag high-priority threads as warnings
    return unresolved
      .filter((thread) => thread.priority >= 4)
      .map((thread) => ({
        issueType: 'continuity',
        severity: 'info',
        description: `High-priority plot thread "${thread.thread_name}" (introduced in Ch ${thread.introduced_chapter || '?'}) is still unresolved`,
      }));
  }

  /**
   * Insert a consistency issue into the database
   */
  private async insertIssue(issue: Partial<ConsistencyIssue>): Promise<void> {
    // Check if identical issue already exists and is open
    const existingQuery = `
      SELECT id FROM consistency_issues
      WHERE project_id = ?
        AND issue_type = ?
        AND description = ?
        AND status IN ('open', 'acknowledged')
    `;

    const existing = await this.mcpClient.readQuery<IssueRow>(existingQuery, [
      this.projectId,
      issue.issueType,
      issue.description,
    ]);

    if (existing.length > 0) {
      // Issue already exists, don't duplicate
      return;
    }

    // Insert new issue
    const insertQuery = `
      INSERT INTO consistency_issues (
        project_id, issue_type, severity, description,
        chapter_id, scene_id, character_id, location_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.mcpClient.writeQuery(insertQuery, [
      this.projectId,
      issue.issueType,
      issue.severity,
      issue.description,
      issue.chapterId || null,
      issue.sceneId || null,
      issue.characterId || null,
      issue.locationId || null,
    ]);
  }

  /**
   * Acknowledge an issue (mark as acknowledged by author)
   */
  async acknowledgeIssue(issueId: number, notes?: string): Promise<void> {
    const query = `
      UPDATE consistency_issues
      SET status = 'acknowledged',
          resolution_notes = ?
      WHERE id = ?
    `;
    await this.mcpClient.writeQuery(query, [notes || null, issueId]);
  }

  /**
   * Resolve an issue (mark as fixed)
   */
  async resolveIssue(issueId: number, notes?: string): Promise<void> {
    const query = `
      UPDATE consistency_issues
      SET status = 'resolved',
          resolution_notes = ?
      WHERE id = ?
    `;
    await this.mcpClient.writeQuery(query, [notes || null, issueId]);
  }

  /**
   * Mark issue as false positive
   */
  async markFalsePositive(issueId: number, notes?: string): Promise<void> {
    const query = `
      UPDATE consistency_issues
      SET status = 'false_positive',
          resolution_notes = ?
      WHERE id = ?
    `;
    await this.mcpClient.writeQuery(query, [notes || null, issueId]);
  }

  /**
   * Get all open issues
   */
  async getOpenIssues(
    severity?: 'info' | 'warning' | 'error'
  ): Promise<ConsistencyIssue[]> {
    let query = `
      SELECT
        ci.*,
        c.chapter_number,
        ch.name as character_name,
        l.name as location_name
      FROM consistency_issues ci
      LEFT JOIN chapters c ON ci.chapter_id = c.id
      LEFT JOIN characters ch ON ci.character_id = ch.id
      LEFT JOIN locations l ON ci.location_id = l.id
      WHERE ci.project_id = ?
        AND ci.status = 'open'
    `;

    const params: unknown[] = [this.projectId];

    if (severity) {
      query += ' AND ci.severity = ?';
      params.push(severity);
    }

    query += ' ORDER BY ci.severity DESC, ci.detected_at DESC';

    return (await this.mcpClient.readQuery(query, params)) as ConsistencyIssue[];
  }
}
