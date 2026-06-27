/**
 * Novel Tools MCP Server - Tool Handlers
 * Implements the actual logic for each MCP tool
 */

import { join } from 'path';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';

// Import the extension (assumes it's built and available)
// In production, this would import from the published package
// For now, we'll use relative paths to the built extension
type NovelWriterExtension = any; // Will be properly typed once we import

/**
 * Initialize extension and load project
 */
async function initializeExtension(projectPath: string): Promise<any> {
  // Dynamic import to avoid circular dependencies
  const { NovelWriterExtension } = await import('../../../dist/index.js');
  const extension = new NovelWriterExtension(projectPath);

  // Load project ID from database
  const mcpClient = (extension as any).mcpClient;
  const result = await mcpClient.readQuery(
    'SELECT id FROM projects WHERE project_path = ? LIMIT 1',
    [projectPath]
  );

  if (result.length === 0) {
    throw new Error('Project not found. Run "novel init" first.');
  }

  extension.setProjectId(result[0].id);
  return extension;
}

/**
 * Validate project path exists
 */
function validateProjectPath(projectPath: string): void {
  if (!existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  const dbPath = join(projectPath, '.novel', 'novel.db');
  if (!existsSync(dbPath)) {
    throw new Error(`Novel database not found. Run "novel init" first.`);
  }
}

// ===== SYNC HANDLERS =====

export async function handleSyncWorldRules(args: any): Promise<any> {
  const { project_path, rule_name } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const sync = extension.getWorldRulesSync();

  if (rule_name) {
    // Sync specific rule
    const rulePath = join(project_path, 'world-rules', `${rule_name}.yaml`);
    if (!existsSync(rulePath)) {
      throw new Error(`World rule not found: ${rule_name}`);
    }
    await sync.syncWorldRuleFile(rulePath);
    return {
      success: true,
      message: `Synced world rule: ${rule_name}`,
      synced_count: 1,
    };
  } else {
    // Sync all rules
    const result = await sync.syncAllWorldRules();
    return {
      success: true,
      message: `Synced ${result.synced} world rules`,
      synced_count: result.synced,
      errors: result.errors,
    };
  }
}

export async function handleSyncCharacters(args: any): Promise<any> {
  const { project_path, character_name } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const sync = extension.getCharacterSync();

  if (character_name) {
    const charPath = join(project_path, 'characters', `${character_name}.yaml`);
    if (!existsSync(charPath)) {
      throw new Error(`Character not found: ${character_name}`);
    }
    await sync.syncCharacterFile(charPath);
    return {
      success: true,
      message: `Synced character: ${character_name}`,
      synced_count: 1,
    };
  } else {
    const result = await sync.syncAllCharacters();
    return {
      success: true,
      message: `Synced ${result.synced} characters`,
      synced_count: result.synced,
      errors: result.errors,
    };
  }
}

export async function handleSyncLocations(args: any): Promise<any> {
  const { project_path, location_name } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const sync = extension.getLocationSync();

  if (location_name) {
    const locPath = join(project_path, 'locations', `${location_name}.yaml`);
    if (!existsSync(locPath)) {
      throw new Error(`Location not found: ${location_name}`);
    }
    await sync.syncLocationFile(locPath);
    return {
      success: true,
      message: `Synced location: ${location_name}`,
      synced_count: 1,
    };
  } else {
    const result = await sync.syncAllLocations();
    return {
      success: true,
      message: `Synced ${result.synced} locations`,
      synced_count: result.synced,
      errors: result.errors,
    };
  }
}

export async function handleSyncPlotThreads(args: any): Promise<any> {
  const { project_path, thread_name } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const sync = extension.getPlotThreadSync();

  if (thread_name) {
    const threadPath = join(project_path, 'plot-threads', `${thread_name}.yaml`);
    if (!existsSync(threadPath)) {
      throw new Error(`Plot thread not found: ${thread_name}`);
    }
    await sync.syncPlotThreadFile(threadPath);
    return {
      success: true,
      message: `Synced plot thread: ${thread_name}`,
      synced_count: 1,
    };
  } else {
    const result = await sync.syncAllPlotThreads();
    return {
      success: true,
      message: `Synced ${result.synced} plot threads`,
      synced_count: result.synced,
      errors: result.errors,
    };
  }
}

export async function handleSyncChapters(args: any): Promise<any> {
  const { project_path, chapter_number } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const sync = extension.getChapterSync();

  if (chapter_number !== undefined) {
    const result = await sync.syncChapter(chapter_number);
    return {
      success: true,
      message: `Synced chapter ${chapter_number}`,
      chapter_id: result.chapterId,
      scenes_synced: result.scenes.length,
    };
  } else {
    const result = await sync.syncAllChapters();
    return {
      success: true,
      message: `Synced ${result.synced} chapters`,
      synced_count: result.synced,
      errors: result.errors,
    };
  }
}

// ===== BUILDER HANDLERS =====

export async function handleCreateWorldRule(args: any): Promise<any> {
  const { project_path, name, category, description, limitations, is_hard_rule, auto_sync } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getWorldRulesBuilder();

  const ruleData = {
    name,
    category,
    description,
    limitations,
    is_hard_rule: is_hard_rule !== undefined ? is_hard_rule : true,
  };

  // Validate
  const errors = builder.validate(ruleData);
  if (errors.length > 0) {
    throw new Error(`Validation errors: ${errors.join(', ')}`);
  }

  // Create file
  const filePath = await builder.create(ruleData);

  // Auto-sync if requested (default true)
  if (auto_sync !== false) {
    const sync = extension.getWorldRulesSync();
    await sync.syncWorldRuleFile(filePath);
  }

  return {
    success: true,
    message: `Created world rule: ${name}`,
    file_path: filePath,
    synced: auto_sync !== false,
  };
}

export async function handleListWorldRules(args: any): Promise<any> {
  const { project_path, category } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getWorldRulesBuilder();

  const rules = await builder.list(category);

  return {
    success: true,
    rules,
    count: rules.length,
  };
}

export async function handleGetWorldRule(args: any): Promise<any> {
  const { project_path, rule_name } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getWorldRulesBuilder();

  const rulePath = join(project_path, 'world-rules', `${rule_name}.yaml`);
  if (!existsSync(rulePath)) {
    throw new Error(`World rule not found: ${rule_name}`);
  }

  // Read from file
  const { readFile } = await import('fs/promises');
  const YAML = await import('yaml');
  const content = await readFile(rulePath, 'utf-8');
  const rule = YAML.parse(content);

  return {
    success: true,
    rule,
    file_path: rulePath,
  };
}

export async function handleAddWorldRuleExample(args: any): Promise<any> {
  const { project_path, rule_name, example, auto_sync } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getWorldRulesBuilder();

  const rulePath = join(project_path, 'world-rules', `${rule_name}.yaml`);
  if (!existsSync(rulePath)) {
    throw new Error(`World rule not found: ${rule_name}`);
  }

  await builder.addExample(rulePath, example);

  if (auto_sync !== false) {
    const sync = extension.getWorldRulesSync();
    await sync.syncWorldRuleFile(rulePath);
  }

  return {
    success: true,
    message: `Added example to world rule: ${rule_name}`,
    synced: auto_sync !== false,
  };
}

export async function handleAddWorldRuleException(args: any): Promise<any> {
  const { project_path, rule_name, exception, auto_sync } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getWorldRulesBuilder();

  const rulePath = join(project_path, 'world-rules', `${rule_name}.yaml`);
  if (!existsSync(rulePath)) {
    throw new Error(`World rule not found: ${rule_name}`);
  }

  await builder.addException(rulePath, exception);

  if (auto_sync !== false) {
    const sync = extension.getWorldRulesSync();
    await sync.syncWorldRuleFile(rulePath);
  }

  return {
    success: true,
    message: `Added exception to world rule: ${rule_name}`,
    synced: auto_sync !== false,
  };
}

export async function handleUpdateWorldRuleLimitations(args: any): Promise<any> {
  const { project_path, rule_name, limitations, auto_sync } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getWorldRulesBuilder();

  const rulePath = join(project_path, 'world-rules', `${rule_name}.yaml`);
  if (!existsSync(rulePath)) {
    throw new Error(`World rule not found: ${rule_name}`);
  }

  await builder.updateLimitations(rulePath, limitations);

  if (auto_sync !== false) {
    const sync = extension.getWorldRulesSync();
    await sync.syncWorldRuleFile(rulePath);
  }

  return {
    success: true,
    message: `Updated limitations for world rule: ${rule_name}`,
    synced: auto_sync !== false,
  };
}

export async function handleMarkWorldRuleEstablished(args: any): Promise<any> {
  const { project_path, rule_name, chapter, scene, quote, auto_sync } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getWorldRulesBuilder();

  const rulePath = join(project_path, 'world-rules', `${rule_name}.yaml`);
  if (!existsSync(rulePath)) {
    throw new Error(`World rule not found: ${rule_name}`);
  }

  await builder.markEstablished(rulePath, chapter, scene, quote);

  if (auto_sync !== false) {
    const sync = extension.getWorldRulesSync();
    await sync.syncWorldRuleFile(rulePath);
  }

  return {
    success: true,
    message: `Marked world rule as established: ${rule_name}`,
    synced: auto_sync !== false,
  };
}

export async function handleToggleWorldRuleHard(args: any): Promise<any> {
  const { project_path, rule_name, auto_sync } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getWorldRulesBuilder();

  const rulePath = join(project_path, 'world-rules', `${rule_name}.yaml`);
  if (!existsSync(rulePath)) {
    throw new Error(`World rule not found: ${rule_name}`);
  }

  const isHard = await builder.toggleHardRule(rulePath);

  if (auto_sync !== false) {
    const sync = extension.getWorldRulesSync();
    await sync.syncWorldRuleFile(rulePath);
  }

  return {
    success: true,
    message: `World rule is now ${isHard ? 'hard (must never violate)' : 'flexible'}`,
    is_hard_rule: isHard,
    synced: auto_sync !== false,
  };
}

export async function handleGetWorldRuleStats(args: any): Promise<any> {
  const { project_path } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getWorldRulesBuilder();

  const stats = await builder.getStats();

  return {
    success: true,
    stats,
  };
}

export async function handleCreateCharacter(args: any): Promise<any> {
  const { project_path, name, role, description, background, auto_sync } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getCharacterBuilder();

  const charData = {
    name,
    role,
    description,
    background,
  };

  const filePath = await builder.create(charData);

  if (auto_sync !== false) {
    const sync = extension.getCharacterSync();
    await sync.syncCharacterFile(filePath);
  }

  return {
    success: true,
    message: `Created character: ${name}`,
    file_path: filePath,
    synced: auto_sync !== false,
  };
}

export async function handleCreateLocation(args: any): Promise<any> {
  const { project_path, name, type, description, auto_sync } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getLocationBuilder();

  const locData = {
    name,
    type,
    description,
  };

  const filePath = await builder.create(locData);

  if (auto_sync !== false) {
    const sync = extension.getLocationSync();
    await sync.syncLocationFile(filePath);
  }

  return {
    success: true,
    message: `Created location: ${name}`,
    file_path: filePath,
    synced: auto_sync !== false,
  };
}

export async function handleCreatePlotThread(args: any): Promise<any> {
  const { project_path, name, type, description, auto_sync } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getPlotThreadBuilder();

  const threadData = {
    name,
    type,
    description,
  };

  const filePath = await builder.create(threadData);

  if (auto_sync !== false) {
    const sync = extension.getPlotThreadSync();
    await sync.syncPlotThreadFile(filePath);
  }

  return {
    success: true,
    message: `Created plot thread: ${name}`,
    file_path: filePath,
    synced: auto_sync !== false,
  };
}

// ===== CONTEXT ASSEMBLY HANDLERS =====

export async function handleGetSceneContext(args: any): Promise<any> {
  const { project_path, chapter_number, scene_id } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const assembler = extension.getContextAssembler();

  const context = await assembler.assembleSceneContext(chapter_number, scene_id);

  return {
    success: true,
    context,
  };
}

export async function handleGetCharacterContext(args: any): Promise<any> {
  const { project_path, character_name, include_relationships } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const mcpClient = (extension as any).mcpClient;

  // Get character data
  const charResult = await mcpClient.readQuery(
    'SELECT * FROM characters WHERE name = ?',
    [character_name]
  );

  if (charResult.length === 0) {
    throw new Error(`Character not found: ${character_name}`);
  }

  const character = charResult[0];

  // Get relationships if requested
  let relationships = [];
  if (include_relationships !== false) {
    relationships = await mcpClient.readQuery(
      'SELECT * FROM character_relationships WHERE character_id = ? OR related_character_id = ?',
      [character.id, character.id]
    );
  }

  return {
    success: true,
    character,
    relationships,
  };
}

export async function handleGetLocationContext(args: any): Promise<any> {
  const { project_path, location_name } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const mcpClient = (extension as any).mcpClient;

  const locResult = await mcpClient.readQuery(
    'SELECT * FROM locations WHERE name = ?',
    [location_name]
  );

  if (locResult.length === 0) {
    throw new Error(`Location not found: ${location_name}`);
  }

  return {
    success: true,
    location: locResult[0],
  };
}

// ===== CONSISTENCY CHECK HANDLERS =====

export async function handleCheckConsistency(args: any): Promise<any> {
  const { project_path, check_type } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const checker = extension.getConsistencyChecker();

  const type = check_type || 'all';
  let issues: any[] = [];

  if (type === 'all' || type === 'characters') {
    const charIssues = await checker.checkCharacterConsistency();
    issues = issues.concat(charIssues);
  }

  if (type === 'all' || type === 'timeline') {
    const timelineIssues = await checker.checkTimelineConsistency();
    issues = issues.concat(timelineIssues);
  }

  if (type === 'all' || type === 'world_rules') {
    const ruleIssues = await checker.checkWorldRules();
    issues = issues.concat(ruleIssues);
  }

  return {
    success: true,
    check_type: type,
    issues_found: issues.length,
    issues,
  };
}

export async function handleCheckWorldRules(args: any): Promise<any> {
  const { project_path, text, chapter_number } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const checker = extension.getConsistencyChecker();

  const violations = await checker.checkTextAgainstWorldRules(text, chapter_number);

  return {
    success: true,
    violations_found: violations.length,
    violations,
  };
}

export async function handleListConsistencyIssues(args: any): Promise<any> {
  const { project_path, severity, verbose } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const checker = extension.getConsistencyChecker();

  const issues = await checker.listIssues(severity);

  // Format issues for MCP response
  const formattedIssues = issues.map((issue: any) => {
    const formatted: any = {
      id: issue.id,
      type: issue.issueType,
      severity: issue.severity,
      description: issue.description,
      status: issue.status,
    };

    if (verbose) {
      formatted.chapter_id = issue.chapterId;
      formatted.scene_id = issue.sceneId;
      formatted.detected_at = issue.detectedAt;
    }

    return formatted;
  });

  return {
    success: true,
    issue_count: formattedIssues.length,
    issues: formattedIssues,
  };
}

export async function handleResolveConsistencyIssue(args: any): Promise<any> {
  const { project_path, issue_id, notes } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const checker = extension.getConsistencyChecker();

  await checker.resolveIssue(issue_id, notes);

  return {
    success: true,
    message: `Marked issue ${issue_id} as resolved`,
    issue_id,
    notes: notes || null,
  };
}

export async function handleAcknowledgeConsistencyIssue(args: any): Promise<any> {
  const { project_path, issue_id, notes } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const checker = extension.getConsistencyChecker();

  await checker.acknowledgeIssue(issue_id, notes);

  return {
    success: true,
    message: `Acknowledged issue ${issue_id} as intentional`,
    issue_id,
    notes: notes || null,
  };
}

export async function handleMarkFalsePositive(args: any): Promise<any> {
  const { project_path, issue_id, notes } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const checker = extension.getConsistencyChecker();

  await checker.markFalsePositive(issue_id, notes);

  return {
    success: true,
    message: `Marked issue ${issue_id} as false positive`,
    issue_id,
    notes: notes || null,
  };
}

// ===== PROJECT HEALTH HANDLERS =====

export async function handleGetProjectHealth(args: any): Promise<any> {
  const { project_path } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const health = await extension.getProjectHealth();

  return {
    success: true,
    health,
  };
}

export async function handleGetWritingStats(args: any): Promise<any> {
  const { project_path, days } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const sessionManager = await extension.getSessionManager();

  const dayCount = days || 30;
  const stats = await sessionManager.getStats(dayCount);

  return {
    success: true,
    days: dayCount,
    stats,
  };
}

export async function handleGetPlotThreadStatus(args: any): Promise<any> {
  const { project_path, status } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const mcpClient = (extension as any).mcpClient;

  let query = 'SELECT * FROM plot_threads WHERE project_id = ?';
  const params: any[] = [(extension as any).projectId];

  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }

  const threads = await mcpClient.readQuery(query, params);

  return {
    success: true,
    status: status || 'all',
    thread_count: threads.length,
    threads,
  };
}

