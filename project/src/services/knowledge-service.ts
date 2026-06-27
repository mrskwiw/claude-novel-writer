import type { MCPClient } from '../core/database.js';
import type { KnowledgeObject, KnowledgeObjectType } from '../types/knowledge.js';
import type { ID, ValidationResult } from '../types/common.js';
import { KnowledgeRepository } from '../db/repositories/knowledge-repository.js';
import { generateId } from '../utils/ids.js';

const VALID_STATUSES = new Set<string>(['active', 'draft', 'deprecated', 'archived']);

function validate(input: Partial<KnowledgeObject>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.projectId) errors.push('projectId is required');
  if (!input.type) errors.push('type is required');
  if (!input.title || input.title.trim() === '') errors.push('title is required');
  if (input.confidence !== undefined) {
    if (input.confidence < 0 || input.confidence > 1) {
      errors.push('confidence must be between 0 and 1');
    }
  }
  if (input.status !== undefined && !VALID_STATUSES.has(input.status)) {
    errors.push(`status must be one of: ${[...VALID_STATUSES].join(', ')}`);
  }
  if (!input.structuredData) warnings.push('structuredData not provided; defaulting to {}');

  return { valid: errors.length === 0, errors, warnings };
}

export class KnowledgeService {
  private readonly repo: KnowledgeRepository;

  constructor(client: MCPClient) {
    this.repo = new KnowledgeRepository(client);
  }

  async create(
    input: Omit<KnowledgeObject, 'id' | 'createdAt' | 'updatedAt'> & { id?: ID }
  ): Promise<{ object: KnowledgeObject | null; validation: ValidationResult }> {
    const validation = validate(input);
    if (!validation.valid) return { object: null, validation };

    const now = new Date().toISOString();
    const object: KnowledgeObject = {
      id: input.id ?? generateId(),
      projectId: input.projectId,
      type: input.type,
      title: input.title.trim(),
      summary: input.summary,
      body: input.body,
      structuredData: input.structuredData ?? {},
      scope: input.scope,
      source: input.source,
      confidence: input.confidence ?? 1,
      status: input.status ?? 'active',
      contextEligible: input.contextEligible ?? true,
      graphEligible: input.graphEligible ?? true,
      embeddingEligible: input.embeddingEligible ?? false,
      createdAt: now,
      updatedAt: now,
    };

    await this.repo.insert(object);
    return { object, validation };
  }

  async getById(id: ID): Promise<KnowledgeObject | null> {
    return this.repo.getById(id);
  }

  async update(id: ID, fields: Partial<KnowledgeObject>): Promise<ValidationResult> {
    const errors: string[] = [];
    if (fields.title !== undefined && fields.title.trim() === '') {
      errors.push('title cannot be empty');
    }
    if (fields.confidence !== undefined && (fields.confidence < 0 || fields.confidence > 1)) {
      errors.push('confidence must be between 0 and 1');
    }
    if (fields.status !== undefined && !VALID_STATUSES.has(fields.status)) {
      errors.push(`status must be one of: ${[...VALID_STATUSES].join(', ')}`);
    }
    if (errors.length > 0) return { valid: false, errors, warnings: [] };
    await this.repo.update(id, fields);
    return { valid: true, errors: [], warnings: [] };
  }

  async upsert(object: KnowledgeObject): Promise<void> {
    return this.repo.upsert(object);
  }

  async listByType(projectId: ID, type: KnowledgeObjectType): Promise<KnowledgeObject[]> {
    return this.repo.listByType(projectId, type);
  }

  async listByStatus(projectId: ID, status: KnowledgeObject['status']): Promise<KnowledgeObject[]> {
    return this.repo.listByStatus(projectId, status);
  }

  async filterContextEligible(projectId: ID): Promise<KnowledgeObject[]> {
    return this.repo.filterContextEligible(projectId);
  }

  async filterGraphEligible(projectId: ID): Promise<KnowledgeObject[]> {
    return this.repo.filterGraphEligible(projectId);
  }

  async filterEmbeddingEligible(projectId: ID): Promise<KnowledgeObject[]> {
    return this.repo.filterEmbeddingEligible(projectId);
  }

  async search(projectId: ID, query: string): Promise<KnowledgeObject[]> {
    return this.repo.search(projectId, query);
  }
}
