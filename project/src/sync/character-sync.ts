/**
 * Character file to database synchronization
 * Handles YAML character profiles → database, and DB → YAML reverse sync.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import YAML from 'yaml';
import type { CharacterYAML } from '../types/novel.js';
import { SyncConflictError } from '../types/novel.js';
import type { MCPClient } from '../core/database.js';
import { SyncStateRepository } from '../db/repositories/sync-state-repository.js';

export interface CharacterSyncOptions {
  /** When true, overwrite DB data from file even if a conflict is detected. */
  forceFile?: boolean;
  /** When true, skip relationship resolution (use for first-pass bulk sync). */
  skipRelationships?: boolean;
}

export class CharacterSync {
  private readonly syncStateRepo: SyncStateRepository;

  constructor(
    private mcpClient: MCPClient,
    private projectId: number,
    private projectPath?: string
  ) {
    this.syncStateRepo = new SyncStateRepository(mcpClient);
  }

  /**
   * Sync a character YAML file to the database.
   *
   * @param filePath - absolute path to the YAML character file
   * @param options  - optional flags; set `forceFile: true` to suppress conflict errors
   */
  async syncCharacterFile(
    filePath: string,
    options?: CharacterSyncOptions
  ): Promise<void> {
    console.log(`Syncing character from ${filePath}...`);

    // Read and parse YAML
    const content = await readFile(filePath, 'utf-8');
    const character = YAML.parse(content) as CharacterYAML;

    // Validate required fields
    if (!character.name) {
      throw new Error(`Character file ${filePath} missing required 'name' field`);
    }

    // Conflict detection: check if DB was modified after last file sync
    if (!options?.forceFile) {
      const existingRow = await this.mcpClient.readQuery(
        'SELECT id, updated_at FROM characters WHERE project_id = ? AND name = ?',
        [this.projectId, character.name]
      );
      if (existingRow.length > 0 && existingRow[0].updated_at) {
        const hasConflict = await this.syncStateRepo.detectConflict(
          'character',
          character.name,
          existingRow[0].updated_at as string
        );
        if (hasConflict) {
          throw new SyncConflictError(
            'character',
            character.name,
            `DB record updated at ${existingRow[0].updated_at as string} is newer than last file sync. Use forceFile option to override.`
          );
        }
      }
    }

    // Insert or update character
    const characterId = await this.upsertCharacter(character, filePath);

    // Sync attributes
    await this.syncAttributes(characterId, character);

    // Sync relationships (skipped on first-pass bulk sync to allow two-pass resolution)
    if (character.relationships && !options?.skipRelationships) {
      await this.syncRelationships(characterId, character.relationships);
    }

    // Sync character arc
    if (character.arc) {
      await this.syncArc(characterId, character.arc);
    }

    // Record successful sync
    await this.syncStateRepo.record(
      'character',
      character.name,
      String(this.projectId),
      filePath
    );

    console.log(`Character ${character.name} synced successfully`);
  }

  /**
   * Second-pass: resolve relationships for a character file whose record is already in the DB.
   * Safe to call after all character records have been inserted (resolves forward references).
   */
  async syncRelationshipsFromFile(filePath: string): Promise<void> {
    const content = await readFile(filePath, 'utf-8');
    const character = YAML.parse(content) as CharacterYAML;
    if (!character.name || !character.relationships?.length) return;

    const rows = await this.mcpClient.readQuery<{ id: number }>(
      'SELECT id FROM characters WHERE project_id = ? AND name = ?',
      [this.projectId, character.name]
    );
    if (rows.length === 0) return;

    await this.syncRelationships(rows[0].id, character.relationships);
  }

