#!/usr/bin/env python3
"""
Split bundled Open Brain thoughts into atomic ones.

Uses the ingestion pipeline (LLM-powered extraction) to split multi-fact
thoughts into individual, self-contained thoughts. Works in three phases:

  1. IDENTIFY  — fetch all thoughts, match the bundled ones by content snippet
  2. DRY RUN   — re-ingest each through the LLM splitter, show proposed splits
  3. EXECUTE   — on confirmation, delete originals and commit the splits

Usage:
  # Preview what will happen (safe — no changes)
  uv run scripts/split-bundled-thoughts.py

  # Execute the splits after reviewing the dry run
  uv run scripts/split-bundled-thoughts.py --execute
"""

import argparse
import json
import sys
import httpx

# ── Configuration ────────────────────────────────────────────────────────────

API_BASE = "https://openbrain.leadetic.com/api"
API_KEY = "ob1_f5901d2190f1449811657ba0e126fffb"

HEADERS = {
    "x-brain-key": API_KEY,
    "Content-Type": "application/json",
}

# Content snippets that uniquely identify each bundled thought.
# Order doesn't matter — each snippet is matched against all thoughts.
BUNDLED_SNIPPETS = [
    # Round 3 — Claude Desktop atomic-capture skill output
    # Two testimonials in one thought
    "Eleftheria Pampoukidou (HR Manager, OTS) praising",
    # Three blog posts in one thought
    "website has a Perspectives blog",
    # Nora: role + experience + languages + LinkedIn
    "Nora Gkikopoulou is Co-Founder of Leadetic. Her role:",
    # Facilitation 3 session types bundled (also duplicate of earlier splits)
    "Facilitation service covers three session types",
    # Learning cycle 4 stages bundled (duplicate)
    "learning cycle has four stages",
    # 70-20-10 model bundled (duplicate)
    "training philosophy is grounded in the 70-20-10",
    # Advisory 3 areas bundled (duplicate)
    "Advisory service covers three areas",
    # Round 4 — Dashboard /ingest still not splitting
    # Daughter: name + birth details + divorce status
    "daughter's name is Eowyn Daira",
    # Personal: location + nationalities + languages + mother + father
    "based in Athens, Greece and have Greek and Canadian",
]


def fetch_all_thoughts(client: httpx.Client) -> list[dict]:
    """Fetch all thoughts via paginated REST API."""
    thoughts = []
    page = 1
    while True:
        resp = client.get(
            f"{API_BASE}/thoughts",
            params={"page": page, "per_page": 100},
            headers=HEADERS,
        )
        resp.raise_for_status()
        data = resp.json()
        thoughts.extend(data["data"])
        if page * data["per_page"] >= data["total"]:
            break
        page += 1
    return thoughts


def match_bundled(thoughts: list[dict]) -> list[dict]:
    """Match thoughts whose content starts with a known bundled snippet."""
    matched = []
    used_snippets = set()
    for thought in thoughts:
        content = thought["content"]
        for snippet in BUNDLED_SNIPPETS:
            if snippet in content and snippet not in used_snippets:
                matched.append(thought)
                used_snippets.add(snippet)
                break
    # Report any snippets that didn't match
    unmatched = set(BUNDLED_SNIPPETS) - used_snippets
    if unmatched:
        print(f"\n  WARNING: {len(unmatched)} snippet(s) didn't match any thought:")
        for s in unmatched:
            print(f"    - {s[:60]}...")
    return matched


def dry_run_ingest(client: httpx.Client, content: str) -> dict:
    """Submit content to the ingestion pipeline as a dry run."""
    resp = client.post(
        f"{API_BASE}/ingest",
        headers=HEADERS,
        json={"text": content, "dry_run": True, "source_label": "split-bundled"},
    )
    resp.raise_for_status()
    return resp.json()


def get_job_detail(client: httpx.Client, job_id: str) -> dict:
    """Fetch ingestion job detail including extracted items."""
    resp = client.get(
        f"{API_BASE}/ingestion-jobs/{job_id}",
        headers=HEADERS,
    )
    resp.raise_for_status()
    return resp.json()


def execute_job(client: httpx.Client, job_id: str) -> dict:
    """Execute a dry-run ingestion job (commit the splits)."""
    resp = client.post(
        f"{API_BASE}/ingestion-jobs/{job_id}/execute",
        headers=HEADERS,
    )
    resp.raise_for_status()
    return resp.json()


