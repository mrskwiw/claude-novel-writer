# SQLite MCP Server Options for Novel Writing Extension

## Summary

**YES** - there are existing MCP SQLite servers we can package with the extension! Two main options:

## Option 1: Official Anthropic MCP SQLite Server (Python) ⭐ RECOMMENDED

**Repository**: `modelcontextprotocol/servers-archived` (archived but stable)
**Package**: `mcp-server-sqlite` (PyPI)
**Language**: Python
**License**: MIT

### Installation
```bash
# Via uvx (recommended - no install needed)
uvx mcp-server-sqlite --db-path ~/novel.db

# Or via pip
pip install mcp-server-sqlite
```

### Configuration (for Claude Desktop/Code)
```json
{
  "mcpServers": {
    "novel-db": {
      "command": "uvx",
      "args": [
        "mcp-server-sqlite",
        "--db-path",
        "${workspaceFolder}/.novel/data.db"
      ]
    }
  }
}
```

### Available Tools
1. **read_query** - Execute SELECT queries
2. **write_query** - Execute INSERT/UPDATE/DELETE
3. **create_table** - Create new tables
4. **list_tables** - List all tables
5. **describe_table** - View table schema
6. **append_insight** - Add business insights to memo (could adapt for writing notes)

### Pros
- ✅ Official Anthropic implementation
- ✅ Battle-tested in production
- ✅ Zero-install with `uvx`
- ✅ Simple, direct SQL interface
- ✅ Memo resource for persistent notes
- ✅ Works with Python ecosystem

### Cons
- ⚠️ Archived (but stable, still works)
- ⚠️ Requires Python runtime
- ⚠️ Basic tools - no high-level CRUD abstractions

---

## Option 2: jparkerweb/mcp-sqlite (Node.js) - Alternative

**Repository**: `jparkerweb/mcp-sqlite`
**Package**: `mcp-sqlite` (npm)
**Language**: Node.js/TypeScript
**Status**: Actively maintained
**License**: MIT

### Installation
```bash
# Via npx (no install needed)
npx -y mcp-sqlite path/to/database.db
```

### Configuration
```json
{
  "mcpServers": {
    "novel-db": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-sqlite",
        ".novel/data.db"
      ]
    }
  }
}
```

### Available Tools
1. **db_info** - Get database metadata
2. **list_tables** - List all tables
3. **get_table_schema** - View table schema
4. **create_record** - Insert with object syntax
5. **read_records** - Query with conditions/pagination
6. **update_records** - Update with conditions
7. **delete_records** - Delete with conditions
8. **query** - Execute raw SQL

### Pros
- ✅ Actively maintained
- ✅ High-level CRUD abstractions
- ✅ Object-based API (easier for AI)
- ✅ Node.js (matches typical extension stacks)
- ✅ Detailed documentation

### Cons
- ⚠️ Third-party (not Anthropic official)
- ⚠️ Requires Node.js runtime
- ⚠️ Less field-tested than official version

---

## Recommendation: Option 1 (Official Anthropic)

### Why?
1. **Official Implementation** - Built by Anthropic, proven reliable
2. **Zero Dependencies** - `uvx` handles everything automatically
3. **SQL-First** - Direct SQL gives us full schema control
4. **Cross-Platform** - Works everywhere Python runs
5. **Simple Integration** - Just point at database file

### Example Usage with Our Schema

```javascript
// Extension would configure MCP server at startup
{
  "mcpServers": {
    "novel-db": {
      "command": "uvx",
      "args": [
        "mcp-server-sqlite",
        "--db-path",
        "${workspaceFolder}/.novel/data.db"
      ]
    }
  }
}
```

Then AI can directly query our schema:

```sql
-- Find all scenes where Sarah appears
SELECT s.id, c.chapter_number, s.title
FROM scenes s
JOIN chapters c ON s.chapter_id = c.id
JOIN character_appearances ca ON ca.scene_id = s.id
JOIN characters ch ON ch.id = ca.character_id
WHERE ch.name = 'Sarah';
```

```sql
-- Check for character attribute conflicts
SELECT ca1.character_id, ca1.attribute_name,
       ca1.attribute_value as first_value,
       ca2.attribute_value as conflicting_value
FROM character_attributes ca1
JOIN character_attributes ca2 ON
    ca1.character_id = ca2.character_id AND
    ca1.attribute_name = ca2.attribute_name AND
    ca1.attribute_value != ca2.attribute_value;
```

---

## Integration Strategy

### Phase 1: Extension Setup
```typescript
// extension.ts
import { exec } from 'child_process';
import path from 'path';

async function initializeDatabase(projectPath: string) {
  const dbPath = path.join(projectPath, '.novel', 'data.db');

  // Ensure .novel directory exists
  await fs.mkdir(path.dirname(dbPath), { recursive: true });

  // Initialize schema if new database
  if (!fs.existsSync(dbPath)) {
    const schema = fs.readFileSync('schema.sql', 'utf8');
    // Use sqlite3 to initialize, or let MCP server create it
  }

  // Configure MCP server
  return {
    command: 'uvx',
    args: ['mcp-server-sqlite', '--db-path', dbPath]
  };
}
```

### Phase 2: File-to-Database Sync
```typescript
// When user edits characters/sarah.yml
async function syncCharacterToDb(characterFile: string) {
  const yaml = parseYAML(characterFile);

  // Use MCP server to write to database
  await mcpClient.write_query(`
    INSERT OR REPLACE INTO characters (name, role, summary)
    VALUES (?, ?, ?)
  `, [yaml.name, yaml.role, yaml.summary]);

  // Sync attributes
  for (const [key, value] of Object.entries(yaml.attributes)) {
    await mcpClient.write_query(`
      INSERT OR REPLACE INTO character_attributes
      (character_id, attribute_name, attribute_value)
      VALUES ((SELECT id FROM characters WHERE name = ?), ?, ?)
    `, [yaml.name, key, value]);
  }
}
```

### Phase 3: Context Assembly
```typescript
async function loadSceneContext(sceneId: number) {
  // Get characters in scene
  const characters = await mcpClient.read_query(`
    SELECT c.* FROM characters c
    JOIN character_appearances ca ON c.id = ca.character_id
    WHERE ca.scene_id = ?
  `, [sceneId]);

  // Get location and world rules
  const location = await mcpClient.read_query(`
    SELECT l.*, wr.rule_name, wr.description
    FROM scenes s
    JOIN locations l ON s.location_id = l.id
    LEFT JOIN world_rules wr ON wr.project_id = l.project_id
    WHERE s.id = ?
  `, [sceneId]);

  // Assemble into AI context
  return {
    characters,
    location,
    // ... more context
  };
}
```

---

## Alternative: Bundle Both?

Could offer **user choice**:
```json
{
  "novel.databaseBackend": {
    "type": "string",
    "enum": ["python", "nodejs"],
    "default": "python",
    "description": "SQLite MCP server implementation"
  }
}
```

**Recommendation**: Start with Python (official), add Node.js option later if needed.

---

## Next Steps

1. ✅ **Decision Made**: Use official `mcp-server-sqlite`
2. 🔄 Create extension package.json with MCP server config
3. 🔄 Implement database initialization (schema.sql)
4. 🔄 Build file-to-database sync engine
5. 🔄 Create context assembly queries
6. 🔄 Add consistency checking queries

Want me to start building the extension structure with MCP integration?
