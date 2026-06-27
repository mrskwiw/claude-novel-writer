import type { ID, Timestamped } from './common.js'
import type { StoryLocation } from './story-location.js'
import type { CanonSource } from './canon.js'

export type PromiseType =
  | 'mystery'
  | 'foreshadowing'
  | 'chekhov_gun'
  | 'relationship_tension'
  | 'character_arc'
  | 'worldbuilding_question'
  | 'plot_question'
  | 'thematic_question'

export type PromiseStatus =
  | 'open'
  | 'developing'
  | 'paid_off'
  | 'dropped'
  | 'intentionally_unresolved'

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
  status: 'healthy' | 'aging' | 'overdue' | 'weak_payoff' | 'dropped'
  explanation: string
  recommendation: string
}
