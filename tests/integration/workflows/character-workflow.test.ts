/**
 * Integration Test: Complete Character Workflow
 * Tests create → edit → sync cycle
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CharacterBuilder } from '../../../project/src/builders/character-builder.js';
import { CharacterSync } from '../../../project/src/sync/character-sync.js';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { getTestProjectPath } from '../../setup.js';
import { readFile, writeFile } from 'fs/promises';
import YAML from 'yaml';
import type { CharacterYAML } from '../../../project/src/types/novel.js';

describe('Character Workflow (Integration)', () => {
  let builder: CharacterBuilder;
  let sync: CharacterSync;
  let mockClient: MockMCPClient;
  let projectPath: string;
  const projectId = 1;

  beforeEach(() => {
    projectPath = getTestProjectPath();
    builder = new CharacterBuilder({ projectPath });
    mockClient = new MockMCPClient();
    sync = new CharacterSync(mockClient, projectId);
  });

  it('should complete create-edit-sync cycle', async () => {
    // Step 1: Create character via builder
    const characterData: CharacterYAML = {
      name: 'Sarah Chen',
      role: 'protagonist',
      summary: 'A brilliant scientist',
    };

    const filePath = await builder.create(characterData);

    // Verify file created
    expect(filePath).toBeTruthy();
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('Sarah Chen');

    // Step 2: Sync to database
    await sync.syncCharacterFile(filePath);

    // Verify database record
    expect(mockClient.getRecordCount('characters')).toBe(1);

    // Step 3: Edit file (simulate user editing)
    const charData = YAML.parse(content) as CharacterYAML;
    charData.physical = {
      age: '32',
      hair: 'brown',
      eyes: 'brown',
    };
    charData.personality = {
      traits: 'Curious and determined',
    };

    await writeFile(filePath, YAML.stringify(charData));

    // Step 4: Re-sync to update database
    await sync.syncCharacterFile(filePath);

    // Verify database updated (still only 1 record)
    expect(mockClient.getRecordCount('characters')).toBe(1);

    // Step 5: Read back and verify
    const savedData = YAML.parse(await readFile(filePath, 'utf-8')) as CharacterYAML;
    expect(savedData.physical?.age).toBe('32');
    expect(savedData.personality?.traits).toBe('Curious and determined');
  });

  it('should handle multiple characters', async () => {
    // Create multiple characters
    const char1Path = await builder.create({
      name: 'Sarah Chen',
      role: 'protagonist',
      summary: 'Scientist',
    });

    const char2Path = await builder.create({
      name: 'Alex Rivers',
      role: 'major',
      summary: 'Engineer',
    });

    const char3Path = await builder.create({
      name: 'Dr. Martinez',
      role: 'minor',
      summary: 'Mentor',
    });

    // Sync all to database
    await sync.syncCharacterFile(char1Path);
    await sync.syncCharacterFile(char2Path);
    await sync.syncCharacterFile(char3Path);

    // Verify all synced
    expect(mockClient.getRecordCount('characters')).toBe(3);

    // List all characters
    const files = await builder.list();
    expect(files).toHaveLength(3);
  });

  it('should handle character arc updates', async () => {
    // Create character with arc
    const characterData: CharacterYAML = {
      name: 'Sarah Chen',
      role: 'protagonist',
      summary: 'A brilliant scientist',
      arc: {
        startingState: 'Isolated and driven',
        endingState: 'Connected and balanced',
      },
    };

    const filePath = await builder.create(characterData);
    await sync.syncCharacterFile(filePath);

    // Update arc with midpoint crisis
    const content = await readFile(filePath, 'utf-8');
    const charData = YAML.parse(content) as CharacterYAML;
    charData.arc!.midpointCrisis = 'Must choose between truth and safety';

    await writeFile(filePath, YAML.stringify(charData));
    await sync.syncCharacterFile(filePath);

    // Verify update
    const updated = YAML.parse(await readFile(filePath, 'utf-8')) as CharacterYAML;
    expect(updated.arc?.midpointCrisis).toBe('Must choose between truth and safety');
  });

  it('should handle validation errors gracefully', async () => {
    // Try to create invalid character (missing required fields)
    const invalidData = {
      name: 'Sarah Chen',
      // Missing role and summary
    } as any;

    const errors = builder.validate(invalidData);
    expect(errors.length).toBeGreaterThan(0);

    // Should not create file for invalid data
    // (In actual implementation, create() should validate first)
  });
});
