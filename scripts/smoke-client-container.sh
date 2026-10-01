#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 ]]; then
  echo "Usage: $0 <locally-built-client-image>" >&2
  exit 2
fi
client_image=$1
docker image inspect "$client_image" >/dev/null
docker image inspect nginx:alpine >/dev/null 2>&1 || docker pull nginx:alpine

scratch=$(mktemp -d)
network="uni-planner-smoke-$$-$RANDOM"
containers=("$network-upstream")
cleanup() {
  local status=$?
  trap - EXIT
  for container in "${containers[@]}"; do docker rm -f "$container" >/dev/null 2>&1 || true; done
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# No host ports, external connectivity, credentials or planner data.
docker network create --internal "$network" >/dev/null
cat > "$scratch/upstream.conf" <<'NGINX'
server {
    listen 3001;
    server_name _;
    location / {
        if ($arg_proof = 1) {
            return 200 'proxy-proof|$http_cf_access_jwt_assertion|$http_cookie|$http_origin|$http_x_forwarded_for';
        }
        default_type text/plain;
        return 200 'synthetic-upstream|$request_uri|$http_host|$http_x_forwarded_proto';
    }
}
NGINX
start_upstream() {
  upstream=$1
  containers+=("$upstream")
  docker run -d --name "$upstream" --network "$network" --network-alias server \
    --mount "type=bind,src=$scratch/upstream.conf,dst=/etc/nginx/conf.d/default.conf,readonly" \
    nginx:alpine >/dev/null
}
start_upstream "$network-upstream"

fail() { echo "Client smoke failed: $*" >&2; exit 1; }
request() {
  local host=$1 path=$2 expected=$3
  docker exec "$client" curl --silent --show-error --max-time 3 --path-as-is \
    -H "Host: $host" -H 'X-Forwarded-Proto: HTTPS, http' \
    -D /tmp/smoke-headers -o /tmp/smoke-body -w '%{http_code}' \
    "http://127.0.0.1$path" > "$scratch/status"
  [[ $(cat "$scratch/status") == "$expected" ]] || fail "$host $path expected $expected"
  docker exec "$client" cat /tmp/smoke-headers > "$scratch/headers"
  docker exec "$client" cat /tmp/smoke-body > "$scratch/body"
  grep -qi '^Content-Security-Policy:.*script-src '\''self' "$scratch/headers" || fail "missing CSP: $path"
  grep -qi '^X-Content-Type-Options: nosniff' "$scratch/headers" || fail "missing nosniff: $path"
}
assert_cache() {
  grep -qi "^Cache-Control: $1" "$scratch/headers" || fail "expected cache policy $1"
}
check_proxy_proof() {
  local host=$1 path=$2 body
  body=$(docker exec "$client" curl -fsS --max-time 3 -H "Host: $host" \
    -H 'Cf-Access-Jwt-Assertion: synthetic-proof' -H 'Cookie: synthetic=only' \
    -H 'Origin: https://planner.example.com' \
    -H 'X-Forwarded-For: 198.51.100.66, 203.0.113.9' "http://127.0.0.1$path")
  [[ $body == 'proxy-proof|synthetic-proof|synthetic=only|https://planner.example.com|198.51.100.66, 203.0.113.9, 127.0.0.1' ]] || fail 'authentication/Origin/IP headers were lost'
}
check_routing() {
  local host=$1 path
  for path in / /planner/week /index.html /sw.js /registerSW.js; do
    request planner.example.com "$path" 200
    assert_cache no-cache
    case "$path" in /|/planner/week|/index.html) grep -qi '<html' "$scratch/body" || fail 'SPA document missing' ;; esac
  done
  check_proxy_proof planner.example.com '/api/smoke?proof=1'
  check_proxy_proof "$host" '/mcp?proof=1'
  request planner.example.com /assets/missing-smoke.js 404
  request planner.example.com /mcp 404
  assert_cache no-store
  for path in / /api/smoke /index.html /sw.js /assets/missing-smoke.js /mcp/ /%6dcp '/mcp%3Fprobe=1' /.well-known/oauth-protected-resource; do
    request "$host" "$path" 404
  done
  for path in /mcp '/mcp?probe=1'; do
    request "$host" "$path" 200
    assert_cache no-store
    [[ $(cat "$scratch/body") == "synthetic-upstream|$path|$host|https" ]] || fail 'MCP URI/Host/protocol forwarding'
  done
  for path in '/api/smoke?probe=1' /api/backup/restore /api/quotes/import; do
    request planner.example.com:8443 "$path" 200
    [[ $(cat "$scratch/body") == "synthetic-upstream|$path|planner.example.com:8443|https" ]] || fail 'website authority/URI/protocol forwarding'
  done
}
check_backend_replacement() {
  local old=$upstream attempt ready=false
  # Starting the replacement before removing the old forces a different IP.
  start_upstream "$network-replacement"
  docker rm -f "$old" >/dev/null
  for attempt in {1..60}; do
    if docker exec "$client" curl -fsS --max-time 1 -H 'Host: planner.example.com' \
      http://127.0.0.1/api/smoke > "$scratch/recovery" 2>/dev/null; then
      ready=true
      break
    fi
    sleep 0.25
  done
  [[ $ready == true ]] || fail 'backend replacement did not recover without restarting nginx'
  check_routing mcp.example.com
  echo 'Client smoke passed: backend replacement recovered without nginx restart'
}
check_image() {
  local label=$1 host=$2
  local environment=(--network "$network")
  [[ $label == default ]] || environment+=(-e "MCP_HOST=$host")
  # Both commands use the image's real entrypoint, validator and envsubst hooks.
  docker run --rm "${environment[@]}" "$client_image" nginx -t
  client="$network-$label"
  containers+=("$client")
  docker run -d --name "$client" "${environment[@]}" "$client_image" >/dev/null
  local ready=false attempt
  for attempt in {1..20}; do
    if docker exec "$client" curl -fsS --max-time 1 -H 'Host: planner.example.com' http://127.0.0.1/ >/dev/null 2>&1; then ready=true; break; fi
    sleep 0.2
  done
  if [[ $ready != true ]]; then docker logs "$client"; fail "$label did not become ready"; fi
  check_routing "$host"
  [[ $label != configured ]] || check_backend_replacement
  docker rm -f "$client" >/dev/null
  echo "Client smoke passed: $label"
}

check_image default mcp-disabled.invalid
check_image configured mcp.example.com
long_label=$(printf '%063d' 0 | tr 0 a)
last_label=$(printf '%061d' 0 | tr 0 b)
check_image maximum "$long_label.$long_label.$long_label.$last_label"
if docker run --rm --network "$network" -e 'MCP_HOST=https://mcp.example.com' \
  "$client_image" nginx -t > "$scratch/invalid-log" 2>&1; then
  fail 'invalid MCP_HOST was accepted'
fi
grep -q 'Invalid MCP_HOST' "$scratch/invalid-log" || fail 'invalid hostname did not fail at validation'
echo 'Client smoke passed: invalid hostname rejected'

# Static upstream resolution used to make nginx crash before the backend existed.
docker rm -f "$upstream" >/dev/null
docker run --rm --network "$network" "$client_image" nginx -t
echo 'Client smoke passed: nginx starts with backend DNS absent'
