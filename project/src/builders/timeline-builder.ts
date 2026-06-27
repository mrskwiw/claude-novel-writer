/**
 * Timeline Builder
 * Creates and manages timeline events for tracking story chronology
 */

import type { MCPClient } from '../core/database.js';

export interface TimelineEvent {
  id?: number;
  projectId: number;
  eventName: string;
  eventType?: 'plot' | 'backstory' | 'world_history';
  description?: string;
  storyDate?: string; // In-universe date (flexible format: "2024-05-01", "Summer 1995", "Three days after arrival")
  storyTimestamp?: number; // Unix-style timestamp for precise ordering
  sceneId?: number; // Which scene depicts this event
  isBackstory?: boolean;
  importance?: number; // 1-10 scale
}

export interface EventDependency {
  id?: number;
  eventBeforeId: number;
  eventAfterId: number;
  dependencyType?: 'sequence' | 'causation' | 'reference';
  notes?: string;
}

export interface TimelineBuilderOptions {
  projectId: number;
  mcpClient: MCPClient;
}

export class TimelineBuilder {
  private projectId: number;
  private mcpClient: MCPClient;

  constructor(options: TimelineBuilderOptions) {
    this.projectId = options.projectId;
    this.mcpClient = options.mcpClient;
  }

  /**
   * Create a new timeline event
   */
  async createEvent(event: Omit<TimelineEvent, 'id' | 'projectId'>): Promise<number> {
    // Validate importance
    if (event.importance !== undefined && (event.importance < 1 || event.importance > 10)) {
      throw new Error('Importance must be between 1 and 10');
    }

    // Validate event type
    if (event.eventType && !['plot', 'backstory', 'world_history'].includes(event.eventType)) {
      throw new Error('Event type must be one of: plot, backstory, world_history');
    }

    await this.mcpClient.writeQuery(
      `INSERT INTO timeline_events (
        project_id, event_name, event_type, description,
        story_date, story_timestamp, scene_id, is_backstory, importance
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        this.projectId,
        event.eventName,
        event.eventType || null,
        event.description || null,
        event.storyDate || null,
        event.storyTimestamp || null,
        event.sceneId || null,
        event.isBackstory ? 1 : 0,
        event.importance || null,
      ]
    );

    // Get the inserted ID
    const idQuery = 'SELECT last_insert_rowid() as id';
    const result = await this.mcpClient.readQuery<{ id: number }>(idQuery);
    return result[0].id;
  }

  /**
   * Get a timeline event by ID
   */
  async getEvent(eventId: number): Promise<TimelineEvent | null> {
    const events = await this.mcpClient.readQuery(
      'SELECT * FROM timeline_events WHERE id = ? AND project_id = ?',
      [eventId, this.projectId]
    );

    if (events.length === 0) {
      return null;
    }

    return this.mapDbRowToEvent(events[0]);
  }

  /**
   * Get a timeline event by name
   */
  async getEventByName(eventName: string): Promise<TimelineEvent | null> {
    const events = await this.mcpClient.readQuery(
      'SELECT * FROM timeline_events WHERE event_name = ? AND project_id = ?',
      [eventName, this.projectId]
    );

    if (events.length === 0) {
      return null;
    }

    return this.mapDbRowToEvent(events[0]);
  }

  /**
   * Get all timeline events, optionally filtered
   */
  async getAllEvents(options?: {
    eventType?: string;
    isBackstory?: boolean;
    minImportance?: number;
  }): Promise<TimelineEvent[]> {
    let query = 'SELECT * FROM timeline_events WHERE project_id = ?';
    const params: unknown[] = [this.projectId];

    if (options?.eventType) {
      query += ' AND event_type = ?';
      params.push(options.eventType);
    }

    if (options?.isBackstory !== undefined) {
      query += ' AND is_backstory = ?';
      params.push(options.isBackstory ? 1 : 0);
    }

    if (options?.minImportance !== undefined) {
      query += ' AND importance >= ?';
      params.push(options.minImportance);
    }

    query += ' ORDER BY story_timestamp ASC, created_at ASC';

    const events = await this.mcpClient.readQuery(query, params);
    return events.map((row) => this.mapDbRowToEvent(row));
  }

  /**
   * Update an existing timeline event
   */
  async updateEvent(eventId: number, updates: Partial<Omit<TimelineEvent, 'id' | 'projectId'>>): Promise<void> {
    // Validate importance if provided
    if (updates.importance !== undefined && (updates.importance < 1 || updates.importance > 10)) {
      throw new Error('Importance must be between 1 and 10');
    }

    // Build dynamic update query
    const setClause: string[] = [];
    const params: unknown[] = [];

    if (updates.eventName !== undefined) {
      setClause.push('event_name = ?');
      params.push(updates.eventName);
    }
    if (updates.eventType !== undefined) {
      setClause.push('event_type = ?');
      params.push(updates.eventType);
    }
    if (updates.description !== undefined) {
      setClause.push('description = ?');
      params.push(updates.description);
    }
    if (updates.storyDate !== undefined) {
      setClause.push('story_date = ?');
      params.push(updates.storyDate);
    }
    if (updates.storyTimestamp !== undefined) {
      setClause.push('story_timestamp = ?');
      params.push(updates.storyTimestamp);
    }
    if (updates.sceneId !== undefined) {
      setClause.push('scene_id = ?');
      params.push(updates.sceneId);
    }
    if (updates.isBackstory !== undefined) {
      setClause.push('is_backstory = ?');
      params.push(updates.isBackstory ? 1 : 0);
    }
    if (updates.importance !== undefined) {
      setClause.push('importance = ?');
      params.push(updates.importance);
    }

    if (setClause.length === 0) {
      return; // Nothing to update
    }

    params.push(eventId, this.projectId);

    await this.mcpClient.writeQuery(
      `UPDATE timeline_events SET ${setClause.join(', ')} WHERE id = ? AND project_id = ?`,
      params
    );
  }

  /**
   * Delete a timeline event
   */
  async deleteEvent(eventId: number): Promise<void> {
    await this.mcpClient.writeQuery(
      'DELETE FROM timeline_events WHERE id = ? AND project_id = ?',
      [eventId, this.projectId]
    );
  }

  /**
   * Create a dependency between two events (A must happen before B)
   */
  async createDependency(dependency: Omit<EventDependency, 'id'>): Promise<number> {
    // Validate dependency type
    if (dependency.dependencyType && !['sequence', 'causation', 'reference'].includes(dependency.dependencyType)) {
      throw new Error('Dependency type must be one of: sequence, causation, reference');
    }

    // Check if both events exist
    const event1 = await this.getEvent(dependency.eventBeforeId);
    const event2 = await this.getEvent(dependency.eventAfterId);

    if (!event1) {
      throw new Error(`Event with ID ${dependency.eventBeforeId} not found`);
    }
    if (!event2) {
      throw new Error(`Event with ID ${dependency.eventAfterId} not found`);
    }

    await this.mcpClient.writeQuery(
      `INSERT INTO event_dependencies (
        event_before_id, event_after_id, dependency_type, notes
      ) VALUES (?, ?, ?, ?)`,
      [
        dependency.eventBeforeId,
        dependency.eventAfterId,
        dependency.dependencyType || 'sequence',
        dependency.notes || null,
      ]
    );

    // Get the inserted ID
    const idQuery = 'SELECT last_insert_rowid() as id';
    const result = await this.mcpClient.readQuery<{ id: number }>(idQuery);
    return result[0].id;
  }

  /**
   * Get all dependencies for an event
   */
  async getEventDependencies(eventId: number): Promise<{
    before: EventDependency[]; // Events that must happen before this one
    after: EventDependency[]; // Events that must happen after this one
  }> {
    // Events that must happen before this one
    const beforeDeps = await this.mcpClient.readQuery(
      `SELECT * FROM event_dependencies WHERE event_after_id = ?`,
      [eventId]
    );

    // Events that must happen after this one
    const afterDeps = await this.mcpClient.readQuery(
      `SELECT * FROM event_dependencies WHERE event_before_id = ?`,
      [eventId]
    );

    return {
      before: beforeDeps.map((row) => this.mapDbRowToDependency(row)),
      after: afterDeps.map((row) => this.mapDbRowToDependency(row)),
    };
  }

  /**
   * Delete a dependency
   */
  async deleteDependency(dependencyId: number): Promise<void> {
    await this.mcpClient.writeQuery(
      'DELETE FROM event_dependencies WHERE id = ?',
      [dependencyId]
    );
  }

  /**
   * Get timeline conflicts (events with dependencies but wrong timestamps)
   */
  async getConflicts(): Promise<Array<{
    event1: TimelineEvent;
    event2: TimelineEvent;
    dependency: EventDependency;
    conflict: string;
  }>> {
    const query = `
      SELECT
        e1.id as e1_id, e1.event_name as e1_name, e1.story_timestamp as e1_ts,
        e2.id as e2_id, e2.event_name as e2_name, e2.story_timestamp as e2_ts,
        ed.id as dep_id, ed.dependency_type as dep_type, ed.notes as dep_notes
      FROM timeline_events e1
      JOIN event_dependencies ed ON e1.id = ed.event_before_id
      JOIN timeline_events e2 ON ed.event_after_id = e2.id
      WHERE e1.project_id = ?
        AND e2.project_id = ?
        AND e1.story_timestamp IS NOT NULL
        AND e2.story_timestamp IS NOT NULL
        AND e1.story_timestamp > e2.story_timestamp
    `;

    const conflicts = await this.mcpClient.readQuery(query, [this.projectId, this.projectId]);

    return conflicts.map((row) => ({
      event1: {
        id: row.e1_id,
        projectId: this.projectId,
        eventName: row.e1_name,
        storyTimestamp: row.e1_ts,
      } as TimelineEvent,
      event2: {
        id: row.e2_id,
        projectId: this.projectId,
        eventName: row.e2_name,
        storyTimestamp: row.e2_ts,
      } as TimelineEvent,
      dependency: {
        id: row.dep_id,
        eventBeforeId: row.e1_id,
        eventAfterId: row.e2_id,
        dependencyType: row.dep_type,
        notes: row.dep_notes,
      } as EventDependency,
      conflict: `"${row.e1_name}" (ts: ${row.e1_ts}) is marked as happening before "${row.e2_name}" (ts: ${row.e2_ts}), but timestamps are reversed`,
    }));
  }

  /**
   * Map database row to TimelineEvent
   */
  private mapDbRowToEvent(row: Record<string, unknown>): TimelineEvent {
    return {
      id: row.id as number | undefined,
      projectId: row.project_id as number,
      eventName: row.event_name as string,
      eventType: row.event_type as TimelineEvent['eventType'],
      description: row.description as string | undefined,
      storyDate: row.story_date as string | undefined,
      storyTimestamp: row.story_timestamp as number | undefined,
      sceneId: row.scene_id as number | undefined,
      isBackstory: Boolean(row.is_backstory),
      importance: row.importance as number | undefined,
    };
  }

  /**
   * Map database row to EventDependency
   */
  private mapDbRowToDependency(row: Record<string, unknown>): EventDependency {
    return {
      id: row.id as number | undefined,
      eventBeforeId: row.event_before_id as number,
      eventAfterId: row.event_after_id as number,
      dependencyType: row.dependency_type as EventDependency['dependencyType'],
      notes: row.notes as string | undefined,
    };
  }
}
