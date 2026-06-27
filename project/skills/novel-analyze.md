---
name: novel-analyze
description: >
  Use this skill when the user wants feedback on their writing quality, prose
  style, pacing, show-vs-tell ratio, POV consistency, sentence variety, sensory
  balance, dialogue attribution, or wants to hear their work read aloud. Trigger
  phrases include: "analyze my writing", "is my pacing good", "too much telling",
  "check my prose", "how's my style", "POV slips", "tense consistency", "read
  aloud prep", "tension arc", "chapter lengths".
version: 0.1.0
---

# Novel Analysis Tools

## Prose analysis (sentence-level quality)
```bash
novel-writer analyze prose
novel-writer analyze prose --chapter 3       # single chapter
```
Reports: economy score, show/tell ratio, sensory balance (visual/auditory/tactile/taste/smell), character voice distinctiveness, dialogue breakdown by character.

## Pacing analysis (story-level structure)
```bash
novel-writer analyze pacing
```
Reports: tension arc across chapters (ASCII chart), POV balance per character, chapter length distribution, pacing anomalies (flat tension, sudden spikes).

## Copy editing (mechanical errors)
```bash
novel-writer analyze copy
novel-writer analyze copy --chapter 3
```
Checks: POV slips (head-hopping within a scene), tense shifts (> 20% inconsistency), name variants (possible misspellings of character names).

## Developmental editing (structure)
```bash
novel-writer analyze developmental
```
Audits: scene purpose (does each scene advance plot or character?), subplot balance (neglected or overdone threads), plot holes (promised setups without payoff).

## Read-aloud preparation
```bash
novel-writer draft readaloud --chapter 3
```
Strips markdown, flags rhythm anomalies, detects accidental rhymes, highlights long sentences that may trip readers.
