# Claude Novel — Foundation Architecture Specs

**Purpose:** Define the six missing foundational systems needed before Claude Novel becomes a true story-aware writing intelligence system rather than a collection of AI writing tools.

**Specs included:**

1. Canon System
2. Context Contracts
3. Context Policy Engine
4. Narrative Graph
5. Promise / Payoff Tracking
6. Project Knowledge Architecture

---

# 1. Canon System Spec

## 1.1 Goal

The Canon System stores and manages authoritative story truth.

It distinguishes between:

- **Facts** — declared details about the story world
- **Rules** — constraints governing what can or cannot happen
- **Situations** — temporary or conditional states
- **Assertions** — claims extracted from prose or user input that may become canon

The Canon System is the foundation for:

- continuity checking
- context assembly
- rules enforcement
- character consistency
- worldbuilding integrity
- memory retrieval
- developmental editing

---

## 1.2 Core Principle

Not all story knowledge behaves the same.

Example:

```txt
Fact: Mira has silver eyes.
Rule: No one can enter the archive without a sworn archivist.
Situation: Mira is currently hiding in the south tower.
Assertion: Chapter 4 implies Mira may know the prince.
```

Each has different persistence, confidence, mutability, and conflict behavior.

---

## 1.3 Canon Entity Model

```ts
type CanonType =
  | "fact"
  | "rule"
  | "situation"
  | "assertion"

type CanonStatus =
  | "active"
  | "deprecated"
  | "superseded"
  | "contested"

type CanonStrength =
  | "hard"
  | "soft"
  | "inferred"

interface CanonItem {
  id: string
  projectId: string

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

  createdAt: string
  updatedAt: string
}
```

---

## 1.4 Canon Scope

```ts
interface CanonScope {
  appliesTo:
    | "entire_project"
    | "chapter"
    | "scene"
    | "character"
    | "location"
    | "plot_thread"
    | "timeline_range"

  targetId?: string
}
```

---

## 1.5 Canon Source

```ts
interface CanonSource {
  sourceType:
    | "user_declared"
    | "manuscript_extracted"
    | "agent_inferred"
    | "imported_note"
    | "generated"

  sourceId?: string
  quote?: string
  location?: StoryLocation
}
```

---

## 1.6 Story Location

```ts
interface StoryLocation {
  chapterId?: string
  sceneId?: string
  paragraphIndex?: number
  lineNumber?: number
}
```

---

## 1.7 Canon Conflict Model

```ts
interface CanonConflict {
  id: string
  projectId: string

  itemA: string
  itemB: string

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

---

## 1.8 Canon Lifecycle

### User-declared canon

```txt
created → active → superseded/deprecated
```

### Extracted assertion

```txt
extracted → assertion → promoted_to_fact OR rejected
```

### Situation

```txt
created → active → expired/resolved
```

---

## 1.9 Required Canon Operations

```ts
interface CanonService {
  createCanonItem(input: CreateCanonInput): Promise<CanonItem>
  updateCanonItem(id: string, patch: Partial<CanonItem>): Promise<CanonItem>
  deprecateCanonItem(id: string, reason: string): Promise<void>

  findBySubject(projectId: string, subject: string): Promise<CanonItem[]>
  findByScope(projectId: string, scope: CanonScope): Promise<CanonItem[]>