def delete_thought(client: httpx.Client, thought_id: str) -> bool:
    """Delete a thought by ID."""
    resp = client.delete(
        f"{API_BASE}/thought/{thought_id}",
        headers=HEADERS,
    )
    return resp.status_code == 204


def preview_split(original: dict, items: list[dict]) -> None:
    """Print a formatted preview of how a thought will be split."""
    content = original["content"]
    # Show first 80 chars of original
    preview = content[:80].replace("\n", " ")
    if len(content) > 80:
        preview += "..."

    print(f"\n{'='*70}")
    print(f"  ORIGINAL ({original['id'][:8]}...): {preview}")
    print(f"  → SPLITS INTO {len(items)} thoughts:")

    for i, item in enumerate(items, 1):
        action = item.get("action", "?")
        marker = "+" if action == "add" else "SKIP (dup)"
        item_content = item["content"][:100].replace("\n", " ")
        if len(item["content"]) > 100:
            item_content += "..."
        print(f"    {marker} {i}. [{item.get('type', '?')}] {item_content}")
        if action == "skip":
            print(f"         reason: {item.get('reason', '?')}")


def main():
    parser = argparse.ArgumentParser(description="Split bundled Open Brain thoughts")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually perform the splits (default: dry run only)",
    )
    args = parser.parse_args()

    client = httpx.Client(timeout=60)

    # ── Phase 1: Identify bundled thoughts ───────────────────────────────
    print("Phase 1: Fetching all thoughts...")
    all_thoughts = fetch_all_thoughts(client)
    print(f"  Found {len(all_thoughts)} total thoughts")

    bundled = match_bundled(all_thoughts)
    print(f"  Matched {len(bundled)} bundled thoughts to split")

    if not bundled:
        print("\nNo bundled thoughts found. Nothing to do.")
        return

    # ── Phase 2: Dry run each through the ingestion pipeline ─────────────
    print(f"\nPhase 2: Running LLM extraction on {len(bundled)} thoughts...")

    jobs: list[dict] = []  # (original_thought, job_id, items)

    for thought in bundled:
        print(f"  Processing {thought['id'][:8]}...", end=" ", flush=True)
        result = dry_run_ingest(client, thought["content"])
        job_id = result["job_id"]
        detail = get_job_detail(client, job_id)
        items = detail.get("items", [])
        print(f"→ {len(items)} atomic thoughts")
        jobs.append({"thought": thought, "job_id": job_id, "items": items})

    # ── Show preview ─────────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print("  DRY RUN RESULTS")
    print(f"{'='*70}")

    total_original = len(jobs)
    total_new = sum(
        len([i for i in j["items"] if i.get("action") == "add"]) for j in jobs
    )
    total_skip = sum(
        len([i for i in j["items"] if i.get("action") == "skip"]) for j in jobs
    )

    for job in jobs:
        preview_split(job["thought"], job["items"])

    print(f"\n{'='*70}")
    print(f"  SUMMARY: {total_original} bundled → {total_new} new + {total_skip} duplicates skipped")
    print(f"{'='*70}")

    if not args.execute:
        print("\n  This was a DRY RUN. No changes were made.")
        print("  To execute: uv run scripts/split-bundled-thoughts.py --execute")
        return

    # ── Phase 3: Execute ─────────────────────────────────────────────────
    print(f"\nPhase 3: Executing splits...")

    success = 0
    failed = 0

    for job in jobs:
        thought = job["thought"]
        tid = thought["id"]
        jid = job["job_id"]
        add_count = len([i for i in job["items"] if i.get("action") == "add"])

        if add_count == 0:
            print(f"  SKIP {tid[:8]}... — no new thoughts to add (all duplicates)")
            continue

        # Execute the ingestion job first (create the new thoughts)
        print(f"  INGEST {tid[:8]}... → {add_count} new thoughts...", end=" ", flush=True)
        try:
            execute_job(client, jid)
        except Exception as e:
            print(f"FAILED: {e}")
            failed += 1
            continue

        # Delete the original bundled thought
        if delete_thought(client, tid):
            print("done, original deleted")
            success += 1
        else:
            print("ingested but FAILED to delete original")
            failed += 1

    print(f"\n  DONE: {success} split successfully, {failed} failed")


if __name__ == "__main__":
    main()
