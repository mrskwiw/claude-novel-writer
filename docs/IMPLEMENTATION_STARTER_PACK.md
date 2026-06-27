# Claude Novel — Implementation Starter Pack

**Purpose:** Convert the architecture specs into an implementation-ready build plan: file map, tickets, migrations, interfaces, CLI commands, tests, and the first vertical slice.

---

# 0. Implementation Principle

The first implementation target is not “AI writes prose.”

The first target is:

```txt
Reliable story state
→ deterministic context
→ constrained AI assistance
```

Everything in this starter pack supports that goal.

---

# 1. Phase 1 Implementation Scope

## Included

- Project Knowledge Architecture
- Canon System
- Context Contracts
- Context Policy Engine
- Promise / Payoff Tracking
- Narrative Graph
- Minimum CLI integration
- Deterministic tests
- One vertical slice

## Excluded for now

- Compression / summarization layer
- Multi-agent collaboration protocol
- Advanced style learning
- Automatic canon extraction from prose
- Full UI
- Reverse DB → file sync
- Complex graph analytics
- LCM / concept model layer

---

# 2. Repository File Map

```txt
claudenovel_plugin/
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── canon.ts
│   │   │   ├── context.ts
│   │   │   ├── knowledge.ts
│   │   │   ├── promise.ts
│   │   │   └── graph.ts
│   │   ├── handlers/
│   │   │   ├── canon-handler.ts
│   │   │   ├── context-handler.ts
│   │   │   ├── knowledge-handler.ts
│   │   │   ├── promise-handler.ts
│   │   │   └── graph-handler.ts
│   │   └── registry.ts
│   │
│   ├── types/
│   │   ├── common.ts
│   │   ├── story-location.ts
│   │   ├── knowledge.ts
│   │   ├── canon.ts
│   │   ├── context.ts
│   │   ├── promise.ts
│   │   └── graph.ts
│   │
│   ├── services/
│   │   ├── knowledge-service.ts
│   │   ├── canon-service.ts
│   │   ├── context-contract-service.ts
│   │   ├── context-policy-engine.ts
│   │   ├── promise-service.ts
│   │   └── narrative-graph-service.ts
│   │
│   ├── context/
│   │   ├── contracts/
│   │   │   ├── scene-continuation.contract.ts
│   │   │   ├── continuity-check.contract.ts
│   │   │   └── developmental-edit.contract.ts
│   │   ├── fetchers/
│   │   │   ├── scene-fetcher.ts
│   │   │   ├── character-fetcher.ts
│   │   │   ├── canon-fetcher.ts
│   │   │   ├── promise-fetcher.ts
│   │   │   ├── graph-fetcher.ts
│   │   │   ├── style-profile-fetcher.ts
│   │   │   └── semantic-memory-fetcher.ts
│   │   ├── scoring.ts
│   │   ├── ordering.ts
│   │   ├── token-budget.ts
│   │   └── fingerprint.ts
│   │
│   ├── sync/
│   │   ├── knowledge-sync.ts
│   │   ├── canon-sync.ts
│   │   ├── promise-sync.ts
│   │   └── graph-sync.ts
│   │
│   ├── db/
│   │   ├── migrations/
│   │   │   ├── 001_knowledge_objects.sql
│   │   │   ├── 002_canon.sql
│   │   │   ├── 003_promises.sql
│   │   │   ├── 004_narrative_graph.sql
│   │   │   └── 005_context_contracts.sql
│   │   └── repositories/
│   │       ├── knowledge-repository.ts
│   │       ├── canon-repository.ts
│   │       ├── promise-repository.ts
│   │       ├── graph-repository.ts
│   │       └── context-contract-repository.ts
│   │
│   ├── utils/
│   │   ├── stable-json.ts
│   │   ├── hash.ts
│   │   ├── token-count.ts
│   │   └── ids.ts
│   │
│   └── index.ts
│
├── tests/
│   ├── fixtures/
│   │   └── mini-novel/
│   │       ├── chapters/
│   │       │   └── 01-opening.md
│   │       ├── characters/
│   │       │   └── mira.yml
│   │       └── .novel/
│   ├── unit/
│   └── integration/
│       ├── vertical-slice.test.ts
│       ├── context-determinism.test.ts
│       └── graph-rebuild.test.ts
│
├── schema.sql
└── package.json
```

