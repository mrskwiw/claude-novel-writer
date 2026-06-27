/**
 * Repository for tracking file-to-database sync state.
 * Used by sync classes to detect DB-side modifications made after the last
 * file sync (i.e., potential conflicts before overwriting DB data from file).
 */

import type { MCPClient } from '../../core/database.js';

export class SyncStateRepository {
  constructor(private readonly client: MCPClient) {}

  /**
   * Record a successful file-to-database sync for an entity.
   * Upserts the sync_state row for (entityType, entityId).
   *
   * @param entityType - e.g. 'character', 'chapter', 'location'
   * @param entityId   - stable string identifier (name or stringified numeric id)
   * @param projectId  - project the entity belongs to
   * @param filePath   - source file that was synced (optional)
   */
  async record(
    entityType: string,
    entityId: string,
    projectId: string,
    filePath?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    // SQLite does not support "INSERT OR REPLACE ... SET" — use a two-step approach
    // so we don't accidentally wipe unrelated columns.
    const existing = await this.client.readQuery(
      `SELECT entity_type FROM sync_state
       WHERE entity_type = ? AND entity_id = ?`,
      [entityType, entityId]
    );

    if (existing.length > 0) {
      await this.client.writeQuery(
        `UPDATE sync_state
         SET project_id = ?, last_synced_at = ?, file_path = ?
         WHERE entity_type = ? AND entity_id = ?`,
        [projectId, now, filePath ?? null, entityType, entityId]
      );
    } else {
      await this.client.writeQuery(
        `INSERT INTO sync_state
           (entity_type, entity_id, project_id, last_synced_at, file_path)
         VALUES (?, ?, ?, ?, ?)`,
        [entityType, entityId, projectId, now, filePath ?? null]
      );
    }
  }

  /**
   * Returns the ISO-8601 timestamp of the last recorded sync, or null if
   * this entity has never been synced.
   */
  async getLastSynced(
    entityType: string,
    entityId: string
  ): Promise<string | null> {
    const rows = await this.client.readQuery(
      `SELECT last_synced_at FROM sync_state
       WHERE entity_type = ? AND entity_id = ?`,
      [entityType, entityId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0].last_synced_at as string;
  }

  /**
   * Returns true when the DB record was modified after the last file sync,
   * indicating a potential conflict.
   *
   * Returns false when:
   *  - The entity has never been synced (no previous sync = no conflict baseline).
   *  - dbUpdatedAt is equal to or earlier than lastSyncedAt.
   *
   * @param entityType  - same as used in `record()`
   * @param entityId    - same as used in `record()`
   * @param dbUpdatedAt - the `updated_at` column value from the DB row (ISO-8601)
   */
  async detectConflict(
    entityType: string,
    entityId: string,
    dbUpdatedAt: string
  ): Promise<boolean> {
    const lastSynced = await this.getLastSynced(entityType, entityId);

    // No previous sync means there is no known-good baseline → no conflict.
    if (lastSynced === null) {
      return false;
    }

    // Conflict: DB was modified after we last synced from the file.
    return dbUpdatedAt > lastSynced;
  }
}
