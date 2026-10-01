#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 ]]; then
  echo "Usage: $0 <locally-built-server-image>" >&2
  exit 2
fi
server_image=$1
docker image inspect "$server_image" >/dev/null
container="uni-planner-server-smoke-$$-$RANDOM"
scratch=$(mktemp -d)

cleanup() {
  local status=$?
  trap - EXIT
  if [[ $status != 0 ]]; then
    echo 'Server smoke failed; isolated container logs:' >&2
    docker logs "$container" >&2 2>/dev/null || true
  fi
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fail() { echo "Server smoke failed: $*" >&2; exit 1; }
# Only generated test configuration enters this container; no host ports,
# bind mounts, credentials, notification recipient or external networking.
umask 077
printf 'JWT_SECRET=%s\n' "$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')" > "$scratch/environment"
docker run -d --name "$container" --network none --env-file "$scratch/environment" \
  -e NODE_ENV=production -e PORT=3001 -e DATABASE_PATH=/app/data/smoke.db \
  -e MCP_ENABLED=false -e TRUST_PROXY_HOPS=2 -e ALLOW_REGISTER=false \
  "$server_image" >/dev/null

ready=false
for attempt in {1..30}; do
  if docker exec "$container" node -e \
    'fetch("http://127.0.0.1:3001/api/health",{signal:AbortSignal.timeout(1000)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))' \
    >/dev/null 2>&1; then ready=true; break; fi
  [[ $(docker inspect -f '{{.State.Running}}' "$container") == true ]] || fail 'backend exited before readiness'
  sleep 0.2
done
[[ $ready == true ]] || fail 'backend did not become ready within the deadline'

docker exec -i "$container" node <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Database = require('better-sqlite3');
(async () => {
  for (const [path, status] of [['/api/health', 200], ['/api/todos', 401], ['/mcp', 404]]) {
    const response = await fetch(`http://127.0.0.1:3001${path}`, { signal: AbortSignal.timeout(3000), redirect: 'manual' });
    assert.equal(response.status, status, `Unexpected status for ${path}`);
    if (path === '/api/health') assert.equal((await response.json()).status, 'ok');
  }
  assert.notEqual(process.getuid(), 0, 'Runtime must be unprivileged');
  fs.accessSync('/app/index.js', fs.constants.R_OK);
  assert.throws(() => fs.accessSync('/app/index.js', fs.constants.W_OK), { code: 'EACCES' });
  const db = new Database(process.env.DATABASE_PATH, { readonly: true });
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0, 'Production must not seed users');
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  } finally {
    db.close();
  }
})().catch(() => { console.error('Server smoke failed: authentication, runtime permissions or fresh database validation'); process.exitCode = 1; });
NODE
echo 'Server smoke passed: unprivileged startup, health, authentication, disabled MCP and fresh database'
