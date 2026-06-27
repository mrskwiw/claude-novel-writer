/**
 * Integration Test: Complete Timeline Workflow
 * Tests timeline creation → sync → conflict detection cycle
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TimelineBuilder } from '../../../project/src/builders/timeline-builder.js';
import { TimelineSync } from '../../../project/src/sync/timeline-sync.js';
import { getTestProjectPath } from '../../setup.js';
import { TestNovelWriterExtension } from '../../helpers/test-extension.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import YAML from 'yaml';

describe('Timeline Workflow (Integration)', () => {
  let builder: TimelineBuilder;
  let sync: TimelineSync;
  let extension: TestNovelWriterExtension;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = getTestProjectPath();
    // Use TestNovelWriterExtension with real SQLite so multi-table JOINs
    // (conflict detection, exportToYAML) work correctly in integration tests.
    extension = new TestNovelWriterExtension(projectPath);
    await extension.initialize({
      title: 'Test Novel',
      author: 'Test Author',
      genre: 'Fantasy',
      targetWordCount: 80000,
    });
    builder = extension.getTimelineBuilder();
    sync = extension.getTimelineSync();

    // Ensure timeline directory exists
    const timelineDir = join(projectPath, 'timeline');
    if (!existsSync(timelineDir)) {
      await mkdir(timelineDir, { recursive: true });
    }
  });

  afterEach(() => {
    extension.cleanup();
  });

  it('should complete create-dependency-conflict detection cycle', async () => {
    // Step 1: Create timeline events
    const event1Id = await builder.createEvent({
      eventName: 'Hero discovers quest',
      eventType: 'plot',
      description: 'The protagonist learns of their destiny',
      storyTimestamp: 100,
      importance: 9,
    });

    const event2Id = await builder.createEvent({
      eventName: 'Hero meets mentor',
      eventType: 'plot',
      description: 'An experienced guide appears',
      storyTimestamp: 200,
      importance: 8,
    });

    const event3Id = await builder.createEvent({
      eventName: 'Hero gains power',
      eventType: 'plot',
      description: 'The protagonist unlocks their abilities',
      storyTimestamp: 300,
      importance: 10,
    });

    // Verify events created
    expect(event1Id).toBeGreaterThan(0);
    expect(event2Id).toBeGreaterThan(0);
    expect(event3Id).toBeGreaterThan(0);

    // Step 2: Create dependencies
    await builder.createDependency({
      eventBeforeId: event1Id,
      eventAfterId: event2Id,
      dependencyType: 'sequence',
    });

    await builder.createDependency({
      eventBeforeId: event2Id,
      eventAfterId: event3Id,
      dependencyType: 'causation',
      notes: 'Mentor teaches hero how to unlock powers',
    });

    // Verify dependencies
    const deps2 = await builder.getEventDependencies(event2Id);
    expect(deps2.before).toHaveLength(1);
    expect(deps2.after).toHaveLength(1);

    // Step 3: Check for conflicts (should be none)
    let conflicts = await builder.getConflicts();
    expect(conflicts).toHaveLength(0);

    // Step 4: Introduce a conflict by updating timestamp
    await builder.updateEvent(event3Id, {
      storyTimestamp: 50, // Move before event1 - creates conflict!
    });

    // Step 5: Detect conflict
    conflicts = await builder.getConflicts();
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].conflict).toContain('timestamps are reversed');

    // Step 6: Fix conflict
    await builder.updateEvent(event3Id, {
      storyTimestamp: 300, // Restore correct order
    });

    conflicts = await builder.getConflicts();
    expect(conflicts).toHaveLength(0);
  });

  it('should sync timeline to YAML and back', async () => {
    // Step 1: Create events in database
    const event1Id = await builder.createEvent({
      eventName: 'Opening scene',
      eventType: 'plot',
      description: 'Story begins',
      storyDate: 'Summer 2024',
      storyTimestamp: 1000,
      importance: 7,
    });

    const event2Id = await builder.createEvent({
      eventName: 'Midpoint reveal',
      eventType: 'plot',
      description: 'Major twist',
      storyDate: 'Fall 2024',
      storyTimestamp: 2000,
      importance: 10,
    });

    await builder.createDependency({
      eventBeforeId: event1Id,
      eventAfterId: event2Id,
    });

    // Step 2: Export to YAML
    const yamlPath = join(projectPath, 'timeline', 'timeline.yaml');
    await sync.exportToYAML(yamlPath);

    // Verify YAML file created
    expect(existsSync(yamlPath)).toBe(true);

    const yamlContent = await readFile(yamlPath, 'utf-8');
    const parsed = YAML.parse(yamlContent);

    expect(parsed.events).toHaveLength(2);
    expect(parsed.events[0].name).toBe('Opening scene');
    expect(parsed.events[0].happensBefore).toContain('Midpoint reveal');

    // Step 3: Modify YAML file
    parsed.events[0].description = 'Updated description from YAML';
    parsed.events.push({
      name: 'Climax battle',
      type: 'plot',
      description: 'Final confrontation',
      storyTimestamp: 3000,
      importance: 10,
      happensBefore: [],
    });

    await writeFile(yamlPath, YAML.stringify(parsed));

    // Step 4: Sync YAML back to database
    await sync.syncTimelineFile(yamlPath);

    // Step 5: Verify changes in database
    const event1 = await builder.getEventByName('Opening scene');
    expect(event1?.description).toBe('Updated description from YAML');

    const event3 = await builder.getEventByName('Climax battle');
    expect(event3).toBeDefined();
    expect(event3?.importance).toBe(10);

    const allEvents = await builder.getAllEvents();
    expect(allEvents).toHaveLength(3);
  });

  it('should handle backstory events', async () => {
    // Step 1: Create backstory events
    const backstoryId = await builder.createEvent({
      eventName: 'Hero\'s tragic past',
      eventType: 'backstory',
      description: 'The event that shaped the protagonist',
      storyDate: '10 years before story',
      isBackstory: true,
      importance: 8,
    });

    const presentId = await builder.createEvent({
      eventName: 'Hero faces similar situation',
      eventType: 'plot',
      description: 'Past trauma resurfaces',
      storyTimestamp: 1000,
      importance: 9,
    });

    // Step 2: Link backstory to present event
    await builder.createDependency({
      eventBeforeId: backstoryId,
      eventAfterId: presentId,
      dependencyType: 'reference',
      notes: 'Present event triggers memory of past',
    });

    // Step 3: Verify backstory filtering
    const backstoryEvents = await builder.getAllEvents({ isBackstory: true });
    expect(backstoryEvents).toHaveLength(1);
    expect(backstoryEvents[0].eventName).toBe('Hero\'s tragic past');

    const plotEvents = await builder.getAllEvents({
      eventType: 'plot',
      isBackstory: false,
    });
    expect(plotEvents).toHaveLength(1);
    expect(plotEvents[0].eventName).toBe('Hero faces similar situation');
  });

  it('should handle importance-based queries', async () => {
    // Create events with varying importance
    await builder.createEvent({
      eventName: 'Minor detail',
      importance: 2,
      storyTimestamp: 100,
    });

    await builder.createEvent({
      eventName: 'Medium importance',
      importance: 5,
      storyTimestamp: 200,
    });

    await builder.createEvent({
      eventName: 'Critical moment',
      importance: 10,
      storyTimestamp: 300,
    });

    // Query by importance
    const important = await builder.getAllEvents({ minImportance: 8 });
    expect(important).toHaveLength(1);
    expect(important[0].eventName).toBe('Critical moment');

    const mediumPlus = await builder.getAllEvents({ minImportance: 5 });
    expect(mediumPlus).toHaveLength(2);
  });

  it('should sync multiple timeline files', async () => {
    // Create multiple timeline YAML files
    const timelineDir = join(projectPath, 'timeline');

    // Act 1 timeline
    const act1Path = join(timelineDir, 'act1.yaml');
    const act1Data = {
      events: [
        {
          name: 'Act 1 Opening',
          type: 'plot',
          description: 'Story begins',
          storyTimestamp: 100,
          importance: 8,
          happensBefore: ['Act 1 Climax'],
        },
        {
          name: 'Act 1 Climax',
          type: 'plot',
          description: 'First major event',
          storyTimestamp: 500,
          importance: 9,
          happensBefore: [],
        },
      ],
    };
    await writeFile(act1Path, YAML.stringify(act1Data));

    // Act 2 timeline
    const act2Path = join(timelineDir, 'act2.yaml');
    const act2Data = {
      events: [
        {
          name: 'Act 2 Opening',
          type: 'plot',
          description: 'Midpoint begins',
          storyTimestamp: 1000,
          importance: 7,
          happensBefore: [],
        },
      ],
    };
    await writeFile(act2Path, YAML.stringify(act2Data));

    // Sync all timeline files
    const result = await sync.syncAllTimelines();

    // Verify all events synced
    expect(result.synced).toBe(2);
    expect(result.errors).toHaveLength(0);

    const allEvents = await builder.getAllEvents();
    expect(allEvents).toHaveLength(3);

    // Verify dependencies created
    const act1Opening = await builder.getEventByName('Act 1 Opening');
    const deps = await builder.getEventDependencies(act1Opening!.id!);
    expect(deps.after).toHaveLength(1);
  });

  it('should handle complex dependency chains', async () => {
    // Create a complex chain: A -> B -> C -> D
    const eventA = await builder.createEvent({
      eventName: 'Event A',
      storyTimestamp: 100,
    });

    const eventB = await builder.createEvent({
      eventName: 'Event B',
      storyTimestamp: 200,
    });

    const eventC = await builder.createEvent({
      eventName: 'Event C',
      storyTimestamp: 300,
    });

    const eventD = await builder.createEvent({
      eventName: 'Event D',
      storyTimestamp: 400,
    });

    // Create chain
    await builder.createDependency({
      eventBeforeId: eventA,
      eventAfterId: eventB,
    });
    await builder.createDependency({
      eventBeforeId: eventB,
      eventAfterId: eventC,
    });
    await builder.createDependency({
      eventBeforeId: eventC,
      eventAfterId: eventD,
    });

    // Verify chain
    const depsB = await builder.getEventDependencies(eventB);
    expect(depsB.before).toHaveLength(1);
    expect(depsB.after).toHaveLength(1);

    const depsA = await builder.getEventDependencies(eventA);
    expect(depsA.before).toHaveLength(0); // First in chain
    expect(depsA.after).toHaveLength(1);

    const depsD = await builder.getEventDependencies(eventD);
    expect(depsD.before).toHaveLength(1);
    expect(depsD.after).toHaveLength(0); // Last in chain

    // Introduce conflict in middle of chain
    await builder.updateEvent(eventC, {
      storyTimestamp: 150, // Move before B - creates conflict
    });

    const conflicts = await builder.getConflicts();
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it('should handle world history events', async () => {
    // Create ancient history event
    const ancientEvent = await builder.createEvent({
      eventName: 'Ancient empire falls',
      eventType: 'world_history',
      description: 'The old civilization collapses',
      storyDate: '1000 years before story',
      importance: 6,
    });

    // Create recent history
    const recentEvent = await builder.createEvent({
      eventName: 'Kingdom established',
      eventType: 'world_history',
      description: 'Current kingdom rises from ashes',
      storyDate: '100 years before story',
      importance: 7,
    });

    // Link history events
    await builder.createDependency({
      eventBeforeId: ancientEvent,
      eventAfterId: recentEvent,
      dependencyType: 'causation',
    });

    // Query world history
    const historyEvents = await builder.getAllEvents({
      eventType: 'world_history',
    });

    expect(historyEvents).toHaveLength(2);
    expect(historyEvents.every((e) => e.eventType === 'world_history')).toBe(true);
  });
});
