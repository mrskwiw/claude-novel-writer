# Claude Novel — Acceptance Test Checklist

**Purpose:** This checklist defines the minimum acceptance tests required before implementation can move from foundation work into AI generation, agents, or higher-level novel intelligence features.

This is not a full test plan. It is the implementation gate.

---

# 0. Gate Rule

Implementation may proceed to AI generation only when all required foundation tests pass:

```txt
Knowledge Objects
→ Canon
→ Promises
→ Context Contracts
→ Context Policy Engine
→ Narrative Graph
```

No subagent, style-learning, or generation work should begin until this checklist passes.

---

# 1. Build + Environment Acceptance

## Required

- [ ] Project installs cleanly with package manager
- [ ] TypeScript build completes with zero errors
- [ ] Test runner executes successfully
- [ ] Database initializes in a clean project
- [ ] Migrations run on an empty database
- [ ] Migrations can run more than once without breaking
- [ ] Fixture project loads correctly

## Pass Condition

```txt
pnpm install
pnpm build
pnpm test
```

all complete successfully.

---

# 2. Database Migration Acceptance

## Required Tables Exist

- [ ] `knowledge_objects`
- [ ] `canon_items`
- [ ] `canon_conflicts`
- [ ] `narrative_promises`
- [ ] `promise_payoffs`
- [ ] `narrative_nodes`
- [ ] `narrative_edges`
- [ ] `context_contracts`

## Required Indexes Exist

- [ ] knowledge by project
- [ ] knowledge by project + type
- [ ] canon by project + subject
- [ ] promise by project + status
- [ ] graph nodes by project + type
- [ ] graph edges by from node
- [ ] graph edges by to node

## Pass Condition

A fresh test database can be created, migrated, queried, and reused without manual cleanup.

---

# 3. Shared Type Acceptance

## Required

- [ ] All shared interfaces compile
- [ ] All shared types are exported from a single types index
- [ ] No circular type imports
- [ ] JSON-backed fields have explicit TypeScript shapes
- [ ] IDs are consistently typed as strings
- [ ] timestamp fields are consistently named `createdAt` and `updatedAt`

## Required Type Groups

- [ ] common
- [ ] story location
- [ ] knowledge
- [ ] canon
- [ ] context
- [ ] promise
- [ ] graph
- [ ] errors

## Pass Condition

A test file can import every public type from:

```ts
import { ... } from "../src/types"
```

without direct deep imports.

---

# 4. Knowledge Object Acceptance

## Required Behaviors

- [ ] Can create a knowledge object
- [ ] Can retrieve by ID
- [ ] Can update object fields
- [ ] Can search by type
- [ ] Can search by status
- [ ] Can filter context-eligible objects
- [ ] Can filter graph-eligible objects
- [ ] Can filter embedding-eligible objects
- [ ] JSON fields round-trip safely
- [ ] Invalid objects fail validation

## Required Validation

- [ ] missing project ID is rejected
- [ ] missing type is rejected
- [ ] missing title is rejected
- [ ] invalid confidence is rejected
- [ ] invalid status is rejected

## Pass Condition

Knowledge object CRUD and search work without requiring canon, promises, or graph services.

---

# 5. Canon System Acceptance

## Required Behaviors

- [ ] Can create canon fact
- [ ] Can create canon rule
- [ ] Can create canon situation
- [ ] Can create canon assertion
- [ ] Can list canon by subject
- [ ] Can list canon by type
- [ ] Can list active canon only
- [ ] Can promote assertion to active canon
- [ ] Can deprecate canon item
- [ ] Can detect direct contradiction

## Required Conflict Test

Given:

```txt
Mira has eye color silver.
Mira has eye color blue.
```

The system must create or return a canon conflict:

```txt
type: direct_contradiction
severity: warning or critical
status: open
```

## Required Knowledge Mirror

- [ ] Creating canon creates matching knowledge object
- [ ] Updating canon updates matching knowledge object
- [ ] Deprecating canon updates matching knowledge object status

## Pass Condition

Canon can preserve authoritative facts and detect simple contradictions deterministically.

---

# 6. Promise / Payoff Acceptance

## Required Behaviors

- [ ] Can create narrative promise
- [ ] Can list open promises
- [ ] Can list promises by project
- [ ] Can add partial payoff
- [ ] Can add resolving payoff
- [ ] Resolving payoff updates promise status to `paid_off`
- [ ] Can report promise health
- [ ] Can link promise to scene location
- [ ] Can link promise to related characters
- [ ] Can link promise to related plot threads
- [ ] Can link promise to related themes

## Required Knowledge Mirror

- [ ] Creating promise creates matching knowledge object
- [ ] Updating promise updates matching knowledge object
- [ ] Paid-off promise updates matching knowledge object status/data

## Pass Condition

The system can track a reader-facing story obligation from setup to payoff.

---

# 7. Context Contract Acceptance

## Required Behaviors

