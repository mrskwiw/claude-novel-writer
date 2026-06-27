# Novel Tools MCP Server

This MCP server exposes high-level novel-writing operations to Claude, enabling AI-assisted novel writing with sophisticated tooling.

## Overview

The Novel Tools MCP server provides Claude with direct access to:
- **Sync Operations**: Synchronize YAML files to database
- **Builder Operations**: Create characters, locations, world rules, plot threads
- **Context Assembly**: Get comprehensive context for scenes, characters, locations
- **Consistency Checking**: Validate consistency of characters, timeline, world rules
- **Project Health**: Track writing progress, statistics, and project health
- **Search & Query**: Find and filter novel elements

## Available Tools

### Sync Operations

- `sync_world_rules` - Sync world rule YAML files to database
- `sync_characters` - Sync character YAML files to database
- `sync_locations` - Sync location YAML files to database
- `sync_plot_threads` - Sync plot thread YAML files to database
- `sync_chapters` - Sync chapter markdown files to database

### Builder Operations

- `create_world_rule` - Create new world rule with validation
- `create_character` - Create new character profile
- `create_location` - Create new location
- `create_plot_thread` - Create new plot thread

### Context Assembly

- `get_scene_context` - Get all context needed for writing a scene
- `get_character_context` - Get comprehensive character information
- `get_location_context` - Get location details and history

### Consistency Checking

- `check_consistency` - Run consistency checks on project
- `check_world_rules` - Validate text against world rules
- `list_consistency_issues` - List all open consistency issues with optional filtering
- `resolve_consistency_issue` - Mark an issue as resolved (fixed in manuscript)
- `acknowledge_consistency_issue` - Acknowledge an intentional inconsistency
- `mark_false_positive` - Mark an issue as incorrectly detected

### Project Health & Stats

- `get_project_health` - Get project health dashboard
- `get_writing_stats` - Get writing statistics and streaks
- `get_plot_thread_status` - Get status of plot threads

### Search & Query

- `search_world_rules` - Search world rules by keyword/category
- `search_characters` - Search characters by name/role

## Installation

```bash
cd mcp-server/novel-tools
npm install
npm run build
```

## Configuration

Add to Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "novel-db": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-sqlite",
        "--db-path",
        "${workspaceFolder}/.novel/novel.db"
      ]
    },
    "novel-tools": {
      "command": "node",
      "args": [
        "${workspaceFolder}/claudenovel_plugin/mcp-server/novel-tools/dist/index.js"
      ]
    }
  }
}
```

## Architecture

```
┌─────────────┐
│   Claude    │
└──────┬──────┘
       │ MCP Protocol
       ├─────────────────┬──────────────────┐
       │                 │                  │
┌──────▼──────┐   ┌─────▼─────┐   ┌───────▼────────┐
│  mcp-sqlite │   │novel-tools│   │ Other MCP      │
│             │   │           │   │ Servers        │
└──────┬──────┘   └─────┬─────┘   └────────────────┘
       │                 │
       │        ┌────────▼────────┐
       │        │ NovelWriter     │
       │        │ Extension       │
       │        └────────┬────────┘
       │                 │
       └─────────────────┴─────────────────┐
                                            │
                                ┌───────────▼──────────┐
                                │  SQLite Database     │
                                │  (.novel/novel.db)   │
                                └──────────────────────┘
```

## Why Two MCP Servers?

- **mcp-sqlite**: Provides low-level database access (CRUD operations, SQL queries)
- **novel-tools**: Provides high-level novel operations (sync, build, context, check)

This separation allows Claude to:
1. Query raw data efficiently (via mcp-sqlite)
2. Execute sophisticated operations (via novel-tools)
3. Maintain type safety and validation
4. Access domain-specific logic

## Usage Examples

### Sync World Rules
```typescript
await mcp.call_tool('sync_world_rules', {
  project_path: '/path/to/project',
  rule_name: 'magic-system' // Optional
});
```

### Create Character
```typescript
await mcp.call_tool('create_character', {
  project_path: '/path/to/project',
  name: 'Sarah Chen',
  role: 'protagonist',
  description: 'A determined detective with a photographic memory',
  auto_sync: true
});
```

### Get Scene Context
```typescript
await mcp.call_tool('get_scene_context', {
  project_path: '/path/to/project',
  chapter_number: 5,
  scene_id: 'confrontation'
});
```

### Check Consistency
```typescript
await mcp.call_tool('check_consistency', {
  project_path: '/path/to/project',
  check_type: 'all' // or 'characters', 'timeline', 'world_rules'
});
```

### List Consistency Issues
```typescript
await mcp.call_tool('list_consistency_issues', {
  project_path: '/path/to/project',
  severity: 'error', // Optional: 'error', 'warning', 'info'
  verbose: true // Optional: Include detailed information
});
```

### Manage Consistency Issues
```typescript
// Resolve an issue
await mcp.call_tool('resolve_consistency_issue', {
  project_path: '/path/to/project',
  issue_id: 5,
  notes: 'Fixed eye color in Chapter 15'
});

// Acknowledge intentional inconsistency
await mcp.call_tool('acknowledge_consistency_issue', {
  project_path: '/path/to/project',
  issue_id: 3,
  notes: 'Intentional for narrative effect'
});

// Mark false positive
await mcp.call_tool('mark_false_positive', {
  project_path: '/path/to/project',
  issue_id: 7,
  notes: 'Not actually a contradiction'
});
```

## Development

```bash
# Watch mode for development
npm run watch

# Build for production
npm run build

# Test (requires novel project)
node dist/index.js
```

## Error Handling

All tools return structured responses:

**Success:**
```json
{
  "success": true,
  "message": "Operation completed",
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message"
}
```

## Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `claudenovel_plugin` - Novel writing extension (must be built)

## License

MIT
