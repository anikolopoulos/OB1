---
name: updating-thoughts
description: |
  Use when editing, correcting, rewriting, re-tagging, re-classifying, or
  annotating an existing Open Brain thought — "update that note", "fix the
  thought about X", "add a status/tag to it", "mark it superseded". Uses the
  update_thought tool on the core Open Brain MCP server. Not for creating a new
  thought (that is capture) or removing one (see deleting-thoughts).
author: Ezana Azene
version: 1.0.0-docker
---

# Updating Thoughts

## Overview

`update_thought` on the core Open Brain server changes an existing thought.
Choosing *how* to update is the non-obvious part: tagging and rewriting behave
and cost differently, the tool acts on a thought's **UUID** (it will not look
one up for you), and every change goes through a **preview, then confirm**
step.

## When to Use

- Correcting a thought's text (factual error, transcription mistake, missing
  context that makes it self-contained)
- Re-classifying or tagging it (status, review flags, cross-references)
- Annotating it without touching the wording

Not for: adding a new idea or later reflection to an old thought — capture a
new thought instead; thoughts are atomic. Not for removing one — if the thought
is outdated or wrong, prefer tagging it `superseded` over deleting (see the
**deleting-thoughts** skill).

## Process

1. **Resolve the id first.** Use `search_thoughts` / `list_thoughts` to find
   the target and confirm it is the right one. Never guess a UUID.
2. **Pick the mode:**
   - Tag / re-classify only → pass `metadata_patch` without `new_content`.
     Shallow-merges keys, leaves content and unmentioned keys alone. **No
     re-embedding and no AI re-extraction.**
   - Change the wording → pass `new_content`: the complete final text, never a
     diff or instruction. Re-embeds and re-extracts metadata so search stays
     accurate.
   - Both → pass both; `metadata_patch` is applied on top of the re-extracted
     metadata.
3. **Preview.** Call `update_thought` without `confirm`. It returns a BEFORE /
   AFTER preview and changes nothing.
4. **Confirm with the user.** Show the preview verbatim and wait for an
   explicit "yes" for *that specific* thought.
5. **Apply.** Call again with the same arguments plus `confirm: true`.

One thought at a time. Never batch-confirm.

## Quick Reference

| Goal | Arguments | Re-embeds? |
|------|-----------|-----------|
| Add/change tags, status, links | `{ id, metadata_patch }` | No |
| Rewrite the note text | `{ id, new_content }` | Yes |
| Both | `{ id, new_content, metadata_patch }` | Yes |
| Apply after the user says yes | same arguments + `confirm: true` | — |

`metadata_patch` is a **merge, not a replace**: `{"status": "superseded"}` adds
or overwrites only `status` and keeps everything else.

## Output

The confirmed call returns what changed: BEFORE / AFTER content for a rewrite,
and the merged keys for a metadata patch. Report it to the user.

## Common Mistakes

- Using `new_content` just to add a tag — wastes AI calls; use `metadata_patch`.
- Appending new information to an old thought — capture a new thought instead.
- Skipping the preview, or applying a different payload than the user approved.
- Expecting `metadata_patch` to replace the whole metadata object — it merges.
- Skipping the search step and passing a half-remembered UUID.

## Notes

- If the new content exactly matches another stored thought, the update is
  refused. Find the other thought and merge or delete one of them first.
- This fork's `update_thought` has no `if_unchanged_since` option; the
  preview-then-confirm step is the guard against editing the wrong version.
