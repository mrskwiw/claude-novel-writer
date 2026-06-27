import type { ID } from './common.js'

export type ContextType =
  | 'current_scene'
  | 'current_chapter'
  | 'recent_scenes'
  | 'character_profiles'
  | 'character_states'
  | 'locations'
  | 'world_rules'
  | 'canon_facts'
  | 'canon_situations'
  | 'plot_threads'
  | 'timeline'
  | 'themes'
  | 'promises'
  | 'style_profile'
  | 'author_profile'
  | 'semantic_memory'
  | 'research_notes'

export interface ContextScope {
  range:
    | 'current_scene'
    | 'current_chapter'
    | 'previous_n_scenes'
    | 'entire_project'
    | 'related_entities'
    | 'semantic_top_k'
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
  | 'priority_then_relevance'
  | 'story_order'
  | 'entity_grouped'
  | 'contract_defined'

export interface ContextTruncationPolicy {
  strategy:
    | 'drop_optional_lowest_priority'
    | 'drop_lowest_relevance'
    | 'hard_fail'
    | 'allow_overflow'
  preserveRequired: boolean
}

export interface ContextContract {
  id: ID
  name: string
  description: string
  operationType:
    | 'generation'
    | 'editing'
    | 'analysis'
    | 'consistency_check'
    | 'planning'
    | 'export'
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