// ===== SEARCH HANDLERS =====

export async function handleSearchWorldRules(args: any): Promise<any> {
  const { project_path, keyword, category, hard_rules_only } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const mcpClient = (extension as any).mcpClient;

  let query = 'SELECT * FROM world_rules WHERE project_id = ?';
  const params: any[] = [(extension as any).projectId];

  if (keyword) {
    query += ' AND (rule_name LIKE ? OR description LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (category) {
    query += ' AND rule_category = ?';
    params.push(category);
  }

  if (hard_rules_only) {
    query += ' AND is_hard_rule = 1';
  }

  const rules = await mcpClient.readQuery(query, params);

  return {
    success: true,
    rule_count: rules.length,
    rules,
  };
}

export async function handleSearchCharacters(args: any): Promise<any> {
  const { project_path, keyword, role } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const mcpClient = (extension as any).mcpClient;

  let query = 'SELECT * FROM characters WHERE project_id = ?';
  const params: any[] = [(extension as any).projectId];

  if (keyword) {
    query += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (role) {
    query += ' AND role = ?';
    params.push(role);
  }

  const characters = await mcpClient.readQuery(query, params);

  return {
    success: true,
    character_count: characters.length,
    characters,
  };
}

// ===== TIMELINE HANDLERS =====

export async function handleSyncTimeline(args: any): Promise<any> {
  const { project_path } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const sync = extension.getTimelineSync();

  const result = await sync.syncAllTimelines();
  return {
    success: true,
    message: `Synced ${result.synced} timeline file(s)`,
    synced_count: result.synced,
    errors: result.errors,
  };
}

export async function handleAddTimelineEvent(args: any): Promise<any> {
  const {
    project_path,
    event_name,
    event_type,
    description,
    story_date,
    story_timestamp,
    importance,
    is_backstory,
  } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getTimelineBuilder();

  const eventId = await builder.createEvent({
    eventName: event_name,
    eventType: event_type,
    description,
    storyDate: story_date,
    storyTimestamp: story_timestamp,
    isBackstory: is_backstory,
    importance,
  });

  return {
    success: true,
    message: `Created timeline event: ${event_name}`,
    event_id: eventId,
  };
}

export async function handleListTimelineEvents(args: any): Promise<any> {
  const { project_path, event_type, is_backstory, min_importance } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getTimelineBuilder();

  const events = await builder.getAllEvents({
    eventType: event_type,
    isBackstory: is_backstory,
    minImportance: min_importance,
  });

  return {
    success: true,
    event_count: events.length,
    events: events.map((e: any) => ({
      id: e.id,
      name: e.eventName,
      type: e.eventType,
      description: e.description,
      story_date: e.storyDate,
      story_timestamp: e.storyTimestamp,
      importance: e.importance,
      is_backstory: e.isBackstory,
    })),
  };
}

export async function handleGetTimelineEvent(args: any): Promise<any> {
  const { project_path, event_name } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getTimelineBuilder();

  const event = await builder.getEventByName(event_name);
  if (!event) {
    throw new Error(`Timeline event not found: ${event_name}`);
  }

  // Get dependencies
  const deps = await builder.getEventDependencies(event.id!);

  // Get names of related events
  const beforeEvents = await Promise.all(
    deps.before.map(async (dep: any) => {
      const e = await builder.getEvent(dep.eventBeforeId);
      return { id: e?.id, name: e?.eventName };
    })
  );

  const afterEvents = await Promise.all(
    deps.after.map(async (dep: any) => {
      const e = await builder.getEvent(dep.eventAfterId);
      return { id: e?.id, name: e?.eventName };
    })
  );

  return {
    success: true,
    event: {
      id: event.id,
      name: event.eventName,
      type: event.eventType,
      description: event.description,
      story_date: event.storyDate,
      story_timestamp: event.storyTimestamp,
      importance: event.importance,
      is_backstory: event.isBackstory,
      happens_after: beforeEvents.filter((e) => e.name),
      happens_before: afterEvents.filter((e) => e.name),
    },
  };
}

export async function handleUpdateTimelineEvent(args: any): Promise<any> {
  const {
    project_path,
    event_name,
    description,
    story_date,
    story_timestamp,
    importance,
  } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getTimelineBuilder();

  const event = await builder.getEventByName(event_name);
  if (!event) {
    throw new Error(`Timeline event not found: ${event_name}`);
  }

  const updates: any = {};
  if (description !== undefined) updates.description = description;
  if (story_date !== undefined) updates.storyDate = story_date;
  if (story_timestamp !== undefined) updates.storyTimestamp = story_timestamp;
  if (importance !== undefined) updates.importance = importance;

  await builder.updateEvent(event.id!, updates);

  return {
    success: true,
    message: `Updated timeline event: ${event_name}`,
  };
}

export async function handleLinkTimelineEvents(args: any): Promise<any> {
  const {
    project_path,
    event_before,
    event_after,
    dependency_type,
    notes,
  } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getTimelineBuilder();

  const beforeEvent = await builder.getEventByName(event_before);
  const afterEvent = await builder.getEventByName(event_after);

  if (!beforeEvent) {
    throw new Error(`Timeline event not found: ${event_before}`);
  }
  if (!afterEvent) {
    throw new Error(`Timeline event not found: ${event_after}`);
  }

  await builder.createDependency({
    eventBeforeId: beforeEvent.id!,
    eventAfterId: afterEvent.id!,
    dependencyType: dependency_type || 'sequence',
    notes,
  });

  return {
    success: true,
    message: `Linked: "${event_before}" → "${event_after}"`,
  };
}

export async function handleCheckTimelineConflicts(args: any): Promise<any> {
  const { project_path } = args;
  validateProjectPath(project_path);

  const extension = await initializeExtension(project_path);
  const builder = extension.getTimelineBuilder();

  const conflicts = await builder.getConflicts();

  return {
    success: true,
    conflict_count: conflicts.length,
    conflicts: conflicts.map((c: any) => ({
      event1_id: c.event1.id,
      event1_name: c.event1.eventName,
      event1_timestamp: c.event1.storyTimestamp,
      event2_id: c.event2.id,
      event2_name: c.event2.eventName,
      event2_timestamp: c.event2.storyTimestamp,
      conflict_description: c.conflict,
    })),
  };
}
