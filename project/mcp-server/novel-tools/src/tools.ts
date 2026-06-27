/**
 * Novel Tools MCP Server - Tool Definitions
 * Exposes high-level novel-writing operations to Claude
 */

export const tools = [
  // ===== SYNC OPERATIONS =====
  {
    name: 'sync_world_rules',
    description: 'Sync all world rule YAML files to database for consistency checking',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        rule_name: {
          type: 'string',
          description: 'Optional: Sync specific rule by name. If not provided, syncs all rules.',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'sync_characters',
    description: 'Sync character YAML files to database',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        character_name: {
          type: 'string',
          description: 'Optional: Sync specific character by name. If not provided, syncs all characters.',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'sync_locations',
    description: 'Sync location YAML files to database',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        location_name: {
          type: 'string',
          description: 'Optional: Sync specific location by name. If not provided, syncs all locations.',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'sync_plot_threads',
    description: 'Sync plot thread YAML files to database',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        thread_name: {
          type: 'string',
          description: 'Optional: Sync specific thread by name. If not provided, syncs all threads.',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'sync_chapters',
    description: 'Sync chapter markdown files to database',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        chapter_number: {
          type: 'number',
          description: 'Optional: Sync specific chapter by number. If not provided, syncs all chapters.',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'sync_timeline',
    description: 'Sync timeline YAML files to database',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
      },
      required: ['project_path'],
    },
  },

  // ===== BUILDER OPERATIONS =====
  {
    name: 'create_world_rule',
    description: 'Create a new world rule YAML file',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        name: {
          type: 'string',
          description: 'Name of the world rule',
        },
        category: {
          type: 'string',
          enum: ['magic', 'technology', 'physics', 'social', 'political'],
          description: 'Category of the world rule',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the rule',
        },
        limitations: {
          type: 'string',
          description: 'Optional: Limitations or constraints on the rule',
        },
        is_hard_rule: {
          type: 'boolean',
          description: 'Optional: Whether this is a hard rule (must never be violated). Default: true',
        },
        auto_sync: {
          type: 'boolean',
          description: 'Optional: Automatically sync to database after creation. Default: true',
        },
      },
      required: ['project_path', 'name', 'category', 'description'],
    },
  },
  {
    name: 'list_world_rules',
    description: 'List all world rules with optional category filter',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        category: {
          type: 'string',
          enum: ['magic', 'technology', 'physics', 'social', 'political'],
          description: 'Optional: Filter by category',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'get_world_rule',
    description: 'Get detailed information about a specific world rule',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the world rule',
        },
      },
      required: ['project_path', 'rule_name'],
    },
  },
  {
    name: 'add_world_rule_example',
    description: 'Add an example to an existing world rule',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the world rule',
        },
        example: {
          type: 'string',
          description: 'Example demonstrating the rule',
        },
        auto_sync: {
          type: 'boolean',
          description: 'Optional: Automatically sync to database after adding. Default: true',
        },
      },
      required: ['project_path', 'rule_name', 'example'],
    },
  },
  {
    name: 'add_world_rule_exception',
    description: 'Add an exception to an existing world rule',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the world rule',
        },
        exception: {
          type: 'string',
          description: 'Exception to the rule',
        },
        auto_sync: {
          type: 'boolean',
          description: 'Optional: Automatically sync to database after adding. Default: true',
        },
      },
      required: ['project_path', 'rule_name', 'exception'],
    },
  },
  {
    name: 'update_world_rule_limitations',
    description: 'Update limitations/constraints for a world rule',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the world rule',
        },
        limitations: {
          type: 'string',
          description: 'Updated limitations text',
        },
        auto_sync: {
          type: 'boolean',
          description: 'Optional: Automatically sync to database after update. Default: true',
        },
      },
      required: ['project_path', 'rule_name', 'limitations'],
    },
  },
  {
    name: 'mark_world_rule_established',
    description: 'Mark where a world rule was first established in the manuscript',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the world rule',
        },
        chapter: {
          type: 'string',
          description: 'Optional: Chapter where rule was established',
        },
        scene: {
          type: 'string',
          description: 'Optional: Scene where rule was established',
        },
        quote: {
          type: 'string',
          description: 'Optional: Quote demonstrating establishment',
        },
        auto_sync: {
          type: 'boolean',
          description: 'Optional: Automatically sync to database after marking. Default: true',
        },
      },
      required: ['project_path', 'rule_name'],
    },
  },
  {
    name: 'toggle_world_rule_hard',
    description: 'Toggle whether a world rule is hard (must never violate) or flexible',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the world rule',
        },
        auto_sync: {
          type: 'boolean',
          description: 'Optional: Automatically sync to database after toggle. Default: true',
        },
      },
      required: ['project_path', 'rule_name'],
    },
  },
  {
    name: 'get_world_rule_stats',
    description: 'Get statistics about world rules (count by category, hard vs flexible, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'create_character',
    description: 'Create a new character YAML file',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        name: {
          type: 'string',
          description: 'Character name',
        },
        role: {
          type: 'string',
          enum: ['protagonist', 'antagonist', 'supporting', 'minor'],
          description: 'Character role in the story',
        },
        description: {
          type: 'string',
          description: 'Physical and personality description',
        },
        background: {
          type: 'string',
          description: 'Character background and history',
        },
        auto_sync: {
          type: 'boolean',
          description: 'Optional: Automatically sync to database after creation. Default: true',
        },
      },
      required: ['project_path', 'name', 'role'],
    },
  },
  {
    name: 'create_location',
    description: 'Create a new location YAML file',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        name: {
          type: 'string',
          description: 'Location name',
        },
        type: {
          type: 'string',
          enum: ['city', 'building', 'landmark', 'natural', 'region'],
          description: 'Type of location',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the location',
        },
        auto_sync: {
          type: 'boolean',
          description: 'Optional: Automatically sync to database after creation. Default: true',
        },
      },
      required: ['project_path', 'name', 'type', 'description'],
    },
  },
  {
    name: 'create_plot_thread',
    description: 'Create a new plot thread YAML file',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        name: {
          type: 'string',
          description: 'Plot thread name',
        },
        type: {
          type: 'string',
          enum: ['main', 'subplot', 'character_arc', 'mystery', 'romance'],
          description: 'Type of plot thread',
        },
        description: {
          type: 'string',
          description: 'Description of the plot thread',
        },
        auto_sync: {
          type: 'boolean',
          description: 'Optional: Automatically sync to database after creation. Default: true',
        },
      },
      required: ['project_path', 'name', 'type', 'description'],
    },
  },

  // ===== TIMELINE OPERATIONS =====
  {
    name: 'add_timeline_event',
    description: 'Add a new timeline event to track story chronology',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        event_name: {
          type: 'string',
          description: 'Name of the event',
        },
        event_type: {
          type: 'string',
          enum: ['plot', 'backstory', 'world_history'],
          description: 'Optional: Type of event',
        },
        description: {
          type: 'string',
          description: 'Optional: Description of the event',
        },
        story_date: {
          type: 'string',
          description: 'Optional: In-universe date (flexible format: "2024-05-01", "Summer 1995", "Three days after arrival")',
        },
        story_timestamp: {
          type: 'number',
          description: 'Optional: Unix-style timestamp for precise ordering',
        },
        importance: {
          type: 'number',
          description: 'Optional: Importance level (1-10)',
        },
        is_backstory: {
          type: 'boolean',
          description: 'Optional: Whether this is a backstory event',
        },
      },
      required: ['project_path', 'event_name'],
    },
  },
  {
    name: 'list_timeline_events',
    description: 'List all timeline events with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        event_type: {
          type: 'string',
          enum: ['plot', 'backstory', 'world_history'],
          description: 'Optional: Filter by event type',
        },
        is_backstory: {
          type: 'boolean',
          description: 'Optional: Show only backstory events',
        },
        min_importance: {
          type: 'number',
          description: 'Optional: Show only events with importance >= N',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'get_timeline_event',
    description: 'Get detailed information about a specific timeline event',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        event_name: {
          type: 'string',
          description: 'Name of the event',
        },
      },
      required: ['project_path', 'event_name'],
    },
  },
  {
    name: 'update_timeline_event',
    description: 'Update an existing timeline event',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        event_name: {
          type: 'string',
          description: 'Name of the event to update',
        },
        description: {
          type: 'string',
          description: 'Optional: New description',
        },
        story_date: {
          type: 'string',
          description: 'Optional: New story date',
        },
        story_timestamp: {
          type: 'number',
          description: 'Optional: New timestamp',
        },
        importance: {
          type: 'number',
          description: 'Optional: New importance level (1-10)',
        },
      },
      required: ['project_path', 'event_name'],
    },
  },
  {
    name: 'link_timeline_events',
    description: 'Create a dependency between two events (A must happen before B)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        event_before: {
          type: 'string',
          description: 'Name of the event that happens first',
        },
        event_after: {
          type: 'string',
          description: 'Name of the event that happens second',
        },
        dependency_type: {
          type: 'string',
          enum: ['sequence', 'causation', 'reference'],
          description: 'Optional: Type of dependency. Default: sequence',
        },
        notes: {
          type: 'string',
          description: 'Optional: Notes about this dependency',
        },
      },
      required: ['project_path', 'event_before', 'event_after'],
    },
  },
  {
    name: 'check_timeline_conflicts',
    description: 'Check for timeline conflicts (events with dependencies but wrong timestamps)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
      },
      required: ['project_path'],
    },
  },

  // ===== CONTEXT ASSEMBLY =====
  {
    name: 'get_scene_context',
    description: 'Assemble contextual information needed for writing a scene (characters present, location, active plot threads, relevant world rules)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        chapter_number: {
          type: 'number',
          description: 'Chapter number',
        },
        scene_id: {
          type: 'string',
          description: 'Scene identifier within the chapter',
        },
      },
      required: ['project_path', 'chapter_number', 'scene_id'],
    },
  },
  {
    name: 'get_character_context',
    description: 'Get comprehensive context for a character (profile, arc, relationships, appearances)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        character_name: {
          type: 'string',
          description: 'Character name',
        },
        include_relationships: {
          type: 'boolean',
          description: 'Optional: Include relationships with other characters. Default: true',
        },
      },
      required: ['project_path', 'character_name'],
    },
  },
  {
    name: 'get_location_context',
    description: 'Get comprehensive context for a location (description, appearances, characters present)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        location_name: {
          type: 'string',
          description: 'Location name',
        },
      },
      required: ['project_path', 'location_name'],
    },
  },

  // ===== CONSISTENCY CHECKING =====
  {
    name: 'check_consistency',
    description: 'Run consistency checks on the project (character descriptions, timeline, world rules)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        check_type: {
          type: 'string',
          enum: ['all', 'characters', 'timeline', 'world_rules', 'locations'],
          description: 'Optional: Type of consistency check to run. Default: all',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'check_world_rules',
    description: 'Check if text violates any world rules',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        text: {
          type: 'string',
          description: 'Text to check against world rules',
        },
        chapter_number: {
          type: 'number',
          description: 'Optional: Chapter number for context',
        },
      },
      required: ['project_path', 'text'],
    },
  },
  {
    name: 'list_consistency_issues',
    description: 'List all open consistency issues with optional severity filtering',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        severity: {
          type: 'string',
          enum: ['error', 'warning', 'info'],
          description: 'Optional: Filter by severity level',
        },
        verbose: {
          type: 'boolean',
          description: 'Optional: Include detailed information (chapter IDs, scene IDs, detection dates)',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'resolve_consistency_issue',
    description: 'Mark a consistency issue as resolved (fixed in manuscript)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        issue_id: {
          type: 'number',
          description: 'ID of the issue to resolve',
        },
        notes: {
          type: 'string',
          description: 'Optional: Resolution notes',
        },
      },
      required: ['project_path', 'issue_id'],
    },
  },
  {
    name: 'acknowledge_consistency_issue',
    description: 'Acknowledge an intentional inconsistency (will not be flagged again)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        issue_id: {
          type: 'number',
          description: 'ID of the issue to acknowledge',
        },
        notes: {
          type: 'string',
          description: 'Optional: Explanation of why this is intentional',
        },
      },
      required: ['project_path', 'issue_id'],
    },
  },
  {
    name: 'mark_false_positive',
    description: 'Mark a consistency issue as incorrectly detected (false positive)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        issue_id: {
          type: 'number',
          description: 'ID of the issue to mark as false positive',
        },
        notes: {
          type: 'string',
          description: 'Optional: Explanation of why this is a false positive',
        },
      },
      required: ['project_path', 'issue_id'],
    },
  },

  // ===== PROJECT HEALTH & STATS =====
  {
    name: 'get_project_health',
    description: 'Get project health dashboard (word count, completion percentage, consistency issues)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'get_writing_stats',
    description: 'Get writing statistics (daily word count, streak, session history)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        days: {
          type: 'number',
          description: 'Optional: Number of days to include in statistics. Default: 30',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'get_plot_thread_status',
    description: 'Get status of all plot threads (active, resolved, pending)',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        status: {
          type: 'string',
          enum: ['all', 'active', 'resolved', 'pending'],
          description: 'Optional: Filter by status. Default: all',
        },
      },
      required: ['project_path'],
    },
  },

  // ===== SEARCH & QUERY =====
  {
    name: 'search_world_rules',
    description: 'Search world rules by keyword or category',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        keyword: {
          type: 'string',
          description: 'Optional: Keyword to search for in rule names/descriptions',
        },
        category: {
          type: 'string',
          enum: ['magic', 'technology', 'physics', 'social', 'political'],
          description: 'Optional: Filter by category',
        },
        hard_rules_only: {
          type: 'boolean',
          description: 'Optional: Only return hard rules. Default: false',
        },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'search_characters',
    description: 'Search characters by name or role',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the novel project',
        },
        keyword: {
          type: 'string',
          description: 'Optional: Keyword to search for in character names/descriptions',
        },
        role: {
          type: 'string',
          enum: ['protagonist', 'antagonist', 'supporting', 'minor'],
          description: 'Optional: Filter by role',
        },
      },
      required: ['project_path'],
    },
  },
] as const;
