# MCP Server Configuration (Template)

This directory contains a **template** for future MCP server configuration. When we build an MCP server wrapper for this extension, these tool definitions will allow other projects to use novel writing commands via MCP.

## Current Status

**This is currently a template for future development.**

**Note**: The project already has a working MCP server at `claudenovel_plugin/mcp-server/novel-tools/` that provides tools for Claude's subagents when working on novel projects. That MCP server is fully functional and documented.

This `.claude/` directory is a different concept - it's for when we want to expose the CLI commands as MCP tools to *external* projects that want to use novel writing features.

**Two MCP Server Concepts**:
1. **Internal MCP Server** (`mcp-server/novel-tools/`) ✅ Complete
   - Used by Claude when working on novel projects
   - Calls extension methods directly
   - Currently has 23 tools including consistency checking

2. **External MCP Server** (this template) ⏳ Future
   - Would allow external projects to use novel CLI commands
   - Would shell out to `/novel` CLI commands
   - Template ready for when we implement this

The Novel Writer Extension is a Claude Code extension (not an MCP server). These tool definitions are prepared for when we:
1. Build an MCP server wrapper around the extension
2. Want to expose novel writing tools to other Claude Code projects via CLI commands
3. Enable subagents in other projects to use novel writing features

## Files

- **mcp-server-tools.json**: Tool definition template
  - Follows MCP tools schema
  - Defines all available `/novel` CLI commands as MCP tools
  - Ready to be used when MCP server is implemented

## Future Usage

When the MCP server is built, external projects will be able to:

1. Connect to the Novel Writer MCP server
2. Access novel writing tools programmatically
3. Use commands like `novel_check_consistency` in their subagents
4. Integrate novel writing features into their workflows

## Adding New Tools

When you implement a new CLI command, add it to `mcp-server-tools.json`:

```json
{
  "name": "novel_<command>_<subcommand>",
  "description": "What the command does",
  "inputSchema": {
    "type": "object",
    "properties": {
      "paramName": {
        "type": "string|number|boolean",
        "description": "Parameter description"
      }
    },
    "required": ["requiredParams"]
  }
}
```

### Naming Convention

- Use snake_case: `novel_check_consistency`
- Format: `novel_<command>_<subcommand>`
- For commands without subcommands: `novel_<command>`

### Input Schema

- Follow JSON Schema specification
- Include all CLI flags as properties
- Mark required flags in `required` array
- Provide clear descriptions for each property
- Use enums for restricted values

## Tool Categories

Current tool categories:

1. **Project Management**: init
2. **Consistency Checking**: check_* (9 tools)
3. **Synchronization**: sync_* (4 tools)
4. **Listing**: list_* (3 tools)
5. **Scene Management**: scene_* (3 tools)
6. **Session Tracking**: session_*, progress_* (3 tools)

Total: 23 tools

## Maintenance

This file should be updated whenever:
- New CLI commands are added
- Command flags change
- Commands are deprecated or removed

See `CLAUDE.md` for the complete documentation maintenance workflow.
