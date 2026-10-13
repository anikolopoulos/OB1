#!/usr/bin/env bash
# End-to-end checks for deploy/: boots Postgres (deploy/db/init), a mock AI
# gateway and the app from this checkout, applies every migration twice to a
# production-shaped legacy brain, and exercises MCP, REST and the fingerprint
# trigger. Everything runs in containers; the stack is removed on exit.
#
#   deploy/test/smoke.sh
#
# Exit 0 when every check passes, 1 at the first failure.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
deploy="$(dirname "$here")"
export SMOKE_PORT="${SMOKE_PORT:-3099}" SMOKE_LLM_PORT="${SMOKE_LLM_PORT:-3098}"
project="ob1-smoke-$$"
dc() { docker compose -p "$project" -f "$here/compose.yml" "$@"; }
trap 'dc down -v --rmi local --remove-orphans >/dev/null 2>&1' EXIT

base="http://127.0.0.1:$SMOKE_PORT"
fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok   $*"; }
psql_file() { dc exec -T postgres psql -U ob1 -d ob1 -v ON_ERROR_STOP=1 -q "$@" >/dev/null; }
sql() { dc exec -T postgres psql -U ob1 -d ob1 -v ON_ERROR_STOP=1 -tAc "$1"; }
llm_calls() { curl -sf "http://127.0.0.1:$SMOKE_LLM_PORT/calls" | sed 's/[^0-9]//g'; }
# Arguments are built in $args first: bash 3.2 (macOS) brace-expands a quoted
# "{...,...}" nested inside "$(...)".
# mcp <key> <tool> <arguments-json> → the tool's first text block (raw response if unreadable)
mcp() {
  local raw
  raw="$(curl -s -X POST "$base/mcp?key=$1" -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$2\",\"arguments\":$3}}")"
  printf '%s' "$raw" | sed -n 's/^data: //p' \
    | docker run --rm -i node:22-bookworm-slim node -e \
        'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result.content[0].text))' \
        2>/dev/null || printf 'UNREADABLE RESPONSE: %s' "$raw"
}
expect_in() { case "$2" in *"$1"*) ;; *) fail "$3 — expected \"$1\" in: $2" ;; esac; }

echo "== boot"
dc up -d --build --quiet-pull >/dev/null 2>&1 || { dc logs --tail 30; fail "stack did not start"; }
for _ in $(seq 1 90); do curl -sf "$base/health" >/dev/null && break; sleep 1; done
curl -sf "$base/health" >/dev/null || { dc logs app --tail 30; fail "app not healthy"; }
pass "stack up"

echo "== fresh install (deploy/db/init only)"
# Checked before any migration runs: the migrations redefine the same
# function, so a drift in init 015 would otherwise be masked.
sql "SELECT public.clone_brain_schema('brain_template', 'brain_init')" >/dev/null
psql_file -v schema=brain_init < "$here/assert-trigger.sql" || fail "trigger from deploy/db/init"
pass "init scripts install a working trigger"

echo "== migrations on a production-shaped brain"
psql_file < "$here/legacy-brain.sql"
for f in "$deploy"/db/migrations/*.sql; do
  psql_file < "$f" || fail "$(basename "$f") run 1"
  psql_file < "$f" || fail "$(basename "$f") run 2 (not idempotent)"
done
psql_file < "$here/assert-migrated-legacy.sql" || fail "migrated legacy brain state"
psql_file -v schema=brain_legacy < "$here/assert-trigger.sql" || fail "trigger on migrated brain"
pass "migrations applied twice; legacy brain repaired and guarded"

echo "== brain created through the admin API"
key="$(curl -sf -X POST "$base/admin/brains" -H 'Authorization: Bearer smoke-admin' \
  -H 'Content-Type: application/json' -d '{"slug":"smoke","display_name":"Smoke"}' \
  | sed -n 's/.*"api_key":"\([^"]*\)".*/\1/p')"
[ -n "$key" ] || fail "brain creation returned no api_key"
legacy_key="$(curl -sf -X POST "$base/admin/brains/legacy/api-keys" -H 'Authorization: Bearer smoke-admin' \
  | sed -n 's/.*"api_key":"\([^"]*\)".*/\1/p')"
[ -n "$legacy_key" ] || fail "legacy api key creation returned no api_key"
psql_file -v schema=brain_smoke < "$here/assert-trigger.sql" || fail "trigger on newly cloned brain"
pass "new brain clones the trigger"

echo "== /mcp methods"
code="$(curl -s -m 3 -o /dev/null -w '%{http_code}' -H 'Accept: text/event-stream' "$base/mcp?key=$key" || true)"
[ "$code" = 405 ] || fail "GET /mcp returned $code (want 405 within 3s)"
code="$(curl -s -m 3 -o /dev/null -w '%{http_code}' -X DELETE "$base/mcp?key=$key" || true)"
[ "$code" = 405 ] || fail "DELETE /mcp returned $code"
tools="$(curl -sf -X POST "$base/mcp?key=$key" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | grep -o '"name":"update_thought"' || true)"
[ -n "$tools" ] || fail "tools/list over POST does not list update_thought"
pass "GET and DELETE refused with 405; POST serves tools"

echo "== capture dedup"
expect_in "Captured" "$(mcp "$key" capture_thought '{"content":"alpha thought"}')" "first capture"
expect_in "duplicate" "$(mcp "$key" capture_thought '{"content":"Alpha   THOUGHT"}')" "second capture"
[ "$(sql "SELECT count(*) FROM brain_smoke.thoughts WHERE content ILIKE 'alpha%'")" = 1 ] || fail "duplicate capture stored twice"
pass "re-capturing the same text merges"

echo "== REST content edit onto existing content returns 409"
mcp "$key" capture_thought '{"content":"beta thought"}' >/dev/null
alpha="$(sql "SELECT id FROM brain_smoke.thoughts WHERE content = 'alpha thought'")"
code="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$base/api/thought/$alpha" -H "x-brain-key: $key" \
  -H 'Content-Type: application/json' -d '{"content":"BETA thought"}')"
[ "$code" = 409 ] || fail "cloned brain: duplicate edit returned $code"
sql "SET search_path = brain_legacy; SELECT * FROM upsert_thought('legacy alpha')" >/dev/null
sql "SET search_path = brain_legacy; SELECT * FROM upsert_thought('legacy beta')" >/dev/null
legacy_alpha="$(sql "SELECT id FROM brain_legacy.thoughts WHERE content = 'legacy alpha'")"
code="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$base/api/thought/$legacy_alpha" -H "x-brain-key: $legacy_key" \
  -H 'Content-Type: application/json' -d '{"content":"legacy beta"}')"
