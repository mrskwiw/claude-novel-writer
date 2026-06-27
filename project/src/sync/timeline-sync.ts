/**
 * Timeline file to database synchronization
 * Handles YAML timeline files → database
 */

import { readFile, readdir, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import YAML from 'yaml';
import type { MCPClient } from '../core/database.js';
import type { TimelineEvent, EventDependency } from '../builders/timeline-builder.js';

// ─── DB row types ─────────────────────────────────────────────────────────────

interface TimelineEventRow {
  id: number;
  event_name: string;
  event_type: 'plot' | 'backstory' | 'world_history' | null;
  description: string | null;
  story_date: string | null;
  story_timestamp: number | null;
  is_backstory: number;
  importance: number | null;
}

interface DependencyRow {
  event_before_id: number;
  event_after_id: number;
  after_name: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface TimelineYAML {
  events: Array<{
    name: string;
    type?: 'plot' | 'backstory' | 'world_history';
    description?: string;
    storyDate?: string;
    storyTimestamp?: number;
    sceneReference?: string; // Scene name/identifier
    isBackstory?: boolean;
    importance?: number;
    happensBefore?: string[]; // Names of events that must happen after this one
  }>;
}

export class TimelineSync {
  constructor(
    private mcpClient: MCPClient,
    private projectId: number,
    private projectPath: string
  ) {}

  /**
   * Sync a timeline YAML file to the database
   */
  async syncTimelineFile(filePath: string): Promise<void> {
    console.log(`Syncing timeline from ${filePath}...`);

    // Read and parse YAML
    const content = await readFile(filePath, 'utf-8');
    const timeline = YAML.parse(content) as TimelineYAML;

    if (!timeline.events || !Array.isArray(timeline.events)) {
      throw new Error(`Timeline file ${filePath} missing 'events' array`);
    }

    // First pass: Create/update all events
    const eventNameToId = new Map<string, number>();

    for (const event of timeline.events) {
      if (!event.name) {
        console.warn('Skipping event without name');
        continue;
      }

      const eventId = await this.upsertEvent(event);
      eventNameToId.set(event.name, eventId);
    }

    // Second pass: Create dependencies
    for (const event of timeline.events) {
      if (event.happensBefore && event.happensBefore.length > 0) {
        const eventBeforeId = eventNameToId.get(event.name);
        if (!eventBeforeId) continue;

        for (const afterEventName of event.happensBefore) {
          const eventAfterId = eventNameToId.get(afterEventName);
          if (!eventAfterId) {
            console.warn(`Event "${afterEventName}" referenced in happensBefore but not found`);
            continue;
          }

          await this.upsertDependency(eventBeforeId, eventAfterId);
        }
      }
    }

    console.log(`Timeline synced successfully: ${timeline.events.length} events`);
  }

  /**
   * Sync all timeline files in the timeline directory
   */
  async syncAllTimelines(): Promise<{ synced: number; errors: string[] }> {
    const timelineDir = join(this.projectPath, 'timeline');
    const errors: string[] = [];
    let synced = 0;

    try {
      const files = await readdir(timelineDir);
      const yamlFiles = files.filter(
        (f) => f.endsWith('.yaml') || f.endsWith('.yml')
      );

      for (const file of yamlFiles) {
        try {
          await this.syncTimelineFile(join(timelineDir, file));
          synced++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${file}: ${message}`);
        }
      }
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.log('No timeline directory found');
        return { synced: 0, errors: [] };
      }
      throw error;
    }

    return { synced, errors };
  }

  /**
   * Export all timeline events to a YAML file
   */
  async exportToYAML(outputPath: string): Promise<void> {
    // Get all events
    const query = `
      SELECT * FROM timeline_events
      WHERE project_id = ?
      ORDER BY story_timestamp ASC, created_at ASC
    `;
    const events = await this.mcpClient.readQuery<TimelineEventRow>(query, [this.projectId]);

    // Get all dependencies
    const depsQuery = `
      SELECT ed.*, e1.event_name as before_name, e2.event_name as after_name
      FROM event_dependencies ed
      JOIN timeline_events e1 ON ed.event_before_id = e1.id
      JOIN timeline_events e2 ON ed.event_after_id = e2.id
      WHERE e1.project_id = ?
    `;
    const dependencies = await this.mcpClient.readQuery<DependencyRow>(depsQuery, [this.projectId]);

    // Build dependencies map
    const eventDeps = new Map<number, string[]>();
    for (const dep of dependencies) {
      const befores = eventDeps.get(dep.event_before_id) || [];
      befores.push(dep.after_name);
      eventDeps.set(dep.event_before_id, befores);
    }

    // Build YAML structure
    const timelineYAML: TimelineYAML = {
      events: events.map((event) => {
        const yamlEvent: TimelineYAML['events'][0] = {
          name: event.event_name,
        };

        if (event.event_type) yamlEvent.type = event.event_type;
        if (event.description) yamlEvent.description = event.description;
        if (event.story_date) yamlEvent.storyDate = event.story_date;
        if (event.story_timestamp) yamlEvent.storyTimestamp = event.story_timestamp;
        if (event.is_backstory) yamlEvent.isBackstory = true;
        if (event.importance) yamlEvent.importance = event.importance;

        const happensBefore = eventDeps.get(event.id);
        if (happensBefore && happensBefore.length > 0) {
          yamlEvent.happensBefore = happensBefore;
        }

        return yamlEvent;
      }),
    };

    // Ensure output directory exists
    await mkdir(dirname(outputPath), { recursive: true });

    // Write YAML file
    const yamlContent = YAML.stringify(timelineYAML, {
      indent: 2,
      lineWidth: 0, // Disable line wrapping
    });

    await writeFile(outputPath, yamlContent, 'utf-8');
    console.log(`Timeline exported to ${outputPath}`);
  }

  /**
   * Insert or update an event
   */
  private async upsertEvent(event: TimelineYAML['events'][0]): Promise<number> {
    // Check if event exists
    const existingQuery = `
      SELECT id FROM timeline_events
      WHERE project_id = ? AND event_name = ?
    `;
    const existing = await this.mcpClient.readQuery<{ id: number }>(existingQuery, [
      this.projectId,
      event.name,
    ]);

    if (existing.length > 0) {
      // Update existing
      const updateQuery = `
        UPDATE timeline_events
        SET event_type = ?,
            description = ?,
            story_date = ?,
            story_timestamp = ?,
            is_backstory = ?,
            importance = ?
        WHERE id = ?
      `;

      await this.mcpClient.writeQuery(updateQuery, [
        event.type || null,
        event.description || null,
        event.storyDate || null,
        event.storyTimestamp || null,
        event.isBackstory ? 1 : 0,
        event.importance || null,
        existing[0].id,
      ]);

      return existing[0].id;
    } else {
      // Insert new
      const insertQuery = `
        INSERT INTO timeline_events (
          project_id, event_name, event_type, description,
          story_date, story_timestamp, is_backstory, importance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.mcpClient.writeQuery(insertQuery, [
        this.projectId,
        event.name,
        event.type || null,
        event.description || null,
        event.storyDate || null,
        event.storyTimestamp || null,
        event.isBackstory ? 1 : 0,
        event.importance || null,
      ]);

      // Get the inserted ID
      const idQuery = 'SELECT last_insert_rowid() as id';
      const result = await this.mcpClient.readQuery<{ id: number }>(idQuery);
      return result[0].id;
    }
  }

  /**
   * Insert or update a dependency
   */
  private async upsertDependency(eventBeforeId: number, eventAfterId: number): Promise<void> {
    // Check if dependency exists
    const existingQuery = `
      SELECT id FROM event_dependencies
      WHERE event_before_id = ? AND event_after_id = ?
    `;
    const existing = await this.mcpClient.readQuery<{ id: number }>(existingQuery, [
      eventBeforeId,
      eventAfterId,
    ]);

    if (existing.length === 0) {
      // Insert new dependency
      const insertQuery = `
        INSERT INTO event_dependencies (event_before_id, event_after_id, dependency_type)
        VALUES (?, ?, 'sequence')
      `;

      await this.mcpClient.writeQuery(insertQuery, [eventBeforeId, eventAfterId]);
    }
    // If it exists, no need to update (dependencies are simple relationships)
  }
}
