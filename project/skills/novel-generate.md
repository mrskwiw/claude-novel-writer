---
name: novel-generate
description: >
  Use this skill when the user wants AI help generating content for their novel:
  continuing a scene, writing dialogue, describing a location, developing a
  character, writing a synopsis, query letter, pitch, or finding comparable
  titles. Trigger phrases include: "continue this scene", "what happens next",
  "write a synopsis", "help me with my query letter", "generate a pitch",
  "what books are similar to mine", "describe this location", "develop this
  character", "next sentence", "I'm stuck".
version: 0.1.0
---

# Novel AI Generation

All generation requires `ANTHROPIC_API_KEY` to be set in the environment.

## Continue a scene (3 alternatives)
```bash
novel-writer generate scene --scene-id <N>
novel-writer generate scene --scene-id <N> --count 5   # more alternatives
```
Loads full scene context (characters, location, world rules, recent chapters) before generating.

## One-true-sentence mode (Hemingway)
```bash
novel-writer generate next-sentence --scene-id <N>
```
Generates the single most true next sentence. Good for writer's block.

## Submission materials
```bash
novel-writer generate synopsis          # full synopsis
novel-writer generate pitch             # one-paragraph pitch
novel-writer generate query             # query letter draft
novel-writer generate comps             # comparable titles
```

## Character & world building
```bash
novel-writer generate character --id <N>          # full character profile
novel-writer generate name --role villain         # name suggestions
novel-writer generate name --place city           # place name suggestions
```

## Development tools
```bash
novel-writer generate premise           # workshop your premise
novel-writer generate sketch --name "Ada"   # quick character sketch
```

## Opening lines workshop
```bash
novel-writer generate opening-lines     # 5 alternative opening lines for the manuscript
```
