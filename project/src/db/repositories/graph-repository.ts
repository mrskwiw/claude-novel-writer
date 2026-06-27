import type { MCPClient } from '../../core/database.js';
import type { NarrativeNode, NarrativeEdge } from '../../types/graph.js';
import type { ID } from '../../types/common.js';

interface NodeRow {
  id: string;
  project_id: string;
  type: string;
  label: string;
  summary: string | null;
  source_id: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

interface EdgeRow {
  id: string;
  project_id: string;
  from_node_id: string;
  to_node_id: string;
  type: string;
  label: string | null;
  weight: number;
  source: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function rowToNode(row: NodeRow): NarrativeNode {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as NarrativeNode['type'],
    label: row.label,
    summary: row.summary ?? undefined,
    sourceId: row.source_id ?? undefined,
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEdge(row: EdgeRow): NarrativeEdge {
  return {
    id: row.id,
    projectId: row.project_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    type: row.type as NarrativeEdge['type'],
    label: row.label ?? undefined,
    weight: row.weight,
    source: row.source ? JSON.parse(row.source) : undefined,
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class GraphRepository {
  constructor(private readonly client: MCPClient) {}

  async upsertNode(node: NarrativeNode): Promise<void> {
    await this.client.writeQuery(
      `INSERT INTO narrative_nodes
         (id, project_id, type, label, summary, source_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         label = excluded.label,
         summary = excluded.summary,
         source_id = excluded.source_id,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`,
      [
        node.id,
        node.projectId,
        node.type,
        node.label,
        node.summary ?? null,
        node.sourceId ?? null,
        JSON.stringify(node.metadata),
        node.createdAt,
        node.updatedAt,
      ]
    );
  }

  async upsertEdge(edge: NarrativeEdge): Promise<void> {
    await this.client.writeQuery(
      `INSERT INTO narrative_edges
         (id, project_id, from_node_id, to_node_id, type, label, weight, source, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         label = excluded.label,
         weight = excluded.weight,
         source = excluded.source,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`,
      [
        edge.id,
        edge.projectId,
        edge.fromNodeId,
        edge.toNodeId,
        edge.type,
        edge.label ?? null,
        edge.weight,
        edge.source ? JSON.stringify(edge.source) : null,
        JSON.stringify(edge.metadata),
        edge.createdAt,
        edge.updatedAt,
      ]
    );
  }

  async getNode(id: ID): Promise<NarrativeNode | null> {
    const rows = await this.client.readQuery(
      'SELECT * FROM narrative_nodes WHERE id = ? LIMIT 1',
      [id]
    ) as NodeRow[];
    return rows[0] ? rowToNode(rows[0]) : null;
  }

  async getNeighbors(nodeId: ID): Promise<{ node: NarrativeNode; edge: NarrativeEdge }[]> {
    const edgeRows = await this.client.readQuery(
      `SELECT * FROM narrative_edges WHERE from_node_id = ? OR to_node_id = ?`,
      [nodeId, nodeId]
    ) as EdgeRow[];

    const result: { node: NarrativeNode; edge: NarrativeEdge }[] = [];
    for (const edgeRow of edgeRows) {
      const edge = rowToEdge(edgeRow);
      const neighborId = edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId;
      const nodeRows = await this.client.readQuery(
        'SELECT * FROM narrative_nodes WHERE id = ? LIMIT 1',
        [neighborId]
      ) as NodeRow[];
      if (nodeRows[0]) {
        result.push({ node: rowToNode(nodeRows[0]), edge });
      }
    }
    return result;
  }

  /** BFS path search — returns ordered list of node IDs from fromId to toId, or null if unreachable. */
  async findPath(fromId: ID, toId: ID): Promise<ID[] | null> {
    if (fromId === toId) return [fromId];

    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      const edgeRows = await this.client.readQuery(
        'SELECT * FROM narrative_edges WHERE from_node_id = ? OR to_node_id = ?',
        [current.id, current.id]
      ) as EdgeRow[];

      for (const edgeRow of edgeRows) {
        const neighborId = edgeRow.from_node_id === current.id
          ? edgeRow.to_node_id
          : edgeRow.from_node_id;
        if (neighborId === toId) return [...current.path, neighborId];
        if (!visited.has(neighborId)) {
          queue.push({ id: neighborId, path: [...current.path, neighborId] });
        }
      }
    }
    return null;
  }

  async deleteNodesByProject(projectId: ID): Promise<void> {
    await this.client.writeQuery(
      'DELETE FROM narrative_nodes WHERE project_id = ?',
      [projectId]
    );
  }

  async deleteEdgesByProject(projectId: ID): Promise<void> {
    await this.client.writeQuery(
      'DELETE FROM narrative_edges WHERE project_id = ?',
      [projectId]
    );
  }
}
