# Interactive Builders

## Overview

The Novel Writer extension includes interactive builders that prompt authors for input and generate properly formatted YAML files. These builders eliminate the need to manually write YAML and ensure consistent formatting.

## Features

✅ **Character Builder** - Interactive character profile creation
✅ **Location Builder** - Interactive location/world element creation
✅ **Auto-sync** - Generated files automatically sync to database
✅ **Validation** - Ensures all required fields are filled
✅ **Template-based** - Follows established YAML templates
🔮 **AI-Assisted** - Coming soon (see AI_ASSISTED_GENERATION_SPEC.md)

## Usage

### Simple CLI Example

```typescript
import { NovelWriterExtension } from 'claude-novel-writer';
import * as readline from 'readline';

// Create a simple prompt function
function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return async (message: string, options = {}) => {
    return new Promise((resolve) => {
      const prompt = options.default
        ? `${message} [${options.default}]: `
        : `${message}: `;

      rl.question(prompt, (answer) => {
        resolve(answer.trim() || options.default || '');
      });
    });
  };
}

// Use the builder
const ext = new NovelWriterExtension('./my-novel');
const prompt = createPrompt();

// Create character interactively
const filePath = await ext.createCharacterInteractive(prompt);
// → Prompts for: name, role, summary, physical traits, etc.
// → Generates: characters/character-name.yml
// → Auto-syncs to database
```

### What Gets Prompted

#### Character Builder Prompts

1. **Basic Information**
   - Character name (required)
   - Full name (optional)
   - Role (protagonist/antagonist/major/minor/background)
   - Summary paragraph

2. **Physical Attributes** (optional section)
   - Age
   - Eye color
   - Hair color
   - Height
   - Build
   - Additional custom traits

3. **Personality Traits** (optional section)
   - Core personality
   - Strengths
   - Flaws
   - Fears
   - Desires/goals

4. **Background** (optional section)
   - Occupation
   - Education
   - Family background
   - Hometown

5. **Skills** (optional section)
   - Custom skill → description pairs

6. **Voice & Speech** (optional section)
   - Speech patterns (multiple)
   - Quirks (multiple)
   - Vocabulary style

7. **Character Arc** (optional)
   - Starting state
   - Ending state
   - Midpoint crisis

8. **Notes** (optional)
   - Additional notes

#### Location Builder Prompts

1. **Basic Information**
   - Location name (required)
   - Type (city/building/room/etc)
   - Parent location (optional)
   - Description (required)

2. **Detailed Attributes** (optional section)
   - Size/scale
   - Population
   - Climate
   - Architecture
   - Atmosphere
   - Additional custom details

3. **Location Rules** (optional)
   - Rules/constraints (multiple entries)

4. **Additional Information**
   - First appearance (chapter/scene)
   - Notes

### Programmatic Usage

For non-interactive scenarios:

```typescript
// Create character from object
const builder = ext.getCharacterBuilder();

await builder.createFromObject({
  name: 'Sarah Chen',
  role: 'protagonist',
  summary: 'A brilliant astrophysicist...',
  physical: {
    age: '34',
    eyeColor: 'blue'
  },
  // ... more fields
});

// Manually sync to database
const sync = ext.getCharacterSync();
await sync.syncCharacterFile('characters/sarah-chen.yml');
```

## Generated YAML Format

### Character Example

```yaml
# Character Profile
# Generated: 2025-10-24T12:00:00.000Z

name: Sarah Chen
fullName: Dr. Sarah Chen
role: protagonist
summary: |
  A brilliant but isolated astrophysicist who discovers
  an anomaly that challenges everything she knows.

# Physical Attributes
physical:
  age: "34"
  eyeColor: "blue"
  hairColor: "dark brown"
  height: "5'7\""

# Personality Traits
personality:
  core: "analytical and driven"
  strengths: "exceptional problem-solver"
  flaws: "struggles to trust others"
  fears: "being wrong, losing control"
  desires: "scientific recognition"

# Background Information
background:
  occupation: "Research scientist at SETI"
  education: "PhD in Astrophysics, MIT"

# Voice & Speech Patterns
voice:
  patterns:
    - Uses scientific metaphors
    - Speaks precisely, avoids contractions when nervous
  quirks:
    - Taps pen when thinking
    - Says "fascinating" frequently
  vocabulary: "Technical, formal"

# Character Arc
arc:
  startingState: |
    Isolated and mistrustful of others.
    Believes science is the only truth.
  endingState: |
    Learns to work with team.
    Reconnects with humanity beyond science.
  midpointCrisis: |
    Forced to choose between career and doing the right thing.
```

### Location Example

