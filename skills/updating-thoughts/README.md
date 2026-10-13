# Updating Thoughts

> Behavioral skill for editing an existing Open Brain thought with the `update_thought` MCP tool.

Adapted from the upstream skill by Ezana Azene for this fork's self-hosted Docker server, where `update_thought` is a core tool with a preview-then-confirm step and an optional `metadata_patch`.

## What It Does

Teaches an AI client *how* and *when* to edit a stored thought: resolve the thought's UUID first, choose between a cheap metadata tag (`metadata_patch`, no re-embedding) and a content rewrite that re-embeds (`new_content`), show the preview, and apply only after the user confirms.

## Supported Clients

- Claude Code
- Codex
- Any AI client that supports reusable skills, rules, or custom instructions and is connected to an Open Brain MCP URL

## Prerequisites

- A brain on the self-hosted Open Brain server, connected to your client (see `CLAUDE.md` → "Connect a brain to Claude Code")
- `search_thoughts` / `list_thoughts` to resolve thought ids (core tools)

## Installation

1. Copy this skill folder into your client's skills directory (`~/.claude/skills/` or `~/.codex/skills/`).
2. Restart or reload the client so it picks up the new skill.
3. Verify by asking the client to "mark my thought about X as superseded". It should search, show a preview with the metadata change, and wait for your "yes".

## Trigger Conditions

- "update / edit / correct / rewrite that thought"
- "re-tag / re-classify / mark as superseded / add a status to"
- "annotate the note about X without changing the wording"

## Expected Outcome

The client resolves the thought's id via search, picks the right update mode, shows a preview, and after your confirmation reports what changed.

## Troubleshooting

**Issue: The client asks for a UUID.**
Solution: That is expected — it should search first. Point it at `search_thoughts` / `list_thoughts`.

**Issue: A tag change re-embedded the whole thought.**
Solution: Use `metadata_patch` without `new_content`. Only `new_content` triggers re-embedding.

**Issue: "another thought already has this exact content".**
Solution: The new text duplicates a stored thought. Find it with `search_thoughts` and merge or delete one of them.