---

# 3. Ownership Boundaries

## Knowledge Service

Owns:
- unified knowledge object lifecycle
- knowledge type registry
- context / graph / embedding eligibility flags

Does not own:
- canon conflict logic
- promise health logic
- graph traversal

## Canon Service

Owns:
- canon item creation
- canon lifecycle
- assertion promotion
- conflict detection

Does not own:
- graph storage
- memory embeddings
- general rule evaluation

## Context Contract Service

Owns:
- registered context contracts
- contract validation
- contract lookup

Does not build context.

## Context Policy Engine

Owns:
- turning a context contract into context blocks
- fetching candidates
- scoring
- stable ordering
- token budget enforcement
- deterministic fingerprinting

Does not own:
- generation prompts
- AI calls
- canonical truth

## Promise Service

Owns:
- narrative promise lifecycle
- payoffs
- promise health reports

Does not own:
- graph traversal
- developmental editing recommendations

## Narrative Graph Service

Owns:
- graph nodes
- graph edges
- rebuild operations
- graph traversal

Does not own:
- whether a canon item is true
- whether a promise is healthy

---

# 4. Database Migration Plan

## Migration Order

1. `001_knowledge_objects.sql`
2. `002_canon.sql`
3. `003_promises.sql`
4. `004_narrative_graph.sql`
5. `005_context_contracts.sql`

## 001 — Knowledge Objects

```sql
CREATE TABLE IF NOT EXISTS knowledge_objects (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  body TEXT,
  structured_data TEXT NOT NULL,
  scope TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  status TEXT NOT NULL,
  context_eligible INTEGER NOT NULL,
  graph_eligible INTEGER NOT NULL,
  embedding_eligible INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_project
ON knowledge_objects(project_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_project_type
ON knowledge_objects(project_id, type);

CREATE INDEX IF NOT EXISTS idx_knowledge_context
ON knowledge_objects(project_id, context_eligible);
```

## 002 — Canon

```sql
CREATE TABLE IF NOT EXISTS canon_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  strength TEXT NOT NULL,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT,
  description TEXT NOT NULL,
  scope TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canon_conflicts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  item_a TEXT NOT NULL,
  item_b TEXT NOT NULL,
  conflict_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  explanation TEXT NOT NULL,
  recommended_resolution TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canon_project_subject
ON canon_items(project_id, subject);

CREATE INDEX IF NOT EXISTS idx_canon_project_type
ON canon_items(project_id, type);

CREATE INDEX IF NOT EXISTS idx_canon_conflicts_project
ON canon_conflicts(project_id, status);
```

## 003 — Promises

```sql
CREATE TABLE IF NOT EXISTS narrative_promises (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  introduced_at TEXT NOT NULL,
  expected_payoff_window TEXT,
  importance INTEGER NOT NULL,
  reader_visibility INTEGER NOT NULL,
  related_characters TEXT NOT NULL,
  related_plot_threads TEXT NOT NULL,
  related_themes TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promise_payoffs (
  id TEXT PRIMARY KEY,
  promise_id TEXT NOT NULL,
  payoff_at TEXT NOT NULL,
  description TEXT NOT NULL,
  payoff_strength INTEGER NOT NULL,
  resolves_promise INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promises_project_status
ON narrative_promises(project_id, status);

CREATE INDEX IF NOT EXISTS idx_payoffs_promise
ON promise_payoffs(promise_id);
```

## 004 — Narrative Graph

