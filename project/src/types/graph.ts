import type { ID, Timestamped } from './common.js'
import type { CanonSource } from './canon.js'

export type NarrativeNodeType =
  | 'character'
  | 'location'
  | 'scene'
  | 'chapter'
  | 'plot_thread'
  | 'event'
  | 'theme'
  | 'promise'
  | 'object'
  | 'canon_item'
  | 'relationship'

export type NarrativeEdgeType =
  | 'appears_in'
  | 'located_in'
  | 'causes'
  | 'depends_on'
  | 'foreshadows'
  | 'pays_off'
  | 'contradicts'
  | 'supports_theme'
  | 'opposes'
  | 'desires'
  | 'blocks'
  | 'knows'
  | 'related_to'
  | 'changes_state'
  | 'introduced_in'
  | 'applies_to'

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
