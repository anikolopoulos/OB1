# Open Brain — TODO

## High Priority

- [ ] **Backfill content fingerprints on existing thoughts** — Only 3/59 thoughts in Alex's brain have fingerprints. Run the backfill recipe to compute SHA-256 fingerprints for all pre-existing thoughts so dedup works correctly.

- [ ] **Fix dashboard "Last null days" bug** — The dashboard home page shows "Last null days" because the stats endpoint returns `window_days: "all"` (string) but the component expects a number. Quick fix in the stats handler or the dashboard page.

## Medium Priority

- [ ] **Adapt 3 remaining old recipes to Docker/LiteLLM** — `chatgpt-conversation-import`, `email-history-import`, and `source-filtering` still have Supabase references in their code (39 occurrences). READMEs were updated but the scripts won't run against the Docker deployment.

- [ ] **Install useful skills into Claude Code** — 10 skill packs synced from upstream but none installed. Candidates: `auto-capture` (saves insights at session close), `panning-for-gold` (research discovery workflow).

## Lower Priority

- [ ] **Dashboard design review** — Apply Leadetic style guide to the dashboard. Current upstream dark theme is functional but generic.

- [ ] **Slack capture end-to-end test** — Webhook was hardened (retry logic, auth, fingerprint dedup) but not tested since changes.

- [ ] **Nora's onboarding** — Create a simple guide for Nora to use the dashboard at `ob.leadetic.com` with her API key.
