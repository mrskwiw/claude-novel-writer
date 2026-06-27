import type { MCPClient } from '../core/database.js';
import type { ContextContract } from '../types/context.js';
import type { ID, ValidationResult } from '../types/common.js';
import { sceneContinuationContract } from '../context/contracts/scene-continuation.contract.js';
import { continuityCheckContract } from '../context/contracts/continuity-check.contract.js';
import { developmentalEditContract } from '../context/contracts/developmental-edit.contract.js';

const DEFAULT_CONTRACTS: readonly ContextContract[] = [
  sceneContinuationContract,
  continuityCheckContract,
  developmentalEditContract,
];

export class ContextContractService {
  /** In-memory registry — default contracts are always available without DB access. */
  private readonly registry = new Map<string, ContextContract>();

  constructor(_client: MCPClient) {
    for (const contract of DEFAULT_CONTRACTS) {
      this.registry.set(contract.id, contract);
    }
  }

  /** Register a custom contract. Overwrites any existing contract with the same id. */
  register(contract: ContextContract): ValidationResult {
    const validation = this.validate(contract);
    if (validation.valid) {
      this.registry.set(contract.id, contract);
    }
    return validation;
  }

  getById(id: ID): ContextContract | null {
    return this.registry.get(id) ?? null;
  }

  listAll(): ContextContract[] {
    return [...this.registry.values()];
  }

  validate(contract: Partial<ContextContract>): ValidationResult {
    const errors: string[] = [];

    if (!contract.id || contract.id.trim() === '') errors.push('id is required');
    if (!contract.name || contract.name.trim() === '') errors.push('name is required');
    if (!contract.description) errors.push('description is required');
    if (!contract.operationType) errors.push('operationType is required');
    if (!Array.isArray(contract.required)) errors.push('required must be an array');
    if (!Array.isArray(contract.optional)) errors.push('optional must be an array');
    if (typeof contract.maxTokens !== 'number' || contract.maxTokens <= 0) {
      errors.push('maxTokens must be a positive number');
    }
    if (!contract.orderingPolicy) errors.push('orderingPolicy is required');
    if (!contract.truncationPolicy) errors.push('truncationPolicy is required');
    if (typeof contract.deterministic !== 'boolean') errors.push('deterministic must be a boolean');

    return { valid: errors.length === 0, errors, warnings: [] };
  }
}
