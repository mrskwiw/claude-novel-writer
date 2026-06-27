import type { ContextContract } from '../../types/context.js';

export const continuityCheckContract: ContextContract = {
  id: 'continuity.check.v1',
  name: 'Continuity Check',
  description: 'Context for checking continuity in a chapter: all active canon, characters, timeline, world rules.',
  operationType: 'consistency_check',
  required: [
    { type: 'canon_facts', scope: { range: 'entire_project' }, priority: 100 },
    { type: 'canon_situations', scope: { range: 'entire_project' }, priority: 90 },
    { type: 'world_rules', scope: { range: 'entire_project' }, priority: 85 },
    { type: 'character_profiles', scope: { range: 'entire_project' }, priority: 80 },
  ],
  optional: [
    { type: 'timeline', scope: { range: 'entire_project' }, priority: 70 },
    { type: 'plot_threads', scope: { range: 'entire_project' }, priority: 60 },
    { type: 'promises', scope: { range: 'entire_project' }, priority: 50 },
  ],
  maxTokens: 8000,
  orderingPolicy: 'entity_grouped',
  truncationPolicy: { strategy: 'drop_optional_lowest_priority', preserveRequired: true },
  deterministic: true,
};
