import type { ContextContract } from '../../types/context.js';

export const developmentalEditContract: ContextContract = {
  id: 'developmental.edit.v1',
  name: 'Developmental Edit',
  description: 'Broad structural context for developmental editing: themes, arcs, promises, pacing.',
  operationType: 'editing',
  required: [
    { type: 'promises', scope: { range: 'entire_project' }, priority: 100 },
    { type: 'plot_threads', scope: { range: 'entire_project' }, priority: 90 },
  ],
  optional: [
    { type: 'character_profiles', scope: { range: 'entire_project' }, priority: 80 },
    { type: 'canon_facts', scope: { range: 'entire_project' }, priority: 70 },
    { type: 'themes', scope: { range: 'entire_project' }, priority: 60 },
    { type: 'timeline', scope: { range: 'entire_project' }, priority: 50 },
    { type: 'style_profile', scope: { range: 'entire_project' }, priority: 40 },
  ],
  maxTokens: 10000,
  orderingPolicy: 'priority_then_relevance',
  truncationPolicy: { strategy: 'drop_optional_lowest_priority', preserveRequired: true },
  deterministic: true,
};
