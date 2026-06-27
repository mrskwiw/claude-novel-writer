/**
 * Scene to database synchronization
 * Handles bidirectional sync between chapter markdown scenes and database
 */

import { SceneBuilder } from '../builders/scene-builder.js';
import type { MCPClient } from '../core/database.js';
import type { SceneContent } from '../builders/scene-builder.js';
import { CharacterArcService, isValidCharacterState } from '../services/character-arc-service.js';

// ─── DB row types ─────────────────────────────────────────────────────────────

interface SceneRow {
  scene_number: number;
  title: string | null;
  pov_character_name: string | null;
  location_name: string | null;
  time_of_day: string | null;
  purpose: string | null;
  emotional_tone: string | null;
  tension_level: number | null;
  summary: string | null;
}

interface SceneStatsRow {
  total_scenes: number;
  total_words: number;
  avg_words: number;
  avg_tension: number;
}

interface TensionRow {
  tension_level: number;
  count: number;
}

interface TensionArcRow {
  chapter_number: number;
  scene_number: number;
  tension_level: number;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface SceneSyncOptions {
  resolveCharacterNames?: boolean; // Resolve character names to IDs
  resolveLocationNames?: boolean; // Resolve location names to IDs
}

export class SceneSync {
  private readonly characterArcService: CharacterArcService;

  constructor(
    private mcpClient: MCPClient,
    private projectId: number
  ) {
    this.characterArcService = new CharacterArcService(mcpClient);
  }

  /**
   * Sync all scenes from a chapter file to database
   */
  async syncChapterScenes(
    chapterFilePath: string,
    options: SceneSyncOptions = {}
  ): Promise<void> {
    // Get chapter ID from database
    const chapterId = await this.getChapterIdFromPath(chapterFilePath);

    if (!chapterId) {
      throw new Error(
        `Chapter not found in database for path: ${chapterFilePath}. Sync chapter first.`
      );
    }

    // Parse scenes from chapter file
    const sceneBuilder = new SceneBuilder({ chapterFilePath });
    const scenes = await sceneBuilder.parseScenes();

    // Delete existing scenes for this chapter (we'll re-insert)
    await this.deleteChapterScenes(chapterId);

    // Insert scenes
    for (const scene of scenes) {
      await this.insertScene(chapterId, scene, options);
    }

    console.log(`Synced ${scenes.length} scenes for chapter ${chapterId}`);
  }

  /**
   * Sync all scenes from all chapters in a project
   */
  async syncAllScenes(
    chapterPaths: string[],
    options: SceneSyncOptions = {}
  ): Promise<void> {
    for (const chapterPath of chapterPaths) {
      try {
        await this.syncChapterScenes(chapterPath, options);
      } catch (error) {
        console.error(`Failed to sync scenes from ${chapterPath}:`, error);
      }
    }
  }

  /**
   * Load scenes from database for a chapter
   */
  async loadChapterScenes(chapterId: number): Promise<SceneContent[]> {
    const query = `
      SELECT
        s.id,
        s.scene_number,
        s.title,
        s.pov_character_id,
        s.location_id,
        s.time_of_day,
        s.word_count,
        s.summary,
        s.purpose,
        s.emotional_tone,
        s.tension_level,
        c.name as pov_character_name,
        l.name as location_name
      FROM scenes s
      LEFT JOIN characters c ON s.pov_character_id = c.id
      LEFT JOIN locations l ON s.location_id = l.id
      WHERE s.chapter_id = ?
      ORDER BY s.scene_number ASC
    `;

    const rows = await this.mcpClient.readQuery<SceneRow>(query, [chapterId]);

    return rows.map((row) => ({
      metadata: {
        sceneNumber: row.scene_number,
        title: row.title || undefined,
        pov: row.pov_character_name || undefined,
        location: row.location_name || undefined,
        timeOfDay: row.time_of_day || undefined,
        purpose: row.purpose || undefined,
        emotionalTone: row.emotional_tone || undefined,
        tensionLevel: row.tension_level || undefined,
      },
      content: row.summary || '', // Summary stored in DB
      startIndex: 0, // Not applicable when loading from DB
      endIndex: 0,
    }));
  }

  /**
   * Get chapter ID from file path
   */
  private async getChapterIdFromPath(
    chapterFilePath: string
  ): Promise<number | null> {
    const query = `
      SELECT id
      FROM chapters
      WHERE project_id = ? AND file_path = ?
    `;

    const result = await this.mcpClient.readQuery<{ id: number }>(query, [
      this.projectId,
      chapterFilePath,
    ]);

    return result.length > 0 ? result[0].id : null;
  }

