# 🚀 Claude Novel — Phase 1 Full Implementation Spec

---

# 0. Design Constraints (Non-Negotiable)

### 0.1 Source of Truth

* Files (Markdown + YAML) are canonical
* Database is a derived index only

### 0.2 Determinism First

* Context engine must be reproducible
* Same input → same output

### 0.3 No Compression Layer

* No summarization in Phase 1
* Token limits handled via selection only

### 0.4 CLI-First System

* All functionality exposed via CLI
* Future agents will call CLI as tools

---

# 1. Project Structure

```
claudenovel/
├── src/
│   ├── cli/
│   ├── services/
│   ├── builders/
│   ├── context/
│   ├── ai/
│   ├── sync/
│   ├── db/
│   ├── utils/
│   └── types/
│
├── schema.sql
├── package.json
└── tsconfig.json
```

---

# 2. Core Type System

```ts
type ID = number

interface Project {
  id: ID
  title: string
  genre?: string
}

interface Chapter {
  id: ID
  projectId: ID
  number: number
  title: string
  filePath: string
}

interface Scene {
  id: ID
  chapterId: ID
  number: number
  text: string
}

interface Character {
  id: ID
  projectId: ID
  name: string
  summary: string
}
```

---

# 3. Database Schema

```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE chapters (
  id INTEGER PRIMARY KEY,
  project_id INTEGER,
  chapter_number INTEGER,
  title TEXT,
  file_path TEXT
);

CREATE TABLE scenes (
  id INTEGER PRIMARY KEY,
  chapter_id INTEGER,
  scene_number INTEGER,
  text TEXT
);

CREATE TABLE characters (
  id INTEGER PRIMARY KEY,
  project_id INTEGER,
  name TEXT,
  summary TEXT
);

CREATE TABLE world_rules (
  id INTEGER PRIMARY KEY,
  project_id INTEGER,
  description TEXT
);
```

---

# 4. Builder Layer

## 4.1 ChapterBuilder

```ts
class ChapterBuilder {
  async create(number: number, title: string): Promise<string>
  async list(): Promise<Chapter[]>
  async getNextNumber(): Promise<number>
}
```

## 4.2 SceneBuilder

```ts
class SceneBuilder {
  async addScene(chapterPath: string, content: string): Promise<void>
  async parseScenes(chapterPath: string): Promise<Scene[]>
}
```

## 4.3 CharacterBuilder

```ts
class CharacterBuilder {
  async create(data: Character): Promise<void>
  async list(): Promise<Character[]>
}
```

---

# 5. Sync System (File → DB)

## 5.1 Flow

```
Read file → Parse → Transform → Upsert into DB
```

## 5.2 Example

```ts
class ChapterSync {
  async sync(filePath: string) {
    const content = readFile(filePath)
    const parsed = parseChapter(content)
    await db.upsertChapter(parsed)
  }
}
```

---

# 6. Context Engine (V1)

## 6.1 Interface

```ts
interface ContextRequest {
  projectId: number
  currentSceneId?: number
  maxTokens?: number
}

interface ContextBlock {
  type: string
  content: string
  score: number
}

interface ContextResult {
  blocks: ContextBlock[]
}
```

---

## 6.2 Pipeline

### Step 1: Fetch

* Current scene
* Recent scenes
* Characters
* World rules

### Step 2: Rank

```ts
score =
  semanticSimilarity * 0.6 +
  recency * 0.2 +
  entityMatch * 0.2
```

### Step 3: Select

```ts
sort DESC → accumulate until token limit
```

---

# 7. Prompt Builder

```ts
class PromptBuilder {
  buildContinuation(context: ContextResult, input: string): string
}
```

## Template

```
CONTEXT:
{{blocks}}

CURRENT TEXT:
{{input}}

TASK:
Continue the scene.

RULES:
- Maintain POV
- Respect character voice
- Follow world rules

OUTPUT:
2–3 options
```

---

# 8. AI Generation System

## 8.1 Client

```ts
class ClaudeClient {
  async generate(prompt: string, temperature = 0.7) {
    return anthropic.messages.create({
      model: "claude-3",
      messages: [{ role: "user", content: prompt }],
      temperature
    })
  }
}
```

---

## 8.2 Service Layer

```ts
class GenerationService {
  async continueScene(sceneId: number, input: string) {
    const context = await contextEngine.build({ sceneId })
    const prompt = promptBuilder.buildContinuation(context, input)
    return await aiClient.generate(prompt)
  }
}
```

---

# 9. CLI System

## 9.1 Commands

```
/novel init
/novel chapter create
/novel chapter list
/novel scene add
/novel character create
/novel generate continue
/novel sync
```

---

## 9.2 Handler Pattern

```ts
async function handleGenerateContinue(args) {
  const result = await generationService.continueScene(
    args.scene,
    args.input
  )

  console.log(result)
}
```

---

# 10. Service Layer (Critical)

## Purpose

* Orchestrates builders + context + AI
* Keeps CLI thin

## Example

```ts
class SceneService {
  async continue(sceneId: number, input: string) {
    return generationService.continueScene(sceneId, input)
  }
}
```

---

# 11. Build Order

### Step 1

* Project init
* Database setup

### Step 2

* Chapter + Scene builders

### Step 3

* Sync system

### Step 4

* Context engine

### Step 5

* AI generation

### Step 6

* CLI integration

---

# 12. Extension Points

## 12.1 Subagent Tool Interface

```ts
interface Tool {
  name: string
  execute(input: any): Promise<any>
}
```

---

## 12.2 Style Profiles (Future)

```ts
interface StyleProfile {
  id: string
  parameters: {
    descriptiveness: number
    dialogueDensity: number
  }
}
```

---

## 12.3 Rules Engine (Stub)

```ts
interface Rule {
  type: "hard" | "soft"
  check(context): boolean
}
```

---

# 13. Acceptance Criteria

Phase 1 is complete when:

* ✅ User can initialize a project
* ✅ Create chapters and scenes
* ✅ Sync data into database
* ✅ Generate scene continuation with context
* ✅ Output reflects characters + recent story state

---

# Final Note

This spec is intentionally:

* Minimal where it should be
* Strict where it matters (context + determinism)
* Expandable without refactoring

The next real leverage point after this:

👉 Context Engine V2 (semantic memory + persistence)
👉 Subagent system

---
