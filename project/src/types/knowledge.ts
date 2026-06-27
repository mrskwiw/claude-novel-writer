import type { ID, Timestamped } from './common.js'
import type { CanonScope, CanonSource } from './canon.js'

export type KnowledgeObjectType =
  | 'character_profile'
  | 'location_profile'
  | 'chapter'
  | 'scene'
  | 'canon_item'
  | 'story_rule'
  | 'narrative_promise'
  | 'promise_payoff'
  | 'plot_thread'
  | 'timeline_event'
  | 'theme'
  | 'style_profile'
  | 'author_profile'
  | 'research_note'
  | 'semantic_memory'

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
  status: 'active' | 'draft' | 'deprecated' | 'archived'
  contextEligible: boolean
  graphEligible: boolean
  embeddingEligible: boolean
}
