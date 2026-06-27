import type { MCPClient } from '../core/database.js';
import type { CanonItem, CanonConflict } from '../types/canon.js';
import type { ID } from '../types/common.js';
import { CanonRepository } from '../db/repositories/canon-repository.js';
import { KnowledgeService } from './knowledge-service.js';
import { generateId } from '../utils/ids.js';

export class CanonService {
  private readonly repo: CanonRepository;
  private readonly knowledge: KnowledgeService;

  constructor(client: MCPClient) {
    this.repo = new CanonRepository(client);
    this.knowledge = new KnowledgeService(client);
  }

  private baseItem(
    projectId: ID,
    type: CanonItem['type'],
    strength: CanonItem['strength'],
    fields: Pick<CanonItem, 'subject' | 'predicate' | 'description' | 'scope' | 'source' | 'confidence'> & Partial<Pick<CanonItem, 'object' | 'validFrom' | 'validUntil'>>
  ): CanonItem {
    const now = new Date().toISOString();
    return {
      id: generateId(),
      projectId,
      type,
      status: 'active',
      strength,
      ...fields,
      createdAt: now,
      updatedAt: now,
    };
  }

  async createFact(
    projectId: ID,
    fields: Pick<CanonItem, 'subject' | 'predicate' | 'object' | 'description' | 'scope' | 'source' | 'confidence'>
  ): Promise<{ item: CanonItem; conflict: CanonConflict | null }> {
    const item = this.baseItem(projectId, 'fact', 'hard', fields);
    const conflict = await this.detectConflict(item);
    await this.repo.insert(item);
    await this.mirrorToKnowledge(item);
    return { item, conflict };
  }

  async createRule(
    projectId: ID,
    fields: Pick<CanonItem, 'subject' | 'predicate' | 'description' | 'scope' | 'source' | 'confidence'> & Partial<Pick<CanonItem, 'object'>>
  ): Promise<{ item: CanonItem; conflict: CanonConflict | null }> {
    const item = this.baseItem(projectId, 'rule', 'hard', fields);
    const conflict = await this.detectConflict(item);
    await this.repo.insert(item);
    await this.mirrorToKnowledge(item);
    return { item, conflict };
  }

  async createSituation(
    projectId: ID,
    fields: Pick<CanonItem, 'subject' | 'predicate' | 'description' | 'scope' | 'source' | 'confidence'> & Partial<Pick<CanonItem, 'object' | 'validFrom' | 'validUntil'>>
  ): Promise<{ item: CanonItem; conflict: CanonConflict | null }> {
    const item = this.baseItem(projectId, 'situation', 'soft', fields);
    const conflict = await this.detectConflict(item);
    await this.repo.insert(item);
    await this.mirrorToKnowledge(item);
    return { item, conflict };
  }

  async createAssertion(
    projectId: ID,
    fields: Pick<CanonItem, 'subject' | 'predicate' | 'description' | 'scope' | 'source' | 'confidence'> & Partial<Pick<CanonItem, 'object'>>
  ): Promise<{ item: CanonItem; conflict: CanonConflict | null }> {
    const item = this.baseItem(projectId, 'assertion', 'inferred', fields);
    const conflict = await this.detectConflict(item);
    await this.repo.insert(item);
    await this.mirrorToKnowledge(item);
    return { item, conflict };
  }

  async listBySubject(projectId: ID, subject: string): Promise<CanonItem[]> {
    return this.repo.listBySubject(projectId, subject);
  }

  async listByType(projectId: ID, type: CanonItem['type']): Promise<CanonItem[]> {
    return this.repo.listByType(projectId, type);
  }

  async listActiveCanon(projectId: ID): Promise<CanonItem[]> {
    return this.repo.listActive(projectId);
  }

  async listConflicts(projectId: ID): Promise<CanonConflict[]> {
    return this.repo.listConflicts(projectId, 'open');
  }

  /** Promote an assertion to a hard fact by changing type and strength. */
  async promoteAssertion(id: ID): Promise<void> {
    await this.repo.update(id, { type: 'fact', strength: 'hard' });
    const item = await this.repo.getById(id);
    if (item) await this.mirrorToKnowledge(item);
  }

  /** Mark a canon item as deprecated. */
  async deprecate(id: ID): Promise<void> {
    await this.repo.update(id, { status: 'deprecated' });
    const item = await this.repo.getById(id);
    if (item) await this.mirrorToKnowledge(item);
  }

  /**
   * Detect direct contradiction: same project + subject + predicate, different object.
   * If found, inserts a canon_conflict row and returns it.
   */
  async detectConflict(newItem: CanonItem): Promise<CanonConflict | null> {
    if (!newItem.object) return null;

    const existing = await this.repo.findBySubjectPredicate(
      newItem.projectId,
      newItem.subject,
      newItem.predicate
    );

    for (const e of existing) {
      if (e.id === newItem.id) continue;
      if (e.object && e.object !== newItem.object) {
        const conflict: CanonConflict = {
          id: generateId(),
          projectId: newItem.projectId,
          itemA: e.id,
          itemB: newItem.id,
          conflictType: 'direct_contradiction',
          severity: newItem.strength === 'hard' || e.strength === 'hard' ? 'critical' : 'warning',
          explanation: `"${newItem.subject} ${newItem.predicate}" has conflicting values: "${e.object}" vs "${newItem.object}"`,
          status: 'open',
        };
        await this.repo.insertConflict(conflict);
        return conflict;
      }
    }
    return null;
  }

  private async mirrorToKnowledge(item: CanonItem): Promise<void> {
    await this.knowledge.upsert({
      id: `canon-${item.id}`,
      projectId: item.projectId,
      type: 'canon_item',
      title: `${item.subject} ${item.predicate}${item.object ? ` ${item.object}` : ''}`,
      summary: item.description,
      structuredData: { canonId: item.id, type: item.type, strength: item.strength, status: item.status },
      scope: item.scope,
      source: item.source,
      confidence: item.confidence,
      status: item.status === 'active' ? 'active' : item.status === 'deprecated' ? 'deprecated' : 'archived',
      contextEligible: item.strength === 'hard' && item.status === 'active',
      graphEligible: item.status === 'active',
      embeddingEligible: false,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  }
}
