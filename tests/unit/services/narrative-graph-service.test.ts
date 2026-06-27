/**
 * Unit tests for GraphRepository + NarrativeGraphService (Ticket 011)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphRepository } from '../../../project/src/db/repositories/graph-repository.js';
import { NarrativeGraphService } from '../../../project/src/services/narrative-graph-service.js';
import type { MCPClient } from '../../../project/src/core/database.js';
import type { NarrativeNode, NarrativeEdge } from '../../../project/src/types/graph.js';

const NOW = '2026-01-01T00:00:00Z';

function makeNode(overrides: Partial<NarrativeNode> = {}): NarrativeNode {
  return {
    id: 'node-1',
    projectId: 'proj-1',
    type: 'character',
    label: 'Mira',
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeEdge(overrides: Partial<NarrativeEdge> = {}): NarrativeEdge {
  return {
    id: 'edge-1',
    projectId: 'proj-1',
    fromNodeId: 'node-1',
    toNodeId: 'node-2',
    type: 'appears_in',
    weight: 1,
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeNodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'node-1',
    project_id: 'proj-1',
    type: 'character',
    label: 'Mira',
    summary: null,
    source_id: null,
    metadata: '{}',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeEdgeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'edge-1',
    project_id: 'proj-1',
    from_node_id: 'node-1',
    to_node_id: 'node-2',
    type: 'appears_in',
    label: null,
    weight: 1,
    source: null,
    metadata: '{}',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeMock(readResults: unknown[][] = []): MCPClient {
  let callIndex = 0;
  return {
    readQuery: vi.fn().mockImplementation(async () => {
      const result = readResults[callIndex] ?? [];
      callIndex++;
      return result;
    }),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 1 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

// ─── GraphRepository ───────────────────────────────────────────────────────

describe('GraphRepository', () => {
  let client: MCPClient;
  let repo: GraphRepository;

  beforeEach(() => {
    client = makeMock();
    repo = new GraphRepository(client);
  });

  it('upsertNode() calls writeQuery with ON CONFLICT clause', async () => {
    await repo.upsertNode(makeNode());
    const [sql] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO UPDATE SET');
  });

  it('upsertEdge() calls writeQuery with ON CONFLICT clause', async () => {
    await repo.upsertEdge(makeEdge());
    const [sql] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
  });

  it('getNode() returns null when not found', async () => {
    expect(await repo.getNode('missing')).toBeNull();
  });

  it('getNode() deserializes metadata', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeNodeRow({ metadata: '{"key":"value"}' }),
    ]);
    const node = await repo.getNode('node-1');
    expect(node?.metadata).toEqual({ key: 'value' });
  });

  it('getNeighbors() returns correct neighbor for directed edge', async () => {
    // First readQuery: edges, Second: neighbor node
    (client.readQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([makeEdgeRow()])
      .mockResolvedValueOnce([makeNodeRow({ id: 'node-2', label: 'Archive' })]);

    const neighbors = await repo.getNeighbors('node-1');
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].node.label).toBe('Archive');
    expect(neighbors[0].edge.type).toBe('appears_in');
  });

  it('getNeighbors() returns empty array when no edges', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const neighbors = await repo.getNeighbors('node-1');
    expect(neighbors).toHaveLength(0);
  });

  it('findPath() returns [id] for same from/to id', async () => {
    const path = await repo.findPath('node-1', 'node-1');
    expect(path).toEqual(['node-1']);
  });

  it('findPath() returns path when connected', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([makeEdgeRow({ from_node_id: 'node-1', to_node_id: 'node-2' })]);
    const path = await repo.findPath('node-1', 'node-2');
    expect(path).toEqual(['node-1', 'node-2']);
  });

  it('findPath() returns null when unreachable', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const path = await repo.findPath('node-1', 'node-99');
    expect(path).toBeNull();
  });
});

// ─── NarrativeGraphService ────────────────────────────────────────────────

describe('NarrativeGraphService', () => {
  it('upsertNode() delegates to repository', async () => {
    const client = makeMock();
    const svc = new NarrativeGraphService(client);
    await svc.upsertNode(makeNode());
    expect(client.writeQuery).toHaveBeenCalledOnce();
  });

  it('upsertEdge() delegates to repository', async () => {
    const client = makeMock();
    const svc = new NarrativeGraphService(client);
    await svc.upsertEdge(makeEdge());
    expect(client.writeQuery).toHaveBeenCalledOnce();
  });

  it('rebuild() deletes then re-inserts nodes and edges', async () => {
    const client = makeMock([
      // characters
      [{ id: 1, name: 'Mira' }],
      // appearances for Mira
      [{ scene_id: 10, scene_title: 'Archive Room' }],
      // promises
      [{ id: 'prom-1', title: 'Archive Door Mystery', introduced_at: '{}' }],
      // canon items
      [],
      // final count queries
      [{ count: 3 }],
      [{ count: 1 }],
    ]);
    const svc = new NarrativeGraphService(client);
    const { nodeCount, edgeCount } = await svc.rebuild('proj-1');
    // DELETE nodes + edges: 2 writeQuery calls
    // upsert character, scene, scene again (upsert), promise: writeQuery calls
    expect(client.writeQuery).toHaveBeenCalled();
    expect(nodeCount).toBe(3);
    expect(edgeCount).toBe(1);
  });

  it('rebuild() is idempotent — same counts on second run', async () => {
    const readResults = [
      [{ id: 1, name: 'Mira' }],
      [{ scene_id: 10, scene_title: 'Archive Room' }],
      [],
      [],
      [{ count: 2 }],
      [{ count: 1 }],
    ];
    function buildClient() {
      return makeMock([...readResults]);
    }
    const svc1 = new NarrativeGraphService(buildClient());
    const result1 = await svc1.rebuild('proj-1');
    const svc2 = new NarrativeGraphService(buildClient());
    const result2 = await svc2.rebuild('proj-1');
    expect(result1.nodeCount).toBe(result2.nodeCount);
    expect(result1.edgeCount).toBe(result2.edgeCount);
  });
});
