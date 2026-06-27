# =========================
# Deterministic Context Packager
# =========================

INPUTS:
  task_spec:
    task_type                # e.g., "continuity_check", "dev_edit", "voice_check", "pacing"
    focus                    # {chapter_id?, scene_id?, file_path?, cursor_offset?}
    scope                    # "scene" | "chapter" | "range" | "project"
    pov_hint?                # optional
    location_hint?           # optional
    explicit_entities?        # optional user-selected entities (ids/names)
    author_intent_flags       # discovery_mode, strictness, etc. (not used for selection, only output contract)
    policy                   # constraints about what can be suggested (not used here)
  project_state_fingerprint   # hash of relevant DB/file timestamps/versions
  packager_version            # e.g., "0.1.0"
  budgets:
    max_chars_text            # total chars of text snippets to include
    max_entities              # total entity records
    max_rules                 # total world rules
    max_events                # total timeline events
    max_threads               # total plot threads
    max_history_items         # editorial history items
  repositories:
    repo                      # deterministic data access layer: DB + files

OUTPUT:
  context_package:
    manifest {packager_version, input_fingerprint, selection_trace[], included_refs[]}
    pointers {focus...}
    snippets {scene_window_text, supporting_scene_texts[]}
    metadata {scene_metadata, chapter_metadata}
    entities {characters[], locations[], world_rules[]}
    plot {threads[]}
    timeline {events[]}
    derived {situation_snapshot, continuity_ledger, open_loops, delta, editorial_history}
    output_contract

# -------------------------
# Rule: Stable ordering primitives
# -------------------------
FUNCTION stable_sort(list, key_tuple):
  # must be stable and platform-consistent
  return list.sort_by(key_tuple) (stable)

FUNCTION stable_uniq(list, identity_key):
  # keeps first occurrence only, by stable order
  seen = set()
  out = []
  FOR item IN list:
    k = identity_key(item)
    IF k not in seen:
      seen.add(k)
      out.append(item)
  RETURN out

FUNCTION clamp(list, max_n):
  RETURN first max_n items (no randomness)

FUNCTION clamp_text(snippets, max_chars):
  # snippets already ordered deterministically
  out = []
  remaining = max_chars
  FOR snip IN snippets:
    take = min(len(snip.text), remaining)
    IF take <= 0: BREAK
    out.append(snip.text[0:take])
    remaining -= take
  RETURN out