  /**
   * Export a character from the database back to a YAML file (reverse sync).
   * Writes to `<projectPath>/characters/<slug>.yaml`.
   *
   * @param characterId - numeric DB id of the character row
   * @returns absolute path to the written file
   */
  async exportToYAML(characterId: string): Promise<string> {
    // Load character row
    const rows = await this.mcpClient.readQuery(
      `SELECT id, name, full_name, role, summary, voice_notes, file_path
       FROM characters WHERE id = ? AND project_id = ?`,
      [characterId, this.projectId]
    );
    if (rows.length === 0) {
      throw new Error(`Character ${characterId} not found in project ${this.projectId}`);
    }
    const row = rows[0];

    // Load attributes
    const attrRows = await this.mcpClient.readQuery(
      `SELECT attribute_type, attribute_name, attribute_value
       FROM character_attributes WHERE character_id = ?`,
      [characterId]
    );

    // Load arc
    const arcRows = await this.mcpClient.readQuery(
      `SELECT starting_state, ending_state, midpoint_crisis
       FROM character_arcs WHERE character_id = ?`,
      [characterId]
    );

    // Build CharacterYAML object
    const yaml: CharacterYAML = {
      name: row.name as string,
      role: row.role as CharacterYAML['role'],
      summary: (row.summary as string) ?? '',
    };

    if (row.full_name) yaml.fullName = row.full_name as string;

    // Group attributes
    const physical: Record<string, string> = {};
    const personality: Record<string, string> = {};
    const background: Record<string, string> = {};
    const skills: Record<string, string> = {};

    for (const attr of attrRows) {
      const val = attr.attribute_value as string;
      switch (attr.attribute_type as string) {
        case 'physical': physical[attr.attribute_name as string] = val; break;
        case 'personality': personality[attr.attribute_name as string] = val; break;
        case 'background': background[attr.attribute_name as string] = val; break;
        case 'skill': skills[attr.attribute_name as string] = val; break;
      }
    }

    if (Object.keys(physical).length > 0) yaml.physical = physical;
    if (Object.keys(personality).length > 0) yaml.personality = personality;
    if (Object.keys(background).length > 0) yaml.background = background;
    if (Object.keys(skills).length > 0) yaml.skills = skills;

    if (arcRows.length > 0) {
      yaml.arc = {
        startingState: arcRows[0].starting_state as string,
        endingState: arcRows[0].ending_state as string,
      };
      if (arcRows[0].midpoint_crisis) {
        yaml.arc.midpointCrisis = arcRows[0].midpoint_crisis as string;
      }
    }

    // Determine output path
    const slug = (row.name as string).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const basePath = this.projectPath ?? '.';
    const outputPath = (row.file_path as string | null) ?? join(basePath, 'characters', `${slug}.yaml`);

    // Write YAML
    await mkdir(dirname(outputPath), { recursive: true });
    const yamlContent = YAML.stringify(yaml, { indent: 2, lineWidth: 0 });
    await writeFile(outputPath, yamlContent, 'utf-8');

    console.log(`Character exported to ${outputPath}`);
    return outputPath;
  }