- [ ] Default contracts load successfully
- [ ] Can fetch contract by ID
- [ ] Invalid contract fails validation
- [ ] Required context requirements are explicit
- [ ] Optional context requirements are explicit
- [ ] Max token budget is enforced
- [ ] Ordering policy is present
- [ ] Truncation policy is present
- [ ] Deterministic flag is present

## Required Default Contracts

- [ ] `scene.continuation.v1`
- [ ] `continuity.check.v1`
- [ ] `developmental.edit.v1`

## Pass Condition

Every AI-facing operation can reference a known context contract before context is built.

---

# 8. Context Policy Engine Acceptance

## Required Behaviors

- [ ] Can build context from a registered contract
- [ ] Includes all required blocks when available
- [ ] Includes optional blocks when budget permits
- [ ] Drops optional blocks deterministically when over budget
- [ ] Never silently drops required blocks
- [ ] Returns structured warning or error when required context exceeds budget
- [ ] Produces deterministic fingerprint
- [ ] Produces stable block ordering
- [ ] Reports omitted blocks with reasons

## Required Determinism Test

Run the same request three times:

```txt
contract: scene.continuation.v1
scene: fixture opening scene
```

Expected:

- [ ] same block IDs
- [ ] same block order
- [ ] same total token count
- [ ] same deterministic fingerprint

## Required Context Contents

For the fixture scene, context must include:

- [ ] current scene
- [ ] Mira character profile
- [ ] Mira silver eyes canon fact
- [ ] archive door mystery promise

## Pass Condition

Context is reproducible, contract-governed, and sufficient for constrained generation.

---

# 9. Narrative Graph Acceptance

## Required Behaviors

- [ ] Can create graph node
- [ ] Can create graph edge
- [ ] Can upsert existing node without duplication
- [ ] Can upsert existing edge without duplication
- [ ] Can get node by ID
- [ ] Can get neighbors
- [ ] Can rebuild graph from existing project data
- [ ] Rebuild is idempotent
- [ ] Can find simple path between connected nodes

## Required Fixture Graph

After graph rebuild, the fixture must contain:

```txt
Mira --appears_in--> The Sealed Archive
Archive Door Mystery --introduced_in--> The Sealed Archive
Mira Silver Eyes Fact --applies_to--> Mira
```

## Required Idempotency Test

Run graph rebuild twice.

Expected:

- [ ] no duplicate nodes
- [ ] no duplicate edges
- [ ] same node count
- [ ] same edge count

## Pass Condition

The system can represent story structure as a stable graph.

---

# 10. CLI Acceptance

## Required Commands Register

- [ ] `/novel knowledge list`
- [ ] `/novel knowledge show`
- [ ] `/novel knowledge search`
- [ ] `/novel canon create`
- [ ] `/novel canon list`
- [ ] `/novel canon conflicts`
- [ ] `/novel promise create`
- [ ] `/novel promise open`
- [ ] `/novel promise payoff`
- [ ] `/novel context contracts`
- [ ] `/novel context build`
- [ ] `/novel graph rebuild`
- [ ] `/novel graph neighbors`

## Required CLI Behavior

- [ ] Commands call services, not repositories directly
- [ ] Commands produce human-readable output
- [ ] Errors use structured error codes
- [ ] Missing required args produce validation errors
- [ ] Unknown IDs produce not-found errors

## Pass Condition

A user can complete the vertical slice from CLI commands alone.

---

# 11. Fixture Project Acceptance

## Required Fixture Files

```txt
tests/fixtures/mini-novel/
├── chapters/
│   └── 01-opening.md
├── characters/
│   └── mira.yml
└── .novel/
```

## Required Character Fixture

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

## Required Chapter Fixture

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

## Pass Condition

The fixture can be used for all integration and determinism tests.

---

# 12. Vertical Slice Acceptance

## Required Flow

- [ ] Initialize project
- [ ] Load or create character Mira
- [ ] Create canon fact: Mira has silver eyes
- [ ] Create scene: The Sealed Archive
- [ ] Create promise: Why is the archive sealed?
- [ ] Build context using `scene.continuation.v1`
- [ ] Rebuild narrative graph
- [ ] Verify expected context blocks
- [ ] Verify expected graph edges

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

## Pass Condition

This test proves the foundation architecture works end-to-end.

---

# 13. Pre-AI Generation Gate

AI generation may begin only after:

- [ ] Knowledge object acceptance passes
- [ ] Canon acceptance passes
- [ ] Promise acceptance passes
- [ ] Context contract acceptance passes
- [ ] Context policy engine acceptance passes
- [ ] Narrative graph acceptance passes
- [ ] CLI acceptance passes
- [ ] Vertical slice acceptance passes
- [ ] Context determinism acceptance passes
- [ ] Graph idempotency acceptance passes

If any item fails, AI generation is blocked.

---

# 14. Final Acceptance Statement

The implementation foundation is accepted when the system can prove:

```txt
Given a small novel project,
the system can store story knowledge,
preserve canon,
track narrative promises,
assemble deterministic context,
and represent story structure as a graph.
```

Only then should Claude Novel move into generation, subagents, or advanced editing workflows.