```yaml
# Location Profile
# Generated: 2025-10-24T12:00:00.000Z

name: SETI Observatory Control Room
type: room
parentLocation: Mount Hamilton Observatory

description: |
  A circular room filled with monitors displaying radio telescope
  data from around the world. The walls are lined with equipment
  from different eras - some vintage 1960s gear, some cutting-edge
  modern displays. The lighting is dim to preserve night vision.
  A subtle hum from servers and cooling systems creates white noise.

# Detailed Attributes
details:
  size: "30 feet diameter"
  climate: "Climate controlled, 68°F"
  atmosphere: "Quiet, focused, slightly eerie at night"
  lighting: "Dim blue-white glow from monitors"

# Location-Specific Rules
rules:
  - No bright lights after sunset (preserves night vision)
  - Radio silence on all devices
  - Only cleared personnel after hours

# First Appearance
firstAppearance: Chapter 1
```

## Validation

Both builders include validation:

✅ Required fields enforced (name, role, summary, description)
✅ Role must be valid value
✅ Filename sanitization (safe filesystem names)
✅ YAML syntax validation
✅ Auto-generated comments for readability

## File Naming

Generated files use sanitized character/location names:

- "Sarah Chen" → `sarah-chen.yml`
- "Mount Hamilton Observatory" → `mount-hamilton-observatory.yml`
- "Dr. Smith's Lab" → `dr-smiths-lab.yml`

## Integration with Sync Engine

Generated files are automatically synced to database (if project initialized):

```typescript
// This happens automatically:
const filePath = await ext.createCharacterInteractive(prompt);
// 1. Prompts for input
// 2. Generates YAML file
// 3. Writes to characters/ directory
// 4. Syncs to database
// 5. Returns file path
```

## Extending the Builders

### Custom Prompt Functions

Implement `PromptFunction` for different UIs:

```typescript
// Web UI example
const webPrompt: PromptFunction = async (message, options) => {
  return await showModalDialog(message, options);
};

// Electron app example
const electronPrompt: PromptFunction = async (message, options) => {
  const result = await ipcRenderer.invoke('show-prompt', message, options);
  return result;
};

// Use with builders
await ext.createCharacterInteractive(webPrompt);
```

### Adding Custom Fields

Extend the builders to prompt for custom fields:

```typescript
class ExtendedCharacterBuilder extends CharacterBuilder {
  async createInteractive(promptFn: PromptFunction): Promise<string> {
    // Call parent method
    const character = await super.createInteractive(promptFn);

    // Add custom prompts
    const customField = await promptFn('Custom field');

    // Modify YAML before writing
    // ...

    return filePath;
  }
}
```

## Best Practices

### For CLI Use
1. Start with required fields
2. Skip optional sections with "no"
3. Use multiline for descriptions/summaries
4. Review generated YAML before committing

### For GUI Use
1. Show section collapsibles
2. Provide field tooltips
3. Live YAML preview
4. Save progress between sections

### For Batch Creation
1. Use programmatic API (`createFromObject`)
2. Generate from templates
3. Bulk sync after all files created

## Comparison with Manual Creation

### Manual (Old Way)
```bash
# Create file
touch characters/sarah.yml

# Copy template
cp examples/character-template.yml characters/sarah.yml

# Edit in text editor (5-10 minutes)
vim characters/sarah.yml

# Sync to database
# (run extension sync command)
```

### Interactive Builder (New Way)
```bash
# Run interactive builder
novel create character

# Answer prompts (3-5 minutes)
# Automatic YAML generation
# Automatic database sync
```

**Time Saved**: ~5 minutes per character
**Error Prevention**: YAML syntax errors eliminated
**Consistency**: All files follow same format

## Future: AI-Assisted Generation

Coming soon - describe characters in natural language:

```typescript
await ext.createCharacterFromDescription(
  "A brilliant but reckless starship pilot in her late 20s"
);
// → Generates complete profile with inferred details
```

See [AI_ASSISTED_GENERATION_SPEC.md](./AI_ASSISTED_GENERATION_SPEC.md) for details.

## Examples

See complete examples:
- `examples/interactive-builder-example.ts` - CLI prompt implementation
- `examples/character-template.yml` - Manual template (reference)
- `examples/location-template.yml` - Manual template (reference)

## Troubleshooting

### "Required field missing"
Some fields are required:
- Character: name, role, summary
- Location: name, description

### "Invalid role"
Character role must be one of:
- protagonist
- antagonist
- major
- minor
- background

### "File already exists"
Builder won't overwrite existing files. Either:
- Delete the old file
- Use a different name
- Use the sync engine to update existing files

---

**Next**: Try the interactive builder with the example CLI script!

```bash
npx tsx examples/interactive-builder-example.ts
```
