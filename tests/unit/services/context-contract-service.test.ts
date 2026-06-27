/**
 * Unit tests for ContextContractService (Ticket 008)
 */

import { describe, it, expect, vi } from 'vitest';
import { ContextContractService } from '../../../project/src/services/context-contract-service.js';
import type { MCPClient } from '../../../project/src/core/database.js';
import type { ContextContract } from '../../../project/src/types/context.js';

function makeMock(): MCPClient {
  return {
    readQuery: vi.fn().mockResolvedValue([]),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 0 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

describe('ContextContractService', () => {
  describe('default contracts', () => {
    it('loads three default contracts on construction', () => {
      const svc = new ContextContractService(makeMock());
      expect(svc.listAll()).toHaveLength(3);
    });

    it('getById("scene.continuation.v1") returns the scene continuation contract', () => {
      const svc = new ContextContractService(makeMock());
      const contract = svc.getById('scene.continuation.v1');
      expect(contract).not.toBeNull();
      expect(contract?.name).toBe('Scene Continuation');
      expect(contract?.operationType).toBe('generation');
    });

    it('getById("continuity.check.v1") returns the continuity check contract', () => {
      const svc = new ContextContractService(makeMock());
      const contract = svc.getById('continuity.check.v1');
      expect(contract).not.toBeNull();
      expect(contract?.operationType).toBe('consistency_check');
    });

    it('getById("developmental.edit.v1") returns the developmental edit contract', () => {
      const svc = new ContextContractService(makeMock());
      const contract = svc.getById('developmental.edit.v1');
      expect(contract).not.toBeNull();
      expect(contract?.operationType).toBe('editing');
    });

    it('all default contracts have at least one required block', () => {
      const svc = new ContextContractService(makeMock());
      for (const contract of svc.listAll()) {
        expect(contract.required.length, `${contract.id} has no required blocks`).toBeGreaterThan(0);
      }
    });

    it('all default contracts are deterministic', () => {
      const svc = new ContextContractService(makeMock());
      for (const contract of svc.listAll()) {
        expect(contract.deterministic, `${contract.id} is not deterministic`).toBe(true);
      }
    });
  });

  describe('getById()', () => {
    it('returns null for unknown id', () => {
      const svc = new ContextContractService(makeMock());
      expect(svc.getById('nonexistent.v1')).toBeNull();
    });
  });

  describe('register()', () => {
    it('registers a valid custom contract', () => {
      const svc = new ContextContractService(makeMock());
      const custom: ContextContract = {
        id: 'my.contract.v1',
        name: 'My Contract',
        description: 'test',
        operationType: 'analysis',
        required: [{ type: 'current_scene', scope: { range: 'current_scene' }, priority: 100 }],
        optional: [],
        maxTokens: 4000,
        orderingPolicy: 'priority_then_relevance',
        truncationPolicy: { strategy: 'drop_optional_lowest_priority', preserveRequired: true },
        deterministic: true,
      };
      const validation = svc.register(custom);
      expect(validation.valid).toBe(true);
      expect(svc.getById('my.contract.v1')).not.toBeNull();
      expect(svc.listAll()).toHaveLength(4);
    });

    it('does not register and returns errors for invalid contract', () => {
      const svc = new ContextContractService(makeMock());
      const invalid = { id: '', name: '' } as Partial<ContextContract>;
      const validation = svc.register(invalid as ContextContract);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('id'))).toBe(true);
      expect(svc.listAll()).toHaveLength(3);
    });
  });

  describe('validate()', () => {
    it('passes for a well-formed contract', () => {
      const svc = new ContextContractService(makeMock());
      const v = svc.validate(svc.getById('scene.continuation.v1')!);
      expect(v.valid).toBe(true);
      expect(v.errors).toHaveLength(0);
    });

    it('fails when required fields are missing', () => {
      const svc = new ContextContractService(makeMock());
      const v = svc.validate({ id: 'x', required: [], optional: [], maxTokens: 0 } as Partial<ContextContract>);
      expect(v.valid).toBe(false);
      expect(v.errors.some(e => e.includes('name'))).toBe(true);
      expect(v.errors.some(e => e.includes('maxTokens'))).toBe(true);
    });

    it('fails when maxTokens is zero', () => {
      const svc = new ContextContractService(makeMock());
      const v = svc.validate({
        id: 'x', name: 'X', description: 'x', operationType: 'generation',
        required: [], optional: [], maxTokens: 0,
        orderingPolicy: 'priority_then_relevance',
        truncationPolicy: { strategy: 'drop_optional_lowest_priority', preserveRequired: true },
        deterministic: true,
      });
      expect(v.valid).toBe(false);
      expect(v.errors.some(e => e.includes('maxTokens'))).toBe(true);
    });
  });
});
