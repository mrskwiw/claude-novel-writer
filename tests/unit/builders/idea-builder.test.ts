import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { IdeaBuilder } from '../../../project/src/builders/idea-builder.js';

describe('IdeaBuilder', () => {
  let testDir: string;
  let builder: IdeaBuilder;

  beforeEach(async () => {
    testDir = join(process.cwd(), `test-idea-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    builder = new IdeaBuilder(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('quickAdd creates a YAML file with correct key format', async () => {
    const idea = await builder.quickAdd('A wizard discovers a hidden library');
    expect(idea.ideaKey).toMatch(/^a-wizard-discovers-a-hidden-/);
    expect(idea.content).toBe('A wizard discovers a hidden library');
    expect(idea.status).toBe('active');
    expect(idea.tags).toEqual([]);
  });

  it('quickAdd with tags stores them', async () => {
    const idea = await builder.quickAdd('Dragon flies over city', ['fantasy', 'dragon']);
    expect(idea.tags).toEqual(['fantasy', 'dragon']);
  });

  it('list returns all ideas', async () => {
    await builder.quickAdd('Idea one');
    await builder.quickAdd('Idea two');
    const ideas = await builder.list();
    expect(ideas.length).toBe(2);
  });

  it('list filters by tag', async () => {
    await builder.quickAdd('Tagged idea', ['magic']);
    await builder.quickAdd('No tag idea');
    const filtered = await builder.list({ tag: 'magic' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].content).toBe('Tagged idea');
  });

  it('list filters by status', async () => {
    const idea = await builder.quickAdd('Active idea');
    await builder.quickAdd('Another active');
    await builder.updateStatus(idea.ideaKey, 'used');
    const active = await builder.list({ status: 'active' });
    expect(active.length).toBe(1);
    const used = await builder.list({ status: 'used' });
    expect(used.length).toBe(1);
  });

  it('get returns idea by key', async () => {
    const created = await builder.quickAdd('Specific idea');
    const retrieved = await builder.get(created.ideaKey);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toBe('Specific idea');
  });

  it('get returns null for missing key', async () => {
    expect(await builder.get('nonexistent-key')).toBeNull();
  });

  it('updateStatus changes status', async () => {
    const idea = await builder.quickAdd('Test idea');
    await builder.updateStatus(idea.ideaKey, 'discarded');
    const retrieved = await builder.get(idea.ideaKey);
    expect(retrieved!.status).toBe('discarded');
  });

  it('link stores entity type and name', async () => {
    const idea = await builder.quickAdd('Link test');
    await builder.link(idea.ideaKey, 'character', 'Mira');
    const retrieved = await builder.get(idea.ideaKey);
    expect(retrieved!.linkedEntityType).toBe('character');
    expect(retrieved!.linkedEntityName).toBe('Mira');
  });

  it('addNote appends note text', async () => {
    const idea = await builder.quickAdd('Note test');
    await builder.addNote(idea.ideaKey, 'First note');
    await builder.addNote(idea.ideaKey, 'Second note');
    const retrieved = await builder.get(idea.ideaKey);
    expect(retrieved!.notes).toContain('First note');
    expect(retrieved!.notes).toContain('Second note');
  });
});
