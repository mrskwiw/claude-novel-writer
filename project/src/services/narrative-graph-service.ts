import type { MCPClient } from '../core/database.js';
import type { NarrativeNode, NarrativeEdge } from '../types/graph.js';
import type { ID } from '../types/common.js';
import { GraphRepository } from '../db/repositories/graph-repository.js';
import { generateId } from '../utils/ids.js';

export class NarrativeGraphService {
  private readonly repo: GraphRepository;

  constructor(private readonly client: MCPClient) {
    this.repo = new GraphRepository(client);
  }

  async upsertNode(node: NarrativeNode): Promise<void> {
    return this.repo.upsertNode(node);
  }

  async upsertEdge(edge: NarrativeEdge): Promise<void> {
    return this.repo.upsertEdge(edge);
  }

  async getNode(id: ID): Promise<NarrativeNode | null> {
    return this.repo.getNode(id);
  }

  async getNeighbors(nodeId: ID): Promise<{ node: NarrativeNode; edge: NarrativeEdge }[]> {
    return this.repo.getNeighbors(nodeId);
  }

  async findPath(fromId: ID, toId: ID): Promise<ID[] | null> {
    return this.repo.findPath(fromId, toId);
  }

  /**
   * Rebuild the full narrative graph for a project.
   * Drops all existing project nodes and edges then re-derives them from:
   *   - characters (scenes they appear in)  → appears_in edges
   *   - narrative promises                  → introduced_in edges
   *   - canon items                         → applies_to edges (by subject matching character labels)
   *
   * Idempotent: running twice produces identical node+edge count.
   */
  async rebuild(projectId: ID): Promise<{ nodeCount: number; edgeCount: number }> {
    await this.repo.deleteEdgesByProject(projectId);
    await this.repo.deleteNodesByProject(projectId);

    const now = new Date().toISOString();
    const makeNode = (type: NarrativeNode['type'], label: string, sourceId?: string): NarrativeNode => ({
      id: `node-${type}-${label.toLowerCase().replace(/\s+/g, '-')}-${projectId}`,
      projectId,
      type,
      label,
      sourceId,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });

    const makeEdge = (
      fromId: ID,
      toId: ID,
      type: NarrativeEdge['type'],
      weight = 1
    ): NarrativeEdge => ({
      id: `edge-${fromId}-${type}-${toId}`,
      projectId,
      fromNodeId: fromId,
      toNodeId: toId,
      type,
      weight,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });

    let nodeCount = 0;
    let edgeCount = 0;

    // ── Characters ──
    const characters: Array<{ id: number; name: string }> = await this.client.readQuery(
      'SELECT id, name FROM characters WHERE project_id = ?',
      [projectId]
    );

    for (const char of characters) {
      const node = makeNode('character', char.name, String(char.id));
      await this.repo.upsertNode(node);
      nodeCount++;

      // Character → scenes via character_appearances
      const appearances: Array<{ scene_id: number; scene_title: string }> = await this.client.readQuery(
        `SELECT ca.scene_id, s.title as scene_title
         FROM character_appearances ca
         JOIN scenes s ON s.id = ca.scene_id
         JOIN chapters ch ON ch.id = s.chapter_id
         WHERE ca.character_id = ? AND ch.project_id = ?`,
        [char.id, projectId]
      );

      for (const app of appearances) {
        const sceneNode = makeNode('scene', app.scene_title, String(app.scene_id));
        await this.repo.upsertNode(sceneNode);
        await this.repo.upsertEdge(makeEdge(node.id, sceneNode.id, 'appears_in'));
        nodeCount++;
        edgeCount++;
      }
    }

    // ── Narrative Promises ──
    const promises: Array<{ id: string; title: string; introduced_at: string }> =
      await this.client.readQuery(
        'SELECT id, title, introduced_at FROM narrative_promises WHERE project_id = ?',
        [projectId]
      );

    for (const p of promises) {
      const promiseNode = makeNode('promise', p.title, p.id);
      await this.repo.upsertNode(promiseNode);
      nodeCount++;

      let location: { sceneId?: string } = {};
      try { location = JSON.parse(p.introduced_at); } catch { /* ignore */ }

      if (location.sceneId) {
        const sceneRows: Array<{ title: string }> = await this.client.readQuery(
          'SELECT title FROM scenes WHERE id = ? AND project_id = ? LIMIT 1',
          [location.sceneId, projectId]
        );
        if (sceneRows[0]) {
          const sceneNode = makeNode('scene', sceneRows[0].title, location.sceneId);
          await this.repo.upsertNode(sceneNode);
          await this.repo.upsertEdge(makeEdge(promiseNode.id, sceneNode.id, 'introduced_in'));
          edgeCount++;
        }
      }
    }

    // ── Canon Items → applies_to character nodes ──
    const canonItems: Array<{ id: string; subject: string; predicate: string; object: string | null; description: string }> =
      await this.client.readQuery(
        `SELECT id, subject, predicate, object, description FROM canon_items
         WHERE project_id = ? AND status = 'active'`,
        [projectId]
      );

    for (const item of canonItems) {
      const canonNode = makeNode('canon_item', `${item.subject} ${item.predicate}${item.object ? ` ${item.object}` : ''}`, item.id);
      await this.repo.upsertNode(canonNode);
      nodeCount++;

      // Link to character node if subject matches a character label
      const charNode = makeNode('character', item.subject);
      const existing = await this.repo.getNode(charNode.id);
      if (existing) {
        await this.repo.upsertEdge(makeEdge(canonNode.id, charNode.id, 'applies_to'));
        edgeCount++;
      }
    }

    // De-duplicate counts via distinct query
    const [nodeResult]: Array<{ count: number }> = await this.client.readQuery(
      'SELECT COUNT(*) as count FROM narrative_nodes WHERE project_id = ?',
      [projectId]
    );
    const [edgeResult]: Array<{ count: number }> = await this.client.readQuery(
      'SELECT COUNT(*) as count FROM narrative_edges WHERE project_id = ?',
      [projectId]
    );

    return {
      nodeCount: nodeResult?.count ?? nodeCount,
      edgeCount: edgeResult?.count ?? edgeCount,
    };
  }
}