[ "$code" = 409 ] || fail "legacy-named index: duplicate edit returned $code"
code="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$base/api/thought/$alpha" -H "x-brain-key: $key" \
  -H 'Content-Type: application/json' -d '{"content":"alpha rewritten"}')"
[ "$code" = 200 ] || fail "plain edit returned $code"
[ "$(sql "SELECT content_fingerprint = encode(sha256(convert_to('alpha rewritten','UTF8')),'hex') FROM brain_smoke.thoughts WHERE id = '$alpha'")" = t ] \
  || fail "REST edit left a stale fingerprint"
pass "409 on both index names; plain edit refreshes the fingerprint"

echo "== update_thought metadata_patch"
id="$alpha"
before="$(llm_calls)"
args="{\"id\":\"$id\",\"metadata_patch\":{\"status\":\"superseded\"}}"
expect_in "PREVIEW" "$(mcp "$key" update_thought "$args")" "patch preview"
[ "$(sql "SELECT metadata ? 'status' FROM brain_smoke.thoughts WHERE id = '$id'")" = f ] || fail "preview changed the thought"
args="{\"id\":\"$id\",\"metadata_patch\":{\"status\":\"superseded\"},\"confirm\":true}"
expect_in "Updated metadata" "$(mcp "$key" update_thought "$args")" "patch confirm"
[ "$(sql "SELECT metadata->>'status' FROM brain_smoke.thoughts WHERE id = '$id'")" = superseded ] || fail "patch not merged"
[ "$(sql "SELECT metadata ? 'status_updated_at' AND metadata ? 'topics' FROM brain_smoke.thoughts WHERE id = '$id'")" = t ] \
  || fail "status_updated_at not stamped, or existing keys lost"
[ "$(llm_calls)" = "$before" ] || fail "metadata-only edit called the AI gateway"
pass "patch previews, merges, stamps status_updated_at, makes no AI call"

args="{\"id\":\"$id\",\"metadata_patch\":{\"source\":\"x\"}}"

expect_in "cannot change: source" "$(mcp "$key" update_thought "$args")" "forbidden key"
args="{\"id\":\"$id\",\"metadata_patch\":{\"importance\":\"high\"}}"
expect_in "Invalid metadata_patch: importance" "$(mcp "$key" update_thought "$args")" "badly typed key, preview"
args="{\"id\":\"$id\",\"metadata_patch\":{\"importance\":\"high\"},\"confirm\":true}"
expect_in "Invalid metadata_patch: importance" "$(mcp "$key" update_thought "$args")" "badly typed key, confirm"
[ "$(sql "SELECT metadata ? 'importance' FROM brain_smoke.thoughts WHERE id = '$id'")" = f ] || fail "badly typed value was stored"
args="{\"id\":\"$id\",\"metadata_patch\":{\"status_updated_at\":\"0000-01-01T00:00:00Z\"},\"confirm\":true}"
expect_in "cannot change: status_updated_at" "$(mcp "$key" update_thought "$args")" "client-set status_updated_at"
code="$(curl -s -o /dev/null -w '%{http_code}' "$base/api/thoughts" -H "x-brain-key: $key")"
[ "$code" = 200 ] || fail "thought list returned $code after rejected patches"
pass "forbidden and badly typed keys rejected"

args="{\"id\":\"$id\",\"new_content\":\"alpha final\",\"metadata_patch\":{\"type\":\"decision\"},\"confirm\":true}"

mcp "$key" update_thought "$args" >/dev/null
[ "$(sql "SELECT content || '|' || (metadata->>'type') FROM brain_smoke.thoughts WHERE id = '$id'")" = "alpha final|decision" ] \
  || fail "content + patch: patch did not win over re-extracted metadata"
pass "content + patch: patch applied on top of re-extracted metadata"

args="{\"id\":\"$id\",\"new_content\":\"alpha final\"}"

expect_in "No change" "$(mcp "$key" update_thought "$args")" "no-op edit"
pass "no-op edit answered before any preview"

echo "== update_thought content edit onto existing content"
args="{\"id\":\"$id\",\"new_content\":\"BETA   thought\",\"confirm\":true}"
expect_in "already has this exact content" "$(mcp "$key" update_thought "$args")" "cloned brain"
legacy_id="$(sql "SELECT id FROM brain_legacy.thoughts WHERE content = 'legacy alpha'")"
args="{\"id\":\"$legacy_id\",\"new_content\":\"legacy beta\",\"confirm\":true}"
expect_in "already has this exact content" "$(mcp "$legacy_key" update_thought "$args")" "legacy-named index"
pass "duplicate content refused with guidance on both index names"

echo "SMOKE OK"