```sql
CREATE TABLE IF NOT EXISTS narrative_nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  summary TEXT,
  source_id TEXT,
  metadata TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS narrative_edges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT,
  weight REAL NOT NULL,
  source TEXT,
  metadata TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_project_type
ON narrative_nodes(project_id, type);

CREATE INDEX IF NOT EXISTS idx_graph_edges_from
ON narrative_edges(project_id, from_node_id);

CREATE INDEX IF NOT EXISTS idx_graph_edges_to
ON narrative_edges(project_id, to_node_id);

CREATE INDEX IF NOT EXISTS idx_graph_edges_type
ON narrative_edges(project_id, type);
```

## 005 — Context Contracts

```sql
CREATE TABLE IF NOT EXISTS context_contracts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  required TEXT NOT NULL,
  optional TEXT NOT NULL,
  max_tokens INTEGER NOT NULL,
  ordering_policy TEXT NOT NULL,
  truncation_policy TEXT NOT NULL,
  deterministic INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

# 5. TypeScript Interface Pack

## Common

```ts
export type ID = string

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface Timestamped {
  createdAt: string
  updatedAt: string
}
```

## Story Location

```ts
export interface StoryLocation {
  chapterId?: ID
  sceneId?: ID
  paragraphIndex?: number
  lineNumber?: number
}
```

## Scope and Source

```ts
export interface CanonScope {
  appliesTo:
    | "entire_project"
    | "chapter"
    | "scene"
    | "character"
    | "location"
    | "plot_thread"
    | "timeline_range"

  targetId?: ID
}

export interface CanonSource {
  sourceType:
    | "user_declared"
    | "manuscript_extracted"
    | "agent_inferred"
    | "imported_note"
    | "generated"

  sourceId?: ID
  quote?: string
  location?: StoryLocation
}
```

## Knowledge Object

```ts
export type KnowledgeObjectType =
  | "character_profile"
  | "location_profile"
  | "chapter"
  | "scene"
  | "canon_item"
  | "story_rule"
  | "narrative_promise"
  | "promise_payoff"
  | "plot_thread"
  | "timeline_event"
  | "theme"
  | "style_profile"
  | "author_profile"
  | "research_note"
  | "semantic_memory"

export interface KnowledgeObject extends Timestamped {
  id: ID
  projectId: ID
  type: KnowledgeObjectType
  title: string
  summary?: string
  body?: string
  structuredData: Record<string, unknown>
  scope: CanonScope
  source: CanonSource
  confidence: number
  status: "active" | "draft" | "deprecated" | "archived"
  contextEligible: boolean
  graphEligible: boolean
  embeddingEligible: boolean
}
```

## Canon

```ts
export type CanonType = "fact" | "rule" | "situation" | "assertion"
export type CanonStatus = "active" | "deprecated" | "superseded" | "contested"
export type CanonStrength = "hard" | "soft" | "inferred"

export interface CanonItem extends Timestamped {
  id: ID
  projectId: ID
  type: CanonType
  status: CanonStatus
  strength: CanonStrength
  subject: string
  predicate: string
  object?: string
  description: string
  scope: CanonScope
  source: CanonSource
  confidence: number
  validFrom?: StoryLocation
  validUntil?: StoryLocation
}

export interface CanonConflict {
  id: ID
  projectId: ID
  itemA: ID
  itemB: ID
  conflictType:
    | "direct_contradiction"
    | "temporal_conflict"
    | "scope_overlap"
    | "rule_violation"
    | "unclear_supersession"
  severity: "info" | "warning" | "critical"
  explanation: string
  recommendedResolution?: string
  status: "open" | "resolved" | "ignored"
}
```

## Context

```ts
export type ContextType =
  | "current_scene"
  | "current_chapter"
  | "recent_scenes"
  | "character_profiles"
  | "character_states"
  | "locations"
  | "world_rules"
  | "canon_facts"
  | "canon_situations"
  | "plot_threads"
  | "timeline"
  | "themes"
  | "promises"
  | "style_profile"
  | "author_profile"
  | "semantic_memory"
  | "research_notes"

