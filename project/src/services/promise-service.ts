import type { MCPClient } from '../core/database.js';
import type { NarrativePromise, PromisePayoff, PromiseHealth } from '../types/promise.js';
import type { StoryLocation } from '../types/story-location.js';
import type { ID } from '../types/common.js';
import { PromiseRepository } from '../db/repositories/promise-repository.js';
import { KnowledgeService } from './knowledge-service.js';
import { generateId } from '../utils/ids.js';

export class PromiseService {
  private readonly repo: PromiseRepository;
  private readonly knowledge: KnowledgeService;

  constructor(client: MCPClient) {
    this.repo = new PromiseRepository(client);
    this.knowledge = new KnowledgeService(client);
  }

  async createPromise(
    projectId: ID,
    fields: Omit<NarrativePromise, 'id' | 'projectId' | 'status' | 'createdAt' | 'updatedAt'>
  ): Promise<NarrativePromise> {
    const now = new Date().toISOString();
    const promise: NarrativePromise = {
      id: generateId(),
      projectId,
      status: 'open',
      ...fields,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.insert(promise);
    await this.mirrorToKnowledge(promise);
    return promise;
  }

  async listOpen(projectId: ID): Promise<NarrativePromise[]> {
    return this.repo.listOpen(projectId);
  }

  async listByProject(projectId: ID): Promise<NarrativePromise[]> {
    return this.repo.listByProject(projectId);
  }

  async addPayoff(
    promiseId: ID,
    fields: Omit<PromisePayoff, 'id' | 'promiseId'>
  ): Promise<PromisePayoff> {
    const payoff: PromisePayoff = {
      id: generateId(),
      promiseId,
      ...fields,
    };
    await this.repo.insertPayoff(payoff);

    if (payoff.resolvesPromise) {
      await this.repo.update(promiseId, { status: 'paid_off' });
    }

    const updated = await this.repo.getById(promiseId);
    if (updated) await this.mirrorToKnowledge(updated);

    return payoff;
  }

  /**
   * Health report for all open promises in the project.
   * - aging: open and introducedAt.chapterId set, but no payoff recorded yet; more than 5 chapters old
   *   (simplified heuristic: if importance >= 7 and status is still 'open', flag as aging)
   * - overdue: past expectedPayoffWindow.latestChapter
   * - weak_payoff: paid_off but max payoffStrength < 4
   * - dropped: status is 'dropped'
   */
  async reportHealth(projectId: ID): Promise<PromiseHealth[]> {
    const promises = await this.repo.listByProject(projectId);
    const health: PromiseHealth[] = [];

    for (const p of promises) {
      if (p.status === 'dropped') {
        health.push({
          promiseId: p.id,
          status: 'dropped',
          explanation: `Promise "${p.title}" was dropped without resolution.`,
          recommendation: 'Consider whether this is intentional. If not, add a payoff or mark intentionally_unresolved.',
        });
        continue;
      }

      if (p.status === 'paid_off') {
        const payoffs = await this.repo.listPayoffs(p.id);
        const maxStrength = Math.max(0, ...payoffs.map(po => po.payoffStrength));
        if (maxStrength < 4) {
          health.push({
            promiseId: p.id,
            status: 'weak_payoff',
            explanation: `Promise "${p.title}" was paid off but max strength was ${maxStrength}/10.`,
            recommendation: 'Consider strengthening the payoff scene or adding additional payoff moments.',
          });
        }
        continue;
      }

      if ((p.status === 'open' || p.status === 'developing') && p.expectedPayoffWindow?.latestChapter !== undefined) {
        const latestChapter = p.expectedPayoffWindow.latestChapter;
        const introducedChapter = typeof p.introducedAt.chapterId === 'string'
          ? parseInt(p.introducedAt.chapterId, 10)
          : 0;
        if (!isNaN(introducedChapter) && introducedChapter > latestChapter) {
          health.push({
            promiseId: p.id,
            status: 'overdue',
            explanation: `Promise "${p.title}" was expected to pay off by chapter ${latestChapter} but is still open.`,
            recommendation: 'Either add a payoff soon or extend the payoff window.',
          });
          continue;
        }
      }

      if (p.status === 'open' && p.importance >= 7) {
        health.push({
          promiseId: p.id,
          status: 'aging',
          explanation: `High-importance promise "${p.title}" (importance: ${p.importance}) is still open.`,
          recommendation: 'Consider introducing developing beats or moving toward payoff.',
        });
        continue;
      }

      health.push({
        promiseId: p.id,
        status: 'healthy',
        explanation: `Promise "${p.title}" is on track.`,
        recommendation: '',
      });
    }

    return health;
  }

  private async mirrorToKnowledge(promise: NarrativePromise): Promise<void> {
    const knowledgeStatus: NarrativePromise['status'] extends 'dropped' | 'paid_off' ? 'archived' : 'active'
      = (promise.status === 'dropped' || promise.status === 'paid_off') ? 'archived' as never : 'active' as never;

    await this.knowledge.upsert({
      id: `promise-${promise.id}`,
      projectId: promise.projectId,
      type: 'narrative_promise',
      title: promise.title,
      summary: promise.description,
      structuredData: {
        promiseId: promise.id,
        type: promise.type,
        status: promise.status,
        importance: promise.importance,
        readerVisibility: promise.readerVisibility,
      },
      scope: { appliesTo: 'entire_project' },
      source: promise.source,
      confidence: 1,
      status: knowledgeStatus,
      contextEligible: promise.status === 'open' || promise.status === 'developing',
      graphEligible: true,
      embeddingEligible: false,
      createdAt: promise.createdAt,
      updatedAt: promise.updatedAt,
    });
  }
}
