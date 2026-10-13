---
name: deleting-thoughts
description: |
  Use when asked to delete, remove, purge, wipe, or "get rid of" an Open Brain
  thought, or before calling delete_thought on the core Open Brain MCP server,
  which HARD-deletes with no undo. Also use when tempted to delete a thought that
  is merely outdated or wrong. To edit or deprecate instead of removing, see
  updating-thoughts.
author: Ezana Azene
version: 1.0.0-docker
---

# Deleting Thoughts

## Overview

`delete_thought` performs a **hard delete**: once confirmed, the row is gone,
with no tombstone, no soft-delete, and no restore. Recovery depends entirely on
database backups. The Open Brain stance is **"deprecate and version rather than
delete."** So deletion is a last resort, and every delete must target an id you
verified this session.

**Violating the letter of these rules is violating their spirit.**

## When to Use

Delete only when **both** hold:
- The thought is genuinely disposable — a test/throwaway, an exact duplicate, or
  an accidental capture, **and**
- Editing or tagging it is not good enough.

If the thought is merely outdated, wrong, or superseded, **update it or tag it**
`superseded` instead (`update_thought` with `metadata_patch`) — see the
**updating-thoughts** skill.

## Process

1. **Resolve the id via `search_thoughts` / `list_thoughts`.** Never delete an
   id you typed from memory.
2. **Preview.** Call `delete_thought({ id })` without `confirm`. It returns the
   thought's full content and deletes nothing.
3. **Confirm with the user.** Show the preview verbatim and get an explicit
   "yes" for *that specific* thought.
4. **Delete.** Call `delete_thought({ id, confirm: true })`. It echoes the
   deleted content. Report that echo to the user; it is the only record left.

One id, one preview, one confirmation, one delete. There is no bulk mode.

## This Is Irreversible — No Exceptions

- No undo, no trash, no restore. Backups only.
- Don't batch-delete "to clean up" without confirming **each** id.
- Don't delete when the user said "update", "fix", "archive", or "deprecate" —
  those are updates, not deletes.
- Don't guess a UUID; a wrong guess deletes the wrong memory permanently.

## Red Flags — STOP

- About to call `delete_thought` with `confirm: true` on an id you did **not**
  get from a search this session.
- Deleting more than one thought from a single vague instruction.
- The user's word was "clean up / tidy / archive / outdated" — not an explicit
  "delete".
- You have not shown the preview to the user and gotten confirmation.

**All of these mean: pause, search, show the thought, and confirm first.**

## Rationalizations — and Reality

| Excuse | Reality |
|--------|---------|
| "It's obviously junk." | Show it and confirm anyway — "obvious" is exactly where wrong deletes happen. |
| "Faster to delete than to tag." | Speed never justifies an irreversible loss. Tag it `superseded` instead. |
| "The user probably meant this one." | Probably ≠ confirmed. Resolve the id and show it. |
| "I'll just re-capture if it was wrong." | Re-capture loses the original timestamp, metadata, and links. |

## Output

The confirmed call echoes the deleted thought's id and content. Always report
it so there is a record of what was removed.