export interface ContextScope {
  range:
    | "current_scene"
    | "current_chapter"
    | "previous_n_scenes"
    | "entire_project"
    | "related_entities"
    | "semantic_top_k"

  n?: number
  topK?: number
}

export interface ContextRequirement {
  type: ContextType
  scope: ContextScope
  priority: number
  maxTokens?: number
}

export type ContextOrderingPolicy =
  | "priority_then_relevance"
  | "story_order"
  | "entity_grouped"
  | "contract_defined"

export interface ContextTruncationPolicy {
  strategy:
    | "drop_optional_lowest_priority"
    | "drop_lowest_relevance"
    | "hard_fail"
    | "allow_overflow"
  preserveRequired: boolean
}

export interface ContextContract {
  id: ID
  name: string
  description: string
  operationType:
    | "generation"
    | "editing"
    | "analysis"
    | "consistency_check"
    | "planning"
    | "export"
  required: ContextRequirement[]
  optional: ContextRequirement[]
  maxTokens: number
  orderingPolicy: ContextOrderingPolicy
  truncationPolicy: ContextTruncationPolicy
  deterministic: boolean
}

export interface ContextBuildRequest {
  projectId: ID
  contractId: ID
  currentSceneId?: ID
  currentChapterId?: ID
  userTask?: string
  queryText?: string
  overrides?: Partial<ContextContract>
}

export interface ContextBlock {
  id: ID
  type: ContextType
  title: string
  content: string
  sourceId?: ID
  sourceType?: string
  priority: number
  relevanceScore?: number
  tokenCount: number
  required: boolean
  orderIndex: number
}

export interface ContextResult {
  projectId: ID
  contractId: ID
  blocks: ContextBlock[]
  totalTokens: number
  omitted: { id: ID; type: ContextType; reason: string }[]
  warnings: { code: string; message: string }[]
  deterministicFingerprint: string
}
```

## Promise / Payoff

```ts
export type PromiseType =
  | "mystery"
  | "foreshadowing"
  | "chekhov_gun"
  | "relationship_tension"
  | "character_arc"
  | "worldbuilding_question"
  | "plot_question"
  | "thematic_question"

export type PromiseStatus =
  | "open"
  | "developing"
  | "paid_off"
  | "dropped"
  | "intentionally_unresolved"

export interface PayoffWindow {
  earliestChapter?: number
  latestChapter?: number
  targetChapter?: number
}

export interface NarrativePromise extends Timestamped {
  id: ID
  projectId: ID
  type: PromiseType
  status: PromiseStatus
  title: string
  description: string
  introducedAt: StoryLocation
  expectedPayoffWindow?: PayoffWindow
  importance: number
  readerVisibility: number
  relatedCharacters: ID[]
  relatedPlotThreads: ID[]
  relatedThemes: ID[]
  source: CanonSource
}

export interface PromisePayoff {
  id: ID
  promiseId: ID
  payoffAt: StoryLocation
  description: string
  payoffStrength: number
  resolvesPromise: boolean
  notes?: string
}

export interface PromiseHealth {
  promiseId: ID
  status: "healthy" | "aging" | "overdue" | "weak_payoff" | "dropped"
  explanation: string
  recommendation: string
}
```

## Narrative Graph

```ts
export type NarrativeNodeType =
  | "character"
  | "location"
  | "scene"
  | "chapter"
  | "plot_thread"
  | "event"
  | "theme"
  | "promise"
  | "object"
  | "canon_item"
  | "relationship"

export type NarrativeEdgeType =
  | "appears_in"
  | "located_in"
  | "causes"
  | "depends_on"
  | "foreshadows"
  | "pays_off"
  | "contradicts"
  | "supports_theme"
  | "opposes"
  | "desires"
  | "blocks"
  | "knows"
  | "related_to"
  | "changes_state"
  | "introduced_in"
  | "applies_to"

