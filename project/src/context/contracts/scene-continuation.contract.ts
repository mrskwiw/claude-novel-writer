import type { ContextContract } from '../../types/context.js';

export const sceneContinuationContract: ContextContract = {
  id: 'scene.continuation.v1',
  name: 'Scene Continuation',
  description: 'Context for continuing a scene: current scene, active characters, relevant canon, open promises.',
  operationType: 'generation',
  required: [
    { type: 'current_scene', scope: { range: 'current_scene' }, priority: 100 },
    { type: 'character_profiles', scope: { range: 'related_entities' }, priority: 90 },
    { type: 'world_rules', scope: { range: 'entire_project' }, priority: 80 },
  ],
  optional: [
    { type: 'canon_facts', scope: { range: 'related_entities' }, priority: 70 },
    { type: 'promises', scope: { range: 'entire_project' }, priority: 60 },
    { type: 'recent_scenes', scope: { range: 'previous_n_scenes', n: 2 }, priority: 50 },
    { type: 'plot_threads', scope: { range: 'entire_project' }, priority: 40 },
  ],
  maxTokens: 6000,
  orderingPolicy: 'priority_then_relevance',
  truncationPolicy: { strategy: 'drop_optional_lowest_priority', preserveRequired: true },
  deterministic: true,
};
