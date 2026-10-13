# Deleting Thoughts

> Safety-focused behavioral skill for removing an Open Brain thought with the `delete_thought` MCP tool.

Adapted from the upstream skill by Ezana Azene for this fork's self-hosted Docker server, where `delete_thought` is a core tool with a preview-then-confirm step.

## What It Does

`delete_thought` is a hard, irreversible delete. This skill makes the client prefer tagging a thought `superseded` over deleting it, resolve the id via search, show the preview, and delete only after an explicit "yes" for that specific thought.

## Supported Clients

- Claude Code
- Codex
- Any AI client that supports reusable skills, rules, or custom instructions and is connected to an Open Brain MCP URL

## Prerequisites

- A brain on the self-hosted Open Brain server, connected to your client (see `CLAUDE.md` → "Connect a brain to Claude Code")
- `search_thoughts` / `list_thoughts` to resolve thought ids (core tools)
- Database backups, since a confirmed delete cannot be undone

## Installation

1. Copy this skill folder into your client's skills directory (`~/.claude/skills/` or `~/.codex/skills/`).
2. Restart or reload the client so it picks up the new skill.
3. Verify by asking the client to "delete my test thought about X". It should search, show the full content, and wait for your "yes".

## Trigger Conditions

- "delete / remove / purge / wipe / get rid of that thought"
- "clean up my thoughts about X" (the skill should push back toward tagging)

## Expected Outcome

The client either tags the thought instead, or deletes exactly one confirmed thought and reports the echoed content as the record of what was removed.

## Troubleshooting

**Issue: The client wants to delete several thoughts at once.**
Solution: That is blocked by design. Each thought needs its own preview and confirmation.

**Issue: "no longer exists".**
Solution: The thought was deleted or changed between the preview and the confirmation. Search again.
