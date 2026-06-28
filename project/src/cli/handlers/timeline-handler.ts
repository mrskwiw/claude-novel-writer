/**
 * Timeline Command Handlers
 * Handles timeline event management commands
 */

import type { ParsedArgs, OutputFormatter } from '../types.js';
import { NovelWriterExtension } from '../../index.js';
import type { TimelineEvent } from '../../builders/timeline-builder.js';
import { join } from 'path';

export async function handleTimelineCommand(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  const subcommand = args.subcommand ?? args.positional[0];

  switch (subcommand) {
    case 'add':
      await handleTimelineAdd(args, projectPath, output);
      break;
    case 'list':
      await handleTimelineList(args, projectPath, output);
      break;
    case 'show':
      await handleTimelineShow(args, projectPath, output);
      break;
    case 'update':
      await handleTimelineUpdate(args, projectPath, output);
      break;
    case 'delete':
      await handleTimelineDelete(args, projectPath, output);
      break;
    case 'link':
      await handleTimelineLink(args, projectPath, output);
      break;
    case 'check':
      await handleTimelineCheck(args, projectPath, output);
      break;
    case 'sync':
      await handleTimelineSync(args, projectPath, output);
      break;
    case 'export':
      await handleTimelineExport(args, projectPath, output);
      break;
    default:
      output.error('Unknown timeline subcommand. Use: add, list, show, update, delete, link, check, sync, export');
  }
}

/**
 * Handle timeline add command
 */
