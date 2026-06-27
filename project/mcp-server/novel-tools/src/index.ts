#!/usr/bin/env node

/**
 * Novel Tools MCP Server
 * Exposes high-level novel-writing operations to Claude via MCP protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { tools } from './tools.js';
import * as handlers from './handlers.js';

// Create server instance
const server = new Server(
  {
    name: 'novel-tools',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Map tool names to handler functions
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  // Sync operations
  sync_world_rules: handlers.handleSyncWorldRules,
  sync_characters: handlers.handleSyncCharacters,
  sync_locations: handlers.handleSyncLocations,
  sync_plot_threads: handlers.handleSyncPlotThreads,
  sync_chapters: handlers.handleSyncChapters,
  sync_timeline: handlers.handleSyncTimeline,

  // Builder operations
  create_world_rule: handlers.handleCreateWorldRule,
  list_world_rules: handlers.handleListWorldRules,
  get_world_rule: handlers.handleGetWorldRule,
  add_world_rule_example: handlers.handleAddWorldRuleExample,
  add_world_rule_exception: handlers.handleAddWorldRuleException,
  update_world_rule_limitations: handlers.handleUpdateWorldRuleLimitations,
  mark_world_rule_established: handlers.handleMarkWorldRuleEstablished,
  toggle_world_rule_hard: handlers.handleToggleWorldRuleHard,
  get_world_rule_stats: handlers.handleGetWorldRuleStats,
  create_character: handlers.handleCreateCharacter,
  create_location: handlers.handleCreateLocation,
  create_plot_thread: handlers.handleCreatePlotThread,

  // Context assembly
  get_scene_context: handlers.handleGetSceneContext,
  get_character_context: handlers.handleGetCharacterContext,
  get_location_context: handlers.handleGetLocationContext,

  // Consistency checking
  check_consistency: handlers.handleCheckConsistency,
  check_world_rules: handlers.handleCheckWorldRules,
  list_consistency_issues: handlers.handleListConsistencyIssues,
  resolve_consistency_issue: handlers.handleResolveConsistencyIssue,
  acknowledge_consistency_issue: handlers.handleAcknowledgeConsistencyIssue,
  mark_false_positive: handlers.handleMarkFalsePositive,

  // Project health & stats
  get_project_health: handlers.handleGetProjectHealth,
  get_writing_stats: handlers.handleGetWritingStats,
  get_plot_thread_status: handlers.handleGetPlotThreadStatus,

  // Search & query
  search_world_rules: handlers.handleSearchWorldRules,
  search_characters: handlers.handleSearchCharacters,

  // Timeline operations
  add_timeline_event: handlers.handleAddTimelineEvent,
  list_timeline_events: handlers.handleListTimelineEvents,
  get_timeline_event: handlers.handleGetTimelineEvent,
  update_timeline_event: handlers.handleUpdateTimelineEvent,
  link_timeline_events: handlers.handleLinkTimelineEvents,
  check_timeline_conflicts: handlers.handleCheckTimelineConflicts,
};

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Get the handler for this tool
    const handler = toolHandlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Execute the handler
    const result = await handler(args || {});

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: errorMessage,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP protocol on stdout
  console.error('Novel Tools MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
