import type { ID, Timestamped } from './common.js'
import type { StoryLocation } from './story-location.js'

export interface CanonScope {
  appliesTo:
    | 'entire_project'
    | 'chapter'
    | 'scene'
    | 'character'
    | 'location'
    | 'plot_thread'
    | 'timeline_range'
  targetId?: ID
}

export interface CanonSource {
  sourceType:
    | 'user_declared'
    | 'manuscript_extracted'
    | 'agent_inferred'
    | 'imported_note'
    | 'generated'
  sourceId?: ID
  quote?: string
  location?: StoryLocation
}

export type CanonType = 'fact' | 'rule' | 'situation' | 'assertion'
export type CanonStatus = 'active' | 'deprecated' | 'superseded' | 'contested'
export type CanonStrength = 'hard' | 'soft' | 'inferred'

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
    | 'direct_contradiction'
    | 'temporal_conflict'
    | 'scope_overlap'
    | 'rule_violation'
    | 'unclear_supersession'
  severity: 'info' | 'warning' | 'critical'
  explanation: string
  recommendedResolution?: string
  status: 'open' | 'resolved' | 'ignored'
}
