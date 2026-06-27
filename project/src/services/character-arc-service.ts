/**
 * CharacterArcService — SPEC-09
 *
 * Tracks character emotional states per scene and derives arc completeness,
 * static run detection, and multi-character comparisons.
 */

import type { MCPClient } from '../core/database.js';
import type {
  CharacterArc,
  CharacterSceneState,
  CharacterState,
} from '../types/novel.js';
import { generateId } from '../utils/ids.js';

/** All valid CharacterState values — used for runtime validation. */
const VALID_STATES = new Set<CharacterState>([
  'hopeful',
  'determined',
  'fearful',
  'angry',
  'grieving',
  'joyful',
  'confused',
  'resigned',
  'transformed',
  'neutral',
  'tense',
  'melancholic',
]);

/**
 * Returns true if `value` is a valid `CharacterState`.
 */
export function isValidCharacterState(value: string): value is CharacterState {
  return VALID_STATES.has(value as CharacterState);
}

/**
 * Detect indices (scene orders) where a static run of 3+ consecutive identical
 * states begins.
 *
 * @param states Ordered array of state records (chapter_number / scene_order ascending)
 * @returns Array of `sceneOrder` values at which each qualifying static run starts
 */
function detectStaticRuns(
  states: CharacterArc['states']
): number[] {
  if (states.length < 3) return [];

  const runStarts: number[] = [];
  let runLen = 1;

  for (let i = 1; i < states.length; i++) {
    if (states[i].state === states[i - 1].state) {
      runLen++;
      if (runLen === 3) {
        // Record the scene order where this run started (i - 2)
        runStarts.push(states[i - 2].sceneOrder);
      }
    } else {
      runLen = 1;
    }
  }

  return runStarts;
}

export class CharacterArcService {
  constructor(private readonly client: MCPClient) {}

  /**
   * Record (or update) a character's emotional state for a given scene.
   * Uses ON CONFLICT DO UPDATE so repeated syncs are idempotent.
   *
   * @param projectId   Novel project identifier
   * @param characterId Database id of the character
   * @param sceneId     Database id of the scene
   * @param state       Emotional state to record
   * @param notes       Optional context notes
   */
  async recordState(
    projectId: string,
    characterId: number,
    sceneId: number,
    state: CharacterState,
    notes?: string
  ): Promise<void> {
    const id = generateId();
    const recordedAt = new Date().toISOString();

    await this.client.writeQuery(
      `INSERT INTO character_scene_states
         (id, project_id, character_id, scene_id, state, notes, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(character_id, scene_id) DO UPDATE SET
         state       = excluded.state,
         notes       = excluded.notes,
         recorded_at = excluded.recorded_at`,
      [id, projectId, characterId, sceneId, state, notes ?? null, recordedAt]
    );
  }

  /**
   * Retrieve the full arc for a named character, ordered chronologically.
   *
   * @param projectId     Novel project identifier
   * @param characterName Exact character name (case-insensitive lookup)
   * @returns `CharacterArc` or `null` if the character or no states exist
   */
  async getArc(
    projectId: string,
    characterName: string
  ): Promise<CharacterArc | null> {
    const rows = await this.client.readQuery(
      `SELECT
         css.state,
         s.scene_number  AS scene_order,
         s.title         AS scene_title,
         c.chapter_number,
         ch.name         AS character_name
       FROM character_scene_states css
       JOIN scenes     s  ON css.scene_id     = s.id
       JOIN chapters   c  ON s.chapter_id     = c.id
       JOIN characters ch ON css.character_id = ch.id
       WHERE css.project_id = ?
         AND LOWER(ch.name) = LOWER(?)
       ORDER BY c.chapter_number ASC, s.scene_number ASC`,
      [projectId, characterName]
    );

    if (rows.length === 0) return null;

    const states: CharacterArc['states'] = rows.map(
      (r: Record<string, unknown>) => ({
        chapterNumber: r.chapter_number as number,
        sceneOrder: r.scene_order as number,
        state: r.state as CharacterState,
        sceneTitle: (r.scene_title as string | null) ?? '',
      })
    );

    const resolvedName: string =
      (rows[0] as Record<string, unknown>).character_name as string;

    return {
      characterName: resolvedName,
      states,
      isComplete:
        states.length > 1
          ? states[0].state !== states[states.length - 1].state
          : false,
      staticRuns: detectStaticRuns(states),
    };
  }

  /**
   * Compare the arcs of two named characters side-by-side.
   *
   * @param projectId Novel project identifier
   * @param nameA     First character name
   * @param nameB     Second character name
   * @returns Object with `a` and `b` arcs (either may be null)
   */
  async compareArcs(
    projectId: string,
    nameA: string,
    nameB: string
  ): Promise<{ a: CharacterArc | null; b: CharacterArc | null }> {
    const [a, b] = await Promise.all([
      this.getArc(projectId, nameA),
      this.getArc(projectId, nameB),
    ]);
    return { a, b };
  }

  /**
   * Return all character states recorded for scenes belonging to a given chapter.
   *
   * @param projectId     Novel project identifier
   * @param chapterNumber The chapter number to inspect
   * @returns Array of `{ characterName, state, sceneTitle }` rows
   */
  async getSceneStates(
    projectId: string,
    chapterNumber: number
  ): Promise<Array<{ characterName: string; state: CharacterState; sceneTitle: string }>> {
    const rows = await this.client.readQuery(
      `SELECT
         ch.name         AS character_name,
         css.state,
         s.title         AS scene_title
       FROM character_scene_states css
       JOIN scenes     s  ON css.scene_id     = s.id
       JOIN chapters   c  ON s.chapter_id     = c.id
       JOIN characters ch ON css.character_id = ch.id
       WHERE css.project_id  = ?
         AND c.chapter_number = ?
       ORDER BY s.scene_number ASC, ch.name ASC`,
      [projectId, chapterNumber]
    );

    return rows.map((r: Record<string, unknown>) => ({
      characterName: r.character_name as string,
      state: r.state as CharacterState,
      sceneTitle: (r.scene_title as string | null) ?? '',
    }));
  }
}