export interface NarrativeNode extends Timestamped {
  id: ID
  projectId: ID
  type: NarrativeNodeType
  label: string
  summary?: string
  sourceId?: ID
  metadata: Record<string, unknown>
}

export interface NarrativeEdge extends Timestamped {
  id: ID
  projectId: ID
  fromNodeId: ID
  toNodeId: ID
  type: NarrativeEdgeType
  label?: string
  weight: number
  source?: CanonSource
  metadata: Record<string, unknown>
}
```

---

# 6. CLI Command Spec

## Knowledge

```bash
/novel knowledge list [--type <type>] [--status <status>] [--context-eligible]
/novel knowledge show <id>
/novel knowledge search "<query>"
/novel knowledge rebuild-index
```

## Canon

```bash
/novel canon create   --type fact|rule|situation|assertion   --strength hard|soft|inferred   --subject <subject>   --predicate <predicate>   --object <object>   --description <description>   --scope <scope>

/novel canon list [--subject <subject>] [--type <type>] [--status <status>]
/novel canon show <id>
/novel canon conflicts
/novel canon promote <assertion-id>
```

## Context

```bash
/novel context contracts
/novel context show-contract <id>
/novel context build --contract <contract-id> [--scene <scene-id>] [--chapter <chapter-id>] [--query <text>]
```

Expected output:

```txt
Context built
Contract: scene.continuation.v1
Blocks: 5
Tokens: 2134
Fingerprint: abc123...

Included:
- current_scene: Opening Scene
- character_profiles: Mira
- canon_facts: Mira has silver eyes
- promises: Archive door mystery
```

## Promise

```bash
/novel promise create   --type mystery|foreshadowing|chekhov_gun|relationship_tension|character_arc|worldbuilding_question|plot_question|thematic_question   --title <title>   --description <description>   --chapter <chapter-id>   --scene <scene-id>   --importance <1-10>   --visibility <1-10>

/novel promise open
/novel promise list
/novel promise show <id>

/novel promise payoff <promise-id>   --chapter <chapter-id>   --scene <scene-id>   --description <description>   --strength <1-10>   --resolves true|false

/novel promise health
```

## Graph

```bash
/novel graph rebuild
/novel graph show --node <id>
/novel graph neighbors --node <id>
/novel graph path --from <id> --to <id>
```

---

# 7. Error Codes

```ts
export type NovelErrorCode =
  | "VALIDATION_ERROR"
  | "PROJECT_NOT_INITIALIZED"
  | "KNOWLEDGE_NOT_FOUND"
  | "CANON_NOT_FOUND"
  | "CANON_CONFLICT_DETECTED"
  | "ASSERTION_NOT_FOUND"
  | "CONTEXT_CONTRACT_NOT_FOUND"
  | "CONTEXT_REQUIRED_BUDGET_EXCEEDED"
  | "PROMISE_NOT_FOUND"
  | "GRAPH_NODE_NOT_FOUND"
  | "DATABASE_ERROR"

