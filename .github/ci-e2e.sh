#!/usr/bin/env bash
# End-to-end checks in CI (and locally): the stack, the e2e scripts, the UI audit and the behaviour fingerprint.
#   .github/ci-e2e.sh                      builds and starts its own throw-away stack (compose project "odci"), removes it at the end
#   OD_REUSE=1 COMPOSE_PROJECT_NAME=opendiagram TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... .github/ci-e2e.sh
#                                          reuses a stack that is already running on :3000 (to try this script locally)
#   UI_SHARD=2/4 .github/ci-e2e.sh         this run audits only every 4th screen (the UI audit is ~85% of the time: CI runs 4 shards in parallel, one
#                                          runner each). Shard 1 also runs test-auth, test-guardrails and the behaviour fingerprint; unset = everything
# Runs every step even when one fails, prints what failed and how long each step took, exits 1 if any failed.
# Needs Docker with Compose v2, Node 24 and Chrome (UI steps).
set -uo pipefail
cd "$(dirname "$0")/.."
P=${COMPOSE_PROJECT_NAME:-odci}
export COMPOSE_PROJECT_NAME=$P
# the app plus the demo databases; the image built here is tagged :ci so it never replaces a pulled :latest
export COMPOSE_PATH_SEPARATOR=: COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml:docker-compose.demo.yml} OPENDIAGRAM_VERSION=${OPENDIAGRAM_VERSION:-ci}
UI=od-ci-ui
SHARD=${UI_SHARD:-1/1}
FIRST=$([ "${SHARD%%/*}" = 1 ] && echo 1 || echo "")
failed=()
timings=()
step() {
  local name=$1 t=$SECONDS; shift
  echo "::group::$name"
  if "$@"; then echo "ok: $name"; else echo "FAILED: $name"; failed+=("$name"); fi
  echo "::endgroup::"
  timings+=("$((SECONDS - t))s  $name")
}

# the app answering /api/health, with a limit (3 minutes): a crashed container fails the run with its logs instead of hanging until the job timeout
wait_health() {
  local url=$1 n=0
  until curl -fs "$url" >/dev/null; do n=$((n + 1)); [ $n -gt 90 ] && { echo "timeout waiting for $url"; return 1; }; sleep 2; done
}

cleanup() {
  local rc=$?
  if [ $rc -ne 0 ]; then
    echo "::group::container logs (the run failed with status $rc)"
    docker compose logs --tail=80 2>&1 | sed 's/^/[compose] /'
    docker logs --tail=80 $UI 2>&1 | sed 's/^/[ui] /'
    echo "::endgroup::"
  fi
  docker rm -f $UI >/dev/null 2>&1
  [ -z "${OD_REUSE:-}" ] && docker compose down -v >/dev/null 2>&1
}
trap cleanup EXIT

if [ -z "${OD_REUSE:-}" ]; then
  export APP_SECRET=${APP_SECRET:-$(openssl rand -hex 24)}
  docker compose up -d --build app demo-pg demo-pg-tls demo-mysql || exit 1
  export TEST_ADMIN_EMAIL=ci-admin@example.com TEST_ADMIN_PASSWORD='ci-test-password-1'
  wait_health http://localhost:3000/api/health || exit 1
  docker compose exec -T app node src/cli.js create-admin "$TEST_ADMIN_EMAIL" "$TEST_ADMIN_PASSWORD" >/dev/null || exit 1
  # demo-mysql runs demo/mysql.sql on its first start (about 20 s): wait until the read-only user sees the shop tables
  for _ in $(seq 1 60); do docker compose exec -T demo-mysql mysql -ureader -preader -e 'select 1 from shop.orders limit 1' >/dev/null 2>&1 && break; sleep 2; done
fi
: "${TEST_ADMIN_EMAIL:?}" "${TEST_ADMIN_PASSWORD:?}"
wait_health http://localhost:3000/api/health || exit 1
timings+=("${SECONDS}s  stack up (build included)")

if [ -n "$FIRST" ]; then
  # test-guardrails opens database sessions with the app's own code (server/src/introspect.js), so it needs the server's dependencies
  [ -d server/node_modules ] || (cd server && npm ci --omit=dev --no-audit --no-fund) || exit 1
  step "server/test-auth.mjs" node server/test-auth.mjs
  step "server/test-guardrails.mjs" node server/test-guardrails.mjs
fi

# the UI tools refuse :3000 and create accounts and diagrams: they get their own empty instance of the same image
docker rm -f $UI >/dev/null 2>&1
docker run -d --name $UI --network "${P}_default" -p 3100:3000 -e APP_SECRET=ci-ui-secret-000000000000000000000000 -e COOKIE_SECURE=0 "$(docker compose config --images app)" >/dev/null || exit 1
wait_health http://localhost:3100/api/health || exit 1
docker exec $UI node src/cli.js create-admin ui@example.com 'ui-test-password-1' >/dev/null || exit 1
export BASE=http://localhost:3100

step "web/uiaudit.mjs shard $SHARD (zero findings)" env AUDIT_SHARD="$SHARD" AUDIT_CONTAINER=$UI AUDIT_EMAIL=ui@example.com AUDIT_PASSWORD='ui-test-password-1' node web/uiaudit.mjs
if [ -n "$FIRST" ]; then
  step "web/behaviorcheck.mjs (matches web/behavior.golden.json)" bash -c '
    SNAP_EMAIL=ui@example.com SNAP_PASSWORD="ui-test-password-1" node web/behaviorcheck.mjs > /tmp/behavior.json && diff -u web/behavior.golden.json /tmp/behavior.json'
fi

echo "::group::timings"; printf '%s\n' "${timings[@]}"; echo "::endgroup::"
if [ ${#failed[@]} -gt 0 ]; then echo "FAILED STEPS: ${failed[*]}"; exit 1; fi
echo "all e2e steps passed (shard $SHARD)"