  /**
   * Insert or update character record
   */
  private async upsertCharacter(
    character: CharacterYAML,
    filePath: string
  ): Promise<number> {
    // Check if character exists
    const existingQuery = `
      SELECT id FROM characters
      WHERE project_id = ? AND name = ?
    `;
    const existing = await this.mcpClient.readQuery<{ id: number }>(existingQuery, [
      this.projectId,
      character.name,
    ]);

    if (existing.length > 0) {
      // Update existing
      const updateQuery = `
        UPDATE characters
        SET full_name = ?,
            role = ?,
            summary = ?,
            voice_notes = ?,
            file_path = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await this.mcpClient.writeQuery(updateQuery, [
        character.fullName || null,
        character.role,
        character.summary,
        this.serializeVoiceNotes(character.voice),
        filePath,
        existing[0].id,
      ]);

      return existing[0].id;
    } else {
      // Insert new
      const insertQuery = `
        INSERT INTO characters (
          project_id, name, full_name, role, summary, voice_notes, file_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      await this.mcpClient.writeQuery(insertQuery, [
        this.projectId,
        character.name,
        character.fullName || null,
        character.role,
        character.summary,
        this.serializeVoiceNotes(character.voice),
        filePath,
      ]);

      // Get the inserted ID
      const idQuery = 'SELECT last_insert_rowid() as id';
      const result = await this.mcpClient.readQuery<{ id: number }>(idQuery);
      return result[0].id;
    }
  }

  /**
   * Sync character attributes to database
   */
  private async syncAttributes(
    characterId: number,
    character: CharacterYAML
  ): Promise<void> {
    const attributeCategories = [
      { type: 'physical', data: character.physical },
      { type: 'personality', data: character.personality },
      { type: 'background', data: character.background },
      { type: 'skill', data: character.skills },
    ];

    for (const category of attributeCategories) {
      if (!category.data) continue;

      for (const [name, value] of Object.entries(category.data)) {
        await this.upsertAttribute(
          characterId,
          category.type as 'physical' | 'personality' | 'background' | 'skill',
          name,
          value
        );
      }
    }
  }

  /**
   * Insert or update a single attribute
   */
  private async upsertAttribute(
    characterId: number,
    type: string,
    name: string,
    value: string
  ): Promise<void> {
    // Check if attribute exists
    const existingQuery = `
      SELECT id, confidence FROM character_attributes
      WHERE character_id = ? AND attribute_type = ? AND attribute_name = ?
    `;
    const existing = await this.mcpClient.readQuery(existingQuery, [
      characterId,
      type,
      name,
    ]);

    if (existing.length > 0) {
      // Update if value changed
      const updateQuery = `
        UPDATE character_attributes
        SET attribute_value = ?,
            confidence = 1.0
        WHERE id = ?
      `;
      await this.mcpClient.writeQuery(updateQuery, [value, existing[0].id]);
    } else {
      // Insert new attribute
      const insertQuery = `
        INSERT INTO character_attributes (
          character_id, attribute_type, attribute_name, attribute_value, confidence
        ) VALUES (?, ?, ?, ?, 1.0)
      `;
      await this.mcpClient.writeQuery(insertQuery, [
        characterId,
        type,
        name,
        value,
      ]);
    }
  }

  /**
   * Sync character relationships
   */
  private async syncRelationships(
    characterId: number,
    relationships: CharacterYAML['relationships']
  ): Promise<void> {
    if (!relationships) return;

    for (const rel of relationships) {
      // YAML files sometimes store relationships as plain strings ("Name: description")
      // rather than structured objects. Skip non-object entries silently.
      if (typeof rel !== 'object' || !rel.character) continue;

      // Find the other character
      const otherQuery = `
        SELECT id FROM characters
        WHERE project_id = ? AND name = ?
      `;
      const other = await this.mcpClient.readQuery<{ id: number }>(otherQuery, [
        this.projectId,
        rel.character,
      ]);

      if (other.length === 0) {
        console.warn(`Relationship target not found: ${rel.character}`);
        continue;
      }

      const otherId = other[0].id;

      // Ensure consistent ordering (lower ID first)
      const [idA, idB] =
        characterId < otherId ? [characterId, otherId] : [otherId, characterId];

      // Upsert relationship
      const checkQuery = `
        SELECT id FROM character_relationships
        WHERE character_id_a = ? AND character_id_b = ?
      `;
      const existing = await this.mcpClient.readQuery(checkQuery, [idA, idB]);

      if (existing.length > 0) {
        const updateQuery = `
          UPDATE character_relationships
          SET relationship_type = ?,
              description = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        await this.mcpClient.writeQuery(updateQuery, [
          rel.type,
          rel.description,
          existing[0].id,
        ]);
      } else {
        const insertQuery = `
          INSERT INTO character_relationships (
            character_id_a, character_id_b, relationship_type, description
          ) VALUES (?, ?, ?, ?)
        `;
        await this.mcpClient.writeQuery(insertQuery, [
          idA,
          idB,
          rel.type,
          rel.description,
        ]);
      }
    }
  }

  /**
   * Sync character arc information
   */
  private async syncArc(
    characterId: number,
    arc: NonNullable<CharacterYAML['arc']>
  ): Promise<void> {
    // Check if arc exists
    const existingQuery = `
      SELECT id FROM character_arcs
      WHERE character_id = ?
    `;
    const existing = await this.mcpClient.readQuery(existingQuery, [
      characterId,
    ]);

    if (existing.length > 0) {
      // Update existing arc
      const updateQuery = `
        UPDATE character_arcs
        SET starting_state = ?,
            ending_state = ?,
            midpoint_crisis = ?
        WHERE id = ?
      `;
      await this.mcpClient.writeQuery(updateQuery, [
        arc.startingState,
        arc.endingState,
        arc.midpointCrisis || null,
        existing[0].id,
      ]);
    } else {
      // Insert new arc
      const insertQuery = `
        INSERT INTO character_arcs (
          character_id, arc_name, starting_state, ending_state, midpoint_crisis
        ) VALUES (?, ?, ?, ?, ?)
      `;
      await this.mcpClient.writeQuery(insertQuery, [
        characterId,
        'Main Arc',
        arc.startingState,
        arc.endingState,
        arc.midpointCrisis || null,
      ]);
    }
  }

  /**
   * Serialize voice notes to string
   */
  private serializeVoiceNotes(
    voice?: CharacterYAML['voice']
  ): string | null {
    if (!voice) return null;

    const parts: string[] = [];

    if (voice.patterns && voice.patterns.length > 0) {
      parts.push(`Patterns: ${voice.patterns.join(', ')}`);
    }

    if (voice.quirks && voice.quirks.length > 0) {
      parts.push(`Quirks: ${voice.quirks.join(', ')}`);
    }

    if (voice.vocabulary) {
      parts.push(`Vocabulary: ${voice.vocabulary}`);
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }

  /**
   * Delete a character from database (when file is deleted)
   */
  async deleteCharacter(characterName: string): Promise<void> {
    const query = `
      DELETE FROM characters
      WHERE project_id = ? AND name = ?
    `;
    await this.mcpClient.writeQuery(query, [this.projectId, characterName]);
    console.log(`Character ${characterName} deleted`);
  }
}
