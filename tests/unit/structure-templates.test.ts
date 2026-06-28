/**
 * Unit tests: src/data/structure-templates.ts (pure, deterministic helpers).
 */

import { describe, it, expect } from 'vitest';
import {
  STRUCTURE_TEMPLATES,
  listTemplates,
  getTemplate,
  beatTargetWord,
  buildAppliedPlan,
  computeStructureStatus,
  templateFromPlan,
  type AppliedStructurePlan,
} from '../../project/src/data/structure-templates.js';

describe('structure-templates data', () => {
  it('exposes exactly three built-in templates', () => {
    const ids = listTemplates().map((t) => t.id).sort();
    expect(ids).toEqual(['heros-journey', 'save-the-cat', 'three-act']);
  });

  it('every beat position is within 0..1 and templates start at 0 / end at 1', () => {
    for (const t of listTemplates()) {
      for (const b of t.beats) {
        expect(b.position).toBeGreaterThanOrEqual(0);
        expect(b.position).toBeLessThanOrEqual(1);
      }
      expect(t.beats[0].position).toBe(0);
      expect(t.beats[t.beats.length - 1].position).toBe(1);
    }
  });

  it('save-the-cat has 15 beats and heros-journey has 12', () => {
    expect(STRUCTURE_TEMPLATES['save-the-cat'].beats).toHaveLength(15);
    expect(STRUCTURE_TEMPLATES['heros-journey'].beats).toHaveLength(12);
  });

  it('getTemplate returns undefined for unknown ids', () => {
    expect(getTemplate('nope')).toBeUndefined();
    expect(getTemplate('three-act')?.id).toBe('three-act');
  });

  it('beatTargetWord rounds position * target', () => {
    expect(beatTargetWord(0.5, 90000)).toBe(45000);
    expect(beatTargetWord(0.1, 90001)).toBe(9000);
  });

  it('buildAppliedPlan resolves target words and is stamped', () => {
    const when = new Date('2026-06-28T00:00:00.000Z');
    const plan = buildAppliedPlan(getTemplate('three-act')!, 80000, when);
    expect(plan.appliedAt).toBe('2026-06-28T00:00:00.000Z');
    expect(plan.targetWordCount).toBe(80000);
    expect(plan.beats[plan.beats.length - 1].targetWord).toBe(80000);
    expect(plan.beats.find((b) => b.id === 'midpoint')?.targetWord).toBe(40000);
  });

  it('computeStructureStatus labels passed / due / upcoming and finds next beat', () => {
    const template = getTemplate('three-act')!;
    // 30000 / 90000 = 33% → past first plot point (22500), before midpoint (45000)
    const report = computeStructureStatus(template, 90000, 30000);
    expect(report.currentWords).toBe(30000);
    expect(report.fractionComplete).toBeCloseTo(0.3333, 3);
    expect(report.nextBeat?.beat.id).toBe('midpoint');
    expect(report.wordsToNextBeat).toBe(15000);

    const opening = report.beats.find((b) => b.beat.id === 'opening-image')!;
    expect(opening.label).toBe('passed');
    expect(opening.reached).toBe(true);

    const resolution = report.beats.find((b) => b.beat.id === 'resolution')!;
    expect(resolution.label).toBe('upcoming');
    expect(resolution.reached).toBe(false);
  });

  it('computeStructureStatus marks within-tolerance beats as due', () => {
    const template = getTemplate('three-act')!;
    // exactly at midpoint target (45000), tolerance 5% = 4500
    const report = computeStructureStatus(template, 90000, 45000);
    const mid = report.beats.find((b) => b.beat.id === 'midpoint')!;
    expect(mid.label).toBe('due');
    expect(mid.reached).toBe(true);
  });

  it('computeStructureStatus: all reached → nextBeat null', () => {
    const template = getTemplate('three-act')!;
    const report = computeStructureStatus(template, 90000, 200000);
    expect(report.nextBeat).toBeNull();
    expect(report.wordsToNextBeat).toBeNull();
    expect(report.reachedCount).toBe(template.beats.length);
  });

  it('computeStructureStatus tolerates a zero target word count', () => {
    const template = getTemplate('three-act')!;
    const report = computeStructureStatus(template, 0, 0);
    expect(report.fractionComplete).toBe(0);
    // every beat target is 0 → all reached, none upcoming
    expect(report.reachedCount).toBe(template.beats.length);
    expect(report.nextBeat).toBeNull();
  });

  it('templateFromPlan reconstructs a usable template from a saved plan', () => {
    const plan: AppliedStructurePlan = {
      template: 'custom-x',
      templateName: 'Custom X',
      targetWordCount: 10000,
      appliedAt: '2026-06-28T00:00:00.000Z',
      beats: [
        { id: 'a', name: 'A', position: 0, targetWord: 0, description: 'start' },
        { id: 'b', name: 'B', position: 1, targetWord: 10000, description: 'end' },
      ],
    };
    const template = templateFromPlan(plan);
    expect(template.id).toBe('custom-x');
    expect(template.beats).toHaveLength(2);
    const report = computeStructureStatus(template, plan.targetWordCount, 5000);
    expect(report.nextBeat?.beat.id).toBe('b');
  });
});