export interface NovelError {
  code: NovelErrorCode
  message: string
  details?: Record<string, unknown>
}
```

---

# 8. Build Tickets

## Ticket 001 — Add Shared Types

Create:

```txt
src/types/common.ts
src/types/story-location.ts
src/types/knowledge.ts
src/types/canon.ts
src/types/context.ts
src/types/promise.ts
src/types/graph.ts
src/types/index.ts
```

Acceptance:
- Types compile
- No circular imports
- All exported from `src/types/index.ts`

## Ticket 002 — Add Database Migrations

Create:

```txt
001_knowledge_objects.sql
002_canon.sql
003_promises.sql
004_narrative_graph.sql
005_context_contracts.sql
```

Acceptance:
- Migrations run on empty DB
- Migrations are idempotent
- Indexes are created

## Ticket 003 — Add Utilities

Create:

```txt
src/utils/stable-json.ts
src/utils/hash.ts
src/utils/ids.ts
src/utils/token-count.ts
```

Acceptance:
- Stable JSON produces same string for reordered object keys
- Hash is deterministic
- IDs are stable where requested and unique where requested

## Ticket 004 — Knowledge Repository

Create:

```txt
src/db/repositories/knowledge-repository.ts
```

Methods:
- insert
- update
- getById
- listByType
- search

Acceptance:
- CRUD works
- JSON fields serialize/deserialize safely
- Unit tests pass

## Ticket 005 — Knowledge Service

Create:

```txt
src/services/knowledge-service.ts
```

Acceptance:
- Creates knowledge object
- Validates required fields
- Supports status and eligibility flags
- Can search by type/status/context eligibility

## Ticket 006 — Canon Repository + Service

Create:

```txt
src/db/repositories/canon-repository.ts
src/services/canon-service.ts
```

Acceptance:
- Can create canon item
- Can list by subject
- Can detect direct contradiction for same subject/predicate with different object
- Mirrors canon item into knowledge_objects

## Ticket 007 — Promise Repository + Service

Create:

```txt
src/db/repositories/promise-repository.ts
src/services/promise-service.ts
```

Acceptance:
- Can create promise
- Can list open promises
- Can add payoff
- Paid-off promise updates status if payoff resolves
- Mirrors promise into knowledge_objects

## Ticket 008 — Context Contract Service

Create:

```txt
src/services/context-contract-service.ts
src/context/contracts/*.ts
```

Acceptance:
- Default contracts load
- Contract validation catches missing required fields
- Can fetch contract by ID

## Ticket 009 — Context Fetchers

Create:

```txt
src/context/fetchers/scene-fetcher.ts
src/context/fetchers/character-fetcher.ts
src/context/fetchers/canon-fetcher.ts
src/context/fetchers/promise-fetcher.ts
```

Acceptance:
- Each fetcher implements shared interface
- Fetchers return candidate blocks
- Missing optional context does not fail

## Ticket 010 — Context Policy Engine

Create:

```txt
src/services/context-policy-engine.ts
src/context/scoring.ts
src/context/ordering.ts
src/context/token-budget.ts
src/context/fingerprint.ts
```

Acceptance:
- Builds context from contract
- Preserves required blocks
- Drops optional blocks deterministically
- Produces deterministic fingerprint
- Same input produces same result

## Ticket 011 — Narrative Graph Repository + Service

Create:

```txt
src/db/repositories/graph-repository.ts
src/services/narrative-graph-service.ts
```

Acceptance:
- Can upsert nodes and edges
- Can get neighbors
- Can rebuild graph from canon + promises + scenes + characters
- Links:
  - character → appears_in → scene
  - promise → introduced_in → scene
  - canon_item → applies_to → character

## Ticket 012 — CLI Commands

Create commands + handlers for:
- knowledge
- canon
- context
- promise
- graph

Acceptance:
- Commands registered
- Handlers call services
- Human-readable output
- Structured errors displayed clearly

## Ticket 013 — Vertical Slice Test

Create:

```txt
tests/integration/vertical-slice.test.ts
```

Acceptance:
- Creates mini project
- Creates character
- Creates canon fact
- Creates scene
- Creates promise
- Builds context
- Rebuilds graph
- Asserts expected blocks and edges exist

---

# 9. Test Plan

## Unit Tests

Knowledge:
- create object
- reject missing type/title
- search by type
- filter context eligible

Canon:
- create fact
- create situation
- create assertion
- conflict detection
- assertion promotion
- mirror to knowledge

Promise:
- create promise
- list open
- add partial payoff
- add resolving payoff
- health report

Context:
- load default contracts
- reject invalid contract
- required context included
- optional context dropped when over budget
- stable ordering
- stable fingerprint
- hard fail when required context exceeds budget

Graph:
- create node
- create edge
- get neighbors
- rebuild graph
- find simple path

## Integration Tests

### Vertical Slice

Scenario:

```txt
Project: Test Novel
Character: Mira
Canon: Mira has silver eyes.
Scene: Mira discovers the locked archive door.
Promise: Why is the archive door sealed?
Context request: scene.continuation.v1
Expected: Context includes scene, Mira, canon fact, promise.
Expected graph includes character/scene/promise/canon relationships.
```

### Context Determinism

Run same context request 3 times.

Expected:
- same block order
- same token count
- same fingerprint

### Graph Rebuild

Create objects.
Rebuild graph twice.

Expected:
- no duplicate nodes
- no duplicate edges
- same node/edge count

---

# 10. Fixture Novel Project

```txt
tests/fixtures/mini-novel/
├── chapters/
│   └── 01-opening.md
├── characters/
│   └── mira.yml
└── .novel/
```

## Character Fixture

```yaml
name: Mira
role: protagonist
summary: A young archivist with forbidden access to royal histories.
physical:
  eyes: silver
personality:
  traits:
    - curious
    - cautious
    - stubborn
```

## Chapter Fixture

```md
---
title: Opening
status: drafted
---

# Opening

<!-- scene:1 -->
<!-- title: The Sealed Archive -->
<!-- pov: Mira -->
<!-- location: Royal Archive Antechamber -->
<!-- tension: 5 -->

Mira stopped before the black iron door. The royal archive had never been sealed before.

A symbol glowed faintly above the lock, though no lamp burned nearby.

<!-- /scene:1 -->
```

---

# 11. Minimum Vertical Slice

## User Story

As an author, I want the system to understand the key state of my story before generating prose, so the generated output respects established facts and narrative obligations.

## Flow

```txt
1. Initialize project
2. Add character Mira
3. Add canon fact: Mira has silver eyes
4. Add scene: Mira discovers sealed archive
5. Add promise: Why is archive sealed?
6. Build context for scene continuation
7. Confirm context contains:
   - current scene
   - Mira profile
   - canon fact
   - active promise
8. Rebuild graph
9. Confirm graph links:
   - Mira appears in scene
   - promise introduced in scene
   - canon fact applies to Mira
```

## Expected Context Output

```txt
[CURRENT_SCENE]
Mira stopped before the black iron door...

[CHARACTER_PROFILE]
Mira — A young archivist with forbidden access to royal histories.

[CANON_FACT]
Mira has silver eyes.

[PROMISE]
Why is the archive door sealed?
Status: open
Importance: 8/10
```

## Expected Graph Output

```txt
Mira --appears_in--> The Sealed Archive
Archive Door Mystery --introduced_in--> The Sealed Archive
Mira Silver Eyes Fact --applies_to--> Mira
```

---

# 12. Definition of Done

Implementation can be considered started successfully when:

- all migrations run
- shared types compile
- core services exist
- CLI commands are registered
- vertical slice passes
- deterministic context test passes
- graph rebuild test passes

Implementation can move to AI generation only after this foundation works.

---

# 13. Recommended First Implementation Session

Start with these tickets only:

```txt
Ticket 001 — Shared Types
Ticket 002 — Database Migrations
Ticket 003 — Stable JSON + Hash Utilities
Ticket 004 — Knowledge Repository
Ticket 005 — Knowledge Service
```

Do not begin Context Policy Engine until Knowledge Service is stable.

---

# 14. Final Build Guidance

Treat this as the spine of Claude Novel.

The correct build sequence is:

```txt
Knowledge Objects
→ Canon
→ Promises
→ Context Contracts
→ Context Policy Engine
→ Narrative Graph
→ Subagents
→ AI Generation
```

This preserves the product's central promise:

```txt
The AI is not just generating text.
It is operating over a structured understanding of the novel.
```
