import type { ContextBlock } from '../../types/context.js';
import type { ContextScope } from '../../types/context.js';

/**
 * Interface every context fetcher must implement.
 *
 * Each fetcher is responsible for loading ContextBlocks of a specific
 * ContextType from the underlying data source (database, memory, etc.).
 * Returning an empty array is valid when no relevant data exists.
 */
export interface ContextFetcher {
  fetch(projectId: string, scope: ContextScope, queryText?: string): Promise<ContextBlock[]>;
}