# -------------------------
# Main: build_context_package
# -------------------------
FUNCTION build_context_package(task_spec, budgets, repo, packager_version, project_state_fingerprint):

  manifest = new_manifest(packager_version)

  # 0) Input fingerprint (for determinism audits)
  input_fingerprint = HASH(
    packager_version,
    project_state_fingerprint,
    canonicalize(task_spec),       # stable key order serialization
    canonicalize(budgets)
  )
  manifest.input_fingerprint = input_fingerprint

  # 1) Resolve focus deterministically
  focus = resolve_focus(task_spec, repo)
  # resolve_focus rules:
  # - if scene_id provided => use it
  # - else if file_path + cursor_offset => map to nearest scene marker
  # - else if chapter_id provided => pick first scene in chapter (or chapter scope)
  # - else => error (deterministic failure)

  manifest.trace += TRACE("focus_resolved", focus.refs)

  # 2) Assemble core scene window (text + metadata)
  scene_window = repo.get_scene_window(
    focus,
    window_policy_for(task_spec.task_type)   # deterministic mapping table
  )
  # window_policy_for examples:
  # - continuity_check => prev=1, curr=1, next=1 (scenes)
  # - voice_check      => curr only + dialogue lines only
  # - pacing           => no raw text (or curr scene only truncated)
  manifest.trace += TRACE("scene_window", scene_window.refs)

  # 3) Identify candidate entities deterministically (no interpretation)
  candidates = []

  # 3a) Entities explicitly selected by user always included (subject to existence)
  IF task_spec.explicit_entities exists:
    candidates += repo.resolve_entities(task_spec.explicit_entities)
    manifest.trace += TRACE("explicit_entities", refs(candidates))

  # 3b) Entities in the scene metadata (POV, location)
  candidates += repo.entities_from_scene_metadata(scene_window.metadata)
  manifest.trace += TRACE("scene_metadata_entities", refs(...))

  # 3c) Entities mentioned by deterministic mention extractor
  # (extractor itself must be deterministic; no LLM)
  mentions = repo.extract_mentions(scene_window.text)
  candidates += repo.resolve_entities(mentions)
  manifest.trace += TRACE("text_mentions", refs(...))

  # 3d) Entities from DB relations: appearances, scene->location, etc.
  candidates += repo.entities_from_relations(focus)
  manifest.trace += TRACE("db_relations", refs(...))

  # 3e) Stable uniq + stable sort
  candidates = stable_uniq(candidates, id)
  candidates = stable_sort(candidates, key_tuple=(entity_type_rank, entity_name, entity_id))

  # 4) Select bounded entity snippets (deterministic truncation)
  characters = clamp(filter_type(candidates, "character"), budgets.max_entities_by_type.character)
  locations  = clamp(filter_type(candidates, "location"),  budgets.max_entities_by_type.location)

  # 5) World rules selection (deterministic relevance rules, not semantic reasoning)
  # Rules are included if:
  # - referenced by tag in scene metadata OR
  # - keyword match from deterministic keyword list OR
  # - linked via explicit mapping (location->rules, plot->rules)
  rule_candidates = []
  rule_candidates += repo.rules_from_scene_metadata(scene_window.metadata)
  rule_candidates += repo.rules_from_keyword_hits(
    keywords = deterministic_keywords(scene_window.text),
    limit = budgets.max_rules * 3   # oversample then clamp deterministically
  )
  rule_candidates += repo.rules_from_entity_links(characters, locations)

  rule_candidates = stable_uniq(rule_candidates, id)
  rule_candidates = stable_sort(rule_candidates, key_tuple=(is_hard_rule DESC, category, name, id))
  world_rules = clamp(rule_candidates, budgets.max_rules)

  manifest.trace += TRACE("world_rules_selected", refs(world_rules))

  # 6) Plot threads selection (deterministic via relations)
  thread_candidates = repo.threads_touched_by_scene(focus.scene_id)
  thread_candidates += repo.threads_from_entity_links(characters)
  thread_candidates = stable_uniq(thread_candidates, id)
  thread_candidates = stable_sort(thread_candidates, key_tuple=(status_rank, priority DESC, name, id))
  threads = clamp(thread_candidates, budgets.max_threads)

  # 7) Timeline neighborhood selection
  # Deterministic neighborhood around story_timestamp if present; else chapter-local
  events = repo.timeline_neighborhood(
    anchor = scene_window.metadata.story_timestamp OR scene_window.metadata.chapter_number,
    policy = timeline_policy_for(task_spec.task_type),
    max_events = budgets.max_events
  )
  events = stable_sort(events, key_tuple=(story_timestamp, name, id))

  # 8) Derived context (deterministic transforms only)
  continuity_ledger = repo.get_continuity_ledger_slice(
    focus,
    entities = characters,
    max_items = budgets.max_ledger_items
  )

  open_loops = repo.get_open_loops(
    focus,
    threads = threads,
    max_items = budgets.max_open_loops
  )

  delta = repo.get_project_delta(
    since = task_spec.last_run_pointer OR "none",
    focus = focus,
    max_items = budgets.max_delta_items
  )

  editorial_history = repo.get_editorial_history(
    focus,
    max_items = budgets.max_history_items
  )

  situation_snapshot = repo.get_situation_snapshot(focus)  # if exists; else null
  # If not exists, packager MAY create a placeholder struct with empty fields,
  # but it must not infer goals/conflicts via LLM.
  # It can include only what is explicit in metadata + ledger.

  manifest.trace += TRACE("derived_context_built", refs(...))

  # 9) Assemble snippets with deterministic truncation
  snippets_ordered = []
  snippets_ordered += [scene_window.primary_text]
  snippets_ordered += stable_sort(scene_window.supporting_texts, key_tuple=(proximity_rank, scene_id))
  snippets = clamp_text(snippets_ordered, budgets.max_chars_text)

  # 10) Output contract (deterministic from task_type mapping table)
  output_contract = output_contract_for(task_spec.task_type)

  # 11) Final included refs (for audit)
  included_refs = collect_refs(focus, scene_window, characters, locations, world_rules, threads, events, derived)
  included_refs = stable_sort(included_refs, key_tuple=(ref_type_rank, ref_id))
  manifest.included_refs = included_refs

  # 12) Return frozen package
  return ContextPackage(
    manifest=manifest,
    focus=focus,
    snippets=snippets,
    metadata=scene_window.metadata,
    entities={characters, locations, world_rules},
    plot={threads},
    timeline={events},
    derived={situation_snapshot, continuity_ledger, open_loops, delta, editorial_history},
    output_contract=output_contract
  )


# -------------------------
# Handling explicit Context Requests (agent -> orchestrator -> packager)
# -------------------------
FUNCTION fulfill_context_request(context_package, context_request, task_spec, budgets, repo):
  # Request MUST be explicit and typed: e.g.
  # - "first_mention_scene" for character_id
  # - "rule_establishment" for world_rule_id
  # - "more_dialogue_samples" for character_id
  # Packager fulfills with deterministic retrieval and appends to package.

  manifest = context_package.manifest
  manifest.trace += TRACE("context_request_received", context_request)

  additions = repo.fulfill_request(context_request)
  additions = stable_sort(additions, key_tuple=(ref_type_rank, ref_id))

  # Merge additions without re-ranking prior selections
  new_package = merge_in_order(context_package, additions, budgets)

  manifest.trace += TRACE("context_request_fulfilled", refs(additions))
  return new_package