async function handleTimelineAdd(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const builder = extension.getTimelineBuilder();

    const name = args.flags.name as string;
    const type = args.flags.type as string | undefined;
    const description = args.flags.description as string | undefined;
    const date = args.flags.date as string | undefined;
    const timestamp = args.flags.timestamp as number | undefined;
    const importance = args.flags.importance as number | undefined;
    const isBackstory = args.flags.backstory as boolean | undefined;
    const before = args.flags.before as string | undefined;

    if (!name) {
      output.error('Event name required. Use --name "event name"');
      return;
    }

    // Validate event type
    if (type && !['plot', 'backstory', 'world_history'].includes(type)) {
      output.error('Event type must be one of: plot, backstory, world_history');
      return;
    }

    // Create the event
    const eventId = await builder.createEvent({
      eventName: name,
      eventType: type as any,
      description,
      storyDate: date,
      storyTimestamp: timestamp,
      isBackstory,
      importance,
    });

    output.success(`Created timeline event: ${name} (ID: ${eventId})`);

    // Create dependencies if specified
    if (before) {
      const afterEventNames = before.split(',').map((s) => s.trim());

      for (const afterEventName of afterEventNames) {
        const afterEvent = await builder.getEventByName(afterEventName);
        if (!afterEvent) {
          output.warning(`Event "${afterEventName}" not found, skipping dependency`);
          continue;
        }

        await builder.createDependency({
          eventBeforeId: eventId,
          eventAfterId: afterEvent.id!,
          dependencyType: 'sequence',
        });

        output.info(`  → Linked: "${name}" must happen before "${afterEventName}"`);
      }
    }

    if (timestamp) {
      output.info(`Timestamp: ${timestamp}`);
    }
    if (date) {
      output.info(`Story date: ${date}`);
    }
  } catch (error) {
    output.error(`Failed to add timeline event: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle timeline list command
 */
async function handleTimelineList(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const builder = extension.getTimelineBuilder();

    const type = args.flags.type as string | undefined;
    const backstory = args.flags.backstory as boolean | undefined;
    const minImportance = args.flags.importance as number | undefined;
    const verbose = args.flags.verbose as boolean | undefined;

    const events = await builder.getAllEvents({
      eventType: type,
      isBackstory: backstory,
      minImportance,
    });

    if (events.length === 0) {
      output.info('No timeline events found');
      return;
    }

    output.info(`\nTimeline Events (${events.length}):\n`);

    for (const event of events) {
      const typeLabel = event.eventType ? `[${event.eventType}]` : '';
      const importanceLabel = event.importance ? `(⭐${event.importance})` : '';
      const backstoryLabel = event.isBackstory ? '📜' : '';

      output.info(`${event.id}. ${event.eventName} ${typeLabel} ${importanceLabel} ${backstoryLabel}`);

      if (verbose) {
        if (event.description) {
          output.info(`   ${event.description}`);
        }
        if (event.storyDate) {
          output.info(`   Date: ${event.storyDate}`);
        }
        if (event.storyTimestamp) {
          output.info(`   Timestamp: ${event.storyTimestamp}`);
        }
        output.info('');
      }
    }
  } catch (error) {
    output.error(`Failed to list timeline events: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle timeline show command
 */
async function handleTimelineShow(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const builder = extension.getTimelineBuilder();

    const name = args.flags.name as string;
    if (!name) {
      output.error('Event name required. Use --name "event name"');
      return;
    }

    const event = await builder.getEventByName(name);
    if (!event) {
      output.error(`Event "${name}" not found`);
      return;
    }

    output.info(`\n=== ${event.eventName} ===\n`);
    output.info(`ID: ${event.id}`);
    if (event.eventType) {
      output.info(`Type: ${event.eventType}`);
    }
    if (event.description) {
      output.info(`Description: ${event.description}`);
    }
    if (event.storyDate) {
      output.info(`Story Date: ${event.storyDate}`);
    }
    if (event.storyTimestamp) {
      output.info(`Timestamp: ${event.storyTimestamp}`);
    }
    if (event.importance) {
      output.info(`Importance: ${event.importance}/10`);
    }
    if (event.isBackstory) {
      output.info(`📜 Backstory event`);
    }

    // Show dependencies
    const deps = await builder.getEventDependencies(event.id!);

    if (deps.before.length > 0) {
      output.info(`\nMust happen after:`);
      for (const dep of deps.before) {
        const beforeEvent = await builder.getEvent(dep.eventBeforeId);
        output.info(`  ← ${beforeEvent?.eventName || 'Unknown'}`);
      }
    }

    if (deps.after.length > 0) {
      output.info(`\nMust happen before:`);
      for (const dep of deps.after) {
        const afterEvent = await builder.getEvent(dep.eventAfterId);
        output.info(`  → ${afterEvent?.eventName || 'Unknown'}`);
      }
    }
  } catch (error) {
    output.error(`Failed to show timeline event: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle timeline update command
 */
async function handleTimelineUpdate(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const builder = extension.getTimelineBuilder();

    const name = args.flags.name as string;
    if (!name) {
      output.error('Event name required. Use --name "event name"');
      return;
    }

    const event = await builder.getEventByName(name);
    if (!event) {
      output.error(`Event "${name}" not found`);
      return;
    }

    const updates: Partial<Omit<TimelineEvent, 'id' | 'projectId'>> = {};
    if (args.flags.description !== undefined) updates.description = args.flags.description as string;
    if (args.flags.date !== undefined) updates.storyDate = args.flags.date as string;
    if (args.flags.timestamp !== undefined) updates.storyTimestamp = args.flags.timestamp as number;
    if (args.flags.importance !== undefined) updates.importance = args.flags.importance as number;

    if (Object.keys(updates).length === 0) {
      output.warning('No updates specified');
      return;
    }

    await builder.updateEvent(event.id!, updates);
    output.success(`Updated event: ${name}`);
  } catch (error) {
    output.error(`Failed to update timeline event: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle timeline delete command
 */
async function handleTimelineDelete(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const builder = extension.getTimelineBuilder();

    const name = args.flags.name as string;
    if (!name) {
      output.error('Event name required. Use --name "event name"');
      return;
    }

    const event = await builder.getEventByName(name);
    if (!event) {
      output.error(`Event "${name}" not found`);
      return;
    }

    await builder.deleteEvent(event.id!);
    output.success(`Deleted event: ${name}`);
  } catch (error) {
    output.error(`Failed to delete timeline event: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle timeline link command
 */
async function handleTimelineLink(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const builder = extension.getTimelineBuilder();

    const before = args.flags.before as string;
    const after = args.flags.after as string;
    const type = args.flags.type as string | undefined;
    const notes = args.flags.notes as string | undefined;

    if (!before || !after) {
      output.error('Both --before and --after required');
      return;
    }

    const beforeEvent = await builder.getEventByName(before);
    const afterEvent = await builder.getEventByName(after);

    if (!beforeEvent) {
      output.error(`Event "${before}" not found`);
      return;
    }
    if (!afterEvent) {
      output.error(`Event "${after}" not found`);
      return;
    }

    await builder.createDependency({
      eventBeforeId: beforeEvent.id!,
      eventAfterId: afterEvent.id!,
      dependencyType: type as any,
      notes,
    });

    output.success(`Linked: "${before}" → "${after}"`);
  } catch (error) {
    output.error(`Failed to link events: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle timeline check command
 */
async function handleTimelineCheck(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const builder = extension.getTimelineBuilder();

    output.info('Checking timeline for conflicts...\n');

    const conflicts = await builder.getConflicts();

    if (conflicts.length === 0) {
      output.success('✓ No timeline conflicts found!');
      return;
    }

    output.warning(`⚠️  Found ${conflicts.length} timeline conflict(s):\n`);

    for (const conflict of conflicts) {
      output.error(`❌ ${conflict.conflict}`);
    }

    output.info('\nFix these by:');
    output.info('1. Adjusting timestamps with /novel timeline update');
    output.info('2. Removing incorrect dependencies');
  } catch (error) {
    output.error(`Failed to check timeline: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle timeline sync command
 */
async function handleTimelineSync(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const sync = extension.getTimelineSync();

    output.info('Syncing timeline files to database...\n');

    const result = await sync.syncAllTimelines();

    output.success(`✓ Synced ${result.synced} timeline file(s)`);

    if (result.errors.length > 0) {
      output.warning(`\nErrors:`);
      result.errors.forEach((err) => output.error(`  ${err}`));
    }
  } catch (error) {
    output.error(`Failed to sync timeline: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle timeline export command
 */
async function handleTimelineExport(
  args: ParsedArgs,
  projectPath: string,
  output: OutputFormatter
): Promise<void> {
  try {
    const extension = new NovelWriterExtension(projectPath);
    await extension.loadProjectId();
    const sync = extension.getTimelineSync();

    const outputPath = (args.flags.output as string) || join(projectPath, 'timeline', 'timeline.yaml');

    output.info(`Exporting timeline to ${outputPath}...\n`);

    await sync.exportToYAML(outputPath);

    output.success(`✓ Timeline exported successfully`);
  } catch (error) {
    output.error(`Failed to export timeline: ${error instanceof Error ? error.message : String(error)}`);
  }
}