  /**
   * Delete all scenes for a chapter
   */
  private async deleteChapterScenes(chapterId: number): Promise<void> {
    const query = `DELETE FROM scenes WHERE chapter_id = ?`;
    await this.mcpClient.writeQuery(query, [chapterId]);
  }

  /**
   * Insert scene into database
   */
  private async insertScene(
    chapterId: number,
    scene: SceneContent,
    options: SceneSyncOptions
  ): Promise<void> {
    const sceneBuilder = new SceneBuilder({ chapterFilePath: '' });
    const wordCount = sceneBuilder.countSceneWords(scene.content);

    // Resolve character and location IDs if requested
    let povCharacterId: number | null = null;
    let locationId: number | null = null;

    if (options.resolveCharacterNames && scene.metadata.pov) {
      povCharacterId = await this.resolveCharacterId(scene.metadata.pov);
    }

    if (options.resolveLocationNames && scene.metadata.location) {
      locationId = await this.resolveLocationId(scene.metadata.location);
    }

    const query = `
      INSERT INTO scenes (
        chapter_id,
        scene_number,
        title,
        pov_character_id,
        location_id,
        time_of_day,
        word_count,
        summary,
        purpose,
        emotional_tone,
        tension_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.mcpClient.writeQuery(query, [
      chapterId,
      scene.metadata.sceneNumber,
      scene.metadata.title || null,
      povCharacterId,
      locationId,
      scene.metadata.timeOfDay || null,
      wordCount,
      scene.content, // Store content as summary
      scene.metadata.purpose || null,
      scene.metadata.emotionalTone || null,
      scene.metadata.tensionLevel || null,
    ]);

    // Fetch the new scene's rowid for follow-up operations
    const idResult = await this.mcpClient.readQuery<{ id: number }>(
      'SELECT last_insert_rowid() as id',
      []
    );
    const sceneId: number | undefined = idResult[0]?.id;

    // Persist emotional_beat if present (column added via migration 008)
    if (scene.metadata.emotionalBeat && sceneId !== undefined) {
      await this.mcpClient.writeQuery(
        'UPDATE scenes SET emotional_beat = ? WHERE id = ?',
        [scene.metadata.emotionalBeat, sceneId]
      );
    }

    // Persist character states if present (SPEC-09, migration 009)
    if (scene.metadata.characterStates && scene.metadata.characterStates.length > 0 && sceneId !== undefined) {
      const projectIdStr = String(this.projectId);
      for (const { name, state } of scene.metadata.characterStates) {
        if (!isValidCharacterState(state)) {
          console.warn(
            `[scene-sync] Skipping invalid character state "${state}" for "${name}" in scene ${sceneId}`
          );
          continue;
        }

        // Look up character by name within this project
        const charRows = await this.mcpClient.readQuery<{ id: number }>(
          'SELECT id FROM characters WHERE project_id = ? AND name = ? LIMIT 1',
          [this.projectId, name]
        );

        if (charRows.length === 0) {
          console.warn(
            `[scene-sync] Character "${name}" not found in project ${this.projectId}; skipping state record`
          );
          continue;
        }

        const characterId: number = charRows[0].id;
        await this.characterArcService.recordState(
          projectIdStr,
          characterId,
          sceneId,
          state
        );
      }
    }

    // Sync scene beats if present (migration 016)
    if (scene.metadata.beats && scene.metadata.beats.length > 0 && sceneId !== undefined) {
      await this.syncSceneBeats(sceneId, scene.metadata.beats);
    }
  }

  /**
   * Upsert beats for a scene — deletes existing beats then re-inserts.
   */
  async syncSceneBeats(
    sceneId: number,
    beats: Array<{ beatNumber: number; description: string }>
  ): Promise<void> {
    await this.mcpClient.writeQuery(
      'DELETE FROM scene_beats WHERE scene_id = ?',
      [sceneId]
    );
    for (const beat of beats) {
      await this.mcpClient.writeQuery(
        `INSERT INTO scene_beats (scene_id, beat_number, description)
         VALUES (?, ?, ?)`,
        [sceneId, beat.beatNumber, beat.description]
      );
    }
  }

  /**
   * Resolve a scene's database ID from chapter number and scene number.
   */
  async resolveSceneId(
    chapterNumber: number,
    sceneNumber: number
  ): Promise<number | null> {
    try {
      const rows = await this.mcpClient.readQuery<{ id: number }>(
        `SELECT s.id FROM scenes s
         JOIN chapters c ON s.chapter_id = c.id
         WHERE c.project_id = ? AND c.chapter_number = ? AND s.scene_number = ?
         LIMIT 1`,
        [this.projectId, chapterNumber, sceneNumber]
      );
      return rows[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Load beats for a scene from the database.
   */
  async loadSceneBeats(
    sceneId: number
  ): Promise<Array<{ beatNumber: number; description: string }>> {
    try {
      const rows = await this.mcpClient.readQuery<{
        beat_number: number;
        description: string;
      }>(
        'SELECT beat_number, description FROM scene_beats WHERE scene_id = ? ORDER BY beat_number ASC',
        [sceneId]
      );
      return rows.map((r) => ({
        beatNumber: r.beat_number,
        description: r.description,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Resolve character name to ID
   */
  private async resolveCharacterId(
    characterName: string
  ): Promise<number | null> {
    const query = `
      SELECT id
      FROM characters
      WHERE project_id = ? AND name = ?
    `;

    const result = await this.mcpClient.readQuery<{ id: number }>(query, [
      this.projectId,
      characterName,
    ]);

    if (result.length === 0) {
      console.warn(
        `Character '${characterName}' not found in database. Scene will have null POV.`
      );
      return null;
    }

    return result[0].id;
  }

  /**
   * Resolve location name to ID
   */
  private async resolveLocationId(locationName: string): Promise<number | null> {
    const query = `
      SELECT id
      FROM locations
      WHERE project_id = ? AND name = ?
    `;

    const result = await this.mcpClient.readQuery<{ id: number }>(query, [
      this.projectId,
      locationName,
    ]);

    if (result.length === 0) {
      console.warn(
        `Location '${locationName}' not found in database. Scene will have null location.`
      );
      return null;
    }

    return result[0].id;
  }

  /**
   * Get scene statistics for a chapter
   */
  async getChapterSceneStats(chapterId: number): Promise<{
    totalScenes: number;
    totalWords: number;
    averageWordsPerScene: number;
    averageTensionLevel: number;
    scenesByTension: Map<number, number>;
  }> {
    const query = `
      SELECT
        COUNT(*) as total_scenes,
        COALESCE(SUM(word_count), 0) as total_words,
        COALESCE(AVG(word_count), 0) as avg_words,
        COALESCE(AVG(tension_level), 0) as avg_tension
      FROM scenes
      WHERE chapter_id = ?
    `;

    const result = await this.mcpClient.readQuery<SceneStatsRow>(query, [chapterId]);
    const stats = result[0];

    // Get tension distribution
    const tensionQuery = `
      SELECT tension_level, COUNT(*) as count
      FROM scenes
      WHERE chapter_id = ? AND tension_level IS NOT NULL
      GROUP BY tension_level
    `;

    const tensionRows = await this.mcpClient.readQuery<TensionRow>(tensionQuery, [chapterId]);
    const scenesByTension = new Map<number, number>();

    tensionRows.forEach((row) => {
      scenesByTension.set(row.tension_level, row.count);
    });

    return {
      totalScenes: stats.total_scenes,
      totalWords: stats.total_words,
      averageWordsPerScene: stats.avg_words,
      averageTensionLevel: stats.avg_tension,
      scenesByTension,
    };
  }

  /**
   * Get scenes by POV character
   */
  async getScenesByCharacter(characterId: number): Promise<any[]> {
    const query = `
      SELECT
        s.*,
        c.chapter_number,
        c.title as chapter_title
      FROM scenes s
      JOIN chapters c ON s.chapter_id = c.id
      WHERE s.pov_character_id = ? AND c.project_id = ?
      ORDER BY c.chapter_number, s.scene_number
    `;

    return await this.mcpClient.readQuery(query, [characterId, this.projectId]);
  }

  /**
   * Get scenes by location
   */
  async getScenesByLocation(locationId: number): Promise<any[]> {
    const query = `
      SELECT
        s.*,
        c.chapter_number,
        c.title as chapter_title
      FROM scenes s
      JOIN chapters c ON s.chapter_id = c.id
      WHERE s.location_id = ? AND c.project_id = ?
      ORDER BY c.chapter_number, s.scene_number
    `;

    return await this.mcpClient.readQuery(query, [locationId, this.projectId]);
  }

  /**
   * Get tension arc for entire project
   */
  async getTensionArc(): Promise<
    Array<{
      chapterNumber: number;
      sceneNumber: number;
      tensionLevel: number;
    }>
  > {
    const query = `
      SELECT
        c.chapter_number,
        s.scene_number,
        s.tension_level
      FROM scenes s
      JOIN chapters c ON s.chapter_id = c.id
      WHERE c.project_id = ? AND s.tension_level IS NOT NULL
      ORDER BY c.chapter_number, s.scene_number
    `;

    const rows = await this.mcpClient.readQuery<TensionArcRow>(query, [this.projectId]);

    return rows.map((row) => ({
      chapterNumber: row.chapter_number,
      sceneNumber: row.scene_number,
      tensionLevel: row.tension_level,
    }));
  }
}