  detectConflicts(item: CanonItem): Promise<CanonConflict[]>
  promoteAssertion(assertionId: string): Promise<CanonItem>
}
```

---

## 1.10 Database Tables

```sql
CREATE TABLE canon_items (
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

CREATE TABLE canon_conflicts (
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
```

---

## 1.11 CLI Commands

```bash
/novel canon create
/novel canon list
/novel canon show <id>
/novel canon update <id>
/novel canon deprecate <id>
/novel canon conflicts
/novel canon promote <assertion-id>
```

---

## 1.12 Acceptance Criteria

- User can create canon facts, rules, and situations
- Canon items preserve source and scope
- Assertions can be promoted or rejected
- Conflicts are detected and stored
- Context engine can request canon by scope and task

---

# 2. Context Contracts Spec

## 2.1 Goal

Context Contracts define exactly what information each command, service, or agent is allowed and required to receive.

They prevent context assembly from becoming inconsistent, bloated, or ad hoc.

---

## 2.2 Core Principle

Every AI operation must declare its context needs before context is built.

---

## 2.3 Context Type Enum

```ts
type ContextType =
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
```

---

## 2.4 Context Contract Model

```ts
interface ContextContract {
  id: string
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
```

---

## 2.5 Context Requirement

```ts
interface ContextRequirement {
  type: ContextType
  scope: ContextScope
  priority: number
  maxTokens?: number
}
```

---

## 2.6 Context Scope

```ts
interface ContextScope {
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
```

---

## 2.7 Ordering Policy

```ts
type ContextOrderingPolicy =
  | "priority_then_relevance"
  | "story_order"
  | "entity_grouped"
  | "contract_defined"
```

Recommended default:

```txt
contract_defined
```

---

## 2.8 Truncation Policy

```ts
interface ContextTruncationPolicy {
  strategy:
    | "drop_optional_lowest_priority"
    | "drop_lowest_relevance"
    | "hard_fail"
    | "allow_overflow"

  preserveRequired: boolean
}
```

Phase 1 rule:

```txt
Required context is never silently dropped.
If required context exceeds budget, return a structured error.
```

---

## 2.9 Standard Contracts

### Scene Continuation Contract

```ts
const SCENE_CONTINUATION_CONTRACT: ContextContract = {
  id: "scene.continuation.v1",
  name: "Scene Continuation",
  operationType: "generation",
  maxTokens: 12000,
  deterministic: true,
  required: [
    { type: "current_scene", scope: { range: "current_scene" }, priority: 100 },
    { type: "character_profiles", scope: { range: "related_entities" }, priority: 90 },
    { type: "canon_facts", scope: { range: "related_entities" }, priority: 85 },
    { type: "style_profile", scope: { range: "entire_project" }, priority: 80 }
  ],
  optional: [
    { type: "recent_scenes", scope: { range: "previous_n_scenes", n: 3 }, priority: 70 },
    { type: "semantic_memory", scope: { range: "semantic_top_k", topK: 8 }, priority: 65 },
    { type: "plot_threads", scope: { range: "related_entities" }, priority: 60 }
  ],
  orderingPolicy: "contract_defined",
  truncationPolicy: {
    strategy: "drop_optional_lowest_priority",
    preserveRequired: true
  }
}
```

### Continuity Check Contract

```ts
const CONTINUITY_CHECK_CONTRACT: ContextContract = {
  id: "continuity.check.v1",
  name: "Continuity Check",
  operationType: "consistency_check",
  maxTokens: 16000,
  deterministic: true,
  required: [
    { type: "current_scene", scope: { range: "current_scene" }, priority: 100 },
    { type: "canon_facts", scope: { range: "entire_project" }, priority: 95 },
    { type: "canon_situations", scope: { range: "entire_project" }, priority: 90 },
    { type: "world_rules", scope: { range: "entire_project" }, priority: 85 }
  ],
  optional: [
    { type: "timeline", scope: { range: "entire_project" }, priority: 75 },
    { type: "semantic_memory", scope: { range: "semantic_top_k", topK: 12 }, priority: 65 }
  ],
  orderingPolicy: "entity_grouped",
  truncationPolicy: {
    strategy: "hard_fail",
    preserveRequired: true
  }
}
```

---

## 2.10 Context Contract Service

```ts
interface ContextContractService {
  getContract(contractId: string): Promise<ContextContract>
  validateContract(contract: ContextContract): Promise<ValidationResult>
  registerContract(contract: ContextContract): Promise<void>
}
```

---

## 2.11 Acceptance Criteria

- Every AI operation references a context contract
- Required vs optional context is explicit
- Token budget behavior is deterministic
- Context engine refuses invalid contracts
- Agents cannot silently request arbitrary context

---

# 3. Context Policy Engine Spec

## 3.1 Goal

The Context Policy Engine turns Context Contracts into actual context assembly behavior.

The contract says what is needed.
The policy engine decides how to fetch, rank, order, and trim it.

---

## 3.2 Core Principle

Context assembly is not one algorithm. It is a policy-driven pipeline.

Different tasks require different context behavior.

---

## 3.3 Policy Engine Interface

```ts
interface ContextPolicyEngine {
  buildContext(request: ContextBuildRequest): Promise<ContextResult>
}
```

---

## 3.4 Context Build Request

```ts
interface ContextBuildRequest {
  projectId: string
  contractId: string

  currentSceneId?: string
  currentChapterId?: string

  userTask?: string
  queryText?: string

  overrides?: Partial<ContextContract>
}
```

---

## 3.5 Context Result

```ts
interface ContextResult {
  projectId: string
  contractId: string

  blocks: ContextBlock[]
  totalTokens: number

  omitted: OmittedContextBlock[]
  warnings: ContextWarning[]

  deterministicFingerprint: string
}
```

---

## 3.6 Context Block

```ts
interface ContextBlock {
  id: string
  type: ContextType
  title: string
  content: string

  sourceId?: string
  sourceType?: string

  priority: number
  relevanceScore?: number
  tokenCount: number

  required: boolean
  orderIndex: number
}
```

---

## 3.7 Pipeline

```txt
1. Load contract
2. Validate request
3. Expand requirements
4. Fetch candidates
5. Score candidates
6. Select blocks
7. Enforce token budget
8. Order blocks
9. Generate fingerprint
10. Return ContextResult
```

---

## 3.8 Requirement Expansion

Example:

```txt
character_profiles + related_entities
```

expands to:

```txt
characters appearing in current scene
characters mentioned in current chapter
characters attached to active plot threads
```

---

## 3.9 Candidate Fetchers

```ts
interface ContextFetcher {
  supports(type: ContextType): boolean
  fetch(req: ExpandedContextRequirement): Promise<ContextCandidate[]>
}
```

Required fetchers:

- SceneFetcher
- ChapterFetcher
- CharacterFetcher
- CanonFetcher
- PlotThreadFetcher
- TimelineFetcher
- StyleProfileFetcher
- SemanticMemoryFetcher
- PromiseFetcher

---

## 3.10 Scoring

```ts
score =
  requirementPriority * 0.45 +
  semanticRelevance * 0.30 +
  entityRelevance * 0.15 +
  recencyRelevance * 0.10
```

All values normalized to 0–1 before calculation.

---

## 3.11 Stable Sorting

Sort by:

```txt
1. required first
2. priority descending
3. score descending
4. type order from contract
5. source id ascending
```

This preserves determinism.

---

## 3.12 Token Budget Enforcement

Rules:

1. Required blocks are selected first.
2. If required blocks exceed maxTokens:
   - return error if policy is `hard_fail`
   - otherwise include required blocks and warn
3. Optional blocks are added by priority/score order.
4. Optional blocks are dropped whole, not summarized.

No compression in this version.

---

## 3.13 Deterministic Fingerprint

```ts
fingerprint = hash(
  projectId +
  contractId +
  request parameters +
  ordered block ids +
  block updatedAt timestamps
)
```

Used for caching, debugging, and reproducibility.

---

## 3.14 CLI Commands

```bash
/novel context build --contract scene.continuation.v1 --scene 4
/novel context inspect --last
/novel context contracts
/novel context show-contract scene.continuation.v1
```

---

## 3.15 Acceptance Criteria

- Context is built only through registered contracts
- Same request produces same fingerprint
- Required context is protected
- Optional context can be dropped deterministically
- Context output explains omissions

---

# 4. Narrative Graph Spec

## 4.1 Goal

The Narrative Graph stores relationships between story entities.

It allows the system to reason over structure rather than scanning prose every time.

---

## 4.2 Core Principle

A novel is not only text. It is a graph of people, places, events, promises, themes, conflicts, and consequences.

---

## 4.3 Node Types

```ts
type NarrativeNodeType =
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
```

---

## 4.4 Edge Types

```ts
type NarrativeEdgeType =
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
```

---

## 4.5 Node Model

```ts
interface NarrativeNode {
  id: string
  projectId: string

  type: NarrativeNodeType
  label: string
  summary?: string

  sourceId?: string
  metadata: Record<string, unknown>

  createdAt: string
  updatedAt: string
}
```

---

## 4.6 Edge Model

```ts
interface NarrativeEdge {
  id: string
  projectId: string

  fromNodeId: string
  toNodeId: string

  type: NarrativeEdgeType
  label?: string
  weight: number

  source?: CanonSource
  metadata: Record<string, unknown>

  createdAt: string
  updatedAt: string
}
```

---

## 4.7 Graph Service

```ts
interface NarrativeGraphService {
  upsertNode(node: NarrativeNode): Promise<NarrativeNode>
  upsertEdge(edge: NarrativeEdge): Promise<NarrativeEdge>

  getNode(id: string): Promise<NarrativeNode | null>
  getNeighbors(nodeId: string, edgeTypes?: NarrativeEdgeType[]): Promise<NarrativeNode[]>

  findPath(fromNodeId: string, toNodeId: string): Promise<NarrativePath[]>
  findConnectedSubgraph(nodeId: string, depth: number): Promise<NarrativeSubgraph>
}
```

---

## 4.8 Database Tables

```sql
CREATE TABLE narrative_nodes (
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

CREATE TABLE narrative_edges (
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
```

---

## 4.9 Graph Construction

Initial graph nodes are created from:

- character profiles
- chapter files
- scene markers
- plot threads
- canon items
- promises
- locations
- timeline events

Edges are created from:

- scene metadata
- character appearances
- plot thread associations
- promise setup/payoff links
- canon scope
- explicit user declarations

---

## 4.10 Queries Enabled

```txt
What plot threads touch this character?
What unresolved promises were introduced before chapter 10?
Which characters have not interacted since chapter 3?
What rules constrain this scene?
What themes are active in this chapter?
What caused this event?
```

---

## 4.11 CLI Commands

```bash
/novel graph rebuild
/novel graph show --node mira
/novel graph neighbors --node mira
/novel graph path --from promise_12 --to scene_31
```

---

## 4.12 Acceptance Criteria

- Graph can be rebuilt from project files + database
- Characters, scenes, plot threads, canon items, promises become nodes
- Important relationships become edges
- Context engine can fetch related graph neighborhoods
- Graph queries are deterministic

---

# 5. Promise / Payoff Tracking Spec

## 5.1 Goal

Track narrative promises, setups, questions, mysteries, foreshadowing, and payoffs.

This gives the developmental editor a structured view of reader expectation.

---

## 5.2 Core Principle

Every story creates obligations.

A promise can be:

- a mystery
- a strange object
- a prophecy
- an unresolved emotional conflict
- a question raised by dialogue
- a power hinted but not explained
- a relationship tension
- a thematic setup

---

## 5.3 Promise Types

```ts
type PromiseType =
  | "mystery"
  | "foreshadowing"
  | "chekhov_gun"
  | "relationship_tension"
  | "character_arc"
  | "worldbuilding_question"
  | "plot_question"
  | "thematic_question"
```

---

## 5.4 Promise Status

```ts
type PromiseStatus =
  | "open"
  | "developing"
  | "paid_off"
  | "dropped"
  | "intentionally_unresolved"
```

---

## 5.5 Promise Model

```ts
interface NarrativePromise {
  id: string
  projectId: string

  type: PromiseType
  status: PromiseStatus

  title: string
  description: string

  introducedAt: StoryLocation
  expectedPayoffWindow?: PayoffWindow

  importance: number
  readerVisibility: number

  relatedCharacters: string[]
  relatedPlotThreads: string[]
  relatedThemes: string[]

  source: CanonSource

  createdAt: string
  updatedAt: string
}
```

---

## 5.6 Payoff Model

```ts
interface PromisePayoff {
  id: string
  promiseId: string

  payoffAt: StoryLocation
  description: string

  payoffStrength: number
  resolvesPromise: boolean

  notes?: string
}
```

---

## 5.7 Payoff Window

```ts
interface PayoffWindow {
  earliestChapter?: number
  latestChapter?: number
  targetChapter?: number
}
```

---

## 5.8 Promise Health

```ts
interface PromiseHealth {
  promiseId: string
  status: "healthy" | "aging" | "overdue" | "weak_payoff" | "dropped"
  explanation: string
  recommendation: string
}
```

---

## 5.9 Promise Service

```ts
interface PromiseService {
  createPromise(input: CreatePromiseInput): Promise<NarrativePromise>
  addPayoff(promiseId: string, input: CreatePayoffInput): Promise<PromisePayoff>

  listOpen(projectId: string): Promise<NarrativePromise[]>
  listByChapter(projectId: string, chapterId: string): Promise<NarrativePromise[]>

  evaluateHealth(projectId: string): Promise<PromiseHealth[]>
}
```

---

## 5.10 Database Tables

```sql
CREATE TABLE narrative_promises (
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

CREATE TABLE promise_payoffs (
  id TEXT PRIMARY KEY,
  promise_id TEXT NOT NULL,
  payoff_at TEXT NOT NULL,
  description TEXT NOT NULL,
  payoff_strength INTEGER NOT NULL,
  resolves_promise INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
```

---

## 5.11 CLI Commands

```bash
/novel promise create
/novel promise list
/novel promise open
/novel promise payoff <promise-id>
/novel promise health
/novel promise show <promise-id>
```

---

## 5.12 Context Integration

Scene generation should include:

- promises active in the current scene
- promises involving current characters
- promises introduced recently
- promises overdue for payoff

Developmental editing should include:

- all open promises
- weak or missing payoffs
- promise density per chapter

---

## 5.13 Acceptance Criteria

- User can manually create promises
- Promises can link to characters, plot threads, themes
- Payoffs can partially or fully resolve promises
- System can report open and overdue promises
- Narrative graph links promises to scenes and payoffs

---

# 6. Project Knowledge Architecture Spec

## 6.1 Goal

Define the unified architecture for all project knowledge so every subsystem stores and retrieves information consistently.

This prevents canon, memory, graph, rules, style, research, and promises from becoming disconnected databases.

---

## 6.2 Core Principle

Every piece of project knowledge should have:

- identity
- type
- scope
- source
- confidence
- lifecycle status
- graph representation
- context eligibility

---

## 6.3 Knowledge Object Types

```ts
type KnowledgeObjectType =
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
```

---

## 6.4 Knowledge Object Interface

```ts
interface KnowledgeObject {
  id: string
  projectId: string

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

  createdAt: string
  updatedAt: string
}
```

---

## 6.5 Knowledge Registry

```ts
interface KnowledgeRegistry {
  registerType(definition: KnowledgeTypeDefinition): Promise<void>
  getDefinition(type: KnowledgeObjectType): Promise<KnowledgeTypeDefinition>
  listTypes(): Promise<KnowledgeTypeDefinition[]>
}
```

---

## 6.6 Type Definition

```ts
interface KnowledgeTypeDefinition {
  type: KnowledgeObjectType
  description: string

  defaultContextEligible: boolean
  defaultGraphEligible: boolean
  defaultEmbeddingEligible: boolean

  canonicalStorage:
    | "markdown"
    | "yaml"
    | "sqlite"
    | "derived"

  requiredFields: string[]
}
```

---

## 6.7 Storage Rule

The project uses layered storage:

```txt
Human-authored knowledge → Markdown/YAML
Derived indexes → SQLite
Semantic retrieval → memory table
Structural reasoning → narrative graph
```

No subsystem owns truth unless explicitly declared canonical.

---

## 6.8 Knowledge Service

```ts
interface KnowledgeService {
  createObject(input: CreateKnowledgeInput): Promise<KnowledgeObject>
  updateObject(id: string, patch: Partial<KnowledgeObject>): Promise<KnowledgeObject>
  getObject(id: string): Promise<KnowledgeObject | null>

  searchObjects(query: KnowledgeSearchQuery): Promise<KnowledgeObject[]>
  listByType(projectId: string, type: KnowledgeObjectType): Promise<KnowledgeObject[]>

  syncObjectToGraph(id: string): Promise<void>
  syncObjectToMemory(id: string): Promise<void>
}
```

---

## 6.9 Knowledge Search Query

```ts
interface KnowledgeSearchQuery {
  projectId: string
  types?: KnowledgeObjectType[]
  text?: string
  scope?: CanonScope
  status?: string[]
  contextEligibleOnly?: boolean
}
```

---

## 6.10 Database Table

```sql
CREATE TABLE knowledge_objects (
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
```

---

## 6.11 Integration Rules

### Canon items

- Stored as canon_items
- Mirrored as knowledge_objects
- Graph eligible
- Context eligible
- Embedding eligible if description is meaningful

### Promises

- Stored as narrative_promises
- Mirrored as knowledge_objects
- Graph eligible
- Context eligible
- Embedding eligible

### Style profiles

- Stored as style_profiles
- Mirrored as knowledge_objects
- Context eligible
- Not graph eligible by default
- Not embedding eligible by default

### Semantic memories

- Stored in memory table
- Mirrored as knowledge_objects only if persistent and user-visible
- Not canonical

---

## 6.12 CLI Commands

```bash
/novel knowledge list
/novel knowledge show <id>
/novel knowledge search "archive"
/novel knowledge types
/novel knowledge rebuild-index
```

---

## 6.13 Acceptance Criteria

- All major project knowledge types have a unified representation
- Context engine can query knowledge objects by eligibility
- Graph system can derive nodes from eligible objects
- Memory system can embed eligible objects
- Canon, promises, style, and rules no longer live in disconnected silos

---

# 7. Recommended Build Order

These specs should not be built independently.

Build them in this order:

## Phase A — Knowledge Foundation

1. Project Knowledge Architecture
2. Canon System

Why:
- Knowledge architecture gives common object model
- Canon depends on scope/source/confidence/lifecycle semantics

## Phase B — Context Governance

3. Context Contracts
4. Context Policy Engine

Why:
- Contracts define needs
- Policy engine executes them

## Phase C — Narrative Intelligence

5. Promise / Payoff Tracking
6. Narrative Graph

Why:
- Promises need to exist before graph can connect them
- Graph becomes the reasoning layer across all systems

---

# 8. System Integration Map

```txt
Project Files
    ↓
Sync System
    ↓
Knowledge Objects
    ↓
 ┌───────────────┬───────────────┬───────────────┐
 │ Canon System  │ Promise System│ Style System   │
 └───────┬───────┴───────┬───────┴───────┬───────┘
         ↓               ↓               ↓
      Narrative Graph     Semantic Memory
         ↓               ↓
         └───────┬───────┘
                 ↓
        Context Policy Engine
                 ↓
             Subagents
                 ↓
       Generation / Editing / Analysis
```

---

# 9. Minimum Vertical Slice

The first testable version should support:

```txt
1. Create a character
2. Create a canon fact about that character
3. Create a scene involving the character
4. Create a promise introduced in the scene
5. Build context for scene continuation
6. Context includes:
   - scene
   - character
   - canon fact
   - active promise
7. Narrative graph links:
   character → appears_in → scene
   promise → introduced_in → scene
   canon_fact → applies_to → character
```

If this works, the architecture is real.

---

# 10. Final Implementation Principle

Do not optimize for "AI generation" first.

Optimize for:

```txt
Reliable story state
→ deterministic context
→ constrained intelligence
→ useful generation
```

That is the product.
